"""Conversation history and sentence chunking."""

import re
from collections.abc import AsyncIterator

DEFAULT_SYSTEM_PROMPT = (
    "You are a professional interview coach conducting a mock interview. "
    "Ask one question at a time. Keep responses concise and conversational. "
    "After the candidate answers, provide brief feedback then ask the next question."
)

SENTENCE_BOUNDARY = re.compile(r"[.!?]\s|\n")


class ConversationManager:
    """Maintains the session's message history."""

    def __init__(self, system_prompt: str = DEFAULT_SYSTEM_PROMPT):
        self.messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]

    def add_user_message(self, text: str) -> None:
        self.messages.append({"role": "user", "content": text})

    def add_assistant_message(self, text: str) -> None:
        self.messages.append({"role": "assistant", "content": text})

    def get_messages(self) -> list[dict[str, str]]:
        return list(self.messages)

    def reset(self) -> None:
        self.messages = self.messages[:1]


async def chunk_sentences(token_stream: AsyncIterator[str]) -> AsyncIterator[str]:
    """Buffer tokens and yield complete sentences on punctuation boundaries."""
    buffer = ""
    async for token in token_stream:
        buffer += token
        while True:
            match = SENTENCE_BOUNDARY.search(buffer)
            if not match:
                break
            end = match.end()
            sentence = buffer[:end].strip()
            buffer = buffer[end:]
            if sentence:
                yield sentence
    remainder = buffer.strip()
    if remainder:
        yield remainder
