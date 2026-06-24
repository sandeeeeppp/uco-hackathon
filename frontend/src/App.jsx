import React, { useState, useEffect, useRef } from 'react';
import Spectrogram from './Spectrogram';
import DataFeed from './DataFeed';

const WS_URL = 'ws://localhost:8000/ws/audio';
const CHUNK_INTERVAL_MS = 500;
const SAMPLE_RATE = 16000;

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState([]);
  const [analyserNode, setAnalyserNode] = useState(null);
  
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);

  // Stats
  const chunksCount = history.length;
  const avgLatency = chunksCount ? history.reduce((s, c) => s + c.processing_ms, 0) / chunksCount : 0;
  const peakScore = chunksCount ? Math.max(...history.map(c => c.fusion.fused_score)) : 0;

  // Latest verdict
  const latest = chunksCount > 0 ? history[0] : null;
  let verdictCls = 'human';
  let verdictText = 'AWAITING_DATA';
  if (latest) {
    verdictCls = latest.fusion.verdict === 'HUMAN' ? 'human' 
               : latest.fusion.verdict === 'SUSPICIOUS' ? 'suspicious' 
               : 'ai';
    verdictText = latest.fusion.verdict;
  }

  const startAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      setAnalyserNode(analyser);

      // Connect WebSocket
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => console.log('SYS_LOG: WebSocket connected');
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'analysis') {
          setHistory(prev => [data, ...prev].slice(0, 100)); // Keep last 100
        }
      };
      
      // Await open
      await new Promise((resolve) => {
        if (ws.readyState === WebSocket.OPEN) resolve();
        else ws.addEventListener('open', resolve);
      });

      // Raw Float32 PCM Capture via ScriptProcessor
      const bufferSize = 4096;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      let pcmBuffer = [];
      const samplesPerChunk = Math.floor(SAMPLE_RATE * (CHUNK_INTERVAL_MS / 1000));

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < inputData.length; i++) pcmBuffer.push(inputData[i]);
        
        while (pcmBuffer.length >= samplesPerChunk) {
          const chunk = pcmBuffer.slice(0, samplesPerChunk);
          pcmBuffer = pcmBuffer.slice(samplesPerChunk);
          ws.send(new Float32Array(chunk).buffer);
        }
      };

      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      setIsRecording(true);
      setHistory([]);

    } catch (err) {
      console.error('SYS_ERR:', err);
      alert('SYS_ERR: Microphone access denied or failed.');
    }
  };

  const stopAnalysis = () => {
    setIsRecording(false);
    
    if (processorRef.current && processorRef.current.disconnect) {
      processorRef.current.disconnect();
    }
    if (sourceRef.current && sourceRef.current.mediaStream) {
      sourceRef.current.mediaStream.getTracks().forEach(t => t.stop());
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
  };

  return (
    <div className="app-container">
      <div className="header-area panel">
        <div className="panel-header">SYS_CORE // VOICE_GUARD</div>
        <div style={{padding: '12px', display: 'flex', justifyContent: 'space-between'}}>
          <div className="title">VOICE_GUARD_TERMINAL v2.0.0</div>
          <div className="sys-info">
            LATENCY: {avgLatency.toFixed(0)}ms | PEAK_RISK: {(peakScore * 100).toFixed(1)}% | CHUNKS: {chunksCount}
          </div>
        </div>
      </div>

      <div className="main-area">
        <div className="panel" style={{flex: '1'}}>
          <div className="panel-header">SPECTRAL_ANALYSIS_VIEW</div>
          <Spectrogram analyserNode={analyserNode} isRecording={isRecording} />
        </div>

        <div className="panel">
          <div className="panel-header">CONTROL_INTERFACE</div>
          <div className="controls">
            <button onClick={startAnalysis} disabled={isRecording}>[ INIT_ANALYSIS ]</button>
            <button className="danger" onClick={stopAnalysis} disabled={!isRecording}>[ HALT_SYSTEM ]</button>
          </div>
        </div>
      </div>

      <div className="side-area">
        <div className="panel" style={{flex: '0 0 auto'}}>
          <div className="panel-header">LIVE_VERDICT</div>
          <div className="verdict-box">
            <div className={`verdict-status ${verdictCls}`}>[{verdictText}]</div>
            {latest ? (
              <>
                <div className="verdict-details"><span>R_SCORE</span><span>{(latest.fusion.fused_score * 100).toFixed(1)}%</span></div>
                <div className="verdict-details"><span>SPECTRAL</span><span>{(latest.spectral.spectral_score * 100).toFixed(1)}%</span></div>
                <div className="verdict-details"><span>PHASE</span><span>{(latest.phase.phase_score * 100).toFixed(1)}%</span></div>
              </>
            ) : (
              <div className="verdict-details">STANDBY...</div>
            )}
          </div>
        </div>

        <div className="panel" style={{flex: '1', minHeight: 0}}>
          <div className="panel-header">SYS_DATA_FEED</div>
          <DataFeed history={history} />
        </div>
      </div>
    </div>
  );
}
