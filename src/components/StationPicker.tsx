import { useCallback, useEffect, useRef, useState } from "react";
import { searchStations, type RadioStation } from "../audio/radio";
import { cn } from "../utils/cn";

const GENRES = [
  { tag: "lofi", label: "Lo-Fi" },
  { tag: "chill", label: "Chill" },
  { tag: "jazz", label: "Jazz" },
  { tag: "synthwave", label: "Synthwave" },
  { tag: "ambient", label: "Ambient" },
  { tag: "electronic", label: "Electronic" },
  { tag: "sleep", label: "Sleep" },
];

interface StationPickerProps {
  onPick: (url: string, name: string) => void;
  activeUrl?: string;
}

export default function StationPicker({ onPick, activeUrl }: StationPickerProps) {
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [activeTag, setActiveTag] = useState<string>("lofi");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const run = useCallback(async (tag: string | null, name: string | null) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const list = await searchStations(
        name ? { name, limit: 30 } : { tag: tag ?? undefined, limit: 40 },
      );
      if (id !== reqId.current) return; // a newer request superseded this one
      setStations(list);
      if (list.length === 0) setError("No HTTPS stations found — try another genre or search.");
    } catch {
      if (id !== reqId.current) return;
      setError("Couldn't reach the radio directory. You can still paste a stream URL below.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Load the default genre on mount.
  useEffect(() => {
    run("lofi", null);
  }, [run]);

  const pickTag = (tag: string) => {
    setActiveTag(tag);
    setQuery("");
    run(tag, null);
  };

  const onSearch = (value: string) => {
    setQuery(value);
    if (value.trim().length >= 2) {
      run(null, value.trim());
    } else if (value.trim().length === 0) {
      run(activeTag, null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Genre chips */}
      <div className="flex flex-wrap gap-1.5">
        {GENRES.map((g) => (
          <button
            key={g.tag}
            onClick={() => pickTag(g.tag)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              activeTag === g.tag && !query
                ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/50"
                : "bg-white/[0.04] text-violet-200/60 hover:bg-white/[0.08]",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={query}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search stations by name…"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-violet-200/30 focus:border-violet-400/60 focus:outline-none"
      />

      {error && <p className="text-xs text-amber-200/80">{error}</p>}

      {/* Station list */}
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1 lofi-scroll">
        {loading && stations.length === 0 && (
          <div className="space-y-2 py-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        )}
        {stations.map((s) => {
          const isActive = activeUrl === s.url;
          return (
            <button
              key={s.uuid}
              onClick={() => onPick(s.url, s.name)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                isActive
                  ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                  : "border-transparent bg-white/[0.02] hover:bg-white/[0.06]",
              )}
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-md bg-white/[0.05] text-xs">
                {s.favicon ? (
                  <img
                    src={s.favicon}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => ((e.currentTarget.style.display = "none"))}
                  />
                ) : (
                  "📻"
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{s.name}</span>
                <span className="block truncate text-[11px] text-violet-200/40">
                  {[s.bitrate ? `${s.bitrate}kbps` : null, s.codec, s.country].filter(Boolean).join(" · ")}
                </span>
              </span>
              {isActive && (
                <span className="flex h-2 w-2 flex-none">
                  <span className="absolute h-2 w-2 animate-ping rounded-full bg-fuchsia-400/70" />
                  <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
