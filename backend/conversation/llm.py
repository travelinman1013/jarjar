"""LLM providers for streaming chat completions.

Supports multiple backends:
- lmstudio (default): OpenAI-compatible API pointed at LM Studio
- mlx: Direct in-process inference via mlx-lm (no server needed)

Configured via LLM_PROVIDER env var.
"""

import os
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "lmstudio")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:1234/v1")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "lm-studio")
LLM_MODEL = os.environ.get("LLM_MODEL", "default")
MLX_MODEL = os.environ.get("MLX_MODEL", "mlx-community/Llama-3.2-3B-Instruct-4bit")

# LM Studio client — always available for settings API model listing
client = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)

# Lazy-loaded mlx-lm model/tokenizer
_mlx_model = None
_mlx_tokenizer = None


def _load_mlx_model():
    """Load mlx-lm model and tokenizer on first use."""
    global _mlx_model, _mlx_tokenizer
    if _mlx_model is None:
        from mlx_lm import load
        _mlx_model, _mlx_tokenizer = load(MLX_MODEL)
    return _mlx_model, _mlx_tokenizer


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


async def _stream_mlx(
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[str]:
    """Stream tokens from mlx-lm in-process inference.

    Uses asyncio.to_thread for the blocking generate call, yielding
    tokens via a queue to maintain the async iterator interface.
    """
    import asyncio
    import queue

    model, tokenizer = _load_mlx_model()

    # Convert messages to a prompt string via chat template
    prompt = tokenizer.apply_chat_template(
        messages, add_generation_prompt=True, tokenize=False,
    )

    token_queue: queue.Queue[str | None] = queue.Queue()

    def _generate():
        from mlx_lm import stream_generate
        for response in stream_generate(
            model,
            tokenizer,
            prompt=prompt,
            max_tokens=max_tokens,
            temp=temperature,
        ):
            if response.text:
                token_queue.put(response.text)
        token_queue.put(None)  # Sentinel

    # Run blocking generation in a thread
    task = asyncio.get_event_loop().run_in_executor(None, _generate)

    # Yield tokens as they appear
    while True:
        try:
            token = token_queue.get(timeout=0.05)
            if token is None:
                break
            yield token
        except queue.Empty:
            # Check if generation thread finished with an error
            if task.done():
                task.result()  # Raises if there was an exception
                break
            await asyncio.sleep(0.01)

    await task  # Ensure thread completes
