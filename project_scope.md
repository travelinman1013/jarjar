# Voice Interview Coach — Project Scope

## Vision

A fully local, real-time voice conversation app for practicing mock interviews and explaining technical concepts out loud. Runs entirely on Mac Studio M3 Ultra. Think of it as a private AI interviewer that listens, responds naturally, adapts to your answers, and gives you honest feedback afterward.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   React UI (Vite)                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Session   │  │ Live     │  │ Post-Session      │  │
│  │ Setup     │  │ Convo    │  │ Review & Scoring  │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└──────────────────┬──────────────────────────────────┘
                   │ WebSocket (audio + events)
                   ▼
┌─────────────────────────────────────────────────────┐
│              Python Backend (FastAPI)                 │
│                                                      │
│  ┌────────────┐  ┌────────┐  ┌───────────────────┐  │
│  │ Silero VAD │→ │ Whisper │→ │ Conversation Mgr  │  │
│  │ (activity) │  │ (STT)  │  │ (turn-taking,     │  │
│  └────────────┘  └────────┘  │  context, prompts) │  │
│                              └────────┬──────────┘  │
│                                       │              │
│  ┌────────────┐  ┌────────┐  ┌───────▼──────────┐  │
│  │ Audio Out  │← │  TTS   │← │  LLM (Ollama)    │  │
│  │ (stream)   │  │ Engine │  │  70B+ local       │  │
│  └────────────┘  └────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Speech-to-Text: whisper.cpp (MLX build)

- **Why**: Native Apple Silicon acceleration, best-in-class accuracy, runs entirely local
- **Model**: `large-v3` — your M3 Ultra transcribes faster than real-time
- **Key feature**: Streaming mode with Silero VAD for real-time chunked transcription
- **Latency target**: < 500ms from end-of-speech to transcript ready

### Voice Activity Detection: Silero VAD

- **Why**: Lightweight, accurate, handles the critical "did they stop talking?" detection
- **Role**: Segments audio into speech chunks, triggers transcription, manages turn-taking
- **Key tuning**: Silence threshold (~800ms) to distinguish pauses from turn completion

### LLM: Ollama

- **Primary model**: Qwen 2.5 72B or Llama 3.3 70B (both fit comfortably in 256GB)
- **Why Ollama**: Clean API, model management, optimized for Apple Silicon
- **Streaming**: Token-by-token streaming so TTS can start before full response completes
- **Context window**: 8K–16K tokens per session (plenty for a 30-min interview)

### Text-to-Speech: Kokoro TTS

- **Why**: Best local TTS quality currently available, natural prosody, fast inference
- **Voices**: Multiple voice options, professional-sounding
- **Streaming**: Sentence-level chunked synthesis — start speaking as soon as first sentence is ready
- **Latency target**: < 300ms from first token to first audio chunk

### Backend: FastAPI + WebSocket

- **Why**: Async-native, WebSocket support, clean Python ecosystem for ML libs
- **Role**: Orchestrates the full STT → LLM → TTS pipeline, manages session state
- **Audio format**: 16-bit PCM over WebSocket (low overhead, no codec latency)

### Frontend: React + Vite + Tailwind

- **Why**: Fast dev cycle, component-based UI, great for the dashboard/review screens
- **Audio**: Web Audio API for mic capture and playback
- **State**: Zustand or React Context for session/conversation state

### Storage: SQLite

- **Why**: Zero-config, local, perfect for session history and transcripts
- **Schema**: Sessions, transcripts (with timestamps), scores, scenario templates
- **Export**: Markdown export for Obsidian integration if desired later

---

## Core Features

### 1. Live Conversation Engine

The heart of the app. Manages real-time voice interaction with natural turn-taking.

**Turn-taking logic:**
1. User speaks → Silero VAD detects voice activity
2. User pauses (~800ms silence) → VAD triggers end-of-turn
3. Audio chunk → whisper.cpp transcription
4. Transcript → LLM (with full conversation context + system prompt)
5. LLM streams response → TTS synthesizes sentence-by-sentence
6. Audio streams back to browser → playback begins
7. If user interrupts (barge-in), stop TTS playback immediately

**Target end-to-end latency:** < 1.5 seconds from user finishing speaking to hearing the response begin. This is achievable locally since there's zero network round-trip.

**Barge-in handling:** If the user starts speaking while the bot is talking, immediately stop playback, capture the new input, and treat it as the next turn. This makes conversations feel natural rather than walkie-talkie.

### 2. Custom Interview Scenarios

Scenario templates are system prompts + configuration that shape the conversation.

**Built-in scenario types:**
- **Behavioral interview** — STAR method questions, follow-up probing, culture fit
- **System design** — "Design a system that..." with progressive complexity, tradeoff discussions
- **Technical deep-dive** — Pick a concept, explain it, defend design choices
- **Explain Like I'm 5** — Practice simplifying complex ideas for non-technical audiences
- **Rapid fire** — Short-answer technical trivia to build quick recall
- **Whiteboard walkthrough** — Talk through architecture decisions as if at a whiteboard

**Scenario configuration:**
```yaml
name: "System Design - Distributed Cache"
type: system_design
difficulty: senior
duration_minutes: 30
system_prompt: |
  You are a senior engineering interviewer at a top tech company.
  Your style is Socratic — you ask clarifying questions, probe
  tradeoffs, and push the candidate to go deeper. Be realistic
  but encouraging.

  Topic: Design a distributed caching system.

  Start by presenting the problem, then let the candidate drive.
  Ask follow-ups like "What happens when a node fails?" and
  "How would you handle cache invalidation at scale?"
focus_areas:
  - scalability
  - fault tolerance
  - consistency models
evaluation_criteria:
  - structured_thinking: "Did they break down the problem systematically?"
  - tradeoff_awareness: "Did they discuss pros/cons of their choices?"
  - depth: "Could they go beyond surface-level answers?"
  - communication: "Was the explanation clear and well-organized?"
```

**Custom scenario creation:** Users can create their own via YAML files or through a UI form.

### 3. Post-Session Feedback & Scoring

After each session, the LLM reviews the transcript in a multi-pass evaluation using Pydantic AI for type-safe structured output.

**Multi-dimensional rubric evaluation (current implementation):**
- Each scenario defines rubric anchors (levels 3/5/7/9) per focus area in YAML
- Transcripts segmented by interview phase, each phase evaluated independently
- Per-phase: dimension scores with rubric level, transcript evidence quotes, improvement suggestions, and stronger-answer examples
- Summary agent synthesizes per-phase results into overall clarity, structure, and depth scores
- RAG-grounded evaluation cross-references candidate claims against local knowledge base
- Falls back to legacy single-call evaluation for scenarios without rubrics defined

**Output format:**
- Overall score (0–10) with best moment and biggest opportunity
- Dynamic radar chart adapting dimensions to scenario focus areas
- Per-phase expandable cards with dimension score bars, evidence quotes, and suggestions
- Phase-grouped transcript replay with dividers
- Filler word count and frequency analysis (regex-based, not LLM)
- Technical accuracy notes (when RAG knowledge base is available)

**Trend tracking:** SQLite stores scores, per-phase evaluations (`PhaseScore` table), and phase-annotated transcripts for review.

### 3b. Adaptive Candidate Skill Profile & Spaced Repetition

Cross-session skill tracking with FSRS spaced repetition scheduling.

**How it works:**
- After each analyzed session, per-phase dimension scores are aggregated into a persistent `SkillDimension` profile
- Scores use EMA (alpha=0.4) so recent performance is weighted heavily over early sessions
- Each dimension is tracked as an FSRS card — the scheduler computes when each skill is due for review based on recall probability (retrievability)
- The setup screen shows a collapsible Skill Overview with horizontal bars color-coded by retrievability (green > 0.8, yellow 0.5-0.8, red < 0.5)
- Scenarios are sorted by recommendation urgency — combining low retrievability (due for review) and low scores (weak areas) with a bonus for never-practiced dimensions
- Profile updates are idempotent: re-analyzing a session updates scores but does not re-advance FSRS intervals
- Single implicit global profile (single-tenant local-first app, no user accounts)

### 3c. Real-Time Collaborative Whiteboard

Optional tldraw v4 drawing canvas for system design scenarios.

**How it works:**
- Scenarios with `whiteboard_enabled: true` show a split-panel layout: transcript on the left, tldraw canvas on the right
- Toggle button in header to show/hide whiteboard mid-session
- Canvas state debounced (2s) and sent to backend via `diagram_state` WebSocket messages
- Diagrams serialized to text (spatial 3x3 grid layout, component summarization) for LLM context injection
- Snapshots captured automatically on phase transitions and session stop, stored in `DiagramSnapshot` table
- Review screen shows read-only tldraw viewers per phase (lazy loaded, pan/zoom only, no editing tools)
- Feedback evaluation includes diagram text when scoring architecture/design dimensions
- tldraw bundle (~2MB) code-split via `React.lazy()` — separate chunks for live canvas and review viewer
- Dark theme CSS override to match app's `bg-gray-950` palette

### 4. Polished UI

Three main screens:

**Session Setup Screen:**
- Skill Profile overview (collapsible, shows per-dimension score bars with FSRS retrievability)
- Scenario selector (cards with type, difficulty, description, recommendation badges)
- Scenarios sorted by recommendation urgency (weak/due skills prioritized)
- Quick-start for recent/favorite scenarios
- Custom scenario builder
- Audio input device selector + mic test
- Session duration setting

**Live Conversation Screen:**
- Minimal, distraction-free design
- Visual audio waveform showing who's speaking
- Live transcript appearing in real-time (subtle, not dominant)
- Optional tldraw whiteboard panel for system design scenarios (toggle in header)
- Timer showing session duration
- Pause/end session controls
- Visual indicator for bot "thinking" state

**Review Dashboard:**
- Full transcript with timestamps and speaker labels
- Feedback scores displayed as a radar chart
- Highlighted key moments (clickable to jump in transcript)
- Read-only diagram replay per phase (for whiteboard scenarios)
- Filler word analysis
- Session history with trend charts
- Export to Markdown button

---

## Phased Build Plan

### Phase 1: Audio Pipeline (Week 1–2)

**Goal:** Speak into mic → see transcript in browser in real-time.

- [ ] Set up Python project (FastAPI, WebSocket)
- [ ] Implement Web Audio API mic capture in React
- [ ] Stream audio to backend via WebSocket
- [ ] Integrate Silero VAD for speech detection
- [ ] Integrate whisper.cpp for transcription
- [ ] Display live transcript in browser
- **Milestone:** You can talk and see your words appear in < 1 second.

### Phase 2: Conversational Loop (Week 2–3)

**Goal:** Have a back-and-forth voice conversation with the LLM.

- [ ] Set up Ollama with chosen model
- [ ] Build conversation manager (context window, turn history)
- [ ] Connect STT output → LLM input with streaming
- [ ] Integrate Kokoro TTS
- [ ] Stream synthesized audio back to browser
- [ ] Implement barge-in detection (stop TTS when user speaks)
- **Milestone:** Full voice conversation loop working end-to-end.

### Phase 3: Scenarios & Prompts (Week 3–4)

**Goal:** Structured interview sessions with different scenario types.

- [ ] Design scenario YAML schema
- [ ] Build 4–6 built-in scenarios
- [ ] Implement scenario loader and session initialization
- [ ] Add session timer and state management
- [ ] SQLite schema for sessions and transcripts
- **Milestone:** Can select a scenario and have a structured mock interview.

### Phase 4: Feedback Engine (Week 4–5)

**Goal:** Get scored feedback after each session.

- [ ] Build feedback prompt template
- [ ] Implement post-session LLM analysis pass
- [ ] Filler word detection (regex + count from transcript)
- [ ] Store scores in SQLite
- [ ] Build review UI with scores and transcript
- **Milestone:** Finish a session, get a detailed scorecard.

### Phase 5: Polish & UI (Week 5–7)

**Goal:** Production-quality interface you enjoy using.

- [ ] Design system (color palette, typography, component library)
- [ ] Session setup screen with scenario cards
- [ ] Live conversation screen with waveform visualization
- [ ] Review dashboard with radar charts and trends
- [ ] Session history browser
- [ ] Custom scenario creation form
- [ ] Audio device selection and mic test
- [ ] Dark mode (obviously)
- **Milestone:** A tool that feels like a real product.

### Phase 6: Quality of Life (Ongoing)

- [ ] Markdown/Obsidian export for transcripts
- [ ] Keyboard shortcuts for session control
- [ ] Performance profiling and latency optimization
- [ ] Voice selection for TTS
- [ ] "Warm-up" mode — casual conversation before structured interview

---

## Performance Budget

| Stage | Target Latency | Notes |
|-------|----------------|-------|
| VAD detection | < 100ms | Silero is very fast |
| STT (whisper) | < 500ms | For a typical 5–10s utterance on M3 Ultra |
| LLM first token | < 300ms | 70B model with Ollama on 256GB |
| TTS first audio | < 300ms | Kokoro sentence-level streaming |
| **Total turn latency** | **< 1.5s** | From user stops speaking → bot starts speaking |

These targets are realistic for your hardware. The M3 Ultra's 256GB unified memory means the LLM, Whisper, and TTS models can all stay loaded simultaneously without swapping.

---

## Project Structure

```
voice-interview-coach/
├── backend/
│   ├── main.py                 # FastAPI app + WebSocket handler
│   ├── audio/
│   │   ├── vad.py              # Silero VAD wrapper
│   │   ├── stt.py              # whisper.cpp integration
│   │   └── tts.py              # Kokoro TTS wrapper
│   ├── conversation/
│   │   ├── manager.py          # Legacy message history + sentence chunking
│   │   ├── phases.py           # Phase-aware InterviewConductor (state machine)
│   │   ├── router.py           # LLM-based phase transition router
│   │   ├── llm.py              # LM Studio OpenAI client
│   │   └── feedback.py         # Pydantic AI rubric evaluation + diagram context
│   ├── diagram/
│   │   └── serializer.py       # tldraw snapshot → text serializer (spatial grid)
│   ├── scenarios/
│   │   ├── loader.py           # YAML scenario parser
│   │   └── templates/          # Built-in scenario YAML files
│   ├── profile/
│   │   ├── fsrs_engine.py      # FSRS spaced repetition wrapper
│   │   └── manager.py          # Skill profile CRUD + recommendations
│   ├── storage/
│   │   ├── db.py               # SQLite connection + migrations
│   │   └── models.py           # Session, transcript, score, skill models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SessionSetup/   # Scenario selection, mic test
│   │   │   ├── LiveSession/    # Waveform, transcript, controls
│   │   │   └── Review/         # Scores, charts, transcript
│   │   ├── hooks/
│   │   │   ├── useAudio.ts     # Mic capture + playback
│   │   │   └── useWebSocket.ts # Backend communication
│   │   ├── stores/             # Zustand state management
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── scenarios/                   # User-created scenario YAML files
└── README.md
```

---

## Open Questions to Decide As You Build

1. **Whisper model size** — `large-v3` gives best accuracy but `medium` is 3x faster. Start with large, drop down if latency is an issue (unlikely on your hardware).

2. **LLM model choice** — Qwen 2.5 72B vs Llama 3.3 70B vs DeepSeek. Worth testing a few to see which gives the most natural interviewer persona.

3. **TTS voice** — Kokoro has multiple voices. Pick one that sounds like a professional interviewer, not a podcast host.

4. **Electron vs. browser** — Starting as a web app (localhost) is simpler. Could wrap in Electron later for a native feel if desired.

5. **Conversation memory across sessions** — ✅ Implemented via adaptive skill profile. FSRS tracks per-dimension scores across sessions and recommends what to practice next based on retrievability decay.