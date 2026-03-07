"""Silero VAD wrapper for voice activity detection.

Segments incoming audio into speech chunks and detects
end-of-turn silence using a configurable threshold.
"""

import os
import numpy as np
import torch
from silero_vad import load_silero_vad, VADIterator

# Configurable silence threshold (ms) for end-of-turn detection.
# Higher values = more tolerant of pauses within a turn.
SILENCE_THRESHOLD_MS = int(os.environ.get("VAD_SILENCE_MS", "800"))

# Silero VAD expects 512-sample chunks at 16kHz (32ms windows)
WINDOW_SIZE = 512
SAMPLE_RATE = 16000
SPEECH_THRESHOLD = 0.7


class VoiceActivityDetector:
    """Processes 16kHz 16-bit PCM chunks through Silero VAD.

    Accumulates speech audio and emits events when speech
    starts and ends (after SILENCE_THRESHOLD_MS of silence).
    """

    def __init__(self, silence_ms: int | None = None):
        self._model = load_silero_vad(onnx=False)
        self._vad_iterator = VADIterator(
            self._model,
            threshold=SPEECH_THRESHOLD,
            sampling_rate=SAMPLE_RATE,
            min_silence_duration_ms=silence_ms if silence_ms is not None else SILENCE_THRESHOLD_MS,
        )
        self._pcm_buffer = bytearray()
        self._speech_audio = bytearray()
        self._is_speaking = False

    def process_chunk(self, pcm_bytes: bytes) -> list[dict]:
        """Feed a PCM chunk and return a list of events.

        Events:
          {"event": "speech_start"}
          {"event": "speech_end", "audio": bytes}
        """
        self._pcm_buffer.extend(pcm_bytes)
        events: list[dict] = []
        bytes_per_window = WINDOW_SIZE * 2  # 16-bit = 2 bytes per sample

        while len(self._pcm_buffer) >= bytes_per_window:
            window_bytes = bytes(self._pcm_buffer[:bytes_per_window])
            del self._pcm_buffer[:bytes_per_window]

            # Convert int16 PCM to float32 tensor
            samples = np.frombuffer(window_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            tensor = torch.from_numpy(samples)

            result = self._vad_iterator(tensor)

            if result is not None:
                if "start" in result:
                    self._is_speaking = True
                    self._speech_audio.clear()
                    events.append({"event": "speech_start"})

                elif "end" in result:
                    # Include this final window in the speech audio
                    self._speech_audio.extend(window_bytes)
                    events.append({
                        "event": "speech_end",
                        "audio": bytes(self._speech_audio),
                    })
                    self._speech_audio.clear()
                    self._is_speaking = False
                    continue  # skip appending below since we already included it

            if self._is_speaking:
                self._speech_audio.extend(window_bytes)

        return events

    def flush(self) -> dict | None:
        """Force-emit any buffered speech audio (e.g. on session stop)."""
        if self._is_speaking and len(self._speech_audio) > 0:
            audio = bytes(self._speech_audio)
            self._speech_audio.clear()
            self._is_speaking = False
            return {"event": "speech_end", "audio": audio}
        return None

    def reset(self):
        """Reset all state for a new session."""
        self._vad_iterator.reset_states()
        self._pcm_buffer.clear()
        self._speech_audio.clear()
        self._is_speaking = False
