# Cognee Knowledge Explorer

A local, fully private AI knowledge graph app powered by **Cognee** and **Ollama**.
Upload documents → build a knowledge graph → chat with your data.

```
┌─────────────────────────────────────────────────────┐
│  Browser  →  Frontend (React)  →  Backend (FastAPI)  │
│                                       ↕              │
│                              Cognee (KG engine)       │
│                                       ↕              │
│                              Ollama (LLM + Embeddings)│
└─────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Docker | 24+ |
| Docker Compose | 2.20+ |
| RAM | 8 GB minimum (16 GB recommended) |
| Disk | 5–20 GB (depending on models) |

---

## Quick Start

### 1. Clone / enter the project

```bash
cd cognee-local
```

### 2. Configure your model (optional)

The defaults work out of the box. To change models, copy the example env file:

```bash
cp .env.example .env
```

Then edit `.env`:

```dotenv
# Light setup (8 GB RAM)
LLM_MODEL=llama3.2:3b
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768

# Medium setup (16 GB RAM) — better graph quality
LLM_MODEL=llama3.1:8b
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768

# Strong setup (24 GB+ RAM) — best graph quality
LLM_MODEL=deepseek-r1:32b
EMBEDDING_MODEL=mxbai-embed-large
EMBEDDING_DIMENSIONS=1024
```

### 3. Start everything

```bash
docker compose up --build
```

On first run this will:
1. Pull the Ollama Docker image
2. Pull your chosen LLM + embedding models (may take a few minutes)
3. Build the Python backend
4. Build the React frontend

### 4. Open the UI

```
http://localhost:3000
```

---

## Using the App

### Upload a document
- Drag & drop or click **Browse** in the sidebar
- Supported: `.txt`, `.pdf`, `.md`, `.csv`
- A sample document is in `docs/sample.txt`

### Build the knowledge graph
- Cognee automatically extracts entities and relationships
- Click **↺ Refresh** to visualise the graph
- Nodes are draggable; scroll to zoom

### Chat with your data
- Type a question in the chat box
- Cognee uses GRAPH_COMPLETION — it traverses the knowledge graph to answer

### Multiple datasets
- Change the **Dataset** field to isolate different document collections
- Each dataset gets its own graph

---

## Architecture

| Service | Port | Description |
|---------|------|-------------|
| `ollama` | 11434 | Ollama model server |
| `backend` | 8000 | FastAPI + Cognee |
| `frontend` | 3000 | React UI |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/models` | List Ollama models |
| POST | `/upload` | Ingest a document |
| POST | `/chat` | Query the knowledge graph |
| GET | `/graph` | Get nodes + edges |
| DELETE | `/reset` | Clear all data |

---

## GPU Acceleration (NVIDIA)

To use your GPU with Ollama, uncomment the `deploy` block in `docker-compose.yml`:

```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

You also need the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

---

## Pulling Additional Models

```bash
# Connect to the running Ollama container
docker exec -it cognee-ollama ollama pull mistral:7b
docker exec -it cognee-ollama ollama pull llama3.3:70b
docker exec -it cognee-ollama ollama pull qwen2.5:7b

# List available models
docker exec -it cognee-ollama ollama list
```

Then update `LLM_MODEL` in your `.env` and restart:

```bash
docker compose down && docker compose up
```

---

## Stopping / Resetting

```bash
# Stop containers (keep volumes)
docker compose down

# Stop and delete all data (graphs, uploads, models)
docker compose down -v
```

---

## Troubleshooting

**Backend can't reach Ollama**
→ Wait for `ollama-init` to finish pulling models. Check `docker compose logs ollama-init`.

**Graph is empty after upload**
→ Cognee needs the LLM to extract entities. Small models (< 3B) may fail. Try `llama3.1:8b`.

**Out of memory**
→ Use a smaller model. `llama3.2:3b` + `nomic-embed-text` fits in 8 GB RAM.

**Port already in use**
→ Edit the port mapping in `docker-compose.yml`, e.g. `"8080:8000"` for the backend.
