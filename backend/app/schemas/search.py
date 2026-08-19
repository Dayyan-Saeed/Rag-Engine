from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    document_ids: Optional[List[UUID]] = None
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)


class SearchResultChunk(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    document_filename: str
    chunk_index: int
    content: str
    page_number: Optional[int] = None
    score: float


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResultChunk]
    total_results: int
    took_ms: float