import { useCallback, useRef, useState } from "react";
import { cn } from "../utils/cn";

interface DropzoneProps {
  onFile: (file: File) => void;
  loading?: boolean;
  compact?: boolean;
}

export default function Dropzone({ onFile, loading, compact }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = Array.from(files).find((f) => f.type.startsWith("audio")) ?? files[0];
      onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "group relative cursor-pointer rounded-2xl border-2 border-dashed transition-all",
        compact ? "p-5" : "p-8",
        dragging
          ? "border-fuchsia-400 bg-fuchsia-500/10"
          : "border-white/15 bg-white/[0.03] hover:border-violet-400/60 hover:bg-violet-500/[0.06]",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 text-3xl transition-transform group-hover:scale-110",
            compact ? "h-12 w-12" : "h-16 w-16",
          )}
        >
          {loading ? <Spinner /> : "🎧"}
        </div>
        <div>
          <p className="font-semibold text-white">
            {loading ? "Decoding audio…" : "Drop an audio file here"}
          </p>
          {!compact && (
            <p className="mt-1 text-sm text-violet-200/60">
              or <span className="text-fuchsia-300 underline-offset-2 group-hover:underline">browse files</span> · MP3, WAV, M4A, OGG, FLAC
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-6 w-6 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
