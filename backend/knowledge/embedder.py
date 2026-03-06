"""Ollama embedding client for local vector embeddings."""

import os
import logging

import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")


class OllamaEmbedder:
    """Async/sync wrapper around Ollama's embedding API."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ):
        self.base_url = (base_url or OLLAMA_BASE_URL).rstrip("/")
        self.model = model or EMBEDDING_MODEL
        self._async_client: httpx.AsyncClient | None = None

    def _get_async_client(self) -> httpx.AsyncClient:
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(timeout=30.0)
        return self._async_client

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single text string asynchronously."""
        client = self._get_async_client()
        response = await client.post(
            f"{self.base_url}/api/embed",
            json={"model": self.model, "input": text},
        )
        response.raise_for_status()
        data = response.json()
        return data["embeddings"][0]

    def embed_query_sync(self, text: str) -> list[float]:
        """Embed a single text string synchronously (for CLI ingestion)."""
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": text},
            )
            response.raise_for_status()
            data = response.json()
            return data["embeddings"][0]

    async def embed_batch(
        self, texts: list[str], batch_size: int = 32,
    ) -> list[list[float]]:
        """Embed multiple texts in batches asynchronously."""
        all_embeddings: list[list[float]] = []
        client = self._get_async_client()
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = await client.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": batch},
            )
            response.raise_for_status()
            data = response.json()
            all_embeddings.extend(data["embeddings"])
        return all_embeddings

    def embed_batch_sync(
        self, texts: list[str], batch_size: int = 32,
    ) -> list[list[float]]:
        """Embed multiple texts in batches synchronously (for CLI ingestion)."""
        all_embeddings: list[list[float]] = []
        with httpx.Client(timeout=60.0) as client:
            for i in range(0, len(texts), batch_size):
                batch = texts[i : i + batch_size]
                response = client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.model, "input": batch},
                )
                response.raise_for_status()
                data = response.json()
                all_embeddings.extend(data["embeddings"])
        return all_embeddings

    async def close(self) -> None:
        if self._async_client:
            await self._async_client.aclose()
            self._async_client = None
