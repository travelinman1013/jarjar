"""FastAPI app entry point with WebSocket audio pipeline handler."""

from dotenv import load_dotenv
load_dotenv()

import asyncio
import json
import logging
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from audio.vad import VoiceActivityDetector
from audio.stt import SpeechToText
from audio.tts import TextToSpeech
from conversation.llm import stream_chat_completion
from conversation.manager import ConversationManager, chunk_sentences

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Voice Interview Coach")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances — models loaded once, shared across connections
stt = SpeechToText()
tts = TextToSpeech()


@app.on_event("startup")
async def startup():
    """Pre-load ML models at server startup."""
    logger.info("Loading whisper model (first run downloads ~1.5GB)...")
    await asyncio.to_thread(stt.load_model)
    logger.info("Whisper model loaded and ready.")
    logger.info("Loading Kokoro TTS model...")
    await asyncio.to_thread(tts.load_model)
    logger.info("Kokoro TTS model loaded and ready.")


@app.get("/")
async def health():
    return {"status": "ok"}


async def run_bot_response(
    websocket: WebSocket,
    conversation: ConversationManager,
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
        await websocket.send_json({"type": "bot_speech_stop"})

    except asyncio.CancelledError:
        raw_response = "".join(raw_tokens)
        if raw_response:
            conversation.add_assistant_message(raw_response)
        raise


async def cancel_bot_task(task: asyncio.Task | None) -> None:
    """Cancel the bot response task and wait for cleanup."""
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    vad = VoiceActivityDetector()
    conversation = ConversationManager()
    turn_id = 0
    bot_response_task: asyncio.Task | None = None

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

                            # Feed to conversation and spawn bot response
                            conversation.add_user_message(text)
                            await cancel_bot_task(bot_response_task)
                            bot_response_task = asyncio.create_task(
                                run_bot_response(websocket, conversation)
                            )

            elif "text" in message:
                # Text frame = JSON control message
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "session.start":
                    vad.reset()
                    conversation.reset()
                    turn_id = 0
                    logger.info("Session started")
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
                    logger.info("Session stopped")

    except WebSocketDisconnect:
        await cancel_bot_task(bot_response_task)
        logger.info("Client disconnected")
