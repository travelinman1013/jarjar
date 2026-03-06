"""Qdrant vector store wrapper with collection-per-topic namespacing.

Uses Qdrant in local disk mode (no server required). Structurally
identical to the original ChromaDB plan but compatible with Python 3.14.
"""

import os
import logging
from pathlib import Path

from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
)

logger = logging.getLogger(__name__)

QDRANT_PERSIST_DIR = os.getenv(
    "QDRANT_PERSIST_DIR",
    str(Path(__file__).parent / "qdrant_db"),
)


class ChunkResult(BaseModel):
    """A single retrieved chunk with metadata."""

    text: str
    source: str
    chunk_index: int
    distance: float
    metadata: dict = {}


class KnowledgeStore:
    """Qdrant persistent store with lazy initialization.

    All Qdrant local-mode operations are synchronous. Callers in async
    contexts must use asyncio.to_thread() to avoid blocking the event loop.
    """

    def __init__(self, persist_dir: str | None = None):
        self.persist_dir = persist_dir or QDRANT_PERSIST_DIR
        self._client: QdrantClient | None = None

    def _get_client(self) -> QdrantClient:
        if self._client is None:
            self._client = QdrantClient(path=self.persist_dir)
            logger.info("Qdrant initialized at %s", self.persist_dir)
        return self._client

    def _ensure_collection(
        self, collection_name: str, vector_size: int,
    ) -> None:
        """Create collection if it doesn't exist."""
        client = self._get_client()
        if not client.collection_exists(collection_name):
            client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=Distance.COSINE,
                ),
            )

    def add_documents(
        self,
        collection_name: str,
        chunks: list[str],
        metadatas: list[dict],
        embeddings: list[list[float]],
    ) -> int:
        """Add document chunks to a collection. Returns count added."""
        if not embeddings:
            return 0

        self._ensure_collection(collection_name, len(embeddings[0]))
        client = self._get_client()

        # Use existing count as starting ID to allow incremental adds
        existing_count = client.count(collection_name).count

        points = [
            PointStruct(
                id=existing_count + i,
                vector=embedding,
                payload={
                    "text": chunk,
                    **meta,
                },
            )
            for i, (chunk, meta, embedding) in enumerate(
                zip(chunks, metadatas, embeddings)
            )
        ]

        client.upsert(collection_name=collection_name, points=points)
        logger.info(
            "Added %d chunks to collection '%s'", len(chunks), collection_name,
        )
        return len(chunks)

    def query(
        self,
        collection_name: str,
        query_embedding: list[float],
        n_results: int = 5,
    ) -> list[ChunkResult]:
        """Query a single collection by embedding vector."""
        client = self._get_client()
        if not client.collection_exists(collection_name):
            logger.warning("Collection '%s' not found", collection_name)
            return []

        count = client.count(collection_name).count
        if count == 0:
            return []

        results = client.query_points(
            collection_name=collection_name,
            query=query_embedding,
            limit=min(n_results, count),
            with_payload=True,
        )

        chunks = []
        for point in results.points:
            payload = point.payload or {}
            # Qdrant cosine score is similarity (0-1), convert to distance
            distance = 1.0 - point.score
            chunks.append(ChunkResult(
                text=payload.get("text", ""),
                source=payload.get("source", "unknown"),
                chunk_index=payload.get("chunk_index", 0),
                distance=distance,
                metadata={
                    k: v for k, v in payload.items() if k != "text"
                },
            ))
        return chunks

    def query_multi(
        self,
        collection_names: list[str],
        query_embedding: list[float],
        n_results: int = 5,
    ) -> list[ChunkResult]:
        """Query across multiple collections, merge and sort by distance."""
        all_chunks: list[ChunkResult] = []
        for name in collection_names:
            all_chunks.extend(
                self.query(name, query_embedding, n_results=n_results)
            )
        all_chunks.sort(key=lambda c: c.distance)
        return all_chunks[:n_results]

    def list_collections(self) -> list[dict]:
        """List all collections with their document counts."""
        client = self._get_client()
        collections = client.get_collections().collections
        return [
            {"name": c.name, "count": client.count(c.name).count}
            for c in collections
        ]

    def delete_collection(self, name: str) -> None:
        """Delete a collection."""
        client = self._get_client()
        client.delete_collection(collection_name=name)
        logger.info("Deleted collection '%s'", name)
