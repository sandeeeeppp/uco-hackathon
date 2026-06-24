/**
 * VoiceGuard — Agent Dashboard Application
 * ==========================================
 * MediaRecorder → WebM/Opus → 500ms chunks → WebSocket → Backend
 * Real-time spectrogram renderer + dynamic score updates
 */

(() => {
  'use strict';

  // ── Config ────────────────────────────────────────────────
  const WS_URL = 'ws://localhost:8000/ws/audio';
  const CHUNK_INTERVAL_MS = 500;
  const SAMPLE_RATE = 16000;

  // ── State ─────────────────────────────────────────────────
  let ws = null;
  let mediaRecorder = null;
  let audioContext = null;
  let analyserNode = null;
  let sourceNode = null;
  let isRecording = false;
  let sessionStart = 0;
  let timerInterval = null;
  let chunkHistory = [];

  // ── DOM References ────────────────────────────────────────
  const btnStart       = document.getElementById('btnStart');
  const btnStop        = document.getElementById('btnStop');
  const statusDot      = document.getElementById('statusDot');
  const statusText     = document.getElementById('statusText');
  const sessionTimer   = document.getElementById('sessionTimer');
  const spectrogramCvs = document.getElementById('spectrogramCanvas');
  const spectrogramCtx = spectrogramCvs.getContext('2d');
  const ringScore      = document.getElementById('ringScore');
  const ringValue      = document.getElementById('ringValue');
  const verdictLabel   = document.getElementById('verdictLabel');
  const barSpectral    = document.getElementById('barSpectral');
  const barPhase       = document.getElementById('barPhase');
  const valSpectral    = document.getElementById('valSpectral');
  const valPhase       = document.getElementById('valPhase');
  const timelineList   = document.getElementById('timelineList');
  const statChunks     = document.getElementById('statChunks');
  const statLatency    = document.getElementById('statLatency');
  const statAvgScore   = document.getElementById('statAvgScore');
  const statPeakRisk   = document.getElementById('statPeakRisk');

  // ── Spectrogram Setup ─────────────────────────────────────
  function initSpectrogram() {
    const dpr = window.devicePixelRatio || 1;
    const rect = spectrogramCvs.getBoundingClientRect();
    spectrogramCvs.width = rect.width * dpr;
    spectrogramCvs.height = rect.height * dpr;
    spectrogramCtx.scale(dpr, dpr);
    spectrogramCtx.fillStyle = '#0c0e18';
    spectrogramCtx.fillRect(0, 0, rect.width, rect.height);
  }

  let spectroX = 0;

  function drawSpectrogramSlice() {
    if (!analyserNode || !isRecording) return;

    const rect = spectrogramCvs.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const bufLen = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufLen);
    analyserNode.getByteFrequencyData(dataArray);

    const sliceWidth = 2;

    // Shift existing image left
    const imageData = spectrogramCtx.getImageData(sliceWidth, 0, w, h);
    spectrogramCtx.putImageData(imageData, 0, 0);

    // Draw new slice on the right edge
    const binsPerPixel = bufLen / h;
    for (let y = 0; y < h; y++) {
      const binIndex = Math.floor((h - y) * binsPerPixel);
      const value = dataArray[binIndex] || 0;
      const norm = value / 255;

      // Gradient: dark blue → cyan → yellow → white
      const r = Math.floor(norm > 0.7 ? 255 : norm > 0.4 ? (norm - 0.4) / 0.3 * 255 : 0);
      const g = Math.floor(norm > 0.7 ? 255 : norm > 0.3 ? (norm - 0.3) / 0.4 * 200 : norm * 80);
      const b = Math.floor(norm > 0.5 ? (1 - (norm - 0.5) * 2) * 255 : norm * 2 * 255);

      spectrogramCtx.fillStyle = `rgb(${r},${g},${b})`;
      spectrogramCtx.fillRect(w - sliceWidth, y, sliceWidth, 1);
    }

    requestAnimationFrame(drawSpectrogramSlice);
  }

  // ── Session Timer ─────────────────────────────────────────
  function startTimer() {
    sessionStart = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      sessionTimer.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
  }

  // ── Ring Gauge Update ─────────────────────────────────────
  const RING_CIRCUMFERENCE = 2 * Math.PI * 80; // r=80

  function updateRing(score, verdict) {
    const pct = Math.min(score, 1);
    ringScore.textContent = Math.round(pct * 100);
    ringValue.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct);

    // Colour by verdict
    let color;
    if (verdict === 'HUMAN') {
      color = getComputedStyle(document.documentElement).getPropertyValue('--verdict-human').trim();
      verdictLabel.className = 'verdict-label human';
    } else if (verdict === 'SUSPICIOUS') {
      color = getComputedStyle(document.documentElement).getPropertyValue('--verdict-suspicious').trim();
      verdictLabel.className = 'verdict-label suspicious';
    } else {
      color = getComputedStyle(document.documentElement).getPropertyValue('--verdict-ai').trim();
      verdictLabel.className = 'verdict-label ai';
    }

    ringValue.style.stroke = color;
    ringScore.style.color = color;
    verdictLabel.textContent = verdict.replace('_', ' ');
  }

  // ── Score Bars ────────────────────────────────────────────
  function updateBars(spectralScore, phaseScore) {
    barSpectral.style.width = `${spectralScore * 100}%`;
    barPhase.style.width = `${phaseScore * 100}%`;
    valSpectral.textContent = (spectralScore * 100).toFixed(1) + '%';
    valPhase.textContent = (phaseScore * 100).toFixed(1) + '%';

    // Color bars by danger level
    barSpectral.style.background = scoreColor(spectralScore);
    barPhase.style.background = scoreColor(phaseScore);
  }

  function scoreColor(s) {
    if (s < 0.35) return 'var(--accent-emerald)';
    if (s < 0.65) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  }

  // ── Timeline ──────────────────────────────────────────────
  function addTimelineEntry(data) {
    const { chunk_id, timestamp, processing_ms, fusion } = data;
    const { fused_score, verdict, confidence } = fusion;

    const cls = verdict === 'HUMAN' ? 'human' : verdict === 'SUSPICIOUS' ? 'suspicious' : 'ai';

    const entry = document.createElement('div');
    entry.className = 'timeline-entry';
    entry.innerHTML = `
      <span class="time">${timestamp.toFixed(1)}s</span>
      <span class="timeline-verdict ${cls}">${verdict.replace('_', ' ')}</span>
      <span class="score" style="color:${scoreColor(fused_score)}">${(fused_score * 100).toFixed(1)}%</span>
      <span class="latency">${processing_ms.toFixed(0)}ms</span>
    `;

    timelineList.prepend(entry);

    // Keep max 100 entries
    while (timelineList.children.length > 100) {
      timelineList.removeChild(timelineList.lastChild);
    }
  }

  // ── Pipeline Stats ────────────────────────────────────────
  function updateStats() {
    const n = chunkHistory.length;
    statChunks.textContent = n;

    if (n === 0) return;

    const avgLatency = chunkHistory.reduce((s, c) => s + c.processing_ms, 0) / n;
    statLatency.textContent = avgLatency.toFixed(0) + 'ms';

    const avgScore = chunkHistory.reduce((s, c) => s + c.fusion.fused_score, 0) / n;
    statAvgScore.textContent = (avgScore * 100).toFixed(1) + '%';

    const peakScore = Math.max(...chunkHistory.map(c => c.fusion.fused_score));
    statPeakRisk.textContent = (peakScore * 100).toFixed(1) + '%';
  }

  // ── WebSocket ─────────────────────────────────────────────
  function connectWebSocket() {
    return new Promise((resolve, reject) => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[VoiceGuard] WebSocket connected');
        resolve();
      };

      ws.onmessage = (evt) => {
        const data = JSON.parse(evt.data);

        if (data.type === 'handshake') {
          console.log('[VoiceGuard] Handshake:', data.message);
          return;
        }

        if (data.type === 'analysis') {
          chunkHistory.push(data);

          // Update UI
          updateRing(data.fusion.fused_score, data.fusion.verdict);
          updateBars(data.spectral.spectral_score, data.phase.phase_score);
          addTimelineEntry(data);
          updateStats();
        }
      };

      ws.onerror = (err) => {
        console.error('[VoiceGuard] WebSocket error:', err);
        reject(err);
      };

      ws.onclose = () => {
        console.log('[VoiceGuard] WebSocket closed');
        if (isRecording) stopRecording();
      };
    });
  }

  // ── MediaRecorder ─────────────────────────────────────────
  async function startRecording() {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });

      // Audio context for spectrogram visualization
      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
      sourceNode = audioContext.createMediaStreamSource(stream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.75;
      sourceNode.connect(analyserNode);

      // Connect WebSocket
      await connectWebSocket();

      // Capture Raw PCM using ScriptProcessor
      const bufferSize = 4096;
      mediaRecorder = audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      let pcmBuffer = [];
      const samplesPerChunk = Math.floor(SAMPLE_RATE * (CHUNK_INTERVAL_MS / 1000));

      mediaRecorder.onaudioprocess = (e) => {
        if (!isRecording || !ws || ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < inputData.length; i++) {
          pcmBuffer.push(inputData[i]);
        }
        
        while (pcmBuffer.length >= samplesPerChunk) {
          const chunkSamples = pcmBuffer.slice(0, samplesPerChunk);
          pcmBuffer = pcmBuffer.slice(samplesPerChunk);
          const float32Array = new Float32Array(chunkSamples);
          ws.send(float32Array.buffer);
        }
      };

      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      
      sourceNode.connect(mediaRecorder);
      mediaRecorder.connect(silentGain);
      silentGain.connect(audioContext.destination);
      isRecording = true;

      // Update UI
      btnStart.disabled = true;
      btnStop.disabled = false;
      statusDot.classList.add('active');
      statusText.textContent = 'Analyzing Live Audio…';

      // Start visuals
      startTimer();
      initSpectrogram();
      drawSpectrogramSlice();

      // Clear previous data
      chunkHistory = [];
      timelineList.innerHTML = '';

    } catch (err) {
      console.error('[VoiceGuard] Failed to start:', err);
      statusText.textContent = 'Error: ' + err.message;
    }
  }

  function stopRecording() {
    isRecording = false;

    if (mediaRecorder && mediaRecorder.disconnect) {
      mediaRecorder.disconnect();
    } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    
    // Stop mic stream
    if (sourceNode && sourceNode.mediaStream) {
       sourceNode.mediaStream.getTracks().forEach(t => t.stop());
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }

    stopTimer();

    btnStart.disabled = false;
    btnStop.disabled = true;
    statusDot.classList.remove('active');
    statusText.textContent = 'Session ended — ' + chunkHistory.length + ' chunks analyzed';
  }

  // ── Event Listeners ───────────────────────────────────────
  btnStart.addEventListener('click', startRecording);
  btnStop.addEventListener('click', stopRecording);

  // ── Init ──────────────────────────────────────────────────
  initSpectrogram();
  window.addEventListener('resize', initSpectrogram);

})();
