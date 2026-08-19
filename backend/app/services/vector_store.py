from typing import List, Optional, Dict, Any
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.core.config import settings


@dataclass
class VectorChunk:
    id: str
    document_id: str
    chunk_index: int
    content: str
    embedding: List[float]
    metadata: Dict[str, Any]


@dataclass
class SearchResult:
    id: str
    document_id: str
    chunk_index: int
    content: str
    score: float
    metadata: Dict[str, Any]


class VectorStore(ABC):
    @abstractmethod
    async def upsert(self, chunks: List[VectorChunk]) -> None:
        pass

    @abstractmethod
    async def search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        pass

    @abstractmethod
    async def delete(self, document_id: str) -> None:
        pass

    @abstractmethod
    async def delete_by_ids(self, ids: List[str]) -> None:
        pass


class PineconeVectorStore(VectorStore):
    def __init__(self):
        self.index = None
        self._init_index()

    def _init_index(self):
        if not settings.PINECONE_API_KEY:
            return
        from pinecone import Pinecone, ServerlessSpec

        pc = Pinecone(api_key=settings.PINECONE_API_KEY)

        # Check if index exists
        existing_indexes = [idx.name for idx in pc.list_indexes()]
        if settings.PINECONE_INDEX_NAME not in existing_indexes:
            pc.create_index(
                name=settings.PINECONE_INDEX_NAME,
                dimension=settings.PINECONE_DIMENSION,
                metric=settings.PINECONE_METRIC,
                spec=ServerlessSpec(
                    cloud="aws",
                    region=settings.PINECONE_ENVIRONMENT,
                ),
            )

        self.index = pc.Index(settings.PINECONE_INDEX_NAME)

    async def upsert(self, chunks: List[VectorChunk]) -> None:
        if not self.index:
            raise RuntimeError("Pinecone not initialized")

        vectors = []
        for chunk in chunks:
            metadata = {
                **chunk.metadata,
                "document_id": chunk.document_id,
                "chunk_index": chunk.chunk_index,
                "content": chunk.content[:2000],  # Store truncated for retrieval
            }
            # Pinecone rejects null metadata values
            metadata = {k: v for k, v in metadata.items() if v is not None}
            vectors.append({
                "id": chunk.id,
                "values": chunk.embedding,
                "metadata": metadata,
            })

        # Upsert in batches of 100
        for i in range(0, len(vectors), 100):
            batch = vectors[i : i + 100]
            self.index.upsert(vectors=batch)

    async def search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        if not self.index:
            raise RuntimeError("Pinecone not initialized")

        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            filter=filter_dict,
            include_metadata=True,
            include_values=False,
        )

        return [
            SearchResult(
                id=match.id,
                document_id=match.metadata.get("document_id", ""),
                chunk_index=match.metadata.get("chunk_index", 0),
                content=match.metadata.get("content", ""),
                score=match.score,
                metadata=match.metadata,
            )
            for match in results.matches
        ]

    async def delete(self, document_id: str) -> None:
        if not self.index:
            raise RuntimeError("Pinecone not initialized")

        # Delete by filter
        self.index.delete(filter={"document_id": document_id})

    async def delete_by_ids(self, ids: List[str]) -> None:
        if not self.index:
            raise RuntimeError("Pinecone not initialized")
        self.index.delete(ids=ids)


class QdrantVectorStore(VectorStore):
    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams

            self.client = QdrantClient(url=settings.QDRANT_URL)

            # Create collection if not exists
            collections = self.client.get_collections().collections
            if not any(c.name == settings.QDRANT_COLLECTION_NAME for c in collections):
                self.client.create_collection(
                    collection_name=settings.QDRANT_COLLECTION_NAME,
                    vectors_config=VectorParams(
                        size=settings.PINECONE_DIMENSION,
                        distance=Distance.COSINE,
                    ),
                )
        except Exception:
            pass  # Qdrant optional for local dev

    async def upsert(self, chunks: List[VectorChunk]) -> None:
        if not self.client:
            return
        from qdrant_client.models import PointStruct

        points = [
            PointStruct(
                id=chunk.id,
                vector=chunk.embedding,
                payload={
                    **chunk.metadata,
                    "document_id": chunk.document_id,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                },
            )
            for chunk in chunks
        ]

        self.client.upsert(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            points=points,
        )

    async def search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        if not self.client:
            return []
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        qdrant_filter = None
        if filter_dict:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filter_dict.items()
            ]
            qdrant_filter = Filter(must=conditions)

        results = self.client.search(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            query_vector=query_embedding,
            limit=top_k,
            query_filter=qdrant_filter,
            with_payload=True,
        )

        return [
            SearchResult(
                id=str(point.id),
                document_id=point.payload.get("document_id", ""),
                chunk_index=point.payload.get("chunk_index", 0),
                content=point.payload.get("content", ""),
                score=point.score,
                metadata=point.payload,
            )
            for point in results
        ]

    async def delete(self, document_id: str) -> None:
        if not self.client:
            return
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        self.client.delete(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            points_selector=Filter(
                must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
            ),
        )

    async def delete_by_ids(self, ids: List[str]) -> None:
        if not self.client:
            return
        self.client.delete(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            points_selector=ids,
        )


def get_vector_store() -> VectorStore:
    if settings.PINECONE_API_KEY:
        return PineconeVectorStore()
    return QdrantVectorStore()