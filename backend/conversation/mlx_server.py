"""Managed mlx_lm.server subprocess for LLM_PROVIDER=mlx.

Provides an OpenAI-compatible endpoint on localhost for all LLM consumers
(live conversation, feedback agents, phase router) without requiring LM Studio.
"""

import atexit
import collections
import logging
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.request

logger = logging.getLogger(__name__)

MLX_SERVER_PORT = int(os.environ.get("MLX_SERVER_PORT", "8642"))
MLX_SERVER_BASE_URL = f"http://127.0.0.1:{MLX_SERVER_PORT}/v1"

_process: subprocess.Popen | None = None
_start_time: float | None = None
_reader_thread: threading.Thread | None = None

# Thread-safe under CPython's GIL: deque with maxlen is safe for single-producer
# (stderr reader thread) / single-consumer (main thread) append/iteration.
# Do not replace with a non-thread-safe container without adding a lock.
_log_buffer: collections.deque[str] = collections.deque(maxlen=200)


def _read_stderr(proc: subprocess.Popen) -> None:
    """Read stderr from the mlx_lm.server subprocess into the ring buffer.

    Runs in a daemon thread. Exits naturally when the process closes stderr.
    """
    try:
        for line in proc.stderr:  # type: ignore[union-attr]
            decoded = line.decode("utf-8", errors="replace").rstrip()
            if decoded:
                _log_buffer.append(decoded)
                logger.debug("mlx_lm.server: %s", decoded)
    except (ValueError, OSError):
        # stderr closed or process gone
        pass


async def ensure_mlx_server() -> str:
    """Start the mlx_lm.server subprocess if not already running.

    Returns the OpenAI-compatible base URL (e.g. http://127.0.0.1:8642/v1).
    Blocks until the server is healthy (model loaded and ready).
    """
    global _process, _start_time, _reader_thread

    proc = _process  # snapshot to avoid SIGTERM race
    if proc is not None and proc.poll() is None:
        return MLX_SERVER_BASE_URL

    import asyncio
    from .llm import MLX_MODEL

    logger.info(
        "Starting local MLX inference server (model=%s, port=%d)...",
        MLX_MODEL, MLX_SERVER_PORT,
    )

    _log_buffer.clear()
    _process = subprocess.Popen(
        [
            sys.executable, "-m", "mlx_lm.server",
            "--model", MLX_MODEL,
            "--port", str(MLX_SERVER_PORT),
            "--host", "127.0.0.1",
            # Limit KV cache to 1 entry to prevent cache merge crashes on
            # sequential requests (mlx_lm bug with BatchRotatingKVCache.merge)
            "--prompt-cache-size", "1",
            # Disable thinking for think-capable models (e.g. OlMo-Think) to
            # prevent <think>...</think> tokens from being streamed to users
            "--chat-template-args", '{"enable_thinking":false}',
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    _start_time = time.monotonic()
    atexit.register(shutdown_mlx_server)

    # SIGTERM handler for uvicorn --reload (atexit doesn't fire on signal kill)
    try:
        signal.signal(signal.SIGTERM, lambda *_: shutdown_mlx_server())
    except ValueError:
        # signal.signal() must be called from the main thread
        logger.debug("Cannot register SIGTERM handler from non-main thread")

    # Start daemon thread to consume stderr into ring buffer
    _reader_thread = threading.Thread(
        target=_read_stderr, args=(_process,), daemon=True,
    )
    _reader_thread.start()

    # Poll until the server is ready
    for _ in range(120):  # 60s at 500ms intervals
        await asyncio.sleep(0.5)

        if _process.poll() is not None:
            # Process exited — grab recent log lines for the error message
            recent = "\n".join(list(_log_buffer)[-20:])
            _process = None
            _start_time = None
            _reader_thread = None
            raise RuntimeError(f"mlx_lm.server exited unexpectedly:\n{recent}")

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
    global _process, _start_time, _reader_thread
    proc = _process  # snapshot to avoid races with concurrent callers
    _process = None
    _start_time = None
    _reader_thread = None
    if proc is not None and proc.poll() is None:
        logger.info("Shutting down MLX inference server...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def get_mlx_status() -> dict:
    """Return current MLX server status for the REST API."""
    from .llm import MLX_MODEL

    proc = _process  # snapshot to avoid races
    running = proc is not None and proc.poll() is None
    return {
        "running": running,
        "model": MLX_MODEL if running else None,
        "port": MLX_SERVER_PORT,
        "pid": proc.pid if running and proc else None,
        "uptime_seconds": round(time.monotonic() - _start_time, 1) if running and _start_time else None,
    }


def get_mlx_logs() -> list[str]:
    """Return recent MLX server log lines from the ring buffer."""
    return list(_log_buffer)
