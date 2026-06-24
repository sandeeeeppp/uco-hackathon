# 🛡️ VoiceGuard — Audio Forensics for Voice Security

> **Team Orbit** — Shuvradeep Bera · Ayush Pawar · Sandeep Saikia  
> UCO Bank Hackathon — Problem Statement 2

## 🎯 Problem

Generative AI can clone a customer's voice from just **3 seconds of audio**. Fraudsters use these clones to bypass Voice Biometric passwords and trick call center agents into authorizing fund transfers. Current defenses rely on **easily spoofed metadata** (caller IDs, phone numbers).

## 💡 Solution — Dual-Phase Orthogonal Defence

A **real-time Audio Forensics Module** that analyzes live calls and flags AI-generated speech as **"High Risk" within 10 seconds**.

### Architecture

```
Live Audio → WebSocket (500ms chunks) → In-Memory Decode
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                                               ▼
          Pipeline A: Spectral ML                    Pipeline B: Phase Forensics
          ─────────────────────                      ───────────────────────────
          STFT + MFCC → 2D Map                       Hilbert Transform → Analytic Signal
          AASIST-L GAT (~85K params)                 Instantaneous Frequency (IF)
          GAN artifact detection                     Chirp Group Delay (CGD)
          ONNX Runtime (<1ms CPU)                    Pure math — no ML needed
                    │                                               │
                    └───────────────────────┬───────────────────────┘
                                            ▼
                                    Weighted Fusion
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                           HUMAN       SUSPICIOUS    AI MANIPULATED
                          (green)       (amber)         (red)
```

### Why Two Pipelines?

| Pipeline | Domain | Detects | AI-Proof? |
|----------|--------|---------|-----------|
| **A — Spectral ML** | Frequency/Texture | GAN upsampling artefacts, unnatural harmonics | Learns signatures |
| **B — Phase Math** | Acoustic Phase | Frame-boundary stitching, IF jitter, CGD anomalies | Exploits physics AI can't fix |

Adversaries must fool **both independent detection domains** — an orthogonal defence.

## 🏗️ Project Structure

```
UCO Hackathon/
├── backend/
│   ├── main.py                 # FastAPI + WebSocket server
│   ├── pipeline_spectral.py    # Pipeline A — STFT/MFCC + AASIST-L
│   ├── pipeline_phase.py       # Pipeline B — Hilbert/IF/CGD
│   ├── fusion.py               # Score fusion + verdict
│   └── requirements.txt        # Python dependencies
├── frontend/
│   ├── index.html              # Agent dashboard
│   ├── style.css               # Dark glassmorphism theme
│   └── app.js                  # MediaRecorder + WebSocket + spectrogram
├── README.md
└── TeamOrbit_PS2.pdf           # Solution presentation
```

## 🚀 Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Server starts at `http://localhost:8000`

### Frontend
Open `frontend/index.html` in a modern browser (Chrome/Edge recommended).

Click **Start Analysis** → speak into your microphone → watch the real-time forensics.

## 🔬 Technologies

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI, Uvicorn |
| Audio Processing | Librosa, SciPy, NumPy, SoundFile |
| ML Engine | AASIST-L Graph Attention Network (~85K params) |
| Deployment | ONNX Runtime (CPU-optimized, SIMD) |
| Transport | WebSocket (persistent, bidirectional) |
| Frontend | Vanilla JS, Canvas API, MediaRecorder API |
| Metrics | Tandem Detection Cost Function (t-DCF) |
| Dataset | ASVspoof 2019 LA |

## 📊 Key Metrics

- **~85K parameters** — ultra-lightweight model
- **< 1ms ONNX execution** per forward pass
- **500ms analysis window** — sub-10s verdict
- **Zero GPU resources** — runs on standard CPU
- **t-DCF optimized** — weighted risk scoring

---

*Built with ❤️ by Team Orbit*
