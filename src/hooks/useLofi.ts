import { useCallback, useEffect, useRef, useState } from "react";
import { LofiEngine } from "../audio/engine";
import { DEFAULT_PARAMS, type LofiParams } from "../audio/presets";

export interface UseLofi {
  params: LofiParams;
  isPlaying: boolean;
  position: number;
  duration: number;
  fileName: string;
  loading: boolean;
  exporting: boolean;
  error: string | null;
  ready: boolean;
  workletReady: boolean;
  isLive: boolean;
  loop: boolean;
  setLoop: (v: boolean) => void;
  recording: boolean;
  recordToggle: () => void;
  cacheAvailable: boolean;
  cacheSeconds: number;
  rewindPlaying: boolean;
  rewindRemaining: number;
  rewind: (seconds: number) => void;
  backToLive: () => void;
  saveCache: (seconds?: number) => Promise<void>;
  update: (patch: Partial<LofiParams>) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  seek: (t: number) => void;
  loadFile: (file: File) => Promise<void>;
  loadUrl: (url: string) => Promise<void>;
  loadStream: (url: string, title: string) => Promise<void>;
  exportWav: () => Promise<void>;
  getAnalyser: () => AnalyserNode | null;
}

export function useLofi(): UseLofi {
  const engineRef = useRef<LofiEngine | null>(null);
  if (!engineRef.current) engineRef.current = new LofiEngine();

  const [params, setParams] = useState<LofiParams>({ ...DEFAULT_PARAMS });
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [workletReady, setWorkletReady] = useState(false);
  const [loop, setLoopState] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cacheSeconds, setCacheSeconds] = useState(0);
  const [rewindPlaying, setRewindPlaying] = useState(false);
  const [rewindRemaining, setRewindRemaining] = useState(0);
  const loopRef = useRef(false);

  const rafRef = useRef<number | null>(null);

  const setLoop = useCallback((v: boolean) => {
    loopRef.current = v;
    setLoopState(v);
  }, []);

  // End-of-track / error / ready callbacks (closure-safe via ref).
  useEffect(() => {
    const engine = engineRef.current!;
    engine.onEnded = () => {
      setIsPlaying(false);
      if (loopRef.current) {
        engine.play();
        setIsPlaying(true);
      }
    };
    engine.onError = (msg) => {
      setError(msg);
      setIsPlaying(false);
    };
    engine.onStreamReady = () => {
      setDuration(engine.duration);
    };
    engine.onRewindStart = (secs) => {
      setRewindPlaying(true);
      setRewindRemaining(secs);
    };
    engine.onRewindEnd = () => {
      setRewindPlaying(false);
      setRewindRemaining(0);
    };
  }, []);

  // Poll the ring buffer fill level while a live stream is active.
  useEffect(() => {
    if (!isLive || !workletReady) {
      setCacheSeconds(0);
      return;
    }
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const s = await engineRef.current!.cacheSeconds();
      if (alive) setCacheSeconds(s);
    };
    void tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isLive, workletReady]);

  // Countdown the rewind remaining time smoothly.
  useEffect(() => {
    if (!rewindPlaying) return;
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setRewindRemaining((r) => Math.max(0, r - dt));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [rewindPlaying]);

  // rAF loop to keep the playhead + UI in sync.
  useEffect(() => {
    const tick = () => {
      const engine = engineRef.current!;
      setPosition(engine.getPosition());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  const update = useCallback((patch: Partial<LofiParams>) => {
    engineRef.current!.setParams(patch);
    setParams({ ...engineRef.current!.params });
  }, []);

  const play = useCallback(async () => {
    try {
      await engineRef.current!.init();
      setReady(engineRef.current!.ready);
      setWorkletReady(engineRef.current!.workletReady);
      engineRef.current!.play();
      setDuration(engineRef.current!.duration);
      setIsPlaying(engineRef.current!.isPlaying);
    } catch {
      /* user gesture needed */
    }
  }, []);

  const pause = useCallback(() => {
    engineRef.current!.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(async () => {
    const engine = engineRef.current!;
    if (engine.isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      await play();
    }
  }, [play]);

  const stop = useCallback(() => {
    engineRef.current!.stop();
    setIsPlaying(false);
    setPosition(0);
  }, []);

  const seek = useCallback((t: number) => {
    engineRef.current!.seek(t);
    setPosition(engineRef.current!.getPosition());
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      await engineRef.current!.init();
      setReady(true);
      setWorkletReady(engineRef.current!.workletReady);
      await engineRef.current!.loadFile(file);
      setParams({ ...engineRef.current!.params });
      setDuration(engineRef.current!.duration);
      setFileName(engineRef.current!.fileName);
      setIsLive(false);
      setPosition(0);
      setIsPlaying(false);
    } catch (e) {
      console.error(e);
      setError("Could not decode that file. Try a standard MP3, WAV, M4A or OGG file.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUrl = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      await engineRef.current!.init();
      setReady(true);
      setWorkletReady(engineRef.current!.workletReady);
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const ab = await res.arrayBuffer();
      const name = url.split("/").pop()?.split("?")[0] || "remote-audio";
      await engineRef.current!.loadArrayBuffer(ab, name);
      setParams({ ...engineRef.current!.params });
      setDuration(engineRef.current!.duration);
      setFileName(engineRef.current!.fileName);
      setIsLive(false);
      setPosition(0);
      setIsPlaying(false);
    } catch (e) {
      console.error(e);
      setError(
        "Couldn't load that URL directly (most likely blocked by CORS / YouTube protection). Download the audio and drop the file here instead.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStream = useCallback(async (url: string, title: string) => {
    setLoading(true);
    setError(null);
    try {
      await engineRef.current!.init();
      setReady(true);
      setWorkletReady(engineRef.current!.workletReady);
      await engineRef.current!.loadStream(url, title);
      setParams({ ...engineRef.current!.params });
      setDuration(engineRef.current!.duration);
      setFileName(engineRef.current!.fileName);
      setIsLive(true);
      setPosition(0);
      setIsPlaying(false);
    } catch (e) {
      console.error(e);
      setError(
        "Couldn't open that radio stream. Many servers block browser playback (CORS). Try another station from the picker, or paste a direct stream URL.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const exportWav = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const blob = await engineRef.current!.exportWav();
      const base = engineRef.current!.fileName.replace(/\.[^.]+$/, "") || "lofi";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-lofi.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      console.error(e);
      setError("Export failed. Make sure a track is loaded first.");
    } finally {
      setExporting(false);
    }
  }, []);

  const rewind = useCallback((seconds: number) => {
    void engineRef.current!.rewind(seconds);
  }, []);

  const backToLive = useCallback(() => {
    engineRef.current!.backToLive();
    setIsPlaying(true);
  }, []);

  const saveCache = useCallback(async (seconds = 60) => {
    setExporting(true);
    setError(null);
    try {
      const blob = await engineRef.current!.renderCacheWav(seconds);
      const base = (engineRef.current!.fileName || "lofi-radio")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w-]+/g, "_");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-cache-${seconds}s.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      console.error(e);
      setError("Couldn't export the cache yet — keep the stream playing for a few seconds first.");
    } finally {
      setExporting(false);
    }
  }, []);

  const getAnalyser = useCallback(() => engineRef.current!.getAnalyser(), []);

  const recordToggle = useCallback(async () => {
    const engine = engineRef.current!;
    if (engine.isRecording) {
      const blob = await engine.stopRecording();
      setRecording(false);
      if (blob.size > 0) {
        const base = (engine.fileName || "lofi-radio").replace(/\.[^.]+$/, "");
        const ext = blob.type.includes("webm")
          ? "webm"
          : blob.type.includes("ogg")
            ? "ogg"
            : "m4a";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${base}-lofi.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    } else {
      const ok = engine.startRecording();
      setRecording(ok);
      if (!ok) setError("Recording isn't supported in this browser.");
    }
  }, []);

  return {
    params,
    isPlaying,
    position,
    duration,
    fileName,
    loading,
    exporting,
    error,
    ready,
    workletReady,
    isLive,
    loop,
    setLoop,
    recording,
    recordToggle,
    cacheAvailable: engineRef.current.cacheAvailable,
    cacheSeconds,
    rewindPlaying,
    rewindRemaining,
    rewind,
    backToLive,
    saveCache,
    update,
    play,
    pause,
    toggle,
    stop,
    seek,
    loadFile,
    loadUrl,
    loadStream,
    exportWav,
    getAnalyser,
  };
}
