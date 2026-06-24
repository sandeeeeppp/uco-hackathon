import React, { useState, useEffect } from 'react';

const HEX_CHARS = '0123456789ABCDEF';

function randomHex(len) {
  let s = '';
  for(let i=0; i<len; i++) s += HEX_CHARS[Math.floor(Math.random() * 16)];
  return s;
}

export default function DataFeed({ history, isRecording }) {
  const [scanner, setScanner] = useState([]);

  // Advanced detecting protocol visual effect
  useEffect(() => {
    if (!isRecording) {
      setScanner([]);
      return;
    }
    const interval = setInterval(() => {
      setScanner(prev => {
        const newLine = `0x${randomHex(8)} [${randomHex(2)} ${randomHex(2)} ${randomHex(2)} ${randomHex(2)}] SCANNING_MEM_BLOCK...`;
        return [newLine, ...prev].slice(0, 5); // Keep last 5 rapid scans
      });
    }, 150);
    return () => clearInterval(interval);
  }, [isRecording]);

  return (
    <div className="log-container">
      {/* Detecting Protocol Active Scan */}
      {isRecording && (
        <div style={{ marginBottom: '16px', color: 'var(--text-dim)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>
          <div>[SYS] PROTOCOL_ACTIVE: MEMORY_HEURISTICS</div>
          {scanner.map((line, i) => (
            <div key={i} style={{ opacity: 1 - (i * 0.15) }}>{line}</div>
          ))}
          <div style={{ color: 'var(--text-main)', marginTop: '4px' }}>&gt; AWAITING_CHUNK_VERDICT<span className="cursor-blink">_</span></div>
        </div>
      )}

      {/* History Feed */}
      {history.map((item, idx) => {
        const cls = item.fusion.verdict === 'HUMAN' ? 'human' 
                  : item.fusion.verdict === 'SUSPICIOUS' ? 'suspicious' 
                  : 'ai';
        return (
          <div key={idx} className={`log-entry ${cls}`}>
            <span>[{item.timestamp.toFixed(1)}s] CHK_{item.chunk_id.toString().padStart(4, '0')}</span>
            <span>R_SCORE: {(item.fusion.fused_score * 100).toFixed(1)}%</span>
            <span>[{item.fusion.verdict}]</span>
            <span>{item.processing_ms.toFixed(0)}ms</span>
          </div>
        );
      })}
      
      {history.length === 0 && !isRecording && (
        <div style={{color: 'var(--text-dim)'}}>&gt; SYSTEM_STANDBY<span className="cursor-blink">_</span></div>
      )}
    </div>
  );
}
