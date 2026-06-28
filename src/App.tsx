import { useMemo, useState } from "react";
import { useLofi } from "./hooks/useLofi";
import { DEFAULT_PARAMS, PRESET_CATEGORIES, ALL_PRESETS, type LofiParams } from "./audio/presets";
import { AMBIENT_LABELS, type AmbientLayer } from "./audio/ambient";
import Visualizer from "./components/Visualizer";
import Knob from "./components/Knob";
import Dropzone from "./components/Dropzone";
import StationPicker from "./components/StationPicker";
import LiveCache from "./components/LiveCache";
import { cn } from "./utils/cn";

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function youtubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export default function App() {
  const lofi = useLofi();
  const [urlInput, setUrlInput] = useState("");
  const [ytId, setYtId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"file" | "radio">("file");
  const [activeStreamUrl, setActiveStreamUrl] = useState<string | undefined>();

  const loaded = lofi.duration > 0 || lofi.isLive;
  const seekPct = loaded && !lofi.isLive ? (lofi.position / (lofi.duration || 1)) * 100 : 0;

  const pickStation = (url: string, name: string) => {
    setActiveStreamUrl(url);
    setYtId(null);
    lofi.loadStream(url, name).catch(() => {});
  };

  const activePreset = useMemo(() => {
    return ALL_PRESETS.find((p) => {
      const merged = { ...DEFAULT_PARAMS, ...p.params };
      return (Object.keys(merged) as (keyof LofiParams)[]).every(
        (k) => merged[k] === lofi.params[k],
      );
    });
  }, [lofi.params]);

  const applyPreset = (preset: (typeof ALL_PRESETS)[number]) => {
    lofi.update({ ...DEFAULT_PARAMS, ...preset.params });
  };

  const handleLoadUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    if (sourceMode === "radio") {
      // Treat as a live radio stream (e.g. https://…/stream, /listen, .mp3).
      const name = v.split("/").pop()?.split("?")[0] || "Live radio";
      setActiveStreamUrl(v);
      setYtId(null);
      lofi.loadStream(v, name || "Live radio").catch(() => {});
      return;
    }
    const id = youtubeId(v);
    if (id) {
      // YouTube audio can't be extracted client-side (CORS), so we just show
      // a preview embed instead of attempting a fetch that's doomed to fail.
      setYtId(id);
      return;
    }
    setYtId(null);
    setActiveStreamUrl(undefined);
    lofi.loadUrl(v).catch(() => {});
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c0a16] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/25 blur-[120px]" />
        <div className="absolute -right-24 top-20 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-sky-500/15 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-fuchsia-900/40">
              <CassetteIcon className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                LoFi Converter
              </h1>
              <p className="text-sm text-violet-200/60">
                slowed · reverb · surround — runs 100% in your browser
              </p>
            </div>
          </div>
          <a
            href="https://github.com/samarthshrivas/LoFi-Converter-GUI"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-white/[0.08]"
          >
            <GithubIcon className="h-4 w-4" />
            View on GitHub
          </a>
        </header>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Player */}
          <section className="lg:col-span-7">
            <Panel className="flex h-full flex-col">
              <div className="relative mb-4 h-40 overflow-hidden rounded-xl bg-black/30 sm:h-48">
                <Visualizer getAnalyser={lofi.getAnalyser} active={lofi.isPlaying} />
                {!loaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="text-sm text-violet-200/50">
                      Load a track to start mixing
                    </p>
                  </div>
                )}
              </div>

              {/* Seek bar / live indicator */}
              {lofi.isLive ? (
                <div
                  className={cn(
                    "mb-4 flex items-center gap-2 rounded-xl border px-3 py-2.5",
                    lofi.rewindPlaying
                      ? "border-cyan-400/40 bg-cyan-500/10"
                      : "border-rose-400/30 bg-rose-500/10",
                  )}
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span
                      className={cn(
                        "absolute inline-flex h-full w-full animate-ping rounded-full",
                        lofi.rewindPlaying ? "bg-cyan-400/70" : "bg-rose-400/70",
                      )}
                    />
                    <span
                      className={cn(
                        "relative inline-flex h-2.5 w-2.5 rounded-full",
                        lofi.rewindPlaying ? "bg-cyan-500" : "bg-rose-500",
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tracking-wide",
                      lofi.rewindPlaying ? "text-cyan-200" : "text-rose-200",
                    )}
                  >
                    {lofi.rewindPlaying ? "REPLAY" : "LIVE"}
                  </span>
                  <span
                    className={cn(
                      "ml-auto font-mono text-xs",
                      lofi.rewindPlaying ? "text-cyan-200/60" : "text-rose-200/60",
                    )}
                  >
                    {formatTime(lofi.position)} ·
                    {lofi.rewindPlaying ? " replaying cache" : " streaming"}
                  </span>
                </div>
              ) : (
                <div className="mb-4">
                  <input
                    type="range"
                    min={0}
                    max={lofi.duration || 0}
                    step={0.05}
                    value={lofi.position}
                    disabled={!loaded}
                    onChange={(e) => lofi.seek(parseFloat(e.target.value))}
                    className="lofi-range w-full"
                    style={{ "--pct": `${seekPct}%` } as React.CSSProperties}
                  />
                  <div className="mt-1 flex justify-between font-mono text-xs text-violet-200/60">
                    <span>{formatTime(lofi.position)}</span>
                    <span>{formatTime(lofi.duration)}</span>
                  </div>
                </div>
              )}

              {/* Transport */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => lofi.toggle()}
                  disabled={!loaded}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-40",
                    "bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-fuchsia-900/40 hover:brightness-110",
                  )}
                >
                  {lofi.isPlaying ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6 translate-x-0.5" />}
                </button>
                <button
                  onClick={() => lofi.stop()}
                  disabled={!loaded}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-violet-100 transition hover:bg-white/[0.08] disabled:opacity-40"
                >
                  <StopIcon className="h-4 w-4" />
                </button>

                {!lofi.isLive && (
                  <ToggleButton active={lofi.loop} onClick={() => lofi.setLoop(!lofi.loop)} disabled={!loaded}>
                    <RepeatIcon className="h-4 w-4" /> Loop
                  </ToggleButton>
                )}
                <ToggleButton
                  active={lofi.params.bypass}
                  onClick={() => lofi.update({ bypass: !lofi.params.bypass })}
                  disabled={!loaded}
                >
                  A/B
                </ToggleButton>

                <div className="ml-auto">
                  {lofi.isLive ? (
                    <button
                      onClick={() => lofi.recordToggle()}
                      disabled={!loaded}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40",
                        lofi.recording
                          ? "animate-pulse bg-gradient-to-r from-rose-500 to-red-600 shadow-rose-900/40"
                          : "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-900/30",
                      )}
                    >
                      <RecordIcon className="h-4 w-4" />
                      {lofi.recording ? "Stop & Save" : "Record"}
                    </button>
                  ) : (
                    <button
                      onClick={() => lofi.exportWav()}
                      disabled={!loaded || lofi.exporting}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:brightness-110 disabled:opacity-40"
                    >
                      {lofi.exporting ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
                      {lofi.exporting ? "Rendering…" : "Export WAV"}
                    </button>
                  )}
                </div>
              </div>

              {lofi.fileName && (
                <p className="mt-4 flex items-center gap-2 truncate text-sm text-violet-200/50">
                  {lofi.isLive ? "📻" : "🎵"}
                  <span className="truncate">{lofi.fileName}</span>
                  {lofi.isLive && (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">
                      Live
                    </span>
                  )}
                </p>
              )}
            </Panel>
          </section>

          {/* Source */}
          <section className="lg:col-span-5">
            <Panel className="flex h-full flex-col">
              <div className="mb-4 flex items-center justify-between">
                <PanelTitle className="mb-0">Source</PanelTitle>
                {/* Mode switch */}
                <div className="flex rounded-lg bg-black/30 p-0.5 text-xs">
                  <button
                    onClick={() => setSourceMode("file")}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-medium transition",
                      sourceMode === "file"
                        ? "bg-white/10 text-white"
                        : "text-violet-200/50 hover:text-violet-200",
                    )}
                  >
                    🎵 File / Link
                  </button>
                  <button
                    onClick={() => setSourceMode("radio")}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-medium transition",
                      sourceMode === "radio"
                        ? "bg-white/10 text-white"
                        : "text-violet-200/50 hover:text-violet-200",
                    )}
                  >
                    📻 Live Radio
                  </button>
                </div>
              </div>

              {sourceMode === "file" ? (
                <>
                  <Dropzone onFile={lofi.loadFile} loading={lofi.loading} />

                  <div className="my-4 flex items-center gap-3 text-xs text-violet-200/40">
                    <span className="h-px flex-1 bg-white/10" /> or paste a link <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLoadUrl()}
                      placeholder="https://… audio file URL"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-violet-200/30 focus:border-violet-400/60 focus:outline-none"
                    />
                    <button
                      onClick={handleLoadUrl}
                      disabled={lofi.loading}
                      className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium transition hover:bg-white/15 disabled:opacity-40"
                    >
                      Load
                    </button>
                  </div>

                  {ytId && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                      <div className="aspect-video w-full">
                        <iframe
                          className="h-full w-full"
                          src={`https://www.youtube.com/embed/${ytId}`}
                          title="YouTube source preview"
                          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                      <p className="bg-amber-500/10 px-3 py-2 text-xs text-amber-200/80">
                        Browsers block direct YouTube audio extraction, so this is a
                        preview. Download the song as a file and drop it above to
                        fully LoFi-process it.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <StationPicker onPick={pickStation} activeUrl={activeStreamUrl} />

                  <div className="my-4 flex items-center gap-3 text-xs text-violet-200/40">
                    <span className="h-px flex-1 bg-white/10" /> or paste a stream URL <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLoadUrl()}
                      placeholder="https://…/stream.mp3 (must be HTTPS)"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-violet-200/30 focus:border-violet-400/60 focus:outline-none"
                    />
                    <button
                      onClick={handleLoadUrl}
                      disabled={lofi.loading}
                      className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium transition hover:bg-white/15 disabled:opacity-40"
                    >
                      Tune
                    </button>
                  </div>

                  <p className="mt-3 rounded-lg border border-sky-400/20 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-200/70">
                    Live radio streams through the same FX chain. Pick a station
                    above, then press play. The cache keeps the last 60 seconds
                    so you can rewind or save anything you just heard.
                  </p>

                  {/* 1-minute timeshift cache */}
                  {lofi.isLive && (
                    <LiveCache
                      cacheSeconds={lofi.cacheSeconds}
                      rewindPlaying={lofi.rewindPlaying}
                      rewindRemaining={lofi.rewindRemaining}
                      available={lofi.cacheAvailable}
                      onRewind={lofi.rewind}
                      onBackToLive={lofi.backToLive}
                      onSave={lofi.saveCache}
                    />
                  )}
                </>
              )}

              {lofi.error && (
                <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {lofi.error}
                </p>
              )}
            </Panel>
          </section>

          {/* Presets */}
          <section className="lg:col-span-12">
            <Panel>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <PanelTitle className="mb-0">Presets</PanelTitle>
                <button
                  onClick={() => applyPreset(ALL_PRESETS[ALL_PRESETS.length - 1])}
                  className="text-xs font-medium text-violet-200/60 underline-offset-2 hover:text-white hover:underline"
                >
                  ✨ Original (FX off)
                </button>
              </div>

              <div className="space-y-5">
                {PRESET_CATEGORIES.map((cat) => (
                  <div key={cat.id}>
                    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300/40">
                      {cat.title}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {cat.presets.map((p) => {
                        const isActive = activePreset?.name === p.name;
                        return (
                          <button
                            key={p.name}
                            onClick={() => applyPreset(p)}
                            className={cn(
                              "group flex items-start gap-3 rounded-xl border p-3 text-left transition",
                              isActive
                                ? "border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/30"
                                : "border-white/10 bg-white/[0.02] hover:border-violet-400/40 hover:bg-violet-500/[0.06]",
                            )}
                          >
                            <span className="text-2xl leading-none">{p.emoji}</span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold leading-tight text-white">{p.name}</span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-violet-200/50">{p.desc}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          {/* FX knobs */}
          <section className="lg:col-span-12">
            <Panel>
              <div className="mb-5 flex items-center justify-between">
                <PanelTitle className="mb-0">Effects</PanelTitle>
                <button
                  onClick={() => lofi.update(DEFAULT_PARAMS)}
                  className="text-xs font-medium text-violet-200/60 underline-offset-2 hover:text-white hover:underline"
                >
                  Reset all
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-8">
                <Knob
                  label="Tempo"
                  value={lofi.params.playbackRate}
                  min={0.6}
                  max={1.25}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.playbackRate}
                  accent="#a78bfa"
                  format={(v) => `${v.toFixed(2)}×`}
                  onChange={(v) => lofi.update({ playbackRate: v })}
                />
                <Knob
                  label="Reverb"
                  value={lofi.params.reverbWet}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.reverbWet}
                  accent="#e879f9"
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => lofi.update({ reverbWet: v })}
                />
                <Knob
                  label="Decay"
                  value={lofi.params.reverbDecay}
                  min={0.5}
                  max={6}
                  step={0.1}
                  defaultValue={DEFAULT_PARAMS.reverbDecay}
                  accent="#f0abfc"
                  format={(v) => `${v.toFixed(1)}s`}
                  onChange={(v) => lofi.update({ reverbDecay: v })}
                />
                <Knob
                  label="Tone"
                  value={lofi.params.cutoff}
                  min={400}
                  max={20000}
                  step={100}
                  defaultValue={DEFAULT_PARAMS.cutoff}
                  accent="#38bdf8"
                  format={(v) => `${(v / 1000).toFixed(1)}k`}
                  onChange={(v) => lofi.update({ cutoff: v })}
                />
                <Knob
                  label="Bass"
                  value={lofi.params.bassGain}
                  min={0}
                  max={14}
                  step={0.5}
                  defaultValue={DEFAULT_PARAMS.bassGain}
                  accent="#fbbf24"
                  format={(v) => `${v.toFixed(1)}dB`}
                  onChange={(v) => lofi.update({ bassGain: v })}
                />
                <Knob
                  label="Width"
                  value={lofi.params.width}
                  min={0}
                  max={1.4}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.width}
                  accent="#34d399"
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => lofi.update({ width: v })}
                />
                <Knob
                  label="Crush"
                  value={lofi.params.crush}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.crush}
                  accent="#fb7185"
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => lofi.update({ crush: v })}
                />
                <Knob
                  label="Volume"
                  value={lofi.params.volume}
                  min={0}
                  max={1.5}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.volume}
                  accent="#f472b6"
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => lofi.update({ volume: v })}
                />
                <Knob
                  label="Wobble"
                  value={lofi.params.wobble}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.wobble}
                  accent="#c084fc"
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => lofi.update({ wobble: v })}
                />
              </div>

              {/* Atmosphere / ambience layer */}
              <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/40">
                    Atmosphere
                  </h3>
                  <div className="flex items-center gap-3">
                    <Knob
                      label="Level"
                      value={lofi.params.ambientLevel}
                      min={0}
                      max={1}
                      step={0.01}
                      defaultValue={DEFAULT_PARAMS.ambientLevel}
                      accent="#60a5fa"
                      format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(v) => lofi.update({ ambientLevel: v })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AMBIENT_LABELS.map((opt) => {
                    const isActive = lofi.params.ambient === (opt.id as AmbientLayer);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => lofi.update({ ambient: opt.id as AmbientLayer })}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                          isActive
                            ? "bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/50"
                            : "bg-white/[0.04] text-violet-200/60 hover:bg-white/[0.08]",
                        )}
                      >
                        <span>{opt.emoji}</span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] leading-snug text-violet-200/40">
                  Procedural ambience mixed under your track — vinyl crackle,
                  rain, thunder, tape hiss &amp; more. Generated live, no samples.
                </p>
              </div>

              {!lofi.workletReady && (
                <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/80">
                  Bitcrusher (Crush knob) is unavailable in this browser — all
                  other effects work normally.
                </p>
              )}
            </Panel>
          </section>
        </div>

        <footer className="mt-10 text-center text-xs text-violet-200/40">
          Built with the Web Audio API · No uploads leave your device · Hostable
          on GitHub Pages as a single static file.
        </footer>
      </div>
    </div>
  );
}

/* ---------- Small UI primitives ---------- */

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PanelTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("mb-4 text-xs font-semibold uppercase tracking-widest text-violet-200/50", className)}>
      {children}
    </h2>
  );
}

function ToggleButton({
  children,
  active,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition disabled:opacity-40",
        active
          ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-white"
          : "border-white/10 bg-white/[0.04] text-violet-200/70 hover:bg-white/[0.08]",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Icons ---------- */

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}
function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 1M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}
function RecordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}
function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.74-1.56-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}
function CassetteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="8" cy="11" r="2.2" />
      <circle cx="16" cy="11" r="2.2" />
      <path d="M6 19l2-2.5h8L18 19" />
      <path d="M10 11h4" />
    </svg>
  );
}
