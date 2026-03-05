# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice Interview Coach — a fully local, real-time voice conversation app for practicing mock interviews. Runs on Mac Studio M3 Ultra (256GB unified memory). All AI inference (STT, LLM, TTS) runs locally via MLX and LM Studio. See `project_scope.md` for full specification.

## Commands

### Backend (FastAPI)
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload          # Dev server on :8000
```
First run downloads the whisper model (~1.5GB from HuggingFace).

### Frontend (Vite + React)
```bash
cd frontend
npm run dev       # Dev server on :5173
npm run build     # TypeScript check + production build
npm run lint      # ESLint
```

### LM Studio
Must be running on `http://localhost:1234` with a model loaded before starting sessions. Configured via `backend/.env`.

## Architecture

**Real-time bidirectional voice pipeline over a single WebSocket (`ws://localhost:8000/ws`):**

```
Browser mic → AudioWorklet (Float32→Int16 PCM) → WebSocket binary frames
    → FastAPI → Silero VAD (speech detection) → mlx-whisper (transcription)
    → LM Studio LLM (streaming response) → Kokoro TTS (speech synthesis)
    → WebSocket binary+JSON frames → Zustand store → React UI
```

### WebSocket Protocol
- **Binary frames** (client→server): Raw 16-bit PCM, 16kHz mono, ~3200 bytes/100ms chunks
- **Binary frames** (server→client): TTS audio, 16-bit PCM, 24kHz mono
- **JSON text frames** (both directions): Control messages (`session.start`, `session.stop`, `session.ready`) and data (`transcript`, `vad`, `bot_transcript`, `bot_speech_start`, `bot_speech_stop`, `interrupt_ack`)

### REST API
- `GET /` — Health check
- `GET /api/scenarios` — List available interview scenarios
- `POST /api/sessions` — Create a new session (body: `{ scenario_name }`)
- `GET /api/sessions/{id}` — Get session details, transcripts, and score
- `POST /api/sessions/{id}/analyze` — Run post-session LLM feedback analysis (idempotent)

### Backend (`backend/`)
- **`main.py`** — FastAPI entrypoint. Loads `.env` via python-dotenv before imports. Global `SpeechToText` and `TextToSpeech` instances loaded at startup; per-connection `VoiceActivityDetector` and `ConversationManager`. Heavy ops run via `asyncio.to_thread()`.
- **`audio/vad.py`** — Silero VAD wrapper. 512-sample windows (32ms), threshold 0.7. Silence threshold configurable via `VAD_SILENCE_MS` env var (default 800ms).
- **`audio/stt.py`** — mlx-whisper wrapper. Model: `mlx-community/whisper-large-v3-turbo`. Synchronous `transcribe_sync()`, language pinned to English.
- **`audio/tts.py`** — Kokoro TTS (ONNX). Strips non-speech characters and normalizes whitespace before synthesis. Returns Int16 PCM at 24kHz.
- **`conversation/llm.py`** — AsyncOpenAI client pointing to LM Studio. Streaming `stream_chat_completion()` for conversation, non-streaming calls for feedback analysis.
- **`conversation/manager.py`** — Maintains per-session message history. `chunk_sentences()` buffers streaming tokens into complete sentences for TTS.
- **`conversation/feedback.py`** — Post-session analysis. `count_filler_words()` uses regex on user transcripts. `generate_feedback()` calls LLM with `response_format=json_object` for structured scoring.
- **`scenarios/loader.py`** — Loads YAML scenario configs from `scenarios/templates/`. Each has `system_prompt`, `focus_areas`, `evaluation_criteria`.
- **`storage/models.py`** — SQLModel tables: `Session`, `TranscriptEntry`, `Score`.
- **`storage/db.py`** — SQLite CRUD helpers (all synchronous, called via `asyncio.to_thread()`).

### Frontend (`frontend/`)
- **`public/audio-processor.js`** — AudioWorklet processor. Must be plain JS (not bundled). Converts Float32→Int16, buffers 1600 samples (100ms) before posting.
- **`src/hooks/useAudio.ts`** — Creates `AudioContext({ sampleRate: 16000 })` for native browser resampling. Connects mic→worklet, posts PCM chunks via callback.
- **`src/hooks/useWebSocket.ts`** — Manages WS lifecycle. Auto-sends `session.start` on connect. Dispatches incoming JSON to Zustand store.
- **`src/hooks/usePlayback.ts`** — Queue-based audio playback at 24kHz for bot TTS audio. Gapless scheduling with flush support for barge-in.
- **`src/stores/sessionStore.ts`** — Zustand store: `view` (setup/session/review), `sessionId`, `transcripts[]`, `feedback`, `isAnalyzing`. Three-way view routing.
- **`src/components/SessionSetup/`** — Scenario selection screen.
- **`src/components/LiveSession/`** — Active interview UI. `VadIndicator`, `BotSpeakingIndicator`, `TranscriptList` subscribe to individual store slices to prevent re-renders. "End & Review" triggers async analysis flow.
- **`src/components/Review/`** — Post-session dashboard with overall score, radar chart (recharts), filler word count, best moment/biggest opportunity cards, and full transcript replay.

## Key Conventions

- Audio format: 16-bit signed PCM, little-endian. 16kHz mono for mic/STT, 24kHz mono for TTS playback.
- CORS is configured for `http://localhost:5173` only
- Backend `.env` is gitignored; `backend/.env` holds runtime config (VAD_SILENCE_MS, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, KOKORO_VOICE)
- Frontend uses Tailwind CSS v4 (CSS-based config via `@import "tailwindcss"`, no `tailwind.config.js`)
- React 19 with strict mode enabled
- All system prompts include plain-text audio instruction (no emojis, no markdown) to prevent TTS issues
- Database: SQLite at `backend/sessions.db`, auto-created on startup
- LLM feedback responses are stripped of markdown code fences before JSON parsing
