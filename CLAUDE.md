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

### Ollama (for RAG embeddings)
Must be running with an embedding model pulled before using the RAG knowledge base.
```bash
ollama pull nomic-embed-text
ollama serve                        # Runs on :11434
```

### Knowledge Base Ingestion
```bash
cd backend
source .venv/bin/activate
python -m knowledge.ingest ingest knowledge/content/system_design/ --collection system_design
python -m knowledge.ingest ingest knowledge/content/distributed_systems/ --collection distributed_systems
python -m knowledge.ingest list                          # Show collections
python -m knowledge.ingest query "consistent hashing" --collection system_design  # Test retrieval
python -m knowledge.ingest delete system_design          # Re-ingest
```

## Architecture

**Real-time bidirectional voice pipeline over a single WebSocket (`ws://localhost:8000/ws`):**

```
Browser mic → AudioWorklet (Float32→Int16 PCM) → WebSocket binary frames
    → FastAPI → Silero VAD (speech detection) → mlx-whisper (transcription)
    → RAG retrieval (Qdrant + Ollama embeddings, optional)
    → LM Studio LLM (streaming response) → Kokoro TTS (speech synthesis)
    → WebSocket binary+JSON frames → Zustand store → React UI
```

### WebSocket Protocol
- **Binary frames** (client→server): Raw 16-bit PCM, 16kHz mono, ~3200 bytes/100ms chunks
- **Binary frames** (server→client): TTS audio, 16-bit PCM, 24kHz mono
- **JSON text frames** (both directions): Control messages (`session.start`, `session.stop`, `session.ready`) and data (`transcript`, `vad`, `bot_transcript`, `bot_speech_start`, `bot_speech_stop`, `interrupt_ack`, `phase_change`)

### REST API
- `GET /` — Health check
- `GET /api/scenarios` — List available interview scenarios
- `POST /api/sessions` — Create a new session (body: `{ scenario_name }`)
- `GET /api/sessions/{id}` — Get session details, transcripts, score, and phase_scores
- `POST /api/sessions/{id}/analyze` — Run post-session LLM feedback analysis (idempotent). Returns per-phase rubric scores when scenario has rubrics, otherwise legacy 3-dimension scores

### Backend (`backend/`)
- **`main.py`** — FastAPI entrypoint. Loads `.env` via python-dotenv before imports. Global `SpeechToText`, `TextToSpeech`, and `KnowledgeRetriever` instances loaded at startup; per-connection `VoiceActivityDetector` and `InterviewConductor`. Heavy ops run via `asyncio.to_thread()`.
- **`audio/vad.py`** — Silero VAD wrapper. 512-sample windows (32ms), threshold 0.7. Silence threshold configurable via `VAD_SILENCE_MS` env var (default 800ms).
- **`audio/stt.py`** — mlx-whisper wrapper. Model: `mlx-community/whisper-large-v3-turbo`. Synchronous `transcribe_sync()`, language pinned to English.
- **`audio/tts.py`** — Kokoro TTS (ONNX). Strips non-speech characters and normalizes whitespace before synthesis. Returns Int16 PCM at 24kHz.
- **`conversation/llm.py`** — AsyncOpenAI client pointing to LM Studio. Streaming `stream_chat_completion()` for conversation. Exports `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` used by feedback agents.
- **`conversation/manager.py`** — Legacy flat conversation manager (superseded by `phases.py`). `chunk_sentences()` buffers streaming tokens into complete sentences for TTS.
- **`conversation/phases.py`** — Phase-aware `InterviewConductor` replacing `ConversationManager`. State machine with phase-specific system prompt injection, turn counting, context window management (max 40 messages), and RAG context injection via `set_rag_context()`.
- **`conversation/router.py`** — Lightweight LLM-based phase transition router. Runs off the hot path after each bot response. Uses `PhaseDecision` Pydantic model with `should_advance`, `next_phase`, `reasoning`. Force-advances at `max_turns`.
- **`conversation/feedback.py`** — Post-session analysis using Pydantic AI agents for type-safe structured output. `count_filler_words()` uses regex on user transcripts. `generate_rubric_feedback()` runs multi-pass per-phase evaluation with rubric anchoring (3/5/7/9 levels per focus area), transcript evidence quotes, and stronger-answer suggestions. `generate_feedback_legacy()` provides backward-compatible single-call evaluation for scenarios without rubrics. Uses `DimensionScore`, `PhaseEvaluationResult`, `SummaryResult`, and `LegacyFeedbackResult` Pydantic output models with `pydantic_ai.Agent`. Optionally grounds evaluation against RAG-retrieved technical reference material.
- **`knowledge/embedder.py`** — Async/sync wrapper around Ollama's embedding API (`nomic-embed-text`). Supports single and batch embedding.
- **`knowledge/store.py`** — Qdrant vector store in local disk mode (no server). Collection-per-topic namespacing, cosine distance. All operations are synchronous (callers use `asyncio.to_thread()`).
- **`knowledge/retriever.py`** — High-level RAG orchestrator. Embeds query, searches Qdrant, filters by distance threshold (0.8 max), formats chunks for system prompt injection. Returns `None` for irrelevant queries.
- **`knowledge/ingest.py`** — CLI tool for ingesting markdown/text documents into the vector store. Uses `RecursiveCharacterTextSplitter` for chunking.
- **`scenarios/loader.py`** — Loads YAML scenario configs from `scenarios/templates/`. Each has `system_prompt`, `focus_areas`, `evaluation_criteria`, `phases`, `knowledge_collections`, `rubrics` (per-focus-area scoring anchors at levels 3/5/7/9), and `phase_exemplars` (strong answer hints per phase).
- **`storage/models.py`** — SQLModel tables: `Session`, `TranscriptEntry` (with `phase` column for per-phase transcript grouping), `Score` (with `technical_accuracy_notes` and `dimension_names` for dynamic radar chart), `PhaseScore` (per-phase rubric evaluation results with JSON `dimension_scores`).
- **`storage/db.py`** — SQLite CRUD helpers (all synchronous, called via `asyncio.to_thread()`). Includes `_run_migrations()` for additive schema changes on existing databases. `save_phase_scores()` / `get_phase_scores_by_session_id()` for per-phase rubric data.

### Frontend (`frontend/`)
- **`public/audio-processor.js`** — AudioWorklet processor. Must be plain JS (not bundled). Converts Float32→Int16, buffers 1600 samples (100ms) before posting.
- **`src/hooks/useAudio.ts`** — Creates `AudioContext({ sampleRate: 16000 })` for native browser resampling. Connects mic→worklet, posts PCM chunks via callback.
- **`src/hooks/useWebSocket.ts`** — Manages WS lifecycle. Auto-sends `session.start` on connect. Dispatches incoming JSON to Zustand store.
- **`src/hooks/usePlayback.ts`** — Queue-based audio playback at 24kHz for bot TTS audio. Gapless scheduling with flush support for barge-in.
- **`src/stores/sessionStore.ts`** — Zustand store: `view` (setup/session/review), `sessionId`, `transcripts[]`, `feedback`, `isAnalyzing`. Three-way view routing. `FeedbackData` interface includes optional `phase_scores` (per-phase rubric evaluations), `dimensions` (dynamic focus area names), and `technical_accuracy_notes`. `DimensionScore` and `PhaseScoreData` interfaces for typed phase evaluation data.
- **`src/components/SessionSetup/`** — Scenario selection screen.
- **`src/components/LiveSession/`** — Active interview UI. `VadIndicator`, `BotSpeakingIndicator`, `TranscriptList` subscribe to individual store slices to prevent re-renders. "End & Review" triggers async analysis flow.
- **`src/components/Review/`** — Post-session dashboard. Split into sub-components: `OverallSummary` (dynamic radar chart adapting to scenario focus areas, overall score, feedback cards, technical accuracy notes), `PhaseTimeline` (vertical list of expandable `PhaseCard` components with per-dimension score bars, evidence quotes, and stronger answer suggestions), `TranscriptReplay` (phase-grouped transcript with dividers). Falls back to legacy 3-dimension radar when phase scores are unavailable.

## Key Conventions

- Audio format: 16-bit signed PCM, little-endian. 16kHz mono for mic/STT, 24kHz mono for TTS playback.
- CORS is configured for `http://localhost:5173` only
- Backend `.env` is gitignored; `backend/.env` holds runtime config (VAD_SILENCE_MS, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, KOKORO_VOICE, OLLAMA_BASE_URL, EMBEDDING_MODEL, QDRANT_PERSIST_DIR)
- Frontend uses Tailwind CSS v4 (CSS-based config via `@import "tailwindcss"`, no `tailwind.config.js`)
- React 19 with strict mode enabled
- All system prompts include plain-text audio instruction (no emojis, no markdown) to prevent TTS issues
- Database: SQLite at `backend/sessions.db`, auto-created on startup
- LLM feedback uses Pydantic AI agents (`pydantic-ai`) for type-safe structured output validation instead of raw JSON parsing
- Feedback evaluation uses rubric anchoring (3/5/7/9 levels defined in scenario YAMLs) with per-phase scoring when rubrics are available
- Database schema uses additive migrations (`ALTER TABLE ADD COLUMN`) for backward compatibility with existing `sessions.db`
- RAG knowledge base is optional — app works without Ollama or ingested content (graceful degradation)
- Qdrant vector store persists at `backend/knowledge/qdrant_db/` (gitignored)
- Knowledge base content lives in `backend/knowledge/content/` organized by topic subdirectory
