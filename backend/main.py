"""FastAPI app entry point with WebSocket audio pipeline handler."""

from dotenv import load_dotenv
load_dotenv()

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from audio.vad import VoiceActivityDetector
from audio.stt import SpeechToText
from audio.tts import TextToSpeech
from conversation.feedback import count_filler_words, generate_feedback
from conversation.llm import stream_chat_completion
from conversation.manager import chunk_sentences
from conversation.phases import InterviewConductor
from conversation.router import evaluate_phase_transition
from scenarios.loader import load_scenarios, get_scenario_by_name
from storage.db import (
    create_db_and_tables,
    create_session as db_create_session,
    add_transcript_entry,
    get_session_scenario,
    get_session_with_transcripts,
    get_score_by_session_id,
    save_score,
    update_session_duration,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances — models loaded once, shared across connections
stt = SpeechToText()
tts = TextToSpeech()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: DB first (instant), then ML models (slow)."""
    create_db_and_tables()
    logger.info("Database initialized.")

    logger.info("Loading whisper model (first run downloads ~1.5GB)...")
    await asyncio.to_thread(stt.load_model)
    logger.info("Whisper model loaded and ready.")

    logger.info("Loading Kokoro TTS model...")
    await asyncio.to_thread(tts.load_model)
    logger.info("Kokoro TTS model loaded and ready.")

    yield


app = FastAPI(title="Voice Interview Coach", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST endpoints ──────────────────────────────────────────────────────────


@app.get("/")
async def health():
    return {"status": "ok"}


@app.get("/api/scenarios")
async def list_scenarios():
    scenarios = await asyncio.to_thread(load_scenarios)
    return [s.model_dump() for s in scenarios]


class CreateSessionRequest(BaseModel):
    scenario_name: str


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: int):
    session_data = await asyncio.to_thread(get_session_with_transcripts, session_id)
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")
    score = await asyncio.to_thread(get_score_by_session_id, session_id)
    return {**session_data, "score": score}


@app.post("/api/sessions/{session_id}/analyze")
async def analyze_session(session_id: int):
    session_data = await asyncio.to_thread(get_session_with_transcripts, session_id)
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")

    transcripts = session_data["transcripts"]
    if not transcripts:
        raise HTTPException(status_code=400, detail="No transcripts to analyze")

    existing = await asyncio.to_thread(get_score_by_session_id, session_id)
    if existing:
        return existing

    scenario = await asyncio.to_thread(
        get_scenario_by_name, session_data["scenario_name"]
    )
    evaluation_criteria = scenario.evaluation_criteria if scenario else []

    filler_count = count_filler_words(transcripts)
    feedback = await generate_feedback(
        session_id, transcripts, session_data["scenario_name"], evaluation_criteria
    )

    await asyncio.to_thread(
        save_score,
        session_id,
        feedback.get("overall_score", 5),
        feedback.get("clarity_score", 5),
        feedback.get("structure_score", 5),
        feedback.get("depth_score", 5),
        feedback.get("best_moment", ""),
        feedback.get("biggest_opportunity", ""),
        filler_count,
    )

    return {**feedback, "filler_word_count": filler_count}


@app.post("/api/sessions")
async def create_session(req: CreateSessionRequest):
    scenario = await asyncio.to_thread(get_scenario_by_name, req.scenario_name)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    session = await asyncio.to_thread(db_create_session, req.scenario_name)
    return {"session_id": session.id, "scenario_name": session.scenario_name}


# ── Bot response pipeline ──────────────────────────────────────────────────


async def run_bot_response(
    websocket: WebSocket,
    conversation: InterviewConductor,
    session_id: int | None = None,
    bot_turn_id: int = 0,
):
    """LLM -> sentence chunking -> TTS -> WebSocket binary send."""
    raw_tokens: list[str] = []
    first_chunk = True

    async def _capture(token_stream):
        async for token in token_stream:
            raw_tokens.append(token)
            yield token

    try:
        token_stream = stream_chat_completion(conversation.get_messages())
        async for sentence in chunk_sentences(_capture(token_stream)):
            if first_chunk:
                await websocket.send_json({"type": "bot_speech_start"})
                first_chunk = False

            await websocket.send_json({
                "type": "bot_transcript",
                "text": sentence,
                "timestamp": time.time(),
            })

            pcm = await tts.synthesize(sentence)
            if pcm:
                await websocket.send_bytes(pcm)

        raw_response = "".join(raw_tokens)
        if raw_response:
            conversation.add_assistant_message(raw_response)
            if session_id:
                await asyncio.to_thread(
                    add_transcript_entry,
                    session_id, bot_turn_id, "bot", raw_response, time.time(),
                )
        await websocket.send_json({"type": "bot_speech_stop"})

    except asyncio.CancelledError:
        raw_response = "".join(raw_tokens)
        if raw_response:
            conversation.add_assistant_message(raw_response)
            if session_id:
                await asyncio.to_thread(
                    add_transcript_entry,
                    session_id, bot_turn_id, "bot", raw_response, time.time(),
                )
        raise


async def cancel_bot_task(task: asyncio.Task | None) -> None:
    """Cancel the bot response task and wait for cleanup."""
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def run_bot_response_with_routing(
    websocket: WebSocket,
    conductor: InterviewConductor,
    session_id: int | None = None,
    bot_turn_id: int = 0,
):
    """Wraps run_bot_response with post-response phase evaluation."""
    await run_bot_response(websocket, conductor, session_id, bot_turn_id)

    if conductor.should_evaluate_transition():
        decision = await evaluate_phase_transition(conductor)
        if decision.should_advance and decision.next_phase:
            conductor.advance_phase(decision.next_phase)
            phase_cfg = conductor.phases.get(decision.next_phase)
            await websocket.send_json({
                "type": "phase_change",
                "phase": decision.next_phase,
                "display_name": phase_cfg.display_name if phase_cfg else decision.next_phase,
            })


# ── WebSocket handler ───────────────────────────────────────────────────────


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    vad = VoiceActivityDetector()
    conductor = InterviewConductor()
    turn_id = 0
    bot_response_task: asyncio.Task | None = None
    session_id: int | None = None
    session_start_time: float | None = None

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message:
                # Binary frame = audio chunk
                events = vad.process_chunk(message["bytes"])
                for event in events:
                    if event["event"] == "speech_start":
                        await websocket.send_json({"type": "vad", "is_speech": True})
                        # Barge-in: cancel bot response if running
                        if bot_response_task and not bot_response_task.done():
                            await cancel_bot_task(bot_response_task)
                            bot_response_task = None
                            await websocket.send_json({"type": "interrupt_ack"})

                    elif event["event"] == "speech_end":
                        await websocket.send_json({"type": "vad", "is_speech": False})
                        turn_id += 1
                        tid = turn_id
                        audio_bytes = event["audio"]
                        logger.info(f"Turn {tid}: transcribing {len(audio_bytes)} bytes...")
                        text = await asyncio.to_thread(stt.transcribe_sync, audio_bytes)
                        if text:
                            await websocket.send_json({
                                "type": "transcript",
                                "text": text,
                                "is_final": True,
                                "turn_id": tid,
                                "timestamp": time.time(),
                            })
                            logger.info(f"Turn {tid}: '{text}'")

                            # Persist user transcript
                            if session_id:
                                await asyncio.to_thread(
                                    add_transcript_entry,
                                    session_id, tid, "user", text, time.time(),
                                )

                            # Feed to conductor and spawn bot response
                            conductor.add_user_message(text)
                            await cancel_bot_task(bot_response_task)
                            bot_response_task = asyncio.create_task(
                                run_bot_response_with_routing(
                                    websocket, conductor, session_id, tid,
                                )
                            )

            elif "text" in message:
                # Text frame = JSON control message
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "session.start":
                    vad.reset()
                    turn_id = 0
                    session_id = data.get("session_id")

                    try:
                        if session_id:
                            scenario_name = await asyncio.to_thread(
                                get_session_scenario, session_id,
                            )
                            if scenario_name:
                                scenario = await asyncio.to_thread(
                                    get_scenario_by_name, scenario_name,
                                )
                                if scenario:
                                    conductor = InterviewConductor(
                                        base_system_prompt=scenario.system_prompt,
                                        phases=scenario.phases or None,
                                    )
                                else:
                                    conductor = InterviewConductor()
                            else:
                                conductor = InterviewConductor()
                        else:
                            conductor = InterviewConductor()
                    except Exception:
                        logger.exception(
                            "Failed to load scenario for session %s", session_id,
                        )
                        conductor = InterviewConductor()

                    session_start_time = time.time()
                    logger.info(f"Session started (id={session_id})")
                    await websocket.send_json({"type": "session.ready"})

                elif msg_type == "session.stop":
                    await cancel_bot_task(bot_response_task)
                    bot_response_task = None

                    final = vad.flush()
                    if final:
                        turn_id += 1
                        text = await asyncio.to_thread(stt.transcribe_sync, final["audio"])
                        if text:
                            await websocket.send_json({
                                "type": "transcript",
                                "text": text,
                                "is_final": True,
                                "turn_id": turn_id,
                                "timestamp": time.time(),
                            })
                            if session_id:
                                await asyncio.to_thread(
                                    add_transcript_entry,
                                    session_id, turn_id, "user", text, time.time(),
                                )

                    # Record session duration
                    if session_id and session_start_time:
                        duration = time.time() - session_start_time
                        await asyncio.to_thread(
                            update_session_duration, session_id, duration,
                        )

                    logger.info("Session stopped")

    except WebSocketDisconnect:
        await cancel_bot_task(bot_response_task)
        # Record duration on unexpected disconnect
        if session_id and session_start_time:
            duration = time.time() - session_start_time
            await asyncio.to_thread(
                update_session_duration, session_id, duration,
            )
        logger.info("Client disconnected")
