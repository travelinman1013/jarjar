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

# Global STT instance — model loaded once, shared across connections
stt = SpeechToText()


@app.on_event("startup")
async def startup():
    """Pre-load ML models at server startup."""
    logger.info("Loading whisper model (first run downloads ~1.5GB)...")
    await asyncio.to_thread(stt.load_model)
    logger.info("Whisper model loaded and ready.")


@app.get("/")
async def health():
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    vad = VoiceActivityDetector()
    turn_id = 0

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message:
                # Binary frame = audio chunk
                events = vad.process_chunk(message["bytes"])
                for event in events:
                    if event["event"] == "speech_start":
                        await websocket.send_json({"type": "vad", "is_speech": True})

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

            elif "text" in message:
                # Text frame = JSON control message
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "session.start":
                    vad.reset()
                    turn_id = 0
                    logger.info("Session started")
                    await websocket.send_json({"type": "session.ready"})

                elif msg_type == "session.stop":
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
        logger.info("Client disconnected")
