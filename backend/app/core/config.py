import os
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    APP_NAME: str = "RAG Engine"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = Field(..., description="PostgreSQL async connection string")

    @property
    def DATABASE_URL_ASYNC(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql+asyncpg://"):
            return url
        for scheme in ("postgresql://", "postgres://"):
            if url.startswith(scheme):
                return url.replace(scheme, "postgresql+asyncpg://", 1)
        return url

    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # Vector DB - Pinecone
    PINECONE_API_KEY: Optional[str] = None
    PINECONE_INDEX_NAME: str = "rag-documents"
    PINECONE_ENVIRONMENT: str = "us-east-1"
    PINECONE_DIMENSION: int = 1024  # voyage-3 dimension
    PINECONE_METRIC: str = "cosine"

    # Vector DB - Qdrant (local dev)
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION_NAME: str = "rag_documents"

    # Embeddings - Voyage AI
    VOYAGE_API_KEY: Optional[str] = None
    VOYAGE_MODEL: str = "voyage-3"
    VOYAGE_BATCH_SIZE: int = 128
    VOYAGE_MIN_INTERVAL: float = 21.0  # free tier: 3 RPM -> 1 call / 20s
    VOYAGE_MAX_TOKENS_PER_CALL: int = 3000  # free tier: 10K TPM safety margin

    # LLM - Groq
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_MAX_TOKENS: int = 4096
    GROQ_TEMPERATURE: float = 0.1

    # LLM - Gemini (fallback)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Auth - Clerk
    CLERK_PUBLISHABLE_KEY: Optional[str] = None
    CLERK_SECRET_KEY: Optional[str] = None
    CLERK_ISSUER: Optional[str] = None

    # Auth - Simple credentials (dev login)
    AUTH_USERNAME: str = "dev-user"
    AUTH_PASSWORD: str = ""
    AUTH_SECRET: str = ""

    # File Upload
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS: set = {".pdf", ".txt", ".md", ".docx"}
    UPLOAD_DIR: str = "./uploads"

    # Chunking
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200

    # Search
    DEFAULT_TOP_K: int = 5
    MAX_TOP_K: int = 20

    # CORS - comma-separated list; overrides environment defaults
    CORS_ORIGINS: str = ""

    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 60
    RATE_LIMIT_WINDOW: int = 60  # seconds


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()