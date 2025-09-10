import logging
from typing import Any, Dict

from langchain_core.messages import AIMessage

from ...classes import ResearchState
from .base import BaseResearcher

logger = logging.getLogger(__name__)


class OnlineEcommerceAuditor(BaseResearcher):
    def __init__(self) -> None:
        super().__init__()
        self.analyst_type = "ecommerce_auditor"

    async def analyze(self, state: ResearchState) -> Dict[str, Any]:
        company = state.get('company', 'Unknown Company')
        websocket_manager = state.get('websocket_manager')
        job_id = state.get('job_id')

        try:
            # Generate search queries tailored for E-commerce Audit
            queries = await self.generate_queries(
                state,
                """
                Generate queries to evaluate {company}'s online e-commerce effectiveness across:
                (1) Social Media Presence,
                (2) E-commerce Performance across Amazon/Walmart/Home Depot/Lowe's/DTC,
                (3) Website Quality (UX/UI, mobile responsiveness, PageSpeed, CTAs),
                (4) AI Optimization (chatbots, personalization, automation, advanced features).
                Include queries that surface platform product pages, reviews/ratings, and any measurable performance indicators.
                """
            )

            # Stream subqueries as a friendly message
            subqueries_msg = "🔍 Subqueries for e-commerce audit:\n" + "\n".join([f"• {query}" for query in queries])
            messages = state.get('messages', [])
            messages.append(AIMessage(content=subqueries_msg))
            state['messages'] = messages

            # Notify websocket about query generation
            if websocket_manager and job_id:
                await websocket_manager.send_status_update(
                    job_id=job_id,
                    status="processing",
                    message="E-commerce audit queries generated",
                    result={
                        "step": "E-commerce Auditor",
                        "analyst_type": "E-commerce Auditor",
                        "queries": queries,
                    },
                )

            # Gather documents from initial site scrape if present
            auditor_data: Dict[str, Any] = {}
            if site_scrape := state.get('site_scrape'):
                company_url = state.get('company_url', 'company-website')
                raw = site_scrape.get('raw_content') if isinstance(site_scrape, dict) else site_scrape
                title = site_scrape.get('title') if isinstance(site_scrape, dict) else state.get('company', 'Unknown Company')
                auditor_data[company_url] = {
                    'title': title or state.get('company', 'Unknown Company'),
                    'raw_content': raw or '',
                    'query': f'E-commerce audit info for {company}',
                    'source': 'site_scrape',
                    'score': 1.0,
                    'url': company_url,
                }

            # Execute searches and merge results
            for query in queries:
                documents = await self.search_documents(state, [query])
                for url, doc in documents.items():
                    doc['query'] = query
                    auditor_data[url] = doc

            completion_msg = f"Completed e-commerce audit discovery with {len(auditor_data)} documents"

            if websocket_manager and job_id:
                await websocket_manager.send_status_update(
                    job_id=job_id,
                    status="processing",
                    message=f"Used Tavily Search to find {len(auditor_data)} documents",
                    result={
                        "step": "Searching",
                        "analyst_type": "E-commerce Auditor",
                        "queries": queries,
                    },
                )

            messages.append(AIMessage(content=completion_msg))
            state['messages'] = messages
            state['auditor_data'] = auditor_data

            if websocket_manager and job_id:
                await websocket_manager.send_status_update(
                    job_id=job_id,
                    status="processing",
                    message=completion_msg,
                    result={
                        "analyst_type": "E-commerce Auditor",
                        "queries": queries,
                        "documents_found": len(auditor_data),
                    },
                )

            return {
                'message': completion_msg,
                'auditor_data': auditor_data,
                'analyst_type': self.analyst_type,
                'queries': queries,
            }

        except Exception as e:
            error_msg = f"E-commerce audit failed: {str(e)}"
            if websocket_manager and job_id:
                await websocket_manager.send_status_update(
                    job_id=job_id,
                    status="error",
                    message=error_msg,
                    result={
                        "analyst_type": "E-commerce Auditor",
                        "error": str(e),
                    },
                )
            raise

    async def run(self, state: ResearchState) -> Dict[str, Any]:
        return await self.analyze(state)

