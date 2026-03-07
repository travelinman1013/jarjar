"""LLM providers for streaming chat completions.

Supports multiple backends:
- lmstudio (default): OpenAI-compatible API pointed at LM Studio
- mlx: OpenAI-compatible API via managed mlx_lm.server subprocess

Configured via LLM_PROVIDER env var.
"""

import os
import re
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

# Matches special tokens like <|channel|>, <|message|>, <|end|>, etc.
_SPECIAL_TOKEN_RE = re.compile(r"<\|[^|]*\|>")


class _SanitizingAsyncOpenAI(AsyncOpenAI):
    """AsyncOpenAI wrapper that strips special tokens from message content."""

    async def post(self, path, *, body=None, **kwargs):
        if isinstance(body, dict):
            for msg in body.get("messages", []):
                content = msg.get("content")
                if isinstance(content, str) and "<|" in content:
                    msg["content"] = _SPECIAL_TOKEN_RE.sub("", content)
        return await super().post(path, body=body, **kwargs)


LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "lmstudio")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:1234/v1")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "lm-studio")
LLM_MODEL = os.environ.get("LLM_MODEL", "default")
MLX_MODEL = os.environ.get("MLX_MODEL", "mlx-community/Llama-3.2-3B-Instruct-4bit")

# LM Studio client — always available for settings API model listing
client = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)

# Lazy-initialized mlx server client
_mlx_client: AsyncOpenAI | None = None


def invalidate_caches():
    """Reset cached mlx client (call when provider or model changes)."""
    global _mlx_client
    _mlx_client = None


async def _get_mlx_client() -> AsyncOpenAI:
    """Get or create an AsyncOpenAI client pointed at the local mlx_lm.server."""
    global _mlx_client
    if _mlx_client is None:
        from .mlx_server import ensure_mlx_server
        base_url = await ensure_mlx_server()
        _mlx_client = _SanitizingAsyncOpenAI(base_url=base_url, api_key="mlx")
    return _mlx_client


async def stream_chat_completion(
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> AsyncIterator[str]:
    """Yield individual tokens from a streaming chat completion.

    Routes to the configured LLM_PROVIDER.
    """
    if LLM_PROVIDER == "mlx":
        async for token in _stream_mlx(messages, temperature, max_tokens):
            yield token
    else:
        async for token in _stream_lmstudio(messages, temperature, max_tokens):
            yield token


async def _stream_lmstudio(
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[str]:
    """Stream tokens from LM Studio via OpenAI-compatible API."""
    response = await client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )
    async for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            yield content


def _coalesce_messages(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Merge consecutive messages with the same role.

    mlx_lm.server requires strict alternating user/assistant roles.
    Consecutive same-role messages can occur after barge-in or failed bot responses.
    """
    if not messages:
        return messages
    result: list[dict[str, str]] = [messages[0]]
    for msg in messages[1:]:
        if msg["role"] == result[-1]["role"]:
            result[-1] = {**result[-1], "content": result[-1]["content"] + "\n" + msg["content"]}
        else:
            result.append(msg)
    # Strip special tokens (e.g. <|channel|>, <|message|>, <|end|>) from
    # non-system messages to prevent mlx_lm.server rejection on next turn
    for msg in result:
        if msg["role"] != "system":
            msg["content"] = _SPECIAL_TOKEN_RE.sub("", msg["content"])
    return result


async def _stream_mlx(
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[str]:
    """Stream tokens from mlx_lm.server via OpenAI-compatible API.

    Filters out <think>...</think> blocks from think-capable models as a
    safety net (the server is also started with enable_thinking=false).
    """
    mlx_client = await _get_mlx_client()
    messages = _coalesce_messages(messages)
    response = await mlx_client.chat.completions.create(
        model=MLX_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )
    in_think = False
    async for chunk in response:
        content = chunk.choices[0].delta.content
        if not content:
            continue

        # Fast path: not in a think block and no tag markers present
        if not in_think and "<" not in content:
            cleaned = _SPECIAL_TOKEN_RE.sub("", content)
            if cleaned:
                yield cleaned
            continue

        # Process character-by-character for think tag boundaries
        buf = ""
        for ch in content:
            buf += ch
            if not in_think:
                if buf.endswith("<think>"):
                    # Entered a think block — drop the tag from output
                    buf = buf[: -len("<think>")]
                    if buf:
                        cleaned = _SPECIAL_TOKEN_RE.sub("", buf)
                        if cleaned:
                            yield cleaned
                    buf = ""
                    in_think = True
            else:
                if buf.endswith("</think>"):
                    # Exited the think block — discard everything inside
                    buf = ""
                    in_think = False

        # Yield any remaining non-think content
        if buf and not in_think:
            cleaned = _SPECIAL_TOKEN_RE.sub("", buf)
            if cleaned:
                yield cleaned
