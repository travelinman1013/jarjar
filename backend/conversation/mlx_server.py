"""Managed mlx_lm.server subprocess for LLM_PROVIDER=mlx.

Provides an OpenAI-compatible endpoint on localhost for all LLM consumers
(live conversation, feedback agents, phase router) without requiring LM Studio.
"""

import atexit
import logging
import os
import subprocess
import sys
import urllib.request

from .llm import MLX_MODEL

logger = logging.getLogger(__name__)

MLX_SERVER_PORT = int(os.environ.get("MLX_SERVER_PORT", "8642"))
MLX_SERVER_BASE_URL = f"http://127.0.0.1:{MLX_SERVER_PORT}/v1"

_process: subprocess.Popen | None = None


async def ensure_mlx_server() -> str:
    """Start the mlx_lm.server subprocess if not already running.

    Returns the OpenAI-compatible base URL (e.g. http://127.0.0.1:8642/v1).
    Blocks until the server is healthy (model loaded and ready).
    """
    global _process

    if _process is not None and _process.poll() is None:
        return MLX_SERVER_BASE_URL

    import asyncio

    logger.info(
        "Starting local MLX inference server (model=%s, port=%d)...",
        MLX_MODEL, MLX_SERVER_PORT,
    )

    _process = subprocess.Popen(
        [
            sys.executable, "-m", "mlx_lm.server",
            "--model", MLX_MODEL,
            "--port", str(MLX_SERVER_PORT),
            "--host", "127.0.0.1",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    atexit.register(shutdown_mlx_server)

    # Poll until the server is ready
    for _ in range(120):  # 60s at 500ms intervals
        await asyncio.sleep(0.5)

        if _process.poll() is not None:
            stderr = _process.stderr.read().decode() if _process.stderr else ""
            _process = None
            raise RuntimeError(f"mlx_lm.server exited unexpectedly: {stderr[-500:]}")

        try:
            req = urllib.request.Request(f"http://127.0.0.1:{MLX_SERVER_PORT}/v1/models")
            with urllib.request.urlopen(req, timeout=1):
                logger.info("MLX inference server ready.")
                return MLX_SERVER_BASE_URL
        except Exception:
            continue

    shutdown_mlx_server()
    raise RuntimeError("mlx_lm.server failed to start within 60 seconds")


def shutdown_mlx_server():
    """Terminate the mlx_lm.server subprocess if running."""
    global _process
    if _process is not None and _process.poll() is None:
        logger.info("Shutting down MLX inference server...")
        _process.terminate()
        try:
            _process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _process.kill()
    _process = None
