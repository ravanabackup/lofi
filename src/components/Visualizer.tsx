import { useEffect, useRef } from "react";

interface VisualizerProps {
  getAnalyser: () => AnalyserNode | null;
  active: boolean;
}

/**
 * Mirrored frequency-bar visualizer drawn on a canvas.
 * Reads live data from the engine's AnalyserNode.
 */
export default function Visualizer({ getAnalyser, active }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let phase = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      const analyser = getAnalyser();
      const barCount = 56;
      const data = new Uint8Array(barCount);

      if (analyser && active) {
        const bins = analyser.frequencyBinCount;
        const freq = new Uint8Array(bins);
        analyser.getByteFrequencyData(freq);
        // Logarithmically compress bins into barCount groups for a musical look.
        for (let i = 0; i < barCount; i++) {
          const t = i / barCount;
          const idx = Math.floor(Math.pow(t, 1.7) * bins);
          data[i] = freq[idx] / 255;
        }
      } else {
        // Idle shimmer when nothing is playing.
        phase += 0.018;
        for (let i = 0; i < barCount; i++) {
          const v =
            0.12 +
            0.08 * Math.sin(phase * 2 + i * 0.4) +
            0.06 * Math.sin(phase * 0.7 + i * 0.15);
          data[i] = Math.max(0.03, v);
        }
      }

      const gap = 3;
      const barW = (width - gap * (barCount - 1)) / barCount;
      const mid = height / 2;

      for (let i = 0; i < barCount; i++) {
        const v = data[i];
        const h = Math.max(2, v * (height * 0.46));
        const x = i * (barW + gap);

        const grad = ctx.createLinearGradient(0, mid - h, 0, mid + h);
        grad.addColorStop(0, "#f0abfc");
        grad.addColorStop(0.5, "#a78bfa");
        grad.addColorStop(1, "#38bdf8");
        ctx.fillStyle = grad;

        const r = Math.min(barW / 2, 3);
        roundRect(ctx, x, mid - h, barW, h * 2, r);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [getAnalyser, active]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
