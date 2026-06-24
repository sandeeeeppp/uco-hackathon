import React from 'react';

export default function DataFeed({ history }) {
  return (
    <div className="log-container">
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
      {history.length === 0 && <div style={{color: 'var(--text-dim)'}}>Waiting for datastream...</div>}
    </div>
  );
}
