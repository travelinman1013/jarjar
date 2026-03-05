# Voice Interview Coach

A fully local, real-time voice conversation app for practicing mock interviews. All AI inference runs on-device — no cloud APIs, no data leaves your machine.

Built for Apple Silicon (tested on Mac Studio M3 Ultra with 256GB unified memory).

## Features

- **Real-time voice conversation** — speak naturally and get instant spoken responses from an AI interview coach
- **Multiple interview scenarios** — behavioral, technical system design, and warm-up sessions with configurable difficulty
- **Live transcription** — see both your speech and the coach's responses in real-time
- **Barge-in support** — interrupt the coach mid-sentence, just like a real conversation
- **Post-session feedback** — AI-generated scores for clarity, structure, and depth with a radar chart visualization
- **Filler word tracking** — automatic detection of "um", "uh", "like", "you know", "basically"
- **Session persistence** — transcripts and scores saved to SQLite for review

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
9. **Post-session**: Full transcript sent to LLM for structured JSON feedback (clarity, structure, depth scores)

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

1. **Select a scenario** from the setup screen (Quick Warmup, Behavioral, System Design, etc.)
2. **Click "Start Recording"** — grant microphone access when prompted
3. **Speak naturally** — the coach will respond with voice and text
4. **Click "End & Review"** when done — the AI analyzes your performance
5. **Review your scores** — radar chart, filler word count, best moment, and improvement suggestions

## Project Structure

```
├── backend/
│   ├── main.py                    # FastAPI app + WebSocket handler
│   ├── audio/
│   │   ├── vad.py                 # Silero VAD (speech detection)
│   │   ├── stt.py                 # mlx-whisper (transcription)
│   │   └── tts.py                 # Kokoro TTS (speech synthesis)
│   ├── conversation/
│   │   ├── llm.py                 # LM Studio OpenAI client
│   │   ├── manager.py             # Message history + sentence chunking
│   │   └── feedback.py            # Post-session scoring + filler words
│   ├── scenarios/
│   │   ├── loader.py              # YAML scenario parser
│   │   └── templates/             # Interview scenario configs
│   └── storage/
│       ├── models.py              # SQLModel tables (Session, Transcript, Score)
│       └── db.py                  # SQLite CRUD helpers
├── frontend/
│   ├── public/audio-processor.js  # AudioWorklet (plain JS, not bundled)
│   └── src/
│       ├── App.tsx                # Three-way view router
│       ├── stores/sessionStore.ts # Zustand state management
│       ├── hooks/
│       │   ├── useAudio.ts        # Mic capture at 16kHz
│       │   ├── useWebSocket.ts    # WS lifecycle + message dispatch
│       │   └── usePlayback.ts     # TTS audio queue at 24kHz
│       └── components/
│           ├── SessionSetup/      # Scenario selection
│           ├── LiveSession/       # Active interview UI
│           └── Review/            # Post-session dashboard + radar chart
└── CLAUDE.md                      # Claude Code instructions
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Zustand, Tailwind CSS v4, Recharts |
| Backend | FastAPI, Python 3.14, SQLModel, SQLite |
| STT | mlx-whisper (whisper-large-v3-turbo, Apple Silicon) |
| LLM | LM Studio (OpenAI-compatible API, local inference) |
| TTS | Kokoro ONNX (24kHz, af_heart voice) |
| VAD | Silero VAD (ONNX, 32ms windows) |
| Audio | Web Audio API, AudioWorklet, 16kHz/24kHz PCM |
