"""Embedding providers for RAG vector search.

Supports multiple backends:
- fastembed: Local ONNX-based embeddings (default, no server needed)
- ollama: Ollama embedding API (requires running Ollama server)

Configured via EMBEDDING_PROVIDER env var.
"""

import logging
import os
from abc import ABC, abstractmethod

import httpx
import numpy as np

logger = logging.getLogger(__name__)

EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "fastembed")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
FASTEMBED_MODEL = os.getenv("FASTEMBED_MODEL", "BAAI/bge-small-en-v1.5")


class BaseEmbedder(ABC):
    """Common interface for embedding providers."""

    @abstractmethod
    async def embed_query(self, text: str) -> list[float]: ...

    @abstractmethod
    def embed_query_sync(self, text: str) -> list[float]: ...

    @abstractmethod
    async def embed_batch(
        self, texts: list[str], batch_size: int = 32,
    ) -> list[list[float]]: ...

    @abstractmethod
    def embed_batch_sync(
        self, texts: list[str], batch_size: int = 32,
    ) -> list[list[float]]: ...

    async def close(self) -> None:
        pass


class FastEmbedEmbedder(BaseEmbedder):
    """Local ONNX-based embeddings via fastembed. No server required."""

    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or FASTEMBED_MODEL
        self._model = None

    def _get_model(self):
        if self._model is None:
            from fastembed import TextEmbedding
            self._model = TextEmbedding(self.model_name)
            logger.info("FastEmbed model loaded: %s", self.model_name)
        return self._model

    def _embed(self, texts: list[str]) -> list[list[float]]:
        model = self._get_model()
        embeddings = list(model.embed(texts))
        return [emb.tolist() for emb in embeddings]

    async def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]

    def embed_query_sync(self, text: str) -> list[float]:
        return self._embed([text])[0]

    async def embed_batch(
        self, texts: list[str], batch_size: int = 32,
    ) -> list[list[float]]:
        return self._embed(texts)

    def embed_batch_sync(
        self, texts: list[str], batch_size: int = 32,
    ) -> list[list[float]]:
        return self._embed(texts)


class OllamaEmbedder(BaseEmbedder):
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
        client = self._get_async_client()
        response = await client.post(
            f"{self.base_url}/api/embed",
            json={"model": self.model, "input": text},
        )
        response.raise_for_status()
        data = response.json()
        return data["embeddings"][0]

    def embed_query_sync(self, text: str) -> list[float]:
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


def create_embedder(provider: str | None = None) -> BaseEmbedder:
    """Factory function to create the configured embedding provider."""
    provider = provider or EMBEDDING_PROVIDER
    if provider == "fastembed":
        return FastEmbedEmbedder()
    elif provider == "ollama":
        return OllamaEmbedder()
    else:
        raise ValueError(f"Unknown embedding provider: {provider}")
