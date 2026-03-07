"""SQLite-vec vector store with collection-per-topic namespacing.

Uses sqlite-vec extension for vector search in a local SQLite database.
No external server required — everything persists in a single .db file.
"""

import json
import logging
import os
import sqlite3
from pathlib import Path

import numpy as np
from pydantic import BaseModel
from sqlite_vec import serialize_float32

import sqlite_vec

logger = logging.getLogger(__name__)

KNOWLEDGE_DB_PATH = os.getenv(
    "KNOWLEDGE_DB_PATH",
    str(Path(__file__).parent / "knowledge.db"),
)


class ChunkResult(BaseModel):
    """A single retrieved chunk with metadata."""

    text: str
    source: str
    chunk_index: int
    distance: float
    metadata: dict = {}


class KnowledgeStore:
    """SQLite-vec persistent store with lazy initialization.

    All operations are synchronous. Callers in async
    contexts must use asyncio.to_thread() to avoid blocking the event loop.
    """

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or KNOWLEDGE_DB_PATH
        self._conn: sqlite3.Connection | None = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.enable_load_extension(True)
            sqlite_vec.load(self._conn)
            self._conn.enable_load_extension(False)
            # Create metadata table for tracking collections
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS vec_collections (
                    name TEXT PRIMARY KEY,
                    vector_size INTEGER NOT NULL
                )
            """)
            # Create chunk metadata table
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS vec_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    collection TEXT NOT NULL,
                    text TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}'
                )
            """)
            self._conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_chunks_collection
                ON vec_chunks(collection)
            """)
            self._conn.commit()
            logger.info("Knowledge store initialized at %s", self.db_path)
        return self._conn

    def _ensure_collection(
        self, collection_name: str, vector_size: int,
    ) -> None:
        """Create vec0 virtual table for collection if it doesn't exist."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT vector_size FROM vec_collections WHERE name = ?",
            (collection_name,),
        ).fetchone()
        if row is None:
            table_name = f"vec_{collection_name}"
            conn.execute(f"""
                CREATE VIRTUAL TABLE IF NOT EXISTS [{table_name}]
                USING vec0(embedding float[{vector_size}])
            """)
            conn.execute(
                "INSERT INTO vec_collections (name, vector_size) VALUES (?, ?)",
                (collection_name, vector_size),
            )
            conn.commit()

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

        vector_size = len(embeddings[0])
        self._ensure_collection(collection_name, vector_size)
        conn = self._get_conn()
        table_name = f"vec_{collection_name}"

        for chunk, meta, embedding in zip(chunks, metadatas, embeddings):
            # Insert chunk metadata
            cursor = conn.execute(
                "INSERT INTO vec_chunks (collection, text, metadata_json) VALUES (?, ?, ?)",
                (collection_name, chunk, json.dumps(meta)),
            )
            rowid = cursor.lastrowid
            # Insert vector with matching rowid
            conn.execute(
                f"INSERT INTO [{table_name}] (rowid, embedding) VALUES (?, ?)",
                (rowid, serialize_float32(embedding)),
            )

        conn.commit()
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
        conn = self._get_conn()

        # Check collection exists
        row = conn.execute(
            "SELECT vector_size FROM vec_collections WHERE name = ?",
            (collection_name,),
        ).fetchone()
        if row is None:
            logger.warning("Collection '%s' not found", collection_name)
            return []

        table_name = f"vec_{collection_name}"

        # KNN query via sqlite-vec match with required k constraint
        rows = conn.execute(
            f"""
            SELECT v.rowid, v.distance, c.text, c.metadata_json
            FROM [{table_name}] v
            JOIN vec_chunks c ON c.id = v.rowid
            WHERE v.embedding MATCH ?
                AND k = ?
            ORDER BY v.distance
            """,
            (serialize_float32(query_embedding), n_results),
        ).fetchall()

        chunks = []
        for rowid, distance, text, metadata_json in rows:
            meta = json.loads(metadata_json)
            chunks.append(ChunkResult(
                text=text,
                source=meta.get("source", "unknown"),
                chunk_index=meta.get("chunk_index", 0),
                distance=distance,
                metadata={k: v for k, v in meta.items() if k != "text"},
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
        conn = self._get_conn()
        collections = conn.execute(
            "SELECT name FROM vec_collections"
        ).fetchall()
        result = []
        for (name,) in collections:
            count_row = conn.execute(
                "SELECT COUNT(*) FROM vec_chunks WHERE collection = ?",
                (name,),
            ).fetchone()
            result.append({"name": name, "count": count_row[0]})
        return result

    def delete_collection(self, name: str) -> None:
        """Delete a collection and its data."""
        conn = self._get_conn()
        table_name = f"vec_{name}"
        try:
            conn.execute(f"DROP TABLE IF EXISTS [{table_name}]")
        except sqlite3.OperationalError:
            pass
        conn.execute(
            "DELETE FROM vec_chunks WHERE collection = ?", (name,)
        )
        conn.execute(
            "DELETE FROM vec_collections WHERE name = ?", (name,)
        )
        conn.commit()
        logger.info("Deleted collection '%s'", name)
