import asyncio
import logging
import os
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.graph import Graph
from backend.services.mongodb import MongoDBService
from backend.services.pdf_service import PDFService
from backend.services.websocket_manager import WebSocketManager
from openai import AsyncAzureOpenAI

# Load environment variables from .env file at startup
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)
console_handler = logging.StreamHandler()
logger.addHandler(console_handler)

app = FastAPI(title="Tavily Company Research API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

manager = WebSocketManager()
pdf_service = PDFService({"pdf_output_dir": "pdfs"})

job_status = defaultdict(lambda: {
    "status": "pending",
    "result": None,
    "error": None,
    "debug_info": [],
    "company": None,
    "report": None,
    "last_update": datetime.now().isoformat()
})

# Single-user simple context holder for the latest completed report
LATEST_REPORT: dict | None = None

mongodb = None
if mongo_uri := os.getenv("MONGODB_URI"):
    try:
        mongodb = MongoDBService(mongo_uri)
        logger.info("MongoDB integration enabled")
    except Exception as e:
        logger.warning(f"Failed to initialize MongoDB: {e}. Continuing without persistence.")

# Initialize Azure OpenAI client for Q&A/chat (streaming)
azure_openai_client: AsyncAzureOpenAI | None = None
try:
    azure_key = os.getenv("AZURE_OPENAI_KEY")
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    if azure_key and azure_endpoint:
        azure_openai_client = AsyncAzureOpenAI(
            api_key=azure_key,
            azure_endpoint=azure_endpoint,
            api_version="2025-04-01-preview",
        )
        logger.info("Azure OpenAI client initialized for Q&A streaming")
    else:
        logger.warning("Azure OpenAI credentials not found; Q&A streaming will be unavailable")
except Exception as e:
    logger.warning(f"Failed to initialize Azure OpenAI client: {e}")

class ResearchRequest(BaseModel):
    company: str
    company_url: str | None = None
    industry: str | None = None
    hq_location: str | None = None

class PDFGenerationRequest(BaseModel):
    report_content: str
    company_name: str | None = None

class ChatRequest(BaseModel):
    question: str

@app.options("/research")
async def preflight():
    response = JSONResponse(content=None, status_code=200)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

@app.post("/research")
async def research(data: ResearchRequest):
    try:
        logger.info(f"Received research request for {data.company}")
        job_id = str(uuid.uuid4())
        asyncio.create_task(process_research(job_id, data))

        response = JSONResponse(content={
            "status": "accepted",
            "job_id": job_id,
            "message": "Research started. Connect to WebSocket for updates.",
            "websocket_url": f"/research/ws/{job_id}"
        })
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    except Exception as e:
        logger.error(f"Error initiating research: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

async def process_research(job_id: str, data: ResearchRequest):
    try:
        if mongodb:
            mongodb.create_job(job_id, data.dict())
        await asyncio.sleep(1)  # Allow WebSocket connection

        await manager.send_status_update(job_id, status="processing", message="Starting research")

        graph = Graph(
            company=data.company,
            url=data.company_url,
            industry=data.industry,
            hq_location=data.hq_location,
            websocket_manager=manager,
            job_id=job_id
        )

        state = {}
        async for s in graph.run(thread={}):
            state.update(s)
        
        # Look for the compiled report in either location.
        report_content = state.get('report') or (state.get('editor') or {}).get('report')
        if report_content:
            logger.info(f"Found report in final state (length: {len(report_content)})")
            job_status[job_id].update({
                "status": "completed",
                "report": report_content,
                "company": data.company,
                "last_update": datetime.now().isoformat()
            })
            # Update single-user latest report context
            global LATEST_REPORT
            LATEST_REPORT = {
                "company": data.company,
                "report": report_content,
            }
            if mongodb:
                mongodb.update_job(job_id=job_id, status="completed")
                mongodb.store_report(job_id=job_id, report_data={"report": report_content})
            await manager.send_status_update(
                job_id=job_id,
                status="completed",
                message="Research completed successfully",
                result={
                    "report": report_content,
                    "company": data.company
                }
            )
        else:
            logger.error(f"Research completed without finding report. State keys: {list(state.keys())}")
            logger.error(f"Editor state: {state.get('editor', {})}")
            
            # Check if there was a specific error in the state
            error_message = "No report found"
            if error := state.get('error'):
                error_message = f"Error: {error}"
            
            await manager.send_status_update(
                job_id=job_id,
                status="failed",
                message="Research completed but no report was generated",
                error=error_message
            )

    except Exception as e:
        logger.error(f"Research failed: {str(e)}")
        await manager.send_status_update(
            job_id=job_id,
            status="failed",
            message=f"Research failed: {str(e)}",
            error=str(e)
        )
        if mongodb:
            mongodb.update_job(job_id=job_id, status="failed", error=str(e))

@app.post("/qa/stream")
async def qa_stream(data: ChatRequest):
    """Simple streaming chat endpoint. Single-user, stateless, no history.
    Streams plain text tokens using Azure OpenAI gpt-4.1.
    """
    if azure_openai_client is None:
        raise HTTPException(status_code=503, detail="Q&A not configured: missing Azure OpenAI credentials")

    question = (data.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    # Ensure a report is available for context
    if not LATEST_REPORT or not LATEST_REPORT.get("report"):
        raise HTTPException(status_code=400, detail="No report loaded yet. Run research first.")

    company = LATEST_REPORT.get("company", "the company")
    report_text = LATEST_REPORT.get("report", "")

    async def token_generator():
        try:
            response = await azure_openai_client.chat.completions.create(
                model="gpt-4.1",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful assistant. Answer using ONLY the report context provided. "
                            "If the answer is not clearly supported by the report, say you don't know. "
                            "Be concise and avoid speculation."
                        ),
                    },
                    {
                        "role": "system",
                        "content": f"Report context for {company}:\n\n{report_text}",
                    },
                    {"role": "user", "content": question},
                ],
                temperature=0.2,
                max_tokens=800,
                stream=True,
            )

            async for chunk in response:
                try:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if delta and getattr(delta, "content", None):
                        text = delta.content
                        if text:
                            yield text.encode("utf-8")
                except Exception:
                    continue
        except Exception as e:
            logger.error(f"Q&A streaming failed: {e}")
            yield f"\n[Error] {str(e)}".encode("utf-8")

    return StreamingResponse(token_generator(), media_type="text/plain; charset=utf-8")
