"""
VoiceGuard — Audio Forensics Engine
====================================
FastAPI server with WebSocket endpoint for real-time audio analysis.

Architecture (from PPT Slide 12):
  Audio Stream → WebSocket Gateway → In-Memory Decode
    → Parallel { Spectral ML Pipeline, Phase Forensics Pipeline }
    → Fusion Engine → WebSocket Push (probability stream)
"""

import asyncio
import io
import time

import numpy as np
import soundfile as sf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pipeline_spectral import SpectralMLPipeline
from pipeline_phase import PhaseForensicsPipeline
from fusion import FusionEngine

# ------------------------------------------------------------------ #
#  App & Middleware                                                    #
# ------------------------------------------------------------------ #
app = FastAPI(
    title="VoiceGuard — Audio Forensics Engine",
    description="Real-time dual-phase deepfake voice detection",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------ #
#  Pipeline Initialization                                            #
# ------------------------------------------------------------------ #
SAMPLE_RATE = 16000

spectral_pipeline = SpectralMLPipeline(sr=SAMPLE_RATE)
phase_pipeline = PhaseForensicsPipeline(sr=SAMPLE_RATE)
fusion_engine = FusionEngine()


# ------------------------------------------------------------------ #
#  REST Endpoints                                                     #
# ------------------------------------------------------------------ #
@app.get("/")
async def root():
    return {"message": "VoiceGuard Audio Forensics Engine", "docs": "/docs"}


@app.get("/api/health")
async def health_check():
    """Health check — confirms both pipelines are online."""
    return {
        "status": "online",
        "engine": "VoiceGuard Audio Forensics",
        "version": "1.0.0",
        "pipelines": {
            "spectral": "AASIST-L (mock — awaiting ONNX model)",
            "phase": "Hilbert / IF / CGD (fully active)",
        },
        "model_params": "~85K",
        "chunk_size_ms": 500,
        "sample_rate": SAMPLE_RATE,
    }


# ------------------------------------------------------------------ #
#  WebSocket Audio Streaming Endpoint                                 #
# ------------------------------------------------------------------ #
@app.websocket("/ws/audio")
async def websocket_audio_endpoint(ws: WebSocket):
    """
    Real-time audio analysis over WebSocket.

    Client sends: binary audio chunks (500 ms, WebM/Opus or raw PCM)
    Server sends: JSON verdict per chunk
    """
    await ws.accept()
    chunk_count = 0
    session_start = time.time()

    # Send initial handshake
    await ws.send_json(
        {
            "type": "handshake",
            "message": "VoiceGuard session active",
            "sample_rate": SAMPLE_RATE,
            "chunk_ms": 500,
        }
    )

    try:
        while True:
            # ---- Receive binary audio chunk ----
            data = await ws.receive_bytes()
            chunk_start = time.time()
            chunk_count += 1

            # ---- In-Memory Decode (skip disk I/O) ----
            audio_data = _decode_audio(data)

            if audio_data is None or len(audio_data) < 160:
                await ws.send_json(
                    {"type": "skip", "chunk_id": chunk_count, "reason": "too_short"}
                )
                continue

            # ---- Dual-Pipeline Analysis (parallel) ----
            spectral_result, phase_result = await asyncio.gather(
                asyncio.to_thread(spectral_pipeline.analyze, audio_data),
                asyncio.to_thread(phase_pipeline.analyze, audio_data),
            )

            # ---- Fusion & Verdict ----
            fusion_result = fusion_engine.fuse(
                spectral_result["spectral_score"],
                phase_result["phase_score"],
            )

            processing_ms = (time.time() - chunk_start) * 1000.0

            # ---- Push result ----
            response = {
                "type": "analysis",
                "chunk_id": chunk_count,
                "timestamp": round(time.time() - session_start, 2),
                "processing_ms": round(processing_ms, 1),
                "spectral": spectral_result,
                "phase": phase_result,
                "fusion": fusion_result,
            }
            await ws.send_json(response)

    except WebSocketDisconnect:
        elapsed = round(time.time() - session_start, 1)
        print(
            f"[VoiceGuard] Client disconnected — "
            f"{chunk_count} chunks in {elapsed}s"
        )
    except Exception as exc:
        print(f"[VoiceGuard] Error: {exc}")
        try:
            await ws.close(code=1011, reason=str(exc)[:120])
        except Exception:
            pass


# ------------------------------------------------------------------ #
#  Helpers                                                            #
# ------------------------------------------------------------------ #
def _decode_audio(raw_bytes: bytes) -> np.ndarray | None:
    """
    Decode an incoming audio chunk from WebM/Opus, WAV, or raw PCM
    entirely in-memory (no disk I/O).
    """
    # Try soundfile first (handles WAV, FLAC, OGG, etc.)
    try:
        audio, sr = sf.read(io.BytesIO(raw_bytes))
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)  # stereo → mono
        if sr != SAMPLE_RATE:
            import librosa
            audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE)
        return audio.astype(np.float32)
    except Exception:
        pass

    # Fallback: treat as raw PCM float32
    try:
        audio = np.frombuffer(raw_bytes, dtype=np.float32)
        if len(audio) > 0:
            return audio
    except Exception:
        pass

    return None


# ------------------------------------------------------------------ #
#  Entry point                                                        #
# ------------------------------------------------------------------ #
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
