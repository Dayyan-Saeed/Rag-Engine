from typing import List, Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embedding import EmbeddingService
from app.services.vector_store import get_vector_store, SearchResult, VectorChunk
from app.services.llm import LLMServiceFactory, LLMResponse
from app.services.document import DocumentProcessor, DocumentChunk
from app.models.document import Document, DocumentChunk as DocumentChunkModel
from app.models.chat import ChatSession, ChatMessage, ChatMessageRole
from app.core.config import settings


class RAGService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = EmbeddingService()
        self.vector_store = get_vector_store()
        self.llm_service = LLMServiceFactory.create()
        self.doc_processor = DocumentProcessor()

    async def process_document(self, document: Document, file_path: str) -> None:
        """Process a document: extract, chunk, embed, store."""
        try:
            # Update status to processing
            document.status = "processing"
            await self.db.commit()

            # Extract and chunk
            full_text, page_count, chunks = self.doc_processor.process_file(
                file_path, document.mime_type
            )

            # Generate embeddings
            chunk_texts = [c.content for c in chunks]
            embeddings = await self.embedding_service.embed_texts(chunk_texts)

            # Store in vector DB and database
            vector_chunks = []
            for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                # Create DB record
                db_chunk = DocumentChunkModel(
                    document_id=document.id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    token_count=chunk.token_count,
                    page_number=chunk.page_number,
                    char_start=chunk.char_start,
                    char_end=chunk.char_end,
                )
                self.db.add(db_chunk)
                await self.db.flush()

                # Prepare for vector store
                vector_chunks.append(VectorChunk(
                    id=str(db_chunk.id),
                    document_id=str(document.id),
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    embedding=embedding,
                    metadata={
                        "user_id": document.user_id,
                        "filename": document.filename,
                        "page_number": chunk.page_number,
                    },
                ))

            await self.db.commit()

            # Upsert to vector store
            await self.vector_store.upsert(vector_chunks)

            # Update document
            document.page_count = page_count
            document.chunk_count = len(chunks)
            document.status = "completed"
            document.completed_at = datetime.utcnow()
            await self.db.commit()

        except Exception as e:
            document.status = "failed"
            document.error_message = str(e)
            await self.db.commit()
            raise

    async def search(
        self,
        user_id: str,
        query: str,
        top_k: int = 5,
        document_ids: Optional[List[UUID]] = None,
        min_score: float = 0.0,
    ) -> List[SearchResult]:
        # Embed query
        query_embedding = await self.embedding_service.embed_query(query)

        # Build filter
        filter_dict = {"user_id": user_id}
        if document_ids:
            filter_dict["document_id"] = {"$in": [str(d) for d in document_ids]}

        # Search
        results = await self.vector_store.search(
            query_embedding=query_embedding,
            top_k=top_k,
            filter_dict=filter_dict,
        )

                # Lexical boost: chunks containing exact query terms rank above pure semantic hits
        query_terms = [t.lower() for t in query.split() if len(t) > 2]
        if query_terms:
            for r in results:
                content_lower = r.content.lower()
                hits = sum(1 for t in query_terms if t in content_lower)
                if hits:
                    r.score += 0.15 * hits
            results.sort(key=lambda r: r.score, reverse=True)

        # Filter by min_score
        results = [r for r in results if r.score >= min_score]

        return results

    async def chat(
        self,
        user_id: str,
        message: str,
        session_id: Optional[UUID] = None,
        document_ids: Optional[List[UUID]] = None,
        stream: bool = True,
    ):
        # Get or create session
        if session_id:
            result = await self.db.execute(
                select(ChatSession).where(
                    ChatSession.id == session_id,
                    ChatSession.user_id == user_id,
                )
            )
            session = result.scalar_one_or_none()
            if not session:
                raise ValueError("Session not found")
        else:
            session = ChatSession(
                user_id=user_id,
                title=message[:50],
                document_ids=document_ids or [],
            )
            self.db.add(session)
            await self.db.flush()

        # Save user message
        user_msg = ChatMessage(
            session_id=session.id,
            role=ChatMessageRole.USER,
            content=message,
        )
        self.db.add(user_msg)
        await self.db.flush()

        # Search for relevant context
        search_results = await self.search(
            user_id=user_id,
            query=message,
            top_k=settings.DEFAULT_TOP_K,
            document_ids=document_ids or session.document_ids,
        )

        # Get conversation history
        history_result = await self.db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(10)
        )
        history = list(reversed(history_result.scalars().all()))

        # Build messages for LLM
        messages = [
            {"role": m.role.value, "content": m.content}
            for m in history
        ]

        if stream:
            # Stream response
            full_response = ""
            async for token in self.llm_service.chat_stream(messages, search_results):
                full_response += token
                yield token

            # Save assistant message
            assistant_msg = ChatMessage(
                session_id=session.id,
                role=ChatMessageRole.ASSISTANT,
                content=full_response,
                citations=self._extract_citations(search_results),
            )
            self.db.add(assistant_msg)
            await self.db.commit()

            yield {"type": "done", "session_id": str(session.id)}
        else:
            # Non-streaming
            response = await self.llm_service.generate_response(message, search_results)
            assistant_msg = ChatMessage(
                session_id=session.id,
                role=ChatMessageRole.ASSISTANT,
                content=response.content,
                citations=response.citations,
            )
            self.db.add(assistant_msg)
            await self.db.commit()

            yield {"content": response.content, "citations": response.citations}

    async def create_session(
        self,
        user_id: str,
        title: str,
        document_ids: List[UUID],
    ) -> ChatSession:
        session = ChatSession(
            user_id=user_id,
            title=title,
            document_ids=document_ids,
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def get_sessions(self, user_id: str) -> List[ChatSession]:
        result = await self.db.execute(
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_session(self, user_id: str, session_id: UUID) -> Optional[ChatSession]:
        result = await self.db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_messages(self, session_id: UUID) -> List[ChatMessage]:
        result = await self.db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
        )
        return list(result.scalars().all())

    async def delete_document(self, user_id: str, document_id: UUID) -> bool:
        # Verify ownership
        result = await self.db.execute(
            select(Document).where(
                Document.id == document_id,
                Document.user_id == user_id,
            )
        )
        document = result.scalar_one_or_none()
        if not document:
            return False

        # Delete from vector store
        await self.vector_store.delete(str(document_id))

        # Delete from database (cascades to chunks)
        await self.db.delete(document)
        await self.db.commit()
        return True

    def _extract_citations(self, chunks: List[SearchResult]) -> List[dict]:
        citations = []
        for i, chunk in enumerate(chunks):
            citations.append({
                "source_id": i + 1,
                "document_id": chunk.document_id,
                "filename": chunk.metadata.get("filename", "Unknown"),
                "page_number": chunk.metadata.get("page_number"),
                "chunk_index": chunk.chunk_index,
                "score": chunk.score,
            })
        return citations


from datetime import datetime