@app.get("/")
async def serve_frontend():
    """Serve the React frontend."""
    if os.path.exists("ui/dist/index.html"):
        return FileResponse("ui/dist/index.html")
    else:
        return JSONResponse(
            content={"message": "Frontend not built yet. Please run 'cd ui && npm run build' or use the frontend dev server at http://localhost:5173"},
            status_code=200
        )

@app.get("/research/pdf/{filename}")
async def get_pdf(filename: str):
    pdf_path = os.path.join("pdfs", filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF not found")
    return FileResponse(pdf_path, media_type='application/pdf', filename=filename)

@app.websocket("/research/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    try:
        await websocket.accept()
        await manager.connect(websocket, job_id)

        if job_id in job_status:
            status = job_status[job_id]
            await manager.send_status_update(
                job_id,
                status=status["status"],
                message="Connected to status stream",
                error=status["error"],
                result=status["result"]
            )

        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                manager.disconnect(websocket, job_id)
                break

    except Exception as e:
        logger.error(f"WebSocket error for job {job_id}: {str(e)}", exc_info=True)
        manager.disconnect(websocket, job_id)

@app.get("/research/{job_id}")
async def get_research(job_id: str):
    if not mongodb:
        raise HTTPException(status_code=501, detail="Database persistence not configured")
    job = mongodb.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Research job not found")
    return job

@app.get("/research/{job_id}/report")
async def get_research_report(job_id: str):
    if not mongodb:
        if job_id in job_status:
            result = job_status[job_id]
            if report := result.get("report"):
                return {"report": report}
        raise HTTPException(status_code=404, detail="Report not found")
    
    report = mongodb.get_report(job_id)
    if not report:
        raise HTTPException(status_code=404, detail="Research report not found")
    return report

@app.post("/generate-pdf")
async def generate_pdf(data: PDFGenerationRequest):
    """Generate a PDF from markdown content and stream it to the client."""
    try:
        success, result = pdf_service.generate_pdf_stream(data.report_content, data.company_name)
        if success:
            pdf_buffer, filename = result
            return StreamingResponse(
                pdf_buffer,
                media_type='application/pdf',
                headers={
                    'Content-Disposition': f'attachment; filename="{filename}"'
                }
            )
        else:
            raise HTTPException(status_code=500, detail=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files for the React frontend (only if dist directory exists)
if os.path.exists("ui/dist/assets"):
    app.mount("/assets", StaticFiles(directory="ui/dist/assets"), name="assets")
else:
    logger.warning("Frontend not built yet. Run 'cd ui && npm run build' to enable static file serving.")

# Serve favicon and logo files
@app.get("/favicon.ico")
async def get_favicon():
    """Serve the favicon."""
    if os.path.exists("ui/dist/favicon.ico"):
        return FileResponse("ui/dist/favicon.ico")
    else:
        raise HTTPException(status_code=404, detail="Favicon not found. Please build the frontend.")

@app.get("/sfalogo.png")
async def get_logo():
    """Serve the company logo."""
    if os.path.exists("ui/dist/sfalogo.png"):
        return FileResponse("ui/dist/sfalogo.png")
    else:
        raise HTTPException(status_code=404, detail="Logo not found. Please build the frontend.")

# Catch-all route for React Router (client-side routing)
# This must be the last route defined
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve React app for any unmatched routes (client-side routing)."""
    if os.path.exists("ui/dist/index.html"):
        return FileResponse("ui/dist/index.html")
    else:
        return JSONResponse(
            content={"message": "Frontend not built yet. Please run 'cd ui && npm run build' or use the frontend dev server at http://localhost:5173"},
            status_code=200
        )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)