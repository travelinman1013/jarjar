"""Speech-to-text using mlx-whisper on Apple Silicon.

Transcribes complete utterances from PCM audio bytes
using the MLX-accelerated Whisper model.
"""

import numpy as np
import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"


class SpeechToText:
    """MLX-Whisper transcription wrapper."""

    def __init__(self, model: str = MODEL):
        self.model = model
        self._loaded = False

    def load_model(self):
        """Pre-load the whisper model. Downloads on first run (~1.5GB)."""
        # Trigger model download + load by transcribing silence
        silence = np.zeros(16000, dtype=np.float32)
        mlx_whisper.transcribe(
            silence,
            path_or_hf_repo=self.model,
            language="en",
        )
        self._loaded = True

    def transcribe_sync(self, pcm_bytes: bytes) -> str:
        """Transcribe PCM audio bytes to text (synchronous).

        Args:
            pcm_bytes: 16-bit signed little-endian PCM at 16kHz mono

        Returns:
            Transcribed text, or empty string if nothing detected.
        """
        audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0

        if len(audio) < 1600:  # Less than 100ms — skip
            return ""

        result = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=self.model,
            language="en",
        )
        return result["text"].strip()
