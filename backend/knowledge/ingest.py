"""CLI tool for ingesting documents into the RAG knowledge base.

Usage:
    cd backend
    python -m knowledge.ingest ingest knowledge/content/system_design/ --collection system_design
    python -m knowledge.ingest list
    python -m knowledge.ingest query "consistent hashing" --collection system_design
    python -m knowledge.ingest delete system_design
"""

import argparse
import re
import sys
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

from .embedder import OllamaEmbedder
from .store import KnowledgeStore

HEADING_PATTERN = re.compile(r"^#{1,3}\s+(.+)", re.MULTILINE)

splitter = RecursiveCharacterTextSplitter(
    chunk_size=1500,
    chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " "],
)


def extract_heading_for_chunk(full_text: str, chunk_text: str) -> str:
    """Find the nearest markdown heading above a chunk's position."""
    chunk_start = full_text.find(chunk_text[:80])
    if chunk_start == -1:
        return ""
    headings = list(HEADING_PATTERN.finditer(full_text))
    nearest = ""
    for match in headings:
        if match.start() <= chunk_start:
            nearest = match.group(1).strip()
        else:
            break
    return nearest


def ingest_file(
    file_path: Path,
    collection_name: str,
    embedder: OllamaEmbedder,
    store: KnowledgeStore,
) -> int:
    """Ingest a single file into a collection. Returns chunk count."""
    text = file_path.read_text(encoding="utf-8")
    if not text.strip():
        return 0

    chunks = splitter.split_text(text)
    if not chunks:
        return 0

    metadatas = []
    for i, chunk in enumerate(chunks):
        heading = extract_heading_for_chunk(text, chunk)
        metadatas.append({
            "source": file_path.name,
            "chunk_index": i,
            "heading": heading,
            "total_chunks": len(chunks),
        })

    print(f"  Embedding {len(chunks)} chunks from {file_path.name}...")
    embeddings = embedder.embed_batch_sync(chunks)

    store.add_documents(collection_name, chunks, metadatas, embeddings)
    return len(chunks)


def cmd_ingest(args: argparse.Namespace) -> None:
    """Ingest files from a path into a named collection."""
    path = Path(args.path)
    if not path.exists():
        print(f"Error: {path} does not exist")
        sys.exit(1)

    embedder = OllamaEmbedder()
    store = KnowledgeStore()

    files: list[Path] = []
    if path.is_file():
        files = [path]
    else:
        files = sorted(path.glob("**/*.md")) + sorted(path.glob("**/*.txt"))

    if not files:
        print(f"No .md or .txt files found in {path}")
        sys.exit(1)

    total_chunks = 0
    for f in files:
        count = ingest_file(f, args.collection, embedder, store)
        total_chunks += count
        print(f"  {f.name}: {count} chunks")

    print(f"\nIngested {total_chunks} total chunks into '{args.collection}'")


def cmd_list(args: argparse.Namespace) -> None:
    """List all collections and their document counts."""
    store = KnowledgeStore()
    collections = store.list_collections()
    if not collections:
        print("No collections found.")
        return
    print(f"{'Collection':<30} {'Documents':>10}")
    print("-" * 42)
    for c in collections:
        print(f"{c['name']:<30} {c['count']:>10}")


def cmd_query(args: argparse.Namespace) -> None:
    """Test retrieval against a collection."""
    embedder = OllamaEmbedder()
    store = KnowledgeStore()

    print(f"Embedding query: '{args.text}'")
    embedding = embedder.embed_query_sync(args.text)

    collections = [args.collection] if args.collection else [
        c["name"] for c in store.list_collections()
    ]

    chunks = store.query_multi(collections, embedding, n_results=args.top_k)
    if not chunks:
        print("No results found.")
        return

    for i, chunk in enumerate(chunks, 1):
        print(f"\n--- Result {i} (distance: {chunk.distance:.4f}) ---")
        print(f"Source: {chunk.source}")
        if chunk.metadata.get("heading"):
            print(f"Heading: {chunk.metadata['heading']}")
        print(f"\n{chunk.text[:500]}{'...' if len(chunk.text) > 500 else ''}")


def cmd_delete(args: argparse.Namespace) -> None:
    """Delete a collection."""
    store = KnowledgeStore()
    store.delete_collection(args.collection)
    print(f"Deleted collection '{args.collection}'")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="RAG Knowledge Base ingestion tool",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # ingest
    p_ingest = subparsers.add_parser("ingest", help="Ingest documents")
    p_ingest.add_argument("path", help="File or directory to ingest")
    p_ingest.add_argument(
        "--collection", required=True, help="Target collection name",
    )
    p_ingest.set_defaults(func=cmd_ingest)

    # list
    p_list = subparsers.add_parser("list", help="List collections")
    p_list.set_defaults(func=cmd_list)

    # query
    p_query = subparsers.add_parser("query", help="Test retrieval")
    p_query.add_argument("text", help="Query text")
    p_query.add_argument("--collection", help="Collection to query")
    p_query.add_argument("--top-k", type=int, default=5, help="Results count")
    p_query.set_defaults(func=cmd_query)

    # delete
    p_delete = subparsers.add_parser("delete", help="Delete a collection")
    p_delete.add_argument("collection", help="Collection name")
    p_delete.set_defaults(func=cmd_delete)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
