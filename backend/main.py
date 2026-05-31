import os
import inspect
import logging
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
import ast
import re

try:
    import cognee
    from cognee.api.v1.search import SearchType
    COGNEE_AVAILABLE = True
except Exception as _e:
    cognee = None
    SearchType = None
    COGNEE_AVAILABLE = False
    import logging as _logging
    _logging.getLogger(__name__).warning(f"cognee import failed: {_e}")
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# ── In-memory active config (set via /config, defaults to Ollama) ────────────
_active_config: dict = {
    "provider":            os.getenv("LLM_PROVIDER",        "ollama"),
    "llm_model":           os.getenv("LLM_MODEL",           "llama3.1:8b"),
    "llm_base_url":        os.getenv("LLM_ENDPOINT",        "http://ollama:11434/v1"),
    "api_key":             os.getenv("LLM_API_KEY",         "ollama"),
    "embedding_model":     os.getenv("EMBEDDING_MODEL",     "nomic-embed-text"),
    "embedding_base_url":  os.getenv("EMBEDDING_ENDPOINT",  "http://ollama:11434/api/embed"),
    "embedding_api_key":   os.getenv("LLM_API_KEY",         "ollama"),
    "embedding_dimensions": int(os.getenv("EMBEDDING_DIMENSIONS", "768")),
}


def _apply_config(cfg: dict):
    """Write config into environment — cognee re-reads on each pipeline run."""
    os.environ["LLM_PROVIDER"]       = cfg["provider"]
    os.environ["LLM_MODEL"]          = cfg["llm_model"]
    os.environ["LLM_ENDPOINT"]       = cfg["llm_base_url"]
    os.environ["LLM_API_KEY"]        = cfg["api_key"]
    os.environ["EMBEDDING_PROVIDER"] = cfg.get("embedding_provider", cfg["provider"])
    os.environ["EMBEDDING_MODEL"]    = cfg["embedding_model"]
    os.environ["EMBEDDING_ENDPOINT"] = cfg["embedding_base_url"]
    os.environ["EMBEDDING_API_KEY"]  = cfg.get("embedding_api_key", cfg["api_key"])
    os.environ["EMBEDDING_DIMENSIONS"] = str(cfg.get("embedding_dimensions", 768))

    # Tokenizer hint for Ollama embeddings
    if cfg["provider"] == "ollama":
        os.environ["HUGGINGFACE_TOKENIZER"] = "nomic-ai/nomic-embed-text-v1.5"

    try:
        cognee.config.set_llm_config({
            "provider": cfg["provider"],
            "model":    cfg["llm_model"],
            "endpoint": cfg["llm_base_url"],
            "api_key":  cfg["api_key"],
        })
    except Exception as e:
        logger.warning(f"cognee.config.set_llm_config warning: {e}")

    logger.info(f"Config applied: provider={cfg['provider']} llm={cfg['llm_model']} embed={cfg['embedding_model']}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Cognee {cognee.__version__} starting")
    _apply_config(_active_config)
    yield


app = FastAPI(title="Cognee Knowledge Graph API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ────────────────────────────────────────────────────────────

class ConfigRequest(BaseModel):
    provider: str                        # ollama | openai | gemini | groq | together | anthropic | custom
    llm_model: str
    llm_base_url: str
    api_key: str
    embedding_model: str
    embedding_base_url: str
    embedding_api_key: Optional[str] = None
    embedding_provider: Optional[str] = None
    embedding_dimensions: Optional[int] = 768


class ChatRequest(BaseModel):
    message: str
    dataset: Optional[str] = "default"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "cognee_version": cognee.__version__}


@app.get("/config")
async def get_config():
    """Return active config (api_key masked)."""
    safe = {**_active_config}
    if safe.get("api_key"):
        safe["api_key"] = safe["api_key"][:6] + "••••••" if len(safe["api_key"]) > 6 else "••••••"
    if safe.get("embedding_api_key"):
        safe["embedding_api_key"] = safe["embedding_api_key"][:6] + "••••••"
    return safe


