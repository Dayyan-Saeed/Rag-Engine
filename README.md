# RAG Engine - AI-Powered Semantic Search & Document Q&A

A full-stack web application for uploading documents, semantic search, and conversational Q&A using RAG (Retrieval-Augmented Generation).

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js 14    │────▶│   FastAPI       │────▶│   Pinecone      │
│   (Vercel)      │     │   (Railway)     │     │   (Vector DB)   │
│   - Upload UI   │     │   - PDF parse   │     │                 │
│   - Search/Chat │     │   - Chunk/embed │     │                 │
│   - Clerk Auth  │     │   - RAG search  │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
            ┌───────────────┐         ┌───────────────┐
            │  PostgreSQL   │         │  Free LLM/    │
            │  (Neon)       │         │  Embedding    │
            │  - Users      │         │  APIs         │
            │  - Docs meta  │         │  - Groq/Gemini│
            │  - Chat hist  │         │  - Voyage AI  │
            └───────────────┘         └───────────────┘
```

## Features

- **Document Upload**: Drag & drop PDF, TXT, MD, DOCX (up to 50MB)
- **Smart Chunking**: Recursive text splitting with token-aware boundaries
- **Vector Search**: Semantic search with Pinecone (100k vectors free tier)
- **RAG Chat**: Streaming responses with citations
- **Multi-tenant**: User isolation via Clerk authentication
- **Free Tier Optimized**: All services have generous free tiers

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11, SQLAlchemy 2.0 |
| Database | PostgreSQL (Neon), pgvector extension |
| Vector DB | Pinecone (primary), Qdrant (local dev) |
| Embeddings | Voyage AI (voyage-3, 1024-dim) |
| LLM | Groq (llama-3.1-70b), Gemini 1.5 Flash (fallback) |
| Auth | Clerk |
| Queue/Cache | Redis (Upstash) |
| Hosting | Vercel (frontend), Railway/Render (backend) |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Python 3.11+
- Accounts for: Pinecone, Voyage AI, Groq, Clerk, Neon (or use local Docker)

### 1. Clone & Configure

```bash
git clone <repo>
cd rag-engine

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# Required: DATABASE_URL, PINECONE_API_KEY, VOYAGE_API_KEY, GROQ_API_KEY, CLERK_*
```

### 2. Local Development (Docker)

```bash
# Start all services
docker-compose up -d

# Backend: http://localhost:8000
# Frontend: http://localhost:3000
# API Docs: http://localhost:8000/docs
# Qdrant UI: http://localhost:6333/dashboard
```

### 3. Run Migrations

```bash
cd backend
alembic upgrade head
```

### 4. Manual Development (without Docker)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `PINECONE_API_KEY` | Pinecone API key | Yes |
| `PINECONE_INDEX_NAME` | Index name (default: rag-documents) | No |
| `VOYAGE_API_KEY` | Voyage AI API key | Yes |
| `GROQ_API_KEY` | Groq API key | Yes |
| `GEMINI_API_KEY` | Gemini API key (fallback) | No |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key | Yes |
| `CLERK_SECRET_KEY` | Clerk secret key | Yes |
| `CLERK_ISSUER` | Clerk issuer URL | Yes |
| `REDIS_URL` | Redis connection string | No |
| `QDRANT_URL` | Qdrant URL for local dev | No |

## API Endpoints

### Documents
- `POST /api/v1/documents/upload` - Upload document
- `GET /api/v1/documents` - List documents
- `GET /api/v1/documents/{id}/status` - Processing status
- `DELETE /api/v1/documents/{id}` - Delete document

### Search
- `POST /api/v1/search` - Semantic search

### Chat
- `POST /api/v1/chat/sessions` - Create session
- `GET /api/v1/chat/sessions` - List sessions
- `GET /api/v1/chat/sessions/{id}` - Get session
- `GET /api/v1/chat/sessions/{id}/messages` - Get messages
- `POST /api/v1/chat` - Streaming chat (SSE)
- `DELETE /api/v1/chat/sessions/{id}` - Delete session

## Deployment

### Frontend (Vercel)
1. Connect GitHub repo to Vercel
2. Add environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://your-backend.railway.app`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
3. Deploy

### Backend (Railway)
1. Create new project from GitHub
2. Add PostgreSQL, Redis plugins
3. Set environment variables (all from .env)
4. Set build command: `pip install -e ".[dev]" && alembic upgrade head`
5. Set start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### Database (Neon)
1. Create Neon project
2. Enable `pgvector` extension in SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copy connection string to `DATABASE_URL`

### Vector DB (Pinecone)
1. Create Pinecone account
2. Create index: `rag-documents`, dimension 1024, cosine metric, serverless (AWS us-east-1)
3. Copy API key to `PINECONE_API_KEY`

## Project Structure

```
rag-engine/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/
│   │   ├── api/routes.py          # API endpoints
│   │   ├── core/                  # Config, DB, Security
│   │   ├── models/                # SQLAlchemy models
│   │   ├── schemas/               # Pydantic schemas
│   │   ├── services/              # Business logic
│   │   │   ├── document.py        # PDF/DOCX processing
│   │   │   ├── embedding.py       # Voyage AI embeddings
│   │   │   ├── vector_store.py    # Pinecone/Qdrant
│   │   │   ├── llm.py             # Groq/Gemini LLM
│   │   │   └── rag.py             # RAG pipeline
│   │   └── main.py                # FastAPI app
│   ├── alembic/                   # Migrations
│   ├── pyproject.toml
│   ├── Dockerfile
│   └── alembic.ini
├── frontend/
│   ├── app/
│   │   ├── dashboard/             # Main app pages
│   │   ├── sign-in/               # Clerk auth
│   │   └── layout.tsx
│   ├── components/                # React components
│   ├── hooks/                     # Custom hooks
│   ├── lib/                       # Utils, API client
│   ├── package.json
│   └── Dockerfile
└── README.md
```

## Free Tier Limits

| Service | Limit |
|---------|-------|
| Pinecone | 1 index, 100k vectors |
| Neon | 512MB storage |
| Railway | $5/month credit (~500 hrs) |
| Vercel | Unlimited personal |
| Groq | 14k req/day, 30k tokens/min |
| Voyage AI | 200M tokens/month |
| Clerk | 10k MAU |
| Upstash Redis | 10k req/day |

## Development

### Running Tests
```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

### Code Quality
```bash
# Backend
ruff check .
ruff format .
mypy .

# Frontend
npm run lint
npm run type-check
```

## License

MIT