import React, { useEffect, useRef } from 'react';

export default function Spectrogram({ analyserNode, isRecording }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    let animationId;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      if (!analyserNode || !isRecording) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      const bufLen = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufLen);
      analyserNode.getByteFrequencyData(dataArray);

      const sliceWidth = 2;

      // Shift left
      const imageData = ctx.getImageData(sliceWidth, 0, w, h);
      ctx.putImageData(imageData, 0, 0);

      // Draw new slice in pure monochrome green
      const binsPerPixel = bufLen / h;
      for (let y = 0; y < h; y++) {
        const binIndex = Math.floor((h - y) * binsPerPixel);
        const value = dataArray[binIndex] || 0;
        const norm = value / 255;

        // Monochrome green intensity
        const g = Math.floor(norm * 255);
        ctx.fillStyle = `rgb(0, ${g}, 0)`;
        ctx.fillRect(w - sliceWidth, y, sliceWidth, 1);
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [analyserNode, isRecording]);

  return (
    <div className="spectrogram-container">
      <canvas ref={canvasRef}></canvas>
      <div className="spectrogram-overlay">
        [FREQ_BAND_0_TO_8KHZ]
      </div>
    </div>
  );
}