@app.post("/config")
async def set_config(req: ConfigRequest):
    """Update LLM + embedding provider config at runtime."""
    global _active_config
    _active_config = {
        "provider":            req.provider,
        "llm_model":           req.llm_model,
        "llm_base_url":        req.llm_base_url,
        "api_key":             req.api_key,
        "embedding_model":     req.embedding_model,
        "embedding_base_url":  req.embedding_base_url,
        "embedding_api_key":   req.embedding_api_key or req.api_key,
        "embedding_provider":  req.embedding_provider or req.provider,
        "embedding_dimensions": req.embedding_dimensions or 768,
    }
    _apply_config(_active_config)
    return {"status": "ok", "provider": req.provider, "llm_model": req.llm_model}


@app.get("/models")
async def list_models():
    """For Ollama: fetch live model list. For cloud: return provider preset lists."""
    import httpx
    ollama_url = os.getenv("OLLAMA_URL", "http://ollama:11434")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{ollama_url}/api/tags")
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"ollama_models": models}
    except Exception as e:
        return {"ollama_models": [], "error": str(e)}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...), dataset: str = "default"):
    allowed = {".txt", ".pdf", ".md", ".csv"}
    suffix = Path(file.filename).suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type: {suffix}. Allowed: {allowed}")

    file_path = UPLOAD_DIR / file.filename
    content = await file.read()
    file_path.write_bytes(content)

    try:
        # Ensure latest config is applied before ingestion
        _apply_config(_active_config)

        logger.info("Resetting system databases before ingestion")
        try:
            await cognee.prune.prune_system(graph=True, vector=True, metadata=True)
        except Exception as pe:
            logger.warning(f"System prune (non-fatal): {pe}")

        logger.info(f"Adding '{file.filename}' to dataset '{dataset}'")
        await cognee.add([str(file_path)], dataset_name=dataset)

        logger.info(f"Running cognify on '{dataset}'")
        await cognee.cognify(datasets=[dataset])

        logger.info("Ingestion complete ✓")
        return {
            "status": "success",
            "filename": file.filename,
            "dataset": dataset,
            "message": "Document ingested and knowledge graph built.",
        }
    except Exception as e:
        logger.exception("Ingestion failed")
        raise HTTPException(500, f"Ingestion failed: {str(e)}")


@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        if not COGNEE_AVAILABLE:
            raise HTTPException(status_code=503, detail="cognee package not installed or failed to import")
        _apply_config(_active_config)
        logger.info(f"Search: '{req.message}' on dataset '{req.dataset}'")

        results = await cognee.search(
            query_text=req.message,
            query_type=SearchType.GRAPH_COMPLETION,
            datasets=[req.dataset],
        )

        if not results:
            return {"answer": "No results found. Make sure a document has been fully ingested.", "sources": []}

        answer_parts = []
        for r in (results[:6] if isinstance(results, list) else [results]):
            if isinstance(r, dict):
                text = r.get("text") or r.get("answer") or r.get("content") or r.get("summary") or str(r)
            elif hasattr(r, "text"):
                text = r.text
            elif hasattr(r, "content"):
                text = r.content
            else:
                text = str(r)
            text = text.strip()
            if text and text not in answer_parts:
                answer_parts.append(text)

        return {"answer": "\n\n".join(answer_parts) or str(results), "sources": []}

    except Exception as e:
        logger.exception("GRAPH_COMPLETION failed — trying SUMMARIES")
        try:
            results = await cognee.search(
                query_text=req.message,
                query_type=SearchType.SUMMARIES,
                datasets=[req.dataset],
            )
            if not results:
                raise HTTPException(404, "No data found — upload a document first.")
            parts = []
            for r in results[:6]:
                text = (r.get("text") or r.get("content") or str(r) if isinstance(r, dict) else str(r))
                if text:
                    parts.append(text.strip())
            return {"answer": "\n\n".join(parts) or str(results), "sources": []}
        except HTTPException:
            raise
        except Exception as e2:
            logger.exception("Both search types failed")
            raise HTTPException(500, f"Query failed: {str(e2)}")


