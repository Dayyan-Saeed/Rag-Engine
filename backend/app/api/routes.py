import os
import shutil
import hmac
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, CurrentUser
from app.services.document import get_document_processor
from app.services.rag import RAGService
from app.models.document import Document, DocumentStatus
from app.schemas.document import (
    DocumentResponse,
    DocumentListResponse,
    DocumentStatusResponse,
)
from app.schemas.search import SearchRequest, SearchResponse
from app.schemas.chat import (
    ChatSessionCreate,
    ChatSessionUpdate,
    ChatSessionResponse,
    ChatRequest,
    ChatStreamChunk,
)
from app.core.config import settings
from app.core.security import (
    get_current_user,
    CurrentUser,
    create_simple_token,
    SIMPLE_TOKEN_EXPIRES,
)
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter()

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    username_ok = hmac.compare_digest(body.username.encode(), settings.AUTH_USERNAME.encode())
    password_ok = hmac.compare_digest(body.password.encode(), settings.AUTH_PASSWORD.encode())
    if not (username_ok and password_ok):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_simple_token(settings.AUTH_USERNAME)
    return LoginResponse(
        access_token=token,
        user_id=settings.AUTH_USERNAME,
        expires_in=SIMPLE_TOKEN_EXPIRES,
    )


@router.post("/documents/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}",
        )

    # Read file to check size
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large")

    # Save file
    file_id = str(UUID(int=0))  # placeholder, will use document.id
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
    with open(file_path, "wb") as f:
        f.write(content)

    # Create document record
    document = Document(
        user_id=current_user.user_id,
        filename=f"{file_id}{ext}",
        original_filename=file.filename,
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        status=DocumentStatus.PENDING,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    # Rename file with actual document ID
    actual_path = os.path.join(UPLOAD_DIR, f"{document.id}{ext}")
    os.rename(file_path, actual_path)
    document.filename = f"{document.id}{ext}"
    await db.commit()

    # Process in background
    rag_service = RAGService(db)
    try:
        await rag_service.process_document(document, actual_path)
    except Exception:
        pass  # document.status/error_message set by process_document; return 202 with status
    finally:
        await db.refresh(document)

    return document


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    page: int = 1,
    page_size: int = 20,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select, func

    # Count total
    total_result = await db.execute(
        select(func.count(Document.id)).where(Document.user_id == current_user.user_id)
    )
    total = total_result.scalar()

    # Get documents
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.user_id)
        .order_by(Document.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    documents = list(result.scalars().all())

    return DocumentListResponse(
        documents=documents,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select

    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.user_id,
        )
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    progress = None
    if document.status == DocumentStatus.PROCESSING and document.chunk_count > 0:
        progress = min(document.chunk_count / max(document.chunk_count, 1), 1.0)

    return DocumentStatusResponse(
        id=document.id,
        status=document.status.value,
        progress=progress,
        error_message=document.error_message,
        chunk_count=document.chunk_count,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rag_service = RAGService(db)
    success = await rag_service.delete_document(current_user.user_id, document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete file
    file_path = os.path.join(UPLOAD_DIR, f"{document_id}")
    for ext in settings.ALLOWED_EXTENSIONS:
        full_path = file_path + ext
        if os.path.exists(full_path):
            os.remove(full_path)
            break


@router.post("/search", response_model=SearchResponse)
async def search_documents(
    request: SearchRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import time

    start = time.time()
    rag_service = RAGService(db)

    results = await rag_service.search(
        user_id=current_user.user_id,
        query=request.query,
        top_k=request.top_k,
        document_ids=request.document_ids,
        min_score=request.min_score,
    )

    took_ms = (time.time() - start) * 1000

    # Convert to response format
    from app.schemas.search import SearchResultChunk
    response_results = [
        SearchResultChunk(
            id=UUID(r.id),
            document_id=UUID(r.document_id),
            document_filename=r.metadata.get("filename", "Unknown"),
            chunk_index=r.chunk_index,
            content=r.content,
            page_number=r.metadata.get("page_number"),
            score=r.score,
        )
        for r in results
    ]

    return SearchResponse(
        query=request.query,
        results=response_results,
        total_results=len(response_results),
        took_ms=took_ms,
    )


# Chat endpoints
@router.post("/chat/sessions", response_model=ChatSessionResponse)
async def create_chat_session(
    request: ChatSessionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rag_service = RAGService(db)
    session = await rag_service.create_session(
        user_id=current_user.user_id,
        title=request.title,
        document_ids=request.document_ids,
    )
    return session


@router.get("/chat/sessions", response_model=List[ChatSessionResponse])
async def list_chat_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rag_service = RAGService(db)
    sessions = await rag_service.get_sessions(current_user.user_id)
    return sessions


@router.get("/chat/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(
    session_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rag_service = RAGService(db)
    session = await rag_service.get_session(current_user.user_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/chat")
async def chat(
    request: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import StreamingResponse
    import json

    rag_service = RAGService(db)

    async def event_generator():
        try:
            async for chunk in rag_service.chat(
                user_id=current_user.user_id,
                message=request.message,
                session_id=request.session_id,
                document_ids=request.document_ids,
                stream=request.stream,
            ):
                if isinstance(chunk, str):
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
                elif isinstance(chunk, dict) and chunk.get("type") == "done":
                    yield f"data: {json.dumps(chunk)}\n\n"
                elif isinstance(chunk, dict):
                    yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    if request.stream:
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )
    else:
        rag_gen = rag_service.chat(
            user_id=current_user.user_id,
            message=request.message,
            session_id=request.session_id,
            document_ids=request.document_ids,
            stream=False,
        )
        response = None
        async for chunk in rag_gen:
            response = chunk
        return {"content": response["content"], "citations": response["citations"]}


@router.get("/chat/sessions/{session_id}/messages")
async def get_chat_messages(
    session_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rag_service = RAGService(db)
    session = await rag_service.get_session(current_user.user_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = await rag_service.get_messages(session_id)
    return messages


@router.delete("/chat/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_session(
    session_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.models.chat import ChatSession

    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(session)
    await db.commit()