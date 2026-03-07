"""FastAPI app entry point with WebSocket audio pipeline handler."""

from dotenv import load_dotenv
load_dotenv()

import asyncio
import json
import logging
import time

import yaml
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from audio.vad import VoiceActivityDetector
from audio.stt import SpeechToText
from audio.tts import TextToSpeech
from conversation.feedback import count_filler_words, generate_feedback_legacy, generate_rubric_feedback
from diagram.serializer import serialize_tldraw_snapshot
from conversation.llm import stream_chat_completion
from conversation.manager import chunk_sentences
from conversation.phases import InterviewConductor
from conversation.router import evaluate_phase_transition
from profile.manager import get_profile, get_recommendations, recalculate_dimensions, reset_dimensions, reset_profile, update_profile_from_session
from scenarios.loader import (
    ScenarioConfig,
    load_scenarios,
    get_scenario_by_name,
    save_scenario,
    delete_scenario,
    is_custom_scenario,
)
from storage.db import (
    create_db_and_tables,
    create_session as db_create_session,
    add_transcript_entry,
    delete_session_cascade,
    get_diagram_snapshots_by_session_id,
    get_phase_scores_by_session_id,
    get_session_scenario,
    get_session_with_transcripts,
    get_score_by_session_id,
    get_skill_trends,
    list_all_sessions,
    save_diagram_snapshot,
    save_phase_scores,
    save_score,
    update_session_duration,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances — models loaded once, shared across connections
stt = SpeechToText()
tts = TextToSpeech()

# RAG retriever — initialized at startup, None if Ollama unavailable
knowledge_retriever = None


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

    global knowledge_retriever
    try:
        from knowledge.embedder import OllamaEmbedder
        from knowledge.store import KnowledgeStore
        from knowledge.retriever import KnowledgeRetriever

        embedder = OllamaEmbedder()
        store = KnowledgeStore()
        knowledge_retriever = KnowledgeRetriever(embedder, store)
        logger.info("Knowledge retriever initialized.")
    except Exception:
        logger.warning("Knowledge retriever unavailable — RAG disabled.")
        knowledge_retriever = None

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


@app.post("/api/scenarios", status_code=201)
async def create_scenario(config: ScenarioConfig):
    existing = await asyncio.to_thread(get_scenario_by_name, config.name)
    if existing:
        raise HTTPException(status_code=409, detail="Scenario name already exists")
    await asyncio.to_thread(save_scenario, config)
    return config.model_dump()


@app.delete("/api/scenarios/{name}")
async def remove_scenario(name: str):
    if not is_custom_scenario(name):
        raise HTTPException(status_code=404, detail="Custom scenario not found")
    await asyncio.to_thread(delete_scenario, name)
    return {"deleted": name}


class GenerateScenarioRequest(BaseModel):
    description: str
    type: str = "technical"
    difficulty: str = "medium"


@app.post("/api/scenarios/generate")
async def generate_scenario(req: GenerateScenarioRequest):
    """Use LLM to generate a scenario config from a description."""
    import re

    system_prompt = """You are a scenario designer for a voice interview coach application.
Generate a complete interview scenario configuration as valid YAML based on the user's description.

The YAML must include these fields:
- name: snake_case identifier (unique)
- type: one of behavioral, technical, system_design
- difficulty: one of easy, medium, hard
- duration_minutes: integer (10-30)
- system_prompt: detailed interviewer instructions (plain text, no emojis or markdown)
- focus_areas: list of 3-5 skill dimensions to evaluate
- evaluation_criteria: list of 4-6 concrete evaluation points
- phases: list of interview phases, each with:
  - name: snake_case
  - display_name: human readable
  - objective: what this phase should accomplish
  - prompt_injection: instructions injected into the system prompt for this phase
  - max_turns: integer (3-8)
  - min_turns: integer (1-2)
  - transition_hint: when to move to the next phase
  - next_phases: list of possible next phase names
- rubrics: for each focus_area, scoring anchors at levels 3, 5, 7, 9
- whiteboard_enabled: boolean

Respond with ONLY the YAML content, no explanations or markdown fences."""

    user_prompt = f"Create a {req.difficulty} {req.type} interview scenario: {req.description}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    tokens: list[str] = []
    async for token in stream_chat_completion(messages, temperature=0.7, max_tokens=4096):
        tokens.append(token)

    raw_output = "".join(tokens)

    # Strip markdown fences if present
    cleaned = re.sub(r"^```(?:yaml)?\s*\n?", "", raw_output.strip())
    cleaned = re.sub(r"\n?```\s*$", "", cleaned)

    try:
        data = yaml.safe_load(cleaned)
        config = ScenarioConfig(**data)
        return config.model_dump()
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse generated scenario: {str(e)}",
        )


class CreateSessionRequest(BaseModel):
    scenario_name: str


@app.get("/api/sessions")
async def list_sessions(limit: int = 50, offset: int = 0):
    return await asyncio.to_thread(list_all_sessions, limit, offset)


@app.delete("/api/sessions/{session_id}")
async def remove_session(session_id: int):
    affected = await asyncio.to_thread(delete_session_cascade, session_id)
    if affected is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if affected:
        await asyncio.to_thread(recalculate_dimensions, affected)
    return {"deleted": session_id}


class BatchDeleteRequest(BaseModel):
    session_ids: list[int]


@app.delete("/api/sessions")
async def remove_sessions_batch(req: BatchDeleteRequest):
    all_affected: set[int] = set()
    deleted_ids: list[int] = []
    for sid in req.session_ids:
        affected = await asyncio.to_thread(delete_session_cascade, sid)
        if affected is not None:
            deleted_ids.append(sid)
            all_affected.update(affected)
    if all_affected:
        await asyncio.to_thread(recalculate_dimensions, list(all_affected))
    return {"deleted": deleted_ids, "count": len(deleted_ids)}


@app.get("/api/trends")
async def get_trends():
    return await asyncio.to_thread(get_skill_trends)


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: int):
    session_data = await asyncio.to_thread(get_session_with_transcripts, session_id)
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")
    score = await asyncio.to_thread(get_score_by_session_id, session_id)
    phase_scores = await asyncio.to_thread(
        get_phase_scores_by_session_id, session_id
    )
    diagrams = await asyncio.to_thread(
        get_diagram_snapshots_by_session_id, session_id
    )
    return {**session_data, "score": score, "phase_scores": phase_scores, "diagrams": diagrams}


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
        # Also return phase scores if available
        phase_scores = await asyncio.to_thread(
            get_phase_scores_by_session_id, session_id
        )
        if phase_scores:
            existing["phase_scores"] = phase_scores
            existing["dimensions"] = existing.get("dimension_names", [])
        return existing

    scenario = await asyncio.to_thread(
        get_scenario_by_name, session_data["scenario_name"]
    )
    evaluation_criteria = scenario.evaluation_criteria if scenario else []
    filler_count = count_filler_words(transcripts)

    if scenario and scenario.rubrics:
        # Rubric-based multi-phase evaluation
        result = await generate_rubric_feedback(
            session_id,
            transcripts,
            session_data["scenario_name"],
            scenario.focus_areas,
            evaluation_criteria,
            scenario.rubrics,
            scenario.phase_exemplars,
            phases_config=scenario.phases,
            retriever=knowledge_retriever,
            knowledge_collections=scenario.knowledge_collections,
        )

        summary = result["summary"]
        await asyncio.to_thread(
            save_score,
            session_id,
            summary.get("overall_score", 5),
            summary.get("clarity_score", 5),
            summary.get("structure_score", 5),
            summary.get("depth_score", 5),
            summary.get("best_moment", ""),
            summary.get("biggest_opportunity", ""),
            filler_count,
            summary.get("technical_accuracy_notes", ""),
            json.dumps(result["dimensions"]),
        )

        if result["phase_scores"]:
            await asyncio.to_thread(
                save_phase_scores, session_id, result["phase_scores"]
            )

        try:
            await asyncio.to_thread(update_profile_from_session, session_id)
        except Exception:
            logger.warning("Profile update failed for session %s", session_id, exc_info=True)

        return {
            **summary,
            "filler_word_count": filler_count,
            "phase_scores": result["phase_scores"],
            "dimensions": result["dimensions"],
        }
    else:
        # Legacy single-call evaluation
        feedback = await generate_feedback_legacy(
            session_id,
            transcripts,
            session_data["scenario_name"],
            evaluation_criteria,
            retriever=knowledge_retriever,
            knowledge_collections=scenario.knowledge_collections if scenario else [],
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


@app.get("/api/profile")
async def get_candidate_profile():
    profile = await asyncio.to_thread(get_profile)
    recommendations = await asyncio.to_thread(get_recommendations)
    return {**profile, "recommendations": recommendations}


@app.delete("/api/profile")
async def reset_full_profile():
    count = await asyncio.to_thread(reset_profile)
    return {"reset": "full", "dimensions_cleared": count}


class DimensionResetRequest(BaseModel):
    dimension_names: list[str]


@app.delete("/api/profile/dimensions")
async def reset_profile_dimensions(req: DimensionResetRequest):
    cleared = await asyncio.to_thread(reset_dimensions, req.dimension_names)
    return {"reset": "selective", "dimensions_cleared": cleared}


class SettingsUpdate(BaseModel):
    vad_silence_ms: int | None = None
    llm_model: str | None = None
    kokoro_voice: str | None = None


@app.get("/api/settings")
async def get_settings():
    import audio.vad as vad_module
    import audio.tts as tts_module
    import conversation.llm as llm_module

    available_voices = tts.get_voices()

    available_models = [llm_module.LLM_MODEL]
    try:
        models = await llm_module.client.models.list()
        available_models = [m.id for m in models.data]
    except Exception:
        pass

    return {
        "vad_silence_ms": vad_module.SILENCE_THRESHOLD_MS,
        "llm_model": llm_module.LLM_MODEL,
        "llm_base_url": llm_module.LLM_BASE_URL,
        "kokoro_voice": tts_module.KOKORO_VOICE,
        "available_voices": available_voices,
        "available_models": available_models,
    }


@app.patch("/api/settings")
async def update_settings(update: SettingsUpdate):
    import audio.vad as vad_module
    import audio.tts as tts_module
    import conversation.llm as llm_module

    if update.vad_silence_ms is not None:
        vad_module.SILENCE_THRESHOLD_MS = max(300, min(2000, update.vad_silence_ms))

    if update.llm_model is not None:
        llm_module.LLM_MODEL = update.llm_model

    if update.kokoro_voice is not None:
        available = tts.get_voices()
        if available and update.kokoro_voice not in available:
            raise HTTPException(
                status_code=400,
                detail=f"Voice '{update.kokoro_voice}' not available. Choose from: {available}",
            )
        tts_module.KOKORO_VOICE = update.kokoro_voice

    return {
        "vad_silence_ms": vad_module.SILENCE_THRESHOLD_MS,
        "llm_model": llm_module.LLM_MODEL,
        "llm_base_url": llm_module.LLM_BASE_URL,
        "kokoro_voice": tts_module.KOKORO_VOICE,
        "available_voices": tts.get_voices(),
        "available_models": [llm_module.LLM_MODEL],
    }


@app.get("/api/sessions/{session_id}/diagrams")
async def get_session_diagrams(session_id: int):
    return await asyncio.to_thread(get_diagram_snapshots_by_session_id, session_id)


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
    phase: str | None = None,
):
    """LLM -> sentence chunking -> TTS -> WebSocket binary send."""
    raw_tokens: list[str] = []
    first_chunk = True

    async def _capture(token_stream):
        async for token in token_stream:
            raw_tokens.append(token)
            yield token

    try:
        await websocket.send_json({"type": "bot_thinking"})
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
                    phase,
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
                    phase,
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
    phase: str | None = None,
    diagram_state: dict | None = None,
):
    """Wraps run_bot_response with post-response phase evaluation."""
    await run_bot_response(websocket, conductor, session_id, bot_turn_id, phase)

    if conductor.should_evaluate_transition():
        decision = await evaluate_phase_transition(conductor)
        if decision.should_advance and decision.next_phase:
            # Capture diagram snapshot for the phase that just ended
            if diagram_state and session_id and phase:
                snapshot = diagram_state.get("snapshot")
                if snapshot:
                    old_phase_cfg = conductor.phases.get(phase)
                    old_display = old_phase_cfg.display_name if old_phase_cfg else phase
                    await asyncio.to_thread(
                        save_diagram_snapshot,
                        session_id,
                        phase,
                        old_display,
                        json.dumps(snapshot),
                        diagram_state.get("serialized_text", ""),
                        diagram_state.get("shape_count", 0),
                    )

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
    knowledge_collections: list[str] = []
    diagram_state: dict = {}  # mutable container: {snapshot, serialized_text, shape_count}

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
                                    conductor.current_phase,
                                )

                            # Feed to conductor and spawn bot response
                            conductor.add_user_message(text)

                            # RAG: retrieve relevant knowledge chunks
                            if knowledge_retriever and knowledge_collections:
                                try:
                                    chunks = await knowledge_retriever.retrieve(
                                        query=text,
                                        collections=knowledge_collections,
                                        top_k=3,
                                    )
                                    conductor.set_rag_context(
                                        knowledge_retriever.format_context(chunks)
                                        if chunks else None
                                    )
                                except Exception:
                                    logger.warning("RAG retrieval failed, continuing without context")
                                    conductor.set_rag_context(None)

                            await cancel_bot_task(bot_response_task)
                            bot_response_task = asyncio.create_task(
                                run_bot_response_with_routing(
                                    websocket, conductor, session_id, tid,
                                    conductor.current_phase,
                                    diagram_state=diagram_state,
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
                                    knowledge_collections = scenario.knowledge_collections
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

                    # Include phase list for progress indicator
                    phase_list = []
                    if conductor.phases:
                        phase_list = [
                            {"name": p.name, "display_name": p.display_name}
                            for p in (scenario.phases if scenario and scenario.phases else [])
                        ]
                    await websocket.send_json({
                        "type": "session.ready",
                        "phase_list": phase_list,
                        "duration_minutes": scenario.duration_minutes if scenario else None,
                    })

                elif msg_type == "diagram_state":
                    snapshot = data.get("snapshot", {})
                    shape_count = data.get("shape_count", 0)
                    serialized = await asyncio.to_thread(
                        serialize_tldraw_snapshot, snapshot
                    )
                    conductor.set_diagram_context(serialized)
                    diagram_state["snapshot"] = snapshot
                    diagram_state["serialized_text"] = serialized
                    diagram_state["shape_count"] = shape_count

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
                                    conductor.current_phase,
                                )

                    # Capture diagram snapshot for the final phase
                    if diagram_state.get("snapshot") and session_id and conductor.current_phase:
                        phase_cfg = conductor.get_current_phase_config()
                        display = phase_cfg.display_name if phase_cfg else conductor.current_phase
                        await asyncio.to_thread(
                            save_diagram_snapshot,
                            session_id,
                            conductor.current_phase,
                            display,
                            json.dumps(diagram_state["snapshot"]),
                            diagram_state.get("serialized_text", ""),
                            diagram_state.get("shape_count", 0),
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
