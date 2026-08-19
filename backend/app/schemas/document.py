from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID


class DocumentBase(BaseModel):
    filename: str
    original_filename: str
    file_size: int
    mime_type: str


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(BaseModel):
    status: Optional[str] = None
    error_message: Optional[str] = None
    page_count: Optional[int] = None
    chunk_count: Optional[int] = None


class DocumentResponse(DocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: str
    page_count: int
    chunk_count: int
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int
    page: int
    page_size: int


class DocumentStatusResponse(BaseModel):
    id: UUID
    status: str
    progress: Optional[float] = None
    error_message: Optional[str] = None
    chunk_count: Optional[int] = None