"""LLM client for streaming chat completions via LM Studio."""

import os
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:1234/v1")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "lm-studio")
LLM_MODEL = os.environ.get("LLM_MODEL", "default")

client = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)


async def stream_chat_completion(
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> AsyncIterator[str]:
    """Yield individual tokens from a streaming chat completion."""
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
