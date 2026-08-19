from typing import List, AsyncGenerator, Optional
from dataclasses import dataclass
from abc import ABC, abstractmethod

from groq import AsyncGroq
import google.generativeai as genai

from app.core.config import settings
from app.services.vector_store import SearchResult


@dataclass
class LLMResponse:
    content: str
    citations: List[dict]


class LLMService(ABC):
    @abstractmethod
    async def chat_stream(
        self,
        messages: List[dict],
        context_chunks: List[SearchResult],
    ) -> AsyncGenerator[str, None]:
        pass

    @abstractmethod
    async def generate_response(
        self,
        query: str,
        context_chunks: List[SearchResult],
    ) -> LLMResponse:
        pass


SYSTEM_PROMPT = """You are a helpful assistant that answers questions based on the provided document context.

Guidelines:
1. Always cite your sources using the format [Doc: filename, p.X] where X is the page number
2. If the answer is not in the provided context, say "I don't have enough information in the provided documents to answer this question."
3. Be concise but complete
4. Use the context to provide accurate, specific answers
5. When citing, reference the specific document and page number from the context provided"""


class GroqLLMService(LLMService):
    def __init__(self):
        self.client = None
        if settings.GROQ_API_KEY:
            self.client = AsyncGroq(api_key=settings.GROQ_API_KEY)

    async def chat_stream(
        self,
        messages: List[dict],
        context_chunks: List[SearchResult],
    ) -> AsyncGenerator[str, None]:
        if not self.client:
            raise RuntimeError("Groq client not initialized")

        # Build context
        context = self._build_context(context_chunks)

        # Prepare messages with system prompt and context
        system_content = f"{SYSTEM_PROMPT}\n\nContext:\n{context}"
        full_messages = [{"role": "system", "content": system_content}] + messages

        stream = await self.client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=full_messages,
            max_tokens=settings.GROQ_MAX_TOKENS,
            temperature=settings.GROQ_TEMPERATURE,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def generate_response(
        self,
        query: str,
        context_chunks: List[SearchResult],
    ) -> LLMResponse:
        if not self.client:
            raise RuntimeError("Groq client not initialized")

        context = self._build_context(context_chunks)
        system_content = f"{SYSTEM_PROMPT}\n\nContext:\n{context}"

        response = await self.client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": query},
            ],
            max_tokens=settings.GROQ_MAX_TOKENS,
            temperature=settings.GROQ_TEMPERATURE,
        )

        content = response.choices[0].message.content or ""
        citations = self._extract_citations(context_chunks)

        return LLMResponse(content=content, citations=citations)

    def _build_context(self, chunks: List[SearchResult]) -> str:
        if not chunks:
            return "No relevant context found."

        context_parts = []
        for i, chunk in enumerate(chunks):
            doc_name = chunk.metadata.get("filename", "Unknown")
            page = chunk.metadata.get("page_number", "?")
            context_parts.append(
                f"[Source {i+1}: Doc: {doc_name}, p.{page}]\n{chunk.content}"
            )

        return "\n\n---\n\n".join(context_parts)

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


class GeminiLLMService(LLMService):
    def __init__(self):
        self.model = None
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self.model = genai.GenerativeModel(settings.GEMINI_MODEL)

    async def chat_stream(
        self,
        messages: List[dict],
        context_chunks: List[SearchResult],
    ) -> AsyncGenerator[str, None]:
        if not self.model:
            raise RuntimeError("Gemini client not initialized")

        context = self._build_context(context_chunks)
        system_content = f"{SYSTEM_PROMPT}\n\nContext:\n{context}"

        # Convert messages to Gemini format
        prompt = system_content + "\n\n" + "\n".join(
            f"{m['role']}: {m['content']}" for m in messages
        )

        response = await self.model.generate_content_async(
            prompt,
            stream=True,
            generation_config=genai.GenerationConfig(
                max_output_tokens=settings.GROQ_MAX_TOKENS,
                temperature=settings.GROQ_TEMPERATURE,
            ),
        )

        async for chunk in response:
            if chunk.text:
                yield chunk.text

    async def generate_response(
        self,
        query: str,
        context_chunks: List[SearchResult],
    ) -> LLMResponse:
        if not self.model:
            raise RuntimeError("Gemini client not initialized")

        context = self._build_context(context_chunks)
        system_content = f"{SYSTEM_PROMPT}\n\nContext:\n{context}"

        prompt = system_content + "\n\nUser: " + query

        response = await self.model.generate_content_async(
            prompt,
            generation_config=genai.GenerationConfig(
                max_output_tokens=settings.GROQ_MAX_TOKENS,
                temperature=settings.GROQ_TEMPERATURE,
            ),
        )

        content = response.text or ""
        citations = self._extract_citations(context_chunks)

        return LLMResponse(content=content, citations=citations)

    def _build_context(self, chunks: List[SearchResult]) -> str:
        if not chunks:
            return "No relevant context found."

        context_parts = []
        for i, chunk in enumerate(chunks):
            doc_name = chunk.metadata.get("filename", "Unknown")
            page = chunk.metadata.get("page_number", "?")
            context_parts.append(
                f"[Source {i+1}: Doc: {doc_name}, p.{page}]\n{chunk.content}"
            )

        return "\n\n---\n\n".join(context_parts)

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


class LLMServiceFactory:
    @staticmethod
    def create() -> LLMService:
        if settings.GROQ_API_KEY:
            return GroqLLMService()
        if settings.GEMINI_API_KEY:
            return GeminiLLMService()
        raise RuntimeError("No LLM provider configured. Set GROQ_API_KEY or GEMINI_API_KEY.")