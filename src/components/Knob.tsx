import { useCallback, useRef } from "react";
import { cn } from "../utils/cn";

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Format the numeric readout. */
  format?: (v: number) => string;
  onChange: (v: number) => void;
  defaultValue?: number;
  accent?: string;
}

/**
 * A rotary knob. Drag vertically to change; double-click to reset.
 */
export default function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = "",
  format,
  onChange,
  defaultValue,
  accent = "#a78bfa",
}: KnobProps) {
  const dragRef = useRef<{ y: number; v: number } | null>(null);

  const norm = (value - min) / (max - min);
  // Map 0..1 to a 270deg sweep (-135deg .. +135deg).
  const angle = -135 + norm * 270;

  const clamp = useCallback(
    (v: number) => {
      const stepped = Math.round(v / step) * step;
      return Math.max(min, Math.min(max, stepped));
    },
    [min, max, step],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, v: value };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = drag.y - e.clientY;
    const range = max - min;
    const next = clamp(drag.v + (dy / 180) * range);
    onChange(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onDouble = () => {
    if (defaultValue !== undefined) onChange(defaultValue);
  };

  const onWheel = (e: React.WheelEvent) => {
    const dir = e.deltaY < 0 ? 1 : -1;
    onChange(clamp(value + dir * step * 5));
  };

  const readout = format ? format(value) : `${value.toFixed(2)}${unit}`;

  return (
    <div className="flex select-none flex-col items-center gap-1.5">
      <div
        className="relative h-14 w-14 cursor-ns-resize touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDouble}
        onWheel={onWheel}
        title="Drag to adjust · Double-click to reset"
      >
        <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow">
          {/* Track */}
          <circle cx="50" cy="50" r="40" fill="#1e1b2e" stroke="#312e45" strokeWidth="6" />
          {/* Value arc */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={accent}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${norm * 188.4} 251`}
            transform="rotate(135 50 50)"
          />
          {/* Knob body */}
          <g transform={`rotate(${angle} 50 50)`}>
            <circle cx="50" cy="50" r="30" fill="#2a2640" stroke="#423a63" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="30" fill="url(#sheen)" />
            <line x1="50" y1="50" x2="50" y2="28" stroke={accent} strokeWidth="4" strokeLinecap="round" />
          </g>
          <defs>
            <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="text-center leading-tight">
        <div className="text-[11px] font-medium text-violet-200/70">{label}</div>
        <div className={cn("font-mono text-xs tabular-nums text-white")}>{readout}</div>
      </div>
    </div>
  );
}
