import { useEffect, useRef, useState } from "react";
import { cn } from "../utils/cn";

interface LiveCacheProps {
  cacheSeconds: number;
  rewindPlaying: boolean;
  rewindRemaining: number;
  available: boolean;
  onRewind: (seconds: number) => void;
  onBackToLive: () => void;
  onSave: (seconds: number) => void;
}

const MAX = 60;

function fmt(s: number): string {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * 1-minute timeshift cache control for live radio. Shows how much audio is
 * buffered, lets the user scrub back up to 60s to replay it, jump back to the
 * live edge, or save the cached minute as a WAV.
 */
export default function LiveCache({
  cacheSeconds,
  rewindPlaying,
  rewindRemaining,
  available,
  onRewind,
  onBackToLive,
  onSave,
}: LiveCacheProps) {
  const [seek, setSeek] = useState(15);
  const fillPct = Math.min(100, (cacheSeconds / MAX) * 100);
  const sliderMax = Math.min(MAX, Math.max(1, Math.floor(cacheSeconds)));
  const seekClamped = Math.min(seek, sliderMax);

  // Keep the rewind slider thumb within the buffered range.
  useEffect(() => {
    if (seek > sliderMax) setSeek(sliderMax);
  }, [sliderMax, seek]);

  if (!available) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/80">
        Timeshift cache needs AudioWorklet support, which isn't available in this
        browser. Live radio still plays fine — you just can't rewind it.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.05] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sky-200/70">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
          </span>
          1-Minute Cache
        </h3>
        <span className="font-mono text-xs text-sky-200/60">
          {fmt(cacheSeconds)} / {fmt(MAX)}
        </span>
      </div>

      {/* Fill bar */}
      <div className="relative mb-4 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-[width] duration-500"
          style={{ width: `${fillPct}%` }}
        />
        {cacheSeconds < MAX && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-medium text-sky-100/70">
            buffering…
          </span>
        )}
      </div>

      {/* Rewind slider */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-violet-200/50">
          <span>Rewind</span>
          <span className="font-mono text-sky-200/80">⏪ {seekClamped}s back</span>
        </div>
        <RewindSlider
          value={seekClamped}
          max={sliderMax}
          onChange={setSeek}
          fillPct={(seekClamped / MAX) * 100}
        />
      </div>

      {/* Status while replaying */}
      {rewindPlaying && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
          </span>
          Replaying cached audio · {fmt(rewindRemaining)} left
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onRewind(seekClamped)}
          disabled={cacheSeconds < 1}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:brightness-110 disabled:opacity-40"
        >
          ⏪ Replay {seekClamped}s
        </button>
        <button
          onClick={onBackToLive}
          disabled={!rewindPlaying}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-40",
            rewindPlaying
              ? "border-rose-400/50 bg-rose-500/15 text-rose-100"
              : "border-white/10 bg-white/[0.04] text-violet-200/70",
          )}
        >
          🔴 Back to Live
        </button>
        <button
          onClick={() => onSave(Math.min(MAX, Math.floor(cacheSeconds) || MAX))}
          disabled={cacheSeconds < 1}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-emerald-200/90 transition hover:bg-white/[0.08] disabled:opacity-40"
        >
          💾 Save cached
        </button>
      </div>
    </div>
  );
}

/** Seek slider that visually anchors the live edge at the right. */
function RewindSlider({
  value,
  max,
  onChange,
  fillPct,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  fillPct: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Hide the native thumb; we draw a custom handle.
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/10" />
      <div
        className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-sky-500/40"
        style={{ width: `${pct}%` }}
      />
      <input
        ref={ref}
        type="range"
        min={1}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="lofi-range relative z-10 h-4 w-full cursor-pointer bg-transparent"
        style={{ "--pct": `${fillPct}%` } as React.CSSProperties}
      />
      {/* Position label of the custom handle */}
      <div
        className="pointer-events-none absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300 bg-white shadow"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