@app.get("/graph")
async def get_graph(dataset: str = "default"):
    try:
        if not COGNEE_AVAILABLE:
            logger.error("/graph called but cognee is not available")
            return {"nodes": [], "edges": [], "error": "cognee package not installed or failed to import"}

        from cognee.infrastructure.databases.graph import get_graph_engine
        graph_engine = await get_graph_engine()
        nodes_raw = await graph_engine.get_graph_data()

        if isinstance(nodes_raw, tuple) and len(nodes_raw) == 2:
            nodes_data, edges_data = nodes_raw
        else:
            nodes_data, edges_data = nodes_raw, []

        nodes = []
        for n in (nodes_data or []):
            # If node is a stringified tuple like "(id, {...})", try to parse it
            if isinstance(n, str):
                parsed = None
                try:
                    parsed = ast.literal_eval(n)
                except Exception:
                    parsed = None
                if isinstance(parsed, (list, tuple)) and len(parsed) >= 2:
                    n = parsed

            # Node may be a dict-like object
            if isinstance(n, dict):
                nid = n.get("id", "")
                label = n.get("name") or n.get("label") or str(nid)[:30]
                nodes.append({"id": str(nid), "label": label})
            # Or a tuple/list like (id, metadata_dict) returned by cognee
            elif isinstance(n, (list, tuple)) and len(n) >= 2:
                nid = n[0]
                meta = n[1] or {}
                label = None
                if isinstance(meta, dict):
                    label = meta.get("name") or meta.get("label") or (meta.get("text") and str(meta.get("text"))[:30])
                if not label:
                    label = str(nid)[:30]
                nodes.append({"id": str(nid), "label": label})
            else:
                # Fallback: stringify the node, but try to extract a UUID and name via regex
                s = str(n)
                uuid_match = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", s)
                if uuid_match:
                    nid = uuid_match.group(0)
                    # try to extract a name field from the string representation
                    name_match = re.search(r"name'\s*:\s*'([^']+)'|\"name\"\s*:\s*\"([^\"]+)\"", s)
                    label = (name_match.group(1) or name_match.group(2))[:30] if name_match else str(nid)[:30]
                    nodes.append({"id": str(nid), "label": label})
                else:
                    nodes.append({"id": s, "label": s[:30]})

        edges = []
        for e in (edges_data or []):
            if isinstance(e, dict):
                edges.append({
                    "source": str(e.get("source_node_id") or e.get("from") or ""),
                    "target": str(e.get("target_node_id") or e.get("to") or ""),
                    "label": e.get("relationship_name") or e.get("type") or "",
                })
            elif isinstance(e, (list, tuple)) and len(e) >= 2:
                edges.append({
                    "source": str(e[0]),
                    "target": str(e[1]),
                    "label": str(e[2]) if len(e) > 2 else "",
                })

        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        logger.exception(f"Graph fetch error for dataset={dataset}: {e}")
        return {"nodes": [], "edges": [], "error": str(e)}


@app.delete("/reset")
async def reset():
    try:
        await cognee.prune.prune_system(graph=True, vector=True, metadata=True)
        data_dir = Path(os.getenv("DATA_ROOT_DIRECTORY", "/app/.cognee_data"))
        cleared = []
        for item in data_dir.iterdir():
            try:
                shutil.rmtree(item) if item.is_dir() else item.unlink()
                cleared.append(item.name)
            except Exception as ie:
                logger.warning(f"Could not remove {item}: {ie}")
        return {"status": "success", "message": "Knowledge graph cleared.", "cleared": cleared}
    except Exception as e:
        raise HTTPException(500, f"Reset failed: {str(e)}")
