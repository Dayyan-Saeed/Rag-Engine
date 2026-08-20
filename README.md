# RAG Engine

Full-stack Retrieval-Augmented Generation (RAG) application: upload PDFs/DOCX/TXT, ask questions against your documents, and get answers with citations.

## Live

- **Frontend:** https://rag-engine-kappa.vercel.app (login with `AUTH_USERNAME` / `AUTH_PASSWORD`)
- **Backend API:** https://rag-engine-production-bcd2.up.railway.app (`/health`)

## Stack

- **Backend:** FastAPI (Python 3.11) — chunking (LangChain), embeddings (Voyage AI), vector search (Pinecone), streaming chat (Groq with Gemini fallback)
- **Frontend:** Next.js 15 (App Router), Tailwind, TypeScript
- **Infra:** PostgreSQL (async SQLAlchemy), Redis (rate limiting), Docker Compose for local dev
- **Deploy:** Vercel (frontend) + Railway (backend, Postgres, Redis)

## Features

- Credentials login (JWT, 24h expiry) with Redis-backed brute-force protection (5 attempts / 15 min lockout)
- Multi-tenant document storage — every search/chat query is filtered by `user_id`
- Lexical-boosted semantic search with configurable minimum score
- Streaming chat over SSE with source citations
- Upload PDF/DOCX/TXT/MD (Voyage embedding throttle respects free-tier limits)

## Repo Layout

```
backend/   FastAPI app (app/api, app/services, app/core)
frontend/  Next.js 15 app (app/, components/, lib/)
```

## Local Development

```bash
# backend
cd backend
pip install -e ".[dev]"
alembic upgrade head   # or run; schema also auto-creates on startup
uvicorn app.main:app --reload

# frontend
cd frontend
npm install
npm run dev
```

Or run everything with Docker:

```bash
docker compose up -d   # postgres, redis, qdrant, backend, frontend
```

Copy `.env.example` to `.env` and fill in `PINECONE_API_KEY`, `VOYAGE_API_KEY`, `GROQ_API_KEY` (required), plus optional `GEMINI_API_KEY` and Clerk keys.

## Environment Variables

See `.env.example` for the full list with comments. Key ones:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL async URL (`postgresql://` accepted; normalized to `postgresql+asyncpg://`) |
| `REDIS_URL` | no | Redis URL (rate limiting); fails open if unset |
| `PINECONE_API_KEY` | yes | Vector store |
| `VOYAGE_API_KEY` | yes | Embeddings |
| `GROQ_API_KEY` | yes | Primary LLM (`openai/gpt-oss-120b`) |
| `GEMINI_API_KEY` | no | Fallback LLM |
| `AUTH_USERNAME` / `AUTH_PASSWORD` / `AUTH_SECRET` | yes (prod) | Login credentials + JWT signing secret |
| `CORS_ORIGINS` | no | Comma-separated allowed origins; defaults to localhost (dev) or `*.vercel.app` (prod) |
| `ENVIRONMENT` | no | `production` disables the dev auth bypass and localhost CORS |