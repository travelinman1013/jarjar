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

### LM Studio (when LLM_PROVIDER=lmstudio)
Must be running on `http://localhost:1234` with a model loaded before starting sessions. Configured via `backend/.env`. When `LLM_PROVIDER=mlx`, LM Studio is not required — inference runs in-process via mlx-lm.

### Ollama (optional, when EMBEDDING_PROVIDER=ollama)
Only needed if `EMBEDDING_PROVIDER=ollama` in `.env`. Default provider is `fastembed` (local ONNX, no server).
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
    → RAG retrieval (sqlite-vec + fastembed/Ollama embeddings, optional)
    → LLM (LM Studio or mlx-lm, streaming response) → Kokoro TTS (speech synthesis)
    → WebSocket binary+JSON frames → Zustand store → React UI
```

### WebSocket Protocol
- **Binary frames** (client→server): Raw 16-bit PCM, 16kHz mono, ~3200 bytes/100ms chunks
- **Binary frames** (server→client): TTS audio, 16-bit PCM, 24kHz mono
- **JSON text frames** (both directions): Control messages (`session.start`, `session.stop`, `session.ready`, `diagram_state`) and data (`transcript`, `vad`, `bot_transcript`, `bot_thinking`, `bot_speech_start`, `bot_speech_stop`, `interrupt_ack`, `phase_change`)

### REST API
- `GET /` — Health check
- `GET /api/scenarios` — List available interview scenarios (built-in + custom)
- `POST /api/scenarios` — Create a custom scenario (validates against `ScenarioConfig`, saves to `scenarios/custom/`)
- `POST /api/scenarios/generate` — LLM-assisted scenario generation from description (body: `{ description, type, difficulty }`)
- `DELETE /api/scenarios/{name}` — Delete a custom scenario (refuses to delete built-in templates)
- `GET /api/sessions` — List all past sessions with summary data (score, transcript count, duration). Supports `limit` and `offset` query params.
- `POST /api/sessions` — Create a new session (body: `{ scenario_name }`)
- `DELETE /api/sessions/{id}` — Delete a session with cascade cleanup of all related data (transcripts, scores, phase scores, diagram snapshots, skill observations). Recalculates affected skill dimensions by replaying EMA + FSRS from remaining observations. Deletes orphaned dimensions with zero observations.
- `DELETE /api/sessions` — Batch delete sessions (body: `{ session_ids: [...] }`). Collects all affected dimensions across deletions, recalculates once.
- `GET /api/sessions/{id}` — Get session details, transcripts, score, and phase_scores
- `POST /api/sessions/{id}/analyze` — Run post-session LLM feedback analysis (idempotent). Returns per-phase rubric scores when scenario has rubrics, otherwise legacy 3-dimension scores. Also updates the candidate skill profile via FSRS when phase scores are present.
- `GET /api/sessions/{id}/diagrams` — Get diagram snapshots for a session (per-phase tldraw snapshots)
- `GET /api/trends` — Get skill dimension score trends over time (per-dimension data points with session timestamps)
- `GET /api/profile` — Get candidate skill profile with per-dimension scores, FSRS retrievability, and scenario recommendations sorted by urgency
- `DELETE /api/profile` — Full skill profile reset. Wipes all `SkillDimension` and `SkillObservation` rows. Returns `{ reset, dimensions_cleared }`.
- `DELETE /api/profile/dimensions` — Selective dimension reset (body: `{ dimension_names: [...] }`). Deletes targeted dimensions and their observations. Returns names actually cleared.
- `GET /api/settings` — Get current runtime configuration (VAD silence, LLM model, TTS voice, available voices/models)
- `PATCH /api/settings` — Update runtime configuration (VAD silence 300-2000ms, LLM model, TTS voice). Changes are in-memory only, not persisted to `.env`.
- `GET /api/agents` — List all saved agents with attribute values, scenario type, thumbnail, timestamps
- `GET /api/agents/{name}` — Get a single agent by name
- `POST /api/agents` — Create a new agent (saves attribute metadata + compiled YAML scenario). 409 if name exists.
- `PUT /api/agents/{name}` — Update an existing agent's attributes, display name, thumbnail, and recompile scenario YAML
- `DELETE /api/agents/{name}` — Delete an agent and its associated custom scenario YAML
- `POST /api/agents/{name}/fork` — Fork an agent or built-in template, returning attribute values and forked_from metadata

### Backend (`backend/`)
- **`main.py`** — FastAPI entrypoint. Loads `.env` via python-dotenv before imports. Global `SpeechToText`, `TextToSpeech`, and `KnowledgeRetriever` instances loaded at startup; per-connection `VoiceActivityDetector` and `InterviewConductor`. Handles `diagram_state` WebSocket messages, captures diagram snapshots on phase transitions and session stop. Sends `bot_thinking` message before LLM streaming starts. Includes phase list and scenario duration in `session.ready` WebSocket message. Settings endpoints allow runtime tuning of VAD, LLM model, and TTS voice. Scenario generation endpoint uses LLM to create full scenario configs from descriptions. Agent CRUD endpoints (create/read/update/delete/fork) manage agent metadata in SQLite and compiled scenario YAMLs in `scenarios/custom/`. `session.start` WebSocket message accepts optional `silence_ms` for per-agent VAD tuning. Heavy ops run via `asyncio.to_thread()`.
- **`audio/vad.py`** — Silero VAD wrapper. 512-sample windows (32ms), threshold 0.7. Silence threshold configurable via `VAD_SILENCE_MS` env var (default 800ms). Constructor accepts optional `silence_ms` parameter for per-session override (used by agent-based sessions).
- **`audio/stt.py`** — mlx-whisper wrapper. Model: `mlx-community/whisper-large-v3-turbo`. Synchronous `transcribe_sync()`, language pinned to English.
- **`audio/tts.py`** — Kokoro TTS (ONNX). Strips non-speech characters and normalizes whitespace before synthesis. Returns Int16 PCM at 24kHz. `get_voices()` method exposes available Kokoro voices for the settings API.
- **`conversation/llm.py`** — Pluggable LLM provider. `LLM_PROVIDER=lmstudio` (default) uses AsyncOpenAI client pointing to LM Studio. `LLM_PROVIDER=mlx` uses mlx-lm for in-process inference via `stream_generate()` with async queue bridging. Streaming `stream_chat_completion()` routes to the configured provider. Exports `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` used by feedback agents.
- **`conversation/manager.py`** — Legacy flat conversation manager (superseded by `phases.py`). `chunk_sentences()` buffers streaming tokens into complete sentences for TTS.
- **`conversation/phases.py`** — Phase-aware `InterviewConductor` replacing `ConversationManager`. State machine with phase-specific system prompt injection, turn counting, context window management (max 40 messages), RAG context injection via `set_rag_context()`, and diagram context injection via `set_diagram_context()`.
- **`conversation/router.py`** — Lightweight LLM-based phase transition router. Runs off the hot path after each bot response. Uses `PhaseDecision` Pydantic model with `should_advance`, `next_phase`, `reasoning`. Force-advances at `max_turns`.
- **`conversation/feedback.py`** — Post-session analysis using Pydantic AI agents for type-safe structured output. `count_filler_words()` uses regex on user transcripts. `generate_rubric_feedback()` runs multi-pass per-phase evaluation with rubric anchoring (3/5/7/9 levels per focus area), transcript evidence quotes, stronger-answer suggestions, and diagram context injection (serialized tldraw text per phase). `generate_feedback_legacy()` provides backward-compatible single-call evaluation for scenarios without rubrics. Uses `DimensionScore`, `PhaseEvaluationResult`, `SummaryResult`, and `LegacyFeedbackResult` Pydantic output models with `pydantic_ai.Agent`. Optionally grounds evaluation against RAG-retrieved technical reference material.
- **`diagram/__init__.py`** + **`diagram/serializer.py`** — tldraw snapshot to text serializer. Resilient parsing with try/except fallback, empty canvas handling, 3x3 spatial grid layout, >20 component summarization (~800 token cap).
- **`knowledge/embedder.py`** — Pluggable embedding provider. `EMBEDDING_PROVIDER=fastembed` (default) uses local ONNX-based embeddings via fastembed (`BAAI/bge-small-en-v1.5`, 384 dims). `EMBEDDING_PROVIDER=ollama` uses Ollama's HTTP API (`nomic-embed-text`). `create_embedder()` factory function returns the configured provider. Both implement `BaseEmbedder` with async/sync embed_query and embed_batch methods.
- **`knowledge/store.py`** — sqlite-vec vector store in a local SQLite database (`knowledge/knowledge.db`). Collection-per-topic namespacing via `vec0` virtual tables. All operations are synchronous (callers use `asyncio.to_thread()`). Uses `serialize_float32()` for vector serialization and `k = ?` constraint for KNN queries.
- **`knowledge/retriever.py`** — High-level RAG orchestrator. Embeds query, searches sqlite-vec store, filters by distance threshold (0.8 max), formats chunks for system prompt injection. Returns `None` for irrelevant queries.
- **`knowledge/ingest.py`** — CLI tool for ingesting markdown/text documents into the vector store. Uses `RecursiveCharacterTextSplitter` for chunking.
- **`skill_profile/__init__.py`** — Candidate skill profile package (renamed from `profile/` to avoid shadowing Python's stdlib `profile` module).
- **`skill_profile/fsrs_engine.py`** — FSRS spaced repetition wrapper using `py-fsrs`. Maps 0-10 rubric scores to FSRS ratings (Again/Hard/Good/Easy). `review_skill()` advances a card's scheduling state, `compute_retrievability()` returns current recall probability.
- **`skill_profile/manager.py`** — Profile CRUD and recommendation logic. `update_profile_from_session()` aggregates per-phase dimension scores into the skill profile using EMA scoring (alpha=0.4) and FSRS card advancement. Idempotent: re-analysis updates scores but skips FSRS advancement. Dimension names normalized via `.lower().strip()`. `get_profile()` returns all dimensions with retrievability. `get_recommendations()` ranks scenarios by urgency (low retrievability + low scores + unpracticed dimensions). `recalculate_dimensions()` replays EMA + FSRS from remaining observations after session deletion — deletes orphaned dimensions with zero observations. `reset_profile()` / `reset_dimensions()` for full/selective profile wipe.
- **`scenarios/loader.py`** — Loads YAML scenario configs from `scenarios/templates/` and `scenarios/custom/`. Each has `system_prompt`, `focus_areas`, `evaluation_criteria`, `phases`, `knowledge_collections`, `rubrics` (per-focus-area scoring anchors at levels 3/5/7/9), `phase_exemplars` (strong answer hints per phase), and `whiteboard_enabled` (boolean, enables tldraw canvas for the scenario). `save_scenario()` writes to `custom/` directory, `delete_scenario()` only allows deletion from `custom/`.
- **`storage/models.py`** — SQLModel tables: `Session`, `TranscriptEntry` (with `phase` column for per-phase transcript grouping), `Score` (with `technical_accuracy_notes` and `dimension_names` for dynamic radar chart), `PhaseScore` (per-phase rubric evaluation results with JSON `dimension_scores`), `DiagramSnapshot` (per-phase tldraw snapshots with `snapshot_json`, `serialized_text`, `shape_count`), `Agent` (name, display_name, attribute_values JSON, scenario_type, visual_thumbnail, forked_from, timestamps), `SkillDimension` (per-skill EMA score, session count, FSRS card state), `SkillObservation` (per-session-per-dimension score audit trail with FSRS rating).
- **`storage/db.py`** — SQLite CRUD helpers (all synchronous, called via `asyncio.to_thread()`). Includes `_run_migrations()` for additive schema changes on existing databases. `list_all_sessions()` returns paginated session list with score and transcript count via LEFT JOIN. `get_skill_trends()` returns per-dimension score history over time. `save_phase_scores()` / `get_phase_scores_by_session_id()` for per-phase rubric data. `save_diagram_snapshot()` / `get_diagram_snapshots_by_session_id()` / `get_diagram_snapshot_for_phase()` for diagram persistence. `upsert_skill_dimension()` / `get_all_skill_dimensions()` / `create_skill_observation()` / `get_skill_observations_by_session()` for skill profile persistence. `delete_session_cascade()` deletes session and all child rows (observations, scores, phase scores, diagrams, transcripts) in one transaction, returns affected dimension IDs. `reset_all_skill_data()` / `reset_skill_dimensions()` for profile reset. `get_observations_for_dimension()` / `get_skill_dimension_by_id()` / `delete_skill_dimension()` support post-deletion dimension recalculation. Agent CRUD: `create_agent()` / `get_agent_by_name()` / `list_agents()` / `update_agent()` / `update_agent_last_used()` / `delete_agent()`.

### Frontend (`frontend/`)
- **`public/audio-processor.js`** — AudioWorklet processor. Must be plain JS (not bundled). Converts Float32→Int16, buffers 1600 samples (100ms) before posting.
- **`src/hooks/useAudio.ts`** — Creates `AudioContext({ sampleRate: 16000 })` for native browser resampling. Connects mic→worklet, posts PCM chunks via callback.
- **`src/hooks/useWebSocket.ts`** — Manages WS lifecycle. Auto-sends `session.start` on connect (includes optional `silence_ms` from sessionStorage for agent-based sessions). Dispatches incoming JSON to Zustand store. Handles `bot_thinking`, `bot_speech_start` (clears thinking), phase list from `session.ready`, and `interrupt_ack` (clears thinking).
- **`src/hooks/usePlayback.ts`** — Queue-based audio playback at 24kHz for bot TTS audio. Gapless scheduling with flush support for barge-in.
- **`src/stores/sessionStore.ts`** — Zustand store: `view` (setup/session/review), `sessionId`, `transcripts[]`, `feedback`, `isAnalyzing`, `whiteboardEnabled`, `diagramSnapshots`, `isBotThinking`, `phaseList`, `scenarioDuration`. Three-way view routing. `FeedbackData` interface includes optional `phase_scores` (per-phase rubric evaluations), `dimensions` (dynamic focus area names), and `technical_accuracy_notes`. `DimensionScore`, `PhaseScoreData`, and `DiagramSnapshotData` interfaces for typed phase evaluation and diagram data.
- **`src/stores/profileStore.ts`** — Zustand store for candidate skill profile. Fetches from `GET /api/profile`. Holds `SkillDimensionData[]` (name, score, session count, last practiced, retrievability) and `RecommendationData[]` (scenario name, urgency, weak/due dimensions). `resetFullProfile()` and `resetDimensions()` call DELETE endpoints and auto-refresh.
- **`src/stores/historyStore.ts`** — Zustand store for session history and skill trends. `fetchPastSessions()` loads from `GET /api/sessions`. `fetchTrends()` loads from `GET /api/trends`. Trends lazy-loaded on first dimension expand. `deleteSession()` and `deleteSessions()` call DELETE endpoints, invalidate trends cache, refresh sessions and profile store.
- **`src/stores/settingsStore.ts`** — Zustand store for runtime settings. `fetchSettings()` loads from `GET /api/settings`. `updateSettings()` patches via `PATCH /api/settings`.
- **`src/stores/agentCreatorStore.ts`** — Zustand store for the Agent Creator. Holds 13 attributes across 4 categories (`AgentAttributes`), config fields (name, scenarioType, focusAreas, knowledgeCollections, duration, whiteboard), and wizard state (`wizardMode`, `wizardStep`). `setAttribute()` updates individual attribute values (triggers orb animation via store subscription). `resetAll()` resets attributes, config, and wizard state.
- **`src/stores/agentLibraryStore.ts`** — Zustand store for saved agents. `fetchAgents()` loads from `GET /api/agents`. `deleteAgent()` calls `DELETE /api/agents/{name}` and removes from local state.
- **`src/lib/agentCompiler.ts`** — Compiles `AgentCreatorState` into a full `CompiledScenarioConfig` (YAML-equivalent). `compileConfig()` builds system prompts from attribute thresholds, selects phase templates per scenario type (system_design/behavioral/technical), applies attribute-driven modifications (max turns, scaffolding injections, challenge style), generates rubrics calibrated to seniority level, and derives difficulty. `deriveSilenceMs()` maps patience (0-100) to VAD silence threshold (300-2000ms).
- **`src/components/AgentCreator/`** — Full-screen modal for creating/editing AI interviewers. `index.tsx` renders header (Save/Save & Start), R3F canvas with 3D orb (left), and right panel (wizard or tabs). `OrbScene.tsx` subscribes to `agentCreatorStore` and drives shader uniforms via `deriveUniforms()` with LERP interpolation (alpha=0.08) for smooth morphing. `OrbEntity.tsx` renders the orb mesh with custom GLSL vertex/fragment shaders. `OrbParticles.tsx` and `OrbRings.tsx` add ambient visual effects. `AttributePanel.tsx` renders 13 sliders grouped by category. `TopicSelector.tsx` handles scenario type, focus areas, duration, whiteboard toggle, and knowledge collections. `SoulPreview.tsx` shows the generated system prompt. `WizardPanel.tsx` is a 7-question guided flow that maps natural language answers to attribute values — each answer triggers `setAttribute()` calls (orb morphs automatically), with a 400ms delay before advancing to let the user see the animation. Includes back navigation, selected-answer highlighting, auto-generated agent name from Q1, and "Switch to Advanced Mode" escape hatch. `wizardQuestions.ts` defines question schema with typed answer-to-attribute/config mappings. `uniformDerivation.ts` maps 13 attributes to shader uniform ranges. `shaders/` contains GLSL noise and orb shader source.
- **`src/components/SessionSetup/`** — Scenario selection screen with agent library, skill profile overview, recommendation badges, session history, settings panel, and scenario builder. "Create Agent" card opens AgentCreator in wizard mode. Agent cards show thumbnail, display name, scenario type, last used, and actions (Start/Edit/Delete). `SkillOverview` renders collapsible horizontal skill bars color-coded by FSRS retrievability with expandable trend charts (recharts LineChart). `RecommendationBadge` shows urgency pills on scenario cards. `SessionHistory` shows past sessions with scenario name, date, duration, score, "View" button, per-row delete with inline confirmation, and multi-select batch delete mode. `ScenarioBuilder` provides AI-assisted scenario generation (LLM-powered) and manual editing form with phase builder. `Settings` panel (gear icon toggle) allows runtime tuning of TTS voice, VAD sensitivity slider, LLM model, and skill profile reset (full or selective per-dimension with two-step confirmation). Scenarios sorted by recommendation urgency.
- **`src/components/LiveSession/`** — Active interview UI. `VadIndicator`, `BotSpeakingIndicator`, `BotThinkingIndicator`, `TranscriptList` subscribe to individual store slices to prevent re-renders. `SessionTimer` uses ref-based DOM updates (no re-renders) with countdown when scenario has duration. `PhaseProgress` shows horizontal step indicator of all phases. `PreSessionBrief` replaces blank void before recording with scenario info and prominent start button. "End & Review" triggers async analysis flow with ref guard to prevent duplicate calls. Split-panel layout when whiteboard is enabled (toggle button in header). `WhiteboardPanel` is code-split via `React.lazy()`.
- **`src/components/LiveSession/WhiteboardPanel.tsx`** — tldraw v4 canvas wrapper. 2s debounced `editor.getSnapshot()` → WebSocket `diagram_state` messages. Dark theme CSS override for `bg-gray-950`. Code-split (lazy loaded).
- **`src/components/Review/`** — Post-session dashboard. Split into sub-components: `OverallSummary` (dynamic radar chart adapting to scenario focus areas, overall score, feedback cards, technical accuracy notes, profile-updated confirmation with dimension tags), `PhaseTimeline` (vertical list of expandable `PhaseCard` components with per-dimension score bars, evidence quotes, stronger answer suggestions, and read-only diagram snapshots), `DiagramViewer` (read-only tldraw viewer, code-split, `isReadonly: true`, hand tool only, zoom-to-fit), `TranscriptReplay` (phase-grouped transcript with dividers). Falls back to legacy 3-dimension radar when phase scores are unavailable. Empty state includes full header with scenario name, explanatory text, and transcript replay when available.

## Key Conventions

- Audio format: 16-bit signed PCM, little-endian. 16kHz mono for mic/STT, 24kHz mono for TTS playback.
- CORS is configured for `http://localhost:5173` only
- Backend `.env` is gitignored; `backend/.env` holds runtime config (VAD_SILENCE_MS, LLM_PROVIDER, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, MLX_MODEL, KOKORO_VOICE, EMBEDDING_PROVIDER, FASTEMBED_MODEL, OLLAMA_BASE_URL, EMBEDDING_MODEL)
- Frontend uses Tailwind CSS v4 (CSS-based config via `@import "tailwindcss"`, no `tailwind.config.js`)
- React 19 with strict mode enabled
- All system prompts include plain-text audio instruction (no emojis, no markdown) to prevent TTS issues
- Database: SQLite at `backend/sessions.db`, auto-created on startup
- LLM feedback uses Pydantic AI agents (`pydantic-ai`) for type-safe structured output validation instead of raw JSON parsing
- Feedback evaluation uses rubric anchoring (3/5/7/9 levels defined in scenario YAMLs) with per-phase scoring when rubrics are available
- Database schema uses additive migrations (`ALTER TABLE ADD COLUMN`) for backward compatibility with existing `sessions.db`
- RAG knowledge base is optional — app works without ingested content (graceful degradation). Default embedding provider (fastembed) requires no external server.
- Vector store uses sqlite-vec, persists at `backend/knowledge/knowledge.db` (gitignored). Replaces previous Qdrant dependency.
- Embedding provider is pluggable: `EMBEDDING_PROVIDER=fastembed` (default, local ONNX via `BAAI/bge-small-en-v1.5`) or `ollama` (requires running server). Configured in `.env`.
- LLM provider is pluggable: `LLM_PROVIDER=lmstudio` (default, OpenAI-compatible API) or `mlx` (in-process via mlx-lm). Live conversation uses the configured provider; feedback analysis always uses the OpenAI-compatible endpoint (LM Studio or remote API).
- Knowledge base content lives in `backend/knowledge/content/` organized by topic subdirectory
- Candidate skill profile uses FSRS (`py-fsrs`) spaced repetition for scheduling practice recommendations
- Skill dimension names are normalized (`.lower().strip()`) to prevent duplicates across scenario YAMLs
- Profile scoring uses EMA (alpha=0.4) so recent sessions are weighted heavily over early poor performance
- Profile update is idempotent — re-analyzing a session updates observation scores but does not re-advance FSRS cards
- Whiteboard (tldraw v4) is optional per scenario — controlled by `whiteboard_enabled: true` in scenario YAML
- tldraw is code-split via `React.lazy()` — separate chunks for WhiteboardPanel (live) and DiagramViewer (review)
- Diagram snapshots are captured on phase transitions and session stop, stored as JSON in `DiagramSnapshot` table
- Diagram serialized text is injected into feedback evaluation prompts for phases with diagrams
- Custom scenarios are stored in `backend/scenarios/custom/` (separate from built-in templates)
- Runtime settings (VAD, LLM model, TTS voice) are mutable module-level variables, changed via `PATCH /api/settings` — not persisted to `.env`
- Session timer uses `useRef` + `setInterval` with direct DOM updates to avoid per-second re-renders
- `handleStop` in LiveSession uses a `useRef` boolean guard to prevent duplicate analysis calls from React StrictMode
- Session deletion cascades through all child tables (observations → scores → phase scores → diagrams → transcripts → session) in one transaction, returns affected dimension IDs for recalculation
- Post-deletion dimension recalculation replays both EMA and FSRS from remaining observations chronologically — orphaned dimensions (zero observations) are deleted
- Skill profile reset (full or selective) is available in the Settings panel with two-step inline confirmation — does NOT delete session data, only aggregated profile
- `deleteSession()` / `deleteSessions()` in historyStore are self-contained: they invalidate trends cache, refresh session list, and refresh profile store without relying on UI components
- Agent Creator uses React Three Fiber (R3F) with custom GLSL shaders — orb animation is driven by Zustand store subscription (not React re-renders), uniforms are mutated directly via `.value` assignment
- Orb visual interpolation uses `useFrame` LERP at alpha=0.08 (~1s convergence) for smooth morphing when attributes change
- Agent Creator defaults to wizard mode for new agents (`wizardMode: true` after `resetAll()`), advanced mode for editing existing agents
- Wizard answers apply mappings immediately via `setAttribute()` (not deferred), so values persist if user switches to Advanced Mode mid-wizard
- Agent configs are compiled client-side via `compileConfig()` in `lib/agentCompiler.ts` and sent to the backend as a full scenario config JSON — the backend saves as YAML in `scenarios/custom/`
- Per-agent VAD silence is derived from patience attribute via `deriveSilenceMs()`, passed through `sessionStorage` to `useWebSocket`, then sent in the `session.start` WebSocket message
- Agent metadata (attributes, thumbnail, timestamps) is stored in the `Agent` SQLite table; the compiled scenario is stored as a YAML file — both are created/updated together
- R3F canvas and OrbScene use code patterns compatible with React Compiler strict lint rules: no `Math.random()` in useMemo, no ref access during render, module-level constants for stable values
