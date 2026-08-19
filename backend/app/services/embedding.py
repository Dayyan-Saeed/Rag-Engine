import asyncio
import time
import voyageai
from typing import List, Optional
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings


_last_embed_call = 0.0
_rate_lock = asyncio.Lock()


async def _throttle() -> None:
    """Respect Voyage free-tier rate limits (3 RPM / 10K TPM) globally."""
    global _last_embed_call
    async with _rate_lock:
        elapsed = time.monotonic() - _last_embed_call
        min_interval = settings.VOYAGE_MIN_INTERVAL
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        _last_embed_call = time.monotonic()


def _estimate_tokens(texts: List[str]) -> int:
    return sum(len(t) // 4 + 1 for t in texts)


class EmbeddingService:
    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        if settings.VOYAGE_API_KEY:
            self.client = voyageai.Client(api_key=settings.VOYAGE_API_KEY)

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=5, min=20, max=60),
    )
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not self.client:
            raise RuntimeError("Voyage AI client not initialized. Set VOYAGE_API_KEY.")

        if not texts:
            return []

        all_embeddings = []
        batch = []
        batch_tokens = 0

        for text in texts:
            tokens = _estimate_tokens([text])
            if batch and batch_tokens + tokens > settings.VOYAGE_MAX_TOKENS_PER_CALL:
                await _throttle()
                result = await asyncio.to_thread(
                    self.client.embed,
                    batch,
                    model=settings.VOYAGE_MODEL,
                    input_type="document",
                )
                all_embeddings.extend(result.embeddings)
                batch = []
                batch_tokens = 0
            batch.append(text)
            batch_tokens += tokens

        if batch:
            await _throttle()
            result = await asyncio.to_thread(
                self.client.embed,
                batch,
                model=settings.VOYAGE_MODEL,
                input_type="document",
            )
            all_embeddings.extend(result.embeddings)

        return all_embeddings

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=5, min=20, max=60),
    )
    async def embed_query(self, text: str) -> List[float]:
        if not self.client:
            raise RuntimeError("Voyage AI client not initialized. Set VOYAGE_API_KEY.")

        await _throttle()
        result = await asyncio.to_thread(
            self.client.embed,
            [text],
            model=settings.VOYAGE_MODEL,
            input_type="query",
        )
        return result.embeddings[0]

    def get_dimension(self) -> int:
        return settings.PINECONE_DIMENSION