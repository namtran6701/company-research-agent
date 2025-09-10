# Backend Report Generation Workflow

This document provides a comprehensive overview of how the backend system generates company research reports using the LangGraph-orchestrated multi-agent pipeline.

## Overview

The system follows a **5-phase workflow** that transforms a company research request into a comprehensive markdown report through sequential and parallel processing stages. The entire process typically takes 2-5 minutes and provides real-time updates via WebSocket connections.

## Phase 1: Request Initiation

**File**: `application.py:147-167`

1. User submits `POST /research` with company details (`ResearchRequest`)
2. System generates unique `job_id` using `uuid.uuid4()`
3. Spawns async `process_research` task without blocking response
4. Returns job details with WebSocket connection URL
5. WebSocket connection established at `/research/ws/{job_id}`
6. Graph instance initialized with company data and WebSocket manager

**Key Code Location**: `application.py:176-183`
```python
graph = Graph(
    company=data.company,
    url=data.company_url,
    industry=data.industry,
    hq_location=data.hq_location,
    websocket_manager=manager,
    job_id=job_id
)
```

## Phase 2: LangGraph Workflow Execution

**File**: `backend/graph.py:62-101`

The workflow follows this exact node sequence with specific edge connections:

### Workflow Graph Structure
```
grounding -> [news_scanner, industry_analyst, company_analyst, ecommerce_auditor] -> collector -> curator -> enricher -> briefing -> editor
```

**Key Architecture**:
- **Entry Point**: `grounding` node
- **Parallel Research**: 4 concurrent researcher agents  
- **Sequential Processing**: Collection → Curation → Enrichment → Briefing → Editing
- **Exit Point**: `editor` node

## Phase 3: Node-by-Node Execution

### 3.1 Initialization Phase

#### GroundingNode (`backend/nodes/grounding.py:17-153`)
**Purpose**: Initial website scraping and context establishment

**Process**:
1. Uses Tavily API for advanced website crawling
2. Crawls up to 50 pages at depth=1 with advanced extraction
3. Extracts raw content and creates initial `ResearchState`
4. Handles website errors gracefully (continues research even if crawl fails)

**State Updates**:
- Creates `site_scrape` with raw website content
- Initializes `messages` with progress updates
- Preserves WebSocket manager and job_id for downstream nodes

**WebSocket Updates**: Real-time crawl progress and error handling

### 3.2 Parallel Research Phase (4 Concurrent Agents)

All research agents extend `BaseResearcher` (`backend/nodes/researchers/base.py`) and run in parallel:

#### NewsScanner (`backend/nodes/researchers/news.py`)
- **Populates**: `news_data`
- **Focus**: Recent news, announcements, press releases

#### IndustryAnalyzer (`backend/nodes/researchers/industry.py`) 
- **Populates**: `industry_data`
- **Focus**: Market position, competition, industry trends

#### CompanyAnalyzer (`backend/nodes/researchers/company.py`)
- **Populates**: `company_data` 
- **Focus**: Core business information, products, services

#### OnlineEcommerceAuditor (`backend/nodes/researchers/auditor.py`)
- **Populates**: `auditor_data`
- **Focus**: E-commerce platform analysis and scoring

**Note**: FinancialAnalyst is temporarily disabled (lines 50-51, 68-69, 85 in `graph.py`)

### 3.3 Sequential Processing Pipeline

#### Collector (`backend/nodes/collector.py:9-44`)
**Purpose**: Data aggregation and validation

**Process**:
1. Collects all research data from parallel agents
2. Validates presence of each data type
3. Logs collection statistics for debugging

**State Verification**:
- Checks: `auditor_data`, `news_data`, `industry_data`, `company_data`
- Reports document counts per category via WebSocket

#### Curator (`backend/nodes/curator.py`)
**Purpose**: Content quality filtering

**Process**:
1. Uses Tavily AI-powered relevance scoring
2. Applies 0.4+ threshold for document inclusion
3. Creates `curated_*_data` fields with high-quality documents
4. Performs URL deduplication and content normalization

**State Updates**:
- `curated_auditor_data`, `curated_news_data`, `curated_industry_data`, `curated_company_data`
- `references` list for citation tracking
- `reference_info` and `reference_titles` for formatting

**WebSocket Updates**: `document_kept`, `curation_complete` with statistics

#### Enricher (`backend/nodes/enricher.py`)
**Purpose**: Data enhancement and metadata addition

**Process**: Enhances curated data with additional context and metadata

#### Briefing (`backend/nodes/briefing.py:267-365`)
**Purpose**: Category-specific summary generation

**Process**:
1. **Parallel Processing**: Up to 2 concurrent briefings with rate limiting (`asyncio.Semaphore(2)`)
2. **Azure GPT-4.1**: Uses specialized prompts for each category
3. **Document Processing**: Sorts by evaluation score, truncates at 8000 chars per doc
4. **Content Limits**: Keeps total content under 120,000 characters

**Specialized Prompts**: 
- **Company**: Structured with Core Product/Service, Leadership, Target Market, etc.
- **Industry**: Market Overview, Competition, Competitive Advantages
- **News**: Major Announcements, Partnerships, Recognition (bullet points only)
- **Auditor**: E-commerce scorecard with 1-10 ratings across 4 dimensions

**State Updates**:
- `company_briefing`, `industry_briefing`, `news_briefing`, `auditor_briefing`
- `briefings` dictionary with all category summaries

**WebSocket Updates**: `briefing_start`, `briefing_complete` per category

#### Editor (`backend/nodes/editor.py:44-424`)
**Purpose**: Final report compilation and formatting

**Three-Phase Process**:

1. **Compilation Phase** (`compile_content:210-291`):
   - Combines all briefings into cohesive narrative
   - Uses Azure GPT-4.1 with structured prompt
   - Enforces exact document structure with specific headers
   - Appends formatted references section

2. **Cleanup Phase**: Deduplication and content organization

3. **Formatting Phase** (`content_sweep:293-415`):
   - **Real-time Streaming**: Sends report chunks via WebSocket as generated
   - Enforces strict markdown structure
   - Removes redundant information
   - Applies consistent formatting rules

**Document Structure Enforcement**:
```markdown
# {Company} Ecommerce Report
## Company Overview
## Industry Overview  
## E-commerce Audit
## News
## References
```

**State Updates**:
- `state['report']` (primary location)
- `state['editor']['report']` (backup location)
- `state['status'] = "editor_complete"`

**WebSocket Updates**: `report_chunk` (streaming), final completion status

## Phase 4: State Management Evolution

**File**: `backend/classes/state.py`

The state evolves through the pipeline as follows:

```python
InputState {
    company, company_url, hq_location, industry, 
    websocket_manager, job_id
}
↓
ResearchState (adds) {
    site_scrape,           # From grounding
    messages,              # Progress tracking
    *_data,               # Raw research (news_data, company_data, etc.)
    curated_*_data,       # Filtered content
    *_briefing,           # Category summaries  
    references,           # Citation tracking
    briefings,            # All briefings dict
    report                # Final output
}
```

## Phase 5: Real-time Communication

**File**: `backend/services/websocket_manager.py`

### WebSocket Message Types:

| Message Type | Source Node | Purpose |
|--------------|-------------|---------|
| `processing` | All nodes | General progress updates |
| `query_generating` | Researchers | Research query generation |
| `document_kept` | Curator | Document curation updates |
| `curation_complete` | Curator | Final curation statistics |
| `briefing_start` | Briefing | Category briefing initiation |
| `briefing_complete` | Briefing | Category briefing completion |
| `report_chunk` | Editor | Streaming report generation |
| `editor_complete` | Editor | Final report completion |

### Message Structure:
```python
{
    "type": "message_type",
    "data": {
        "step": "current_node",
        "message": "human_readable_update",
        "result": {/* node_specific_data */}
    }
}
```

## Phase 6: Report Completion and Storage

**File**: `application.py:186-216`

1. **Report Extraction**: Retrieved from `state.get('report')` or `state.get('editor', {}).get('report')`
2. **Multi-location Storage**:
   - In-memory: `job_status[job_id]` for immediate access
   - Database: MongoDB (if configured) for persistence  
   - Global: `LATEST_REPORT` for single-user fallback
3. **Final WebSocket Update**: Completion status with full report
4. **API Availability**: Report accessible via `/research/status/{job_id}` and PDF generation

## Key Architecture Decisions

### 1. Dual Model Strategy
- **Azure GPT-4.1** for both briefing generation (`briefing.py`) and final editing (`editor.py`)
- High-context processing for large document volumes
- Consistent quality across all content generation

### 2. Real-time Streaming Architecture  
- **Immediate Feedback**: Editor streams report chunks during formatting
- **Progress Visibility**: Each node provides detailed status updates
- **Error Transparency**: Graceful error handling with user notification

### 3. Parallel + Sequential Hybrid
- **Research Phase**: 4 agents run concurrently for speed
- **Processing Phase**: Sequential pipeline ensures proper data flow
- **Rate Limiting**: Semaphores prevent API overload

### 4. State Persistence Strategy
- **Multiple Storage Locations**: Ensures report availability despite failures
- **Backward Compatibility**: Supports both new WebSocket and legacy polling clients
- **Stateless Nodes**: Each node is independently recoverable

### 5. Error Handling Philosophy
- **Continue on Failure**: Website crawl errors don't stop research
- **Graceful Degradation**: Missing data results in empty sections, not crashes
- **Transparent Errors**: All failures reported via WebSocket with context

## File Reference Summary

| Component | File Location | Key Functions |
|-----------|---------------|---------------|
| **Main Application** | `application.py` | `research()`, `process_research()` |
| **Workflow Graph** | `backend/graph.py` | `Graph.__init__()`, `_build_workflow()` |
| **State Definition** | `backend/classes/state.py` | `InputState`, `ResearchState` |
| **Grounding** | `backend/nodes/grounding.py` | `initial_search()` |
| **Research Base** | `backend/nodes/researchers/base.py` | `BaseResearcher` |
| **Data Collection** | `backend/nodes/collector.py` | `collect()` |
| **Content Curation** | `backend/nodes/curator.py` | Content filtering logic |
| **Briefing Generation** | `backend/nodes/briefing.py` | `generate_category_briefing()` |
| **Report Compilation** | `backend/nodes/editor.py` | `compile_content()`, `content_sweep()` |
| **WebSocket Manager** | `backend/services/websocket_manager.py` | Real-time communication |

## Performance Characteristics

- **Typical Duration**: 2-5 minutes end-to-end
- **Concurrent Research**: 4 parallel agents
- **Rate Limiting**: 2 concurrent briefings max
- **Content Limits**: 120K characters per briefing input
- **Document Limits**: 8K characters per document
- **WebSocket Updates**: ~15-25 messages per research job

## Dependencies

- **LangGraph**: Workflow orchestration
- **Tavily API**: Website crawling and relevance scoring  
- **Azure OpenAI**: GPT-4.1 for content generation
- **WebSockets**: Real-time communication
- **MongoDB**: Optional persistence layer
- **FastAPI**: HTTP API framework