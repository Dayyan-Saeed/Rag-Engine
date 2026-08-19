from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID


class ChatSessionCreate(BaseModel):
    title: str = Field(default="New Chat", max_length=500)
    document_ids: List[UUID] = Field(default_factory=list)


class ChatSessionUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    document_ids: Optional[List[UUID]] = None


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: str
    title: str
    document_ids: List[UUID]
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class ChatMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=8000)
    document_ids: Optional[List[UUID]] = None


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    role: str
    content: str
    citations: List[dict] = Field(default_factory=list)
    created_at: datetime


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    session_id: Optional[UUID] = None
    document_ids: Optional[List[UUID]] = None
    stream: bool = True


class ChatStreamChunk(BaseModel):
    type: str  # "token", "citation", "done", "error"
    content: str = ""
    citations: List[dict] = Field(default_factory=list)
    session_id: Optional[UUID] = None