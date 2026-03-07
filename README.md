# Voice Interview Coach

A fully local, real-time voice conversation app for practicing mock interviews. All AI inference runs on-device — no cloud APIs, no data leaves your machine.

Built for Apple Silicon (tested on Mac Studio M3 Ultra with 256GB unified memory).

## Features

### Core Interview Experience
- **Real-time voice conversation** — speak naturally and get instant spoken responses from an AI interview coach
- **Multiple interview scenarios** — behavioral, technical system design, and warm-up sessions with configurable difficulty
- **Live transcription** — see both your speech and the coach's responses in real-time
- **Barge-in support** — interrupt the coach mid-sentence, just like a real conversation
- **Real-time whiteboard** — tldraw v4 drawing canvas for sketching system design diagrams during technical interviews (per-scenario opt-in)

### Live Session UX
- **Session timer** — elapsed time display with countdown when scenario has a duration limit, red warning at <2 minutes remaining
- **Phase progress indicator** — horizontal step bar showing all interview phases with current phase highlighted
- **Bot thinking indicator** — visual "Thinking..." state shown while the LLM generates a response (before TTS starts)
- **Pre-session brief** — scenario info (name, type, duration, phases) displayed before recording starts, replacing the blank void

### Post-Session Analysis
- **Multi-dimensional rubric evaluation** — per-phase scoring with rubric anchors (3/5/7/9 levels), transcript evidence quotes, and stronger-answer suggestions powered by Pydantic AI structured output
- **Dynamic radar chart** — adapts dimensions to scenario focus areas (e.g., requirements gathering, trade-off analysis for system design)
- **Phase-by-phase breakdown** — expandable timeline showing dimension scores, evidence, and improvement advice for each interview phase
- **RAG-grounded evaluation** — cross-references candidate claims against local knowledge base for technical accuracy
- **Diagram-aware evaluation** — serialized whiteboard snapshots injected into feedback prompts so the LLM scores architecture diagrams alongside verbal responses
- **Diagram replay in review** — read-only tldraw viewer per phase in the post-session review, showing what the candidate drew
- **Filler word tracking** — automatic detection of "um", "uh", "like", "you know", "basically"

### Progress Tracking
- **Session history** — browse all past sessions with scenario name, date, duration, and score; click "View" to revisit any session's review
- **Skill trend charts** — expandable per-dimension score graphs showing improvement over time (recharts LineChart)
- **Skill profile with FSRS** — spaced repetition scheduling recommends which scenarios to practice next based on skill decay
- **Session persistence** — transcripts (with phase annotations), scores, per-phase evaluations, and diagram snapshots saved to SQLite

### Agent Creation Studio
- **RPG-style character builder** — 13 attribute sliders across 4 categories (Demeanor, Behavior, Expertise, Evaluation) to configure a custom AI interviewer personality
- **3D orb visualization** — real-time GLSL shader-driven orb that morphs as attributes change (color, particles, rings, roughness, glow)
- **Guided wizard mode** — 7-question onboarding flow for first-time users that maps natural language answers to attribute values, with the orb animating between each answer
- **Advanced slider mode** — full control over all 13 attributes with instant orb feedback; wizard-derived values preserved when switching modes
- **Agent library** — save, edit, fork, and launch agents directly from the setup screen with thumbnail previews
- **Config compiler** — translates attribute values into full backend scenario configs (system prompts, phases, rubrics, difficulty, VAD sensitivity)

### Customization
- **AI-assisted scenario creation** — describe an interview scenario in plain text, and the LLM generates a complete config with phases, rubrics, and evaluation criteria
- **Manual scenario editor** — full form for creating/editing scenarios: phases, focus areas, evaluation criteria, system prompts, whiteboard toggle
- **Voice & model settings** — runtime configuration of TTS voice (dropdown of available Kokoro voices), VAD response delay (300-2000ms slider), and LLM model selection

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (React 19)                          │
│                                                                     │
│  ┌──────────┐   ┌────────────┐   ┌────────────┐   ┌─────────────┐ │
│  │ Session  │   │    Live    │   │   Review   │   │   Zustand   │ │
│  │  Setup   │──▶│  Session   │──▶│ Dashboard  │   │    Store    │ │
│  └──────────┘   └─────┬──────┘   └────────────┘   └──────┬──────┘ │
│                       │              ▲ RadarChart         │        │
│                       │              │ (recharts)         │        │
│  ┌────────────┐  ┌────┴─────┐       │              ┌─────┴──────┐ │
│  │ useAudio   │  │useWeb-   │       │              │usePlayback │ │
│  │ (Worklet)  │  │Socket    │───────┘              │ (24kHz)    │ │
│  └─────┬──────┘  └────┬─────┘                      └─────┬──────┘ │
│        │              │                                   │        │
└────────┼──────────────┼───────────────────────────────────┼────────┘
         │    WebSocket (ws://localhost:8000/ws)             │
         │              │                                   │
    PCM 16kHz      JSON control                      PCM 24kHz
    binary frames  messages                          binary frames
         │              │                                   ▲
         ▼              ▼                                   │
┌────────┼──────────────┼───────────────────────────────────┼────────┐
│        │         FastAPI (Python)                          │        │
│        │              │                                   │        │
│   ┌────┴─────┐   ┌────┴──────┐                            │        │
│   │ Silero   │   │ Session   │                            │        │
│   │ VAD      │   │ Manager   │                            │        │
│   │ (0.7)    │   └────┬──────┘                            │        │
│   └────┬─────┘        │                                   │        │
│        │              │                                   │        │
│   ┌────┴─────┐   ┌────┴──────┐   ┌───────────┐   ┌──────┴──────┐ │
│   │mlx-      │   │ LM Studio │   │ Feedback  │   │ Kokoro TTS  │ │
│   │whisper   │   │ (OpenAI   │   │ Analyzer  │   │ (ONNX)      │ │
│   │(STT)     │   │  compat)  │   │ (scores)  │   │ 24kHz PCM   │ │
│   └──────────┘   └───────────┘   └─────┬─────┘   └─────────────┘ │
│                                        │                           │
│                                   ┌────┴──────┐                   │
│                                   │  SQLite   │                   │
│                                   │ sessions  │                   │
│                                   │ transcripts                   │
│                                   │ scores    │                   │
│                                   └───────────┘                   │
└───────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Mic capture**: Browser AudioWorklet captures at 16kHz, converts Float32 to Int16 PCM, sends 100ms chunks over WebSocket
2. **Speech detection**: Silero VAD processes 32ms windows, detects speech start/end with configurable silence threshold
3. **Transcription**: mlx-whisper (Apple Silicon optimized) transcribes completed speech segments
4. **LLM response**: User transcript fed to LM Studio via OpenAI-compatible API, streamed token-by-token
5. **Sentence chunking**: Streaming tokens buffered into complete sentences at punctuation boundaries
6. **Speech synthesis**: Each sentence synthesized by Kokoro TTS (ONNX), sent as 24kHz PCM binary frames
7. **Playback**: Browser queues and plays TTS audio with gapless scheduling
8. **Barge-in**: If user speaks while bot is talking, bot response is cancelled and playback flushed
9. **Post-session**: Transcripts segmented by interview phase, each phase evaluated by Pydantic AI agent against rubric anchors with per-dimension scores, evidence quotes, and improvement suggestions. Summary agent synthesizes overall scores

## Prerequisites

- **macOS** with Apple Silicon (M1/M2/M3/M4)
- **Python 3.12+**
- **Node.js 20+**
- **LM Studio** running locally on port 1234 with a model loaded

## Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Download the Kokoro TTS model files:

```bash
cd models/kokoro
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

Create `backend/.env` (optional — defaults shown):

```env
VAD_SILENCE_MS=800
LLM_BASE_URL=http://localhost:1234/v1
LLM_API_KEY=lm-studio
LLM_MODEL=default
KOKORO_VOICE=af_heart
```

### Frontend

```bash
cd frontend
npm install
```

## Running

1. Start LM Studio and load a model
2. Start the backend:
   ```bash
   cd backend
   source .venv/bin/activate
   uvicorn main:app --reload
   ```
   First run downloads the whisper model (~1.5GB from HuggingFace).

3. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser

## Usage

1. **Create an agent** — click "Create Agent" on the setup screen. The guided wizard asks 7 questions to configure your interviewer, or switch to advanced mode for full slider control. The 3D orb morphs in real-time as you shape the agent's personality.
2. **Or select a built-in scenario** from the setup screen (Quick Warmup, Behavioral, System Design, etc.) — or create your own with the AI-assisted scenario builder
3. **Review the pre-session brief** — scenario details, phases, and tips are shown before you start
4. **Click "Start Recording"** — grant microphone access when prompted
5. **Speak naturally** — the coach will respond with voice and text. Watch the timer, phase progress, and thinking indicator in the header.
6. **Click "End & Review"** when done — the AI analyzes your performance
7. **Review your scores** — dynamic radar chart, per-phase breakdown with rubric-grounded scores, evidence quotes, stronger-answer suggestions, diagram replay, filler word count, and full transcript
8. **Track your progress** — browse past sessions and skill trend charts on the setup screen

**Whiteboard**: For system design scenarios, a tldraw whiteboard panel appears alongside the transcript. Use the toggle button in the header to show/hide it mid-session. Diagrams are automatically captured at each phase transition and included in the LLM's evaluation.

**Settings**: Click the gear icon on the setup screen to configure TTS voice, VAD response delay, and LLM model. Changes take effect for new sessions (not persisted to `.env`).

## Project Structure

```
├── backend/
│   ├── main.py                    # FastAPI app + WebSocket handler + settings API
│   ├── audio/
│   │   ├── vad.py                 # Silero VAD (speech detection)
│   │   ├── stt.py                 # mlx-whisper (transcription)
│   │   └── tts.py                 # Kokoro TTS (speech synthesis + voice listing)
│   ├── conversation/
│   │   ├── llm.py                 # LM Studio OpenAI client
│   │   ├── manager.py             # Legacy message history + sentence chunking
│   │   ├── phases.py              # Phase-aware InterviewConductor (state machine)
│   │   ├── router.py              # LLM-based phase transition router
│   │   └── feedback.py            # Pydantic AI rubric evaluation + diagram context
│   ├── diagram/
│   │   └── serializer.py          # tldraw snapshot → text serializer (spatial grid)
│   ├── knowledge/
│   │   ├── embedder.py            # Ollama embedding wrapper
│   │   ├── store.py               # Qdrant vector store (local disk mode)
│   │   ├── retriever.py           # RAG orchestrator
│   │   └── ingest.py              # CLI for knowledge base ingestion
│   ├── scenarios/
│   │   ├── loader.py              # YAML scenario parser + save/delete for custom
│   │   ├── templates/             # Built-in interview scenario configs
│   │   └── custom/                # User-created scenarios (via UI or API)
│   └── storage/
│       ├── models.py              # SQLModel tables (Session, Transcript, Score,
│       │                          #   PhaseScore, DiagramSnapshot, SkillDimension)
│       └── db.py                  # SQLite CRUD + additive migrations + history/trends
├── frontend/
│   ├── public/audio-processor.js  # AudioWorklet (plain JS, not bundled)
│   └── src/
│       ├── App.tsx                # Three-way view router
│       ├── hooks/
│       │   ├── useAudio.ts        # Mic capture at 16kHz
│       │   ├── useWebSocket.ts    # WS lifecycle + message dispatch
│       │   └── usePlayback.ts     # TTS audio queue at 24kHz
│       ├── lib/
│       │   └── agentCompiler.ts   # Attributes → ScenarioConfig compiler
│       ├── stores/
│       │   ├── sessionStore.ts    # Zustand state (session, phases, timer, thinking)
│       │   ├── profileStore.ts    # Skill profile + recommendations
│       │   ├── historyStore.ts    # Past sessions + skill trends
│       │   ├── settingsStore.ts   # Runtime settings (voice, VAD, model)
│       │   ├── agentCreatorStore.ts # Agent attributes, wizard state
│       │   └── agentLibraryStore.ts # Saved agents CRUD
│       └── components/
│           ├── SessionSetup/      # Scenario selection + skill overview + history
│           │   ├── SkillOverview  #   Skill bars with expandable trend charts
│           │   ├── ScenarioBuilder#   AI-assisted + manual scenario creation
│           │   └── Settings       #   Voice, VAD, model configuration panel
│           ├── AgentCreator/      # RPG-style agent builder
│           │   ├── OrbScene.tsx   #   R3F scene with orb entity + particles + rings
│           │   ├── AttributePanel #   13 attribute sliders across 4 categories
│           │   ├── WizardPanel    #   Guided 7-question wizard mode
│           │   └── SoulPreview    #   Generated system prompt preview
│           ├── LiveSession/       # Active interview UI + whiteboard panel
│           │   └── WhiteboardPanel.tsx  # tldraw canvas (lazy loaded)
│           └── Review/            # Post-session dashboard (dynamic radar,
│               ├── DiagramViewer.tsx    #   read-only tldraw replay (lazy loaded)
│               └── ...            #   phase timeline, transcript replay)
└── CLAUDE.md                      # Claude Code instructions
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Zustand, Tailwind CSS v4, Recharts, tldraw v4, React Three Fiber, Three.js |
| Backend | FastAPI, Python 3.14, SQLModel, SQLite, Pydantic AI |
| STT | mlx-whisper (whisper-large-v3-turbo, Apple Silicon) |
| LLM | LM Studio (OpenAI-compatible API, local inference) |
| TTS | Kokoro ONNX (24kHz, af_heart voice) |
| VAD | Silero VAD (ONNX, 32ms windows) |
| Audio | Web Audio API, AudioWorklet, 16kHz/24kHz PCM |
