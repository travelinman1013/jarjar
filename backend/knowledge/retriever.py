"""High-level RAG retriever orchestrating embedding + vector search."""

import asyncio
import logging

from .embedder import OllamaEmbedder
from .store import KnowledgeStore, ChunkResult

logger = logging.getLogger(__name__)

# Cosine distance threshold — chunks above this are considered irrelevant.
# With cosine space, distance 0.0 = identical, 2.0 = opposite.
# 0.8 is a reasonable cutoff for "meaningfully related" content.
MAX_DISTANCE_THRESHOLD = 0.8


class KnowledgeRetriever:
    """Orchestrates embedding queries and vector store retrieval.

    ChromaDB operations are synchronous and are dispatched via
    asyncio.to_thread() to avoid blocking the event loop.
    """

    def __init__(
        self,
        embedder: OllamaEmbedder,
        store: KnowledgeStore,
        max_distance: float = MAX_DISTANCE_THRESHOLD,
    ):
        self.embedder = embedder
        self.store = store
        self.max_distance = max_distance

    async def retrieve(
        self,
        query: str,
        collections: list[str],
        top_k: int = 3,
    ) -> list[ChunkResult] | None:
        """Retrieve relevant chunks for a query.

        Returns None if no chunks pass the distance threshold (e.g. for
        conversational queries like "could you repeat the question?").
        """
        if not collections:
            return None

        query_embedding = await self.embedder.embed_query(query)

        # ChromaDB is synchronous — run off the event loop
        chunks = await asyncio.to_thread(
            self.store.query_multi,
            collections,
            query_embedding,
            n_results=top_k,
        )

        # Filter by distance threshold — discard irrelevant results
        relevant = [c for c in chunks if c.distance <= self.max_distance]

        if not relevant:
            logger.debug(
                "No chunks passed distance threshold (%.2f) for query: '%s'",
                self.max_distance,
                query[:80],
            )
            return None

        logger.info(
            "Retrieved %d/%d chunks (threshold %.2f) for: '%s'",
            len(relevant),
            len(chunks),
            self.max_distance,
            query[:80],
        )
        return relevant

    @staticmethod
    def format_context(chunks: list[ChunkResult]) -> str:
        """Format retrieved chunks into a text block for system prompt injection."""
        lines = ["[REFERENCE MATERIAL]"]
        for chunk in chunks:
            heading = chunk.metadata.get("heading", "")
            source_label = chunk.source
            if heading:
                source_label += f" — {heading}"
            lines.append(f"\nSource: {source_label}")
            lines.append(chunk.text)
        lines.append("\n[END REFERENCE MATERIAL]")
        lines.append(
            "Use the reference material above to inform your questions and "
            "evaluate candidate responses. Do not quote it directly — "
            "incorporate the knowledge naturally."
        )
        return "\n".join(lines)
