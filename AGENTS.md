# AGENTS.md — RAG Engine

## Project Overview
Full-stack RAG application: FastAPI backend + Next.js 14 frontend. Upload PDFs/DOCX → chunk + embed (Voyage AI) → vector search (Pinecone) → streaming chat with citations (Groq/Gemini). Auth via Clerk. Deploy: Vercel (frontend) + Railway (backend).

## Commands
```bash
# Backend (from backend/)
pip install -e ".[dev]"          # install deps
alembic upgrade head             # run migrations
uvicorn app.main:app --reload    # dev server (port 8000)
pytest                           # run tests

# Frontend (from frontend/)
npm install                      # install deps
npm run dev                      # dev server (port 3000)
npm run build                    # production build
npm run lint                     # lint
npm run type-check               # tsc --noEmit

# Docker (from root)
docker-compose up -d             # postgres, redis, qdrant, backend, frontend
```

## Key Entry Points
| Area | Path |
|------|------|
| API routes | `backend/app/api/routes.py` |
| RAG pipeline | `backend/app/services/rag.py` |
| Vector store (Pinecone/Qdrant) | `backend/app/services/vector_store.py` |
| Embeddings (Voyage AI) | `backend/app/services/embedding.py` |
| LLM (Groq/Gemini) | `backend/app/services/llm.py` |
| Document parsing | `backend/app/services/document.py` |
| DB models | `backend/app/models/{document,chat,user}.py` |
| Frontend pages | `frontend/app/dashboard/{page,search,chat}/page.tsx` |
| API client | `frontend/lib/api.ts` |

## Architecture Notes
- **Monorepo**: `backend/` (Python) + `frontend/` (TypeScript) — separate deployments
- **Auth**: Clerk JWT verified in `backend/app/core/security.py`; all API routes require `Authorization: Bearer <token>`
- **Multi-tenancy**: Every vector query filtered by `user_id` in `vector_store.py`
- **Vector DB**: Pinecone primary (free tier: 1 index, 100k vectors); Qdrant for local dev only
- **Streaming**: SSE endpoint at `POST /api/v1/chat` returns `text/event-stream`
- **Background processing**: Upload returns 202 immediately; processing runs inline (consider Celery for scale)

## Required Env Vars (`.env`)
```
DATABASE_URL=postgresql+asyncpg://...
PINECONE_API_KEY=...         # required
VOYAGE_API_KEY=...           # required
GROQ_API_KEY=...             # required (primary LLM)
GEMINI_API_KEY=...           # fallback LLM
CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_ISSUER=https://xxx.clerk.accounts.dev
REDIS_URL=redis://localhost:6379/0
```

## Conventions
- **Python**: Ruff (line-length 100, double quotes), mypy strict, pytest-asyncio
- **TypeScript**: ESLint + Prettier + Tailwind, strict TS, path aliases `@/*`
- **Commits**: Not yet established (no git history)
- **Tests**: Backend in `backend/tests/`; frontend not yet configured

## Gotchas
- **Pinecone free tier**: 100k vector limit — monitor `document.chunk_count` sum per user
- **Groq rate limits**: 14k req/day, 30k tokens/min — Gemini fallback auto-enabled in `llm.py`
- **File uploads**: Stored in `backend/uploads/` (ephemeral on Railway); use S3 for production
- **Migrations**: Run `alembic upgrade head` after schema changes in `backend/app/models/`
- **CORS**: Only `localhost:3000` and `*.vercel.app` allowed in `backend/app/main.py`