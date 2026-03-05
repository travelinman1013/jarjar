"""Kokoro TTS wrapper for text-to-speech synthesis (kokoro-onnx)."""

import asyncio
import logging
import os
import re
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

KOKORO_SAMPLE_RATE = 24000
KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "af_heart")

MODELS_DIR = Path(__file__).parent.parent / "models" / "kokoro"
MODEL_PATH = MODELS_DIR / "kokoro-v1.0.onnx"
VOICES_PATH = MODELS_DIR / "voices-v1.0.bin"


class TextToSpeech:
    """Sentence-level TTS using kokoro-onnx. Returns Int16 PCM at 24kHz."""

    def __init__(self):
        self._kokoro = None

    def load_model(self) -> None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"\n\nKokoro model not found at {MODEL_PATH}\n"
                f"Download it with:\n"
                f"  cd {MODELS_DIR}\n"
                f"  wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx\n"
            )
        if not VOICES_PATH.exists():
            raise FileNotFoundError(
                f"\n\nKokoro voices not found at {VOICES_PATH}\n"
                f"Download it with:\n"
                f"  cd {MODELS_DIR}\n"
                f"  wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin\n"
            )

        from kokoro_onnx import Kokoro

        self._kokoro = Kokoro(str(MODEL_PATH), str(VOICES_PATH))
        logger.info(f"Kokoro TTS loaded. Available voices: {self._kokoro.get_voices()}")

    def _synthesize_sync(self, text: str) -> bytes:
        clean = re.sub(r'[^\w\s.,!?\'\"-]', '', text)
        if not clean.strip():
            return b""
        audio_np, _ = self._kokoro.create(clean, voice=KOKORO_VOICE, lang="en-us")
        int16 = (audio_np * 32767).astype(np.int16)
        return int16.tobytes()

    async def synthesize(self, text: str) -> bytes:
        return await asyncio.to_thread(self._synthesize_sync, text)
