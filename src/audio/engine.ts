import { ensureWorklet } from "./worklet";
import { makeImpulse } from "./impulse";
import { AMBIENT_SPECS, makeNoiseBuffer, type AmbientLayer } from "./ambient";
import { DEFAULT_PARAMS, type LofiParams } from "./presets";

/** All the persistent FX nodes for one context. */
interface FxGraph {
  crushNode: AudioNode;
  lowpass: BiquadFilterNode;
  bass: BiquadFilterNode;
  wSplitter: ChannelSplitterNode;
  wMerger: ChannelMergerNode;
  gLa: GainNode;
  gRb: GainNode;
  gLb: GainNode;
  gRa: GainNode;
  convolver: ConvolverNode;
  dryGain: GainNode;
  wetGain: GainNode;
  mixBus: GainNode;
  fxGain: GainNode;
  directGain: GainNode;
  master: GainNode;
  analyser: AnalyserNode | null;
  /** Tap used by MediaRecorder to capture the processed output in real time. */
  recordDest: MediaStreamAudioDestinationNode | null;
  ir: AudioBuffer | null;
  lastDecay: number;
  isWorklet: boolean;
  // VHS wobble LFO (connects to a buffer source's playbackRate).
  wobbleLfo: OscillatorNode;
  wobbleDepth: GainNode;
  // Ambient noise sub-chain (independent generator mixed into master).
  ambientFilter: BiquadFilterNode;
  ambientMod: GainNode;
  ambientLevel: GainNode;
  ambientGate: GainNode;
  ambientLfo: OscillatorNode;
  ambientModDepth: GainNode;
  ambientSrc: AudioBufferSourceNode | null;
  currentAmbient: AmbientLayer;
  /** 1-minute timeshift ring buffer tapped from the master bus (live mode). */
  ringBuffer: AudioWorkletNode | null;
}

/** Maps the 0..1 "crush" control to bit depth and downsample frequency. */
function crushToParams(crush: number) {
  const c = Math.max(0, Math.min(1, crush));
  return {
    bits: Math.round(16 - c * 12), // 16 (clean) -> 4 (crushed)
    normFreq: 1 - c * 0.85, // 1 (no hold) -> 0.15 (heavy)
  };
}

/** Picks the best supported MediaRecorder audio mime type. */
function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* noop */
    }
  }
  return "";
}

/** Builds the FX chain (shared by live + offline contexts). */
function createFxGraph(ctx: BaseAudioContext, workletOk: boolean, withAnalyser: boolean): FxGraph {
  let crushNode: AudioNode;
  let isWorklet = false;
  if (workletOk) {
    const node = new AudioWorkletNode(ctx, "bitcrusher-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    const p = crushToParams(DEFAULT_PARAMS.crush);
    (node.parameters.get("bits") as AudioParam).value = p.bits;
    (node.parameters.get("normFreq") as AudioParam).value = p.normFreq;
    crushNode = node;
    isWorklet = true;
  } else {
    // Fallback passthrough if the worklet fails to load.
    crushNode = ctx.createGain();
  }

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = DEFAULT_PARAMS.cutoff;
  lowpass.Q.value = 0.7;

  const bass = ctx.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 220;
  bass.gain.value = DEFAULT_PARAMS.bassGain;

  // Stereo widener (mid/side via a 4-gain matrix).
  const wSplitter = ctx.createChannelSplitter(2);
  const wMerger = ctx.createChannelMerger(2);
  const gLa = ctx.createGain();
  const gRb = ctx.createGain();
  const gLb = ctx.createGain();
  const gRa = ctx.createGain();

  // outL = L*a + R*b  ->  merger input 0
  wSplitter.connect(gLa, 0).connect(wMerger, 0, 0);
  wSplitter.connect(gRb, 1).connect(wMerger, 0, 0);
  // outR = L*b + R*a  ->  merger input 1
  wSplitter.connect(gLb, 0).connect(wMerger, 0, 1);
  wSplitter.connect(gRa, 1).connect(wMerger, 0, 1);

  // Reverb (convolver) blended with dry signal.
  const convolver = ctx.createConvolver();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const mixBus = ctx.createGain();

  // FX on/off vs dry bypass path.
  const fxGain = ctx.createGain();
  const directGain = ctx.createGain();

  const master = ctx.createGain();
  const analyser = withAnalyser ? ctx.createAnalyser() : null;
  if (analyser) {
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
  }
  // Recording tap (only meaningful for the live context).
  const recordDest = withAnalyser
    ? (ctx as AudioContext).createMediaStreamDestination()
    : null;

  // VHS wobble: an LFO whose depth (scaled by the "wobble" param) gets added to
  // a buffer source's playbackRate in startSource().
  const wobbleLfo = ctx.createOscillator();
  wobbleLfo.type = "sine";
  wobbleLfo.frequency.value = 5.2;
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = 0;
  wobbleLfo.connect(wobbleDepth);
  wobbleLfo.start();

  // Ambient noise sub-chain (independent generator). The source/buffer is built
  // lazily when a layer is selected; these shaping nodes persist.
  const ambientFilter = ctx.createBiquadFilter();
  ambientFilter.type = "lowpass";
  ambientFilter.frequency.value = 8000;
  ambientFilter.Q.value = 0.5;
  const ambientMod = ctx.createGain(); // slow tremolo on the bed
  ambientMod.gain.value = 1;
  const ambientLevel = ctx.createGain();
  ambientLevel.gain.value = 0;
  const ambientGate = ctx.createGain(); // opens only while playing
  ambientGate.gain.value = 0;
  ambientFilter.connect(ambientMod).connect(ambientLevel).connect(ambientGate);
  const ambientLfo = ctx.createOscillator();
  ambientLfo.type = "sine";
  ambientLfo.frequency.value = 0.2;
  const ambientModDepth = ctx.createGain();
  ambientModDepth.gain.value = 0;
  ambientLfo.connect(ambientModDepth).connect(ambientMod.gain);
  ambientLfo.start();
  // Ambient bed joins the master bus (gated by play state).
  ambientGate.connect(master);

  // Wire the chain.
  crushNode.connect(lowpass);
  lowpass.connect(bass);
  bass.connect(wSplitter);

  wMerger.connect(dryGain).connect(mixBus);
  wMerger.connect(convolver).connect(wetGain).connect(mixBus);

  mixBus.connect(fxGain).connect(master);

  // Direct (unprocessed) tap is wired per-source.
  directGain.connect(master);

  if (analyser) {
    master.connect(analyser).connect(ctx.destination);
  } else {
    master.connect(ctx.destination);
  }
  // Silent tap feeding MediaRecorder (no audible output of its own).
  if (recordDest) {
    master.connect(recordDest);
  }
  // 1-minute timeshift ring buffer (live graph only, needs the worklet).
  let ringBuffer: AudioWorkletNode | null = null;
  if (workletOk && withAnalyser) {
    ringBuffer = new AudioWorkletNode(ctx, "ring-buffer-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { duration: 60 },
    });
    master.connect(ringBuffer);
  }

  return {
    crushNode,
    lowpass,
    bass,
    wSplitter,
    wMerger,
    gLa,
    gRb,
    gLb,
    gRa,
    convolver,
    dryGain,
    wetGain,
    mixBus,
    fxGain,
    directGain,
    master,
    analyser,
    recordDest,
    ir: null,
    lastDecay: -1,
    isWorklet,
    wobbleLfo,
    wobbleDepth,
    ambientFilter,
    ambientMod,
    ambientLevel,
    ambientGate,
    ambientLfo,
    ambientModDepth,
    ambientSrc: null,
    currentAmbient: "none",
    ringBuffer,
  };
}

/** Rebuilds the ambient noise source when the layer changes. */
function applyAmbientLayer(g: FxGraph, ctx: BaseAudioContext, layer: AmbientLayer) {
  if (layer === g.currentAmbient) return;
  // Tear down the previous source.
  if (g.ambientSrc) {
    try {
      g.ambientSrc.stop();
    } catch {
      /* noop */
    }
    try {
      g.ambientSrc.disconnect();
    } catch {
      /* noop */
    }
    g.ambientSrc = null;
  }
  g.currentAmbient = layer;
  if (layer === "none") return;

  const spec = AMBIENT_SPECS[layer];
  g.ambientFilter.type = spec.filter;
  g.ambientFilter.frequency.value = spec.freq;
  g.ambientFilter.Q.value = spec.q;
  g.ambientModDepth.gain.value = spec.tremolo * 0.5;

  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, layer);
  src.loop = true;
  src.connect(g.ambientFilter);
  src.start();
  g.ambientSrc = src;
}

/** Pushes param values onto a graph. */
function applyGraphParams(g: FxGraph, ctx: BaseAudioContext, params: LofiParams) {
  g.lowpass.frequency.value = params.cutoff;
  g.bass.gain.value = params.bassGain;

  const a = 0.5 + 0.5 * params.width;
  const b = 0.5 - 0.5 * params.width;
  g.gLa.gain.value = a;
  g.gRa.gain.value = a;
  g.gLb.gain.value = b;
  g.gRb.gain.value = b;

  g.dryGain.gain.value = 1;
  g.wetGain.gain.value = params.reverbWet;

  if (Math.abs(g.lastDecay - params.reverbDecay) > 0.01 || !g.ir) {
    g.ir = makeImpulse(ctx, params.reverbDecay + 0.4, 3);
    g.convolver.buffer = g.ir;
    g.lastDecay = params.reverbDecay;
  }

  if (g.isWorklet) {
    const node = g.crushNode as AudioWorkletNode;
    const cp = crushToParams(params.crush);
    (node.parameters.get("bits") as AudioParam).value = cp.bits;
    (node.parameters.get("normFreq") as AudioParam).value = cp.normFreq;
  }

  g.master.gain.value = params.volume;
  g.fxGain.gain.value = params.bypass ? 0 : 1;
  g.directGain.gain.value = params.bypass ? 1 : 0;

  // VHS wobble depth (added to a buffer source's playbackRate).
  g.wobbleDepth.gain.value = params.wobble * 0.05;

  // Ambient bed: switch layer + set level.
  applyAmbientLayer(g, ctx, params.ambient);
  const spec = params.ambient === "none" ? null : AMBIENT_SPECS[params.ambient];
  g.ambientLevel.gain.value = spec ? params.ambientLevel * spec.level : 0;
}

export class LofiEngine {
  ctx: AudioContext | null = null;
  buffer: AudioBuffer | null = null;
  fileName = "";
  ready = false;
  workletReady = false;
  /** True when the loaded source is a live radio stream (infinite). */
  isStream = false;
  streamTitle = "";
  /** Whether the 1-minute timeshift cache is actively capturing. */
  cacheEnabled = false;
  /** True while a cached segment is being replayed (rewind). */
  rewindPlaying = false;

  private graph: FxGraph | null = null;
  private source: AudioBufferSourceNode | null = null;
  private inSplitter: ChannelSplitterNode | null = null;
  private inMerger: ChannelMergerNode | null = null;

  // Stream-mode nodes.
  private audioEl: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;

  // Real-time recorder (used for capturing streams).
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private recording = false;

  // Rewind (cache replay) playback source.
  private rewindSrc: AudioBufferSourceNode | null = null;
  // Port message router for ring-buffer requests.
  private portResolvers: Record<string, ((data: unknown) => void) | null> = {};
  private portWired = false;

  params: LofiParams = { ...DEFAULT_PARAMS };
  private startedAt = 0;
  private offset = 0;
  private playing = false;
  private manualStop = false;

  onEnded?: () => void;
  onError?: (message: string) => void;
  onStreamReady?: () => void;
  onRewindStart?: (seconds: number) => void;
  onRewindEnd?: () => void;

  async init(): Promise<void> {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    let workletOk = false;
    try {
      await ensureWorklet(this.ctx);
      workletOk = true;
      this.workletReady = true;
    } catch (e) {
      console.warn("AudioWorklet unavailable — bitcrusher disabled.", e);
    }
    this.graph = createFxGraph(this.ctx, workletOk, true);
    this.ready = true;
    applyGraphParams(this.graph, this.ctx, this.params);
  }

  get duration(): number {
    if (this.isStream) return this.audioEl?.duration ?? Infinity;
    return this.buffer?.duration ?? 0;
  }

  /** True for live radio (no fixed length / seeking). */
  get isLive(): boolean {
    return this.isStream;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  getPosition(): number {
    if (this.isStream) {
      const t = this.audioEl?.currentTime ?? 0;
      return isFinite(t) ? t : 0;
    }
    if (!this.ctx || !this.buffer) return 0;
    if (!this.playing) return this.offset;
    const elapsed = (this.ctx.currentTime - this.startedAt) * this.params.playbackRate;
    return Math.min(this.buffer.duration, this.offset + elapsed);
  }

  getAnalyser(): AnalyserNode | null {
    return this.graph?.analyser ?? null;
  }

  async loadArrayBuffer(data: ArrayBuffer, name: string): Promise<void> {
    await this.init();
    const decoded = await this.ctx!.decodeAudioData(data);
    this.stop();
    this.clearStream();
    this.isStream = false;
    this.buffer = decoded;
    this.fileName = name;
    this.streamTitle = "";
    this.offset = 0;
  }

  /**
   * Loads a live radio stream. Radio is infinite, so it is played through an
   * <audio> element wired into the FX graph via a MediaElementSourceNode.
   * Requires the stream server to send CORS headers (otherwise the browser
   * refuses to let Web Audio touch the audio).
   */
  async loadStream(url: string, title: string): Promise<void> {
    await this.init();
    this.stopSource();
    this.clearStream();
    this.isStream = true;
    this.buffer = null;
    this.fileName = title;
    this.streamTitle = title;

    const ctx = this.ctx!;
    const audioEl = new Audio();
    audioEl.crossOrigin = "anonymous"; // must be set before src
    audioEl.preload = "auto";
    // Slowing a media element normally keeps pitch; we WANT it to drop (lofi).
    this.applyMediaPitch(audioEl);
    audioEl.playbackRate = this.params.playbackRate;
    audioEl.src = url;

    // MediaElementSource can only be created once per element.
    const mediaSource = ctx.createMediaElementSource(audioEl);
    this.connectInput(mediaSource, 2);

    this.audioEl = audioEl;
    this.mediaSource = mediaSource;

    // Surface load / connection problems (very often CORS on live streams).
    audioEl.addEventListener("error", () => {
      const code = audioEl.error?.code;
      const msg =
        code === 2 || code === 3 || code === 4
          ? "Couldn't open that stream. Many radio servers block browser playback (CORS) — try a station from the picker, or paste its direct stream URL."
          : "Stream error. The station may be offline or unsupported in the browser.";
      this.playing = false;
      this.setAmbientGate(false);
      this.enableCache(false);
      this.onError?.(msg);
    });
    audioEl.addEventListener("canplay", () => this.onStreamReady?.());
    // Prepare an idle (empty) ring buffer; capture begins when playback starts.
    this.clearCache();
    this.enableCache(false);
  }

  // ---------------- 1-minute timeshift cache ----------------

  /** Enables/disables ring-buffer capture without clearing what's stored. */
  enableCache(enabled: boolean) {
    const node = this.graph?.ringBuffer;
    this.cacheEnabled = enabled;
    if (node) node.port.postMessage({ type: enabled ? "start" : "stop" });
    this.wirePort();
  }

  /** Resets the ring buffer (loses any cached audio). */
  clearCache() {
    const node = this.graph?.ringBuffer;
    if (node) node.port.postMessage({ type: "clear" });
  }

  get cacheAvailable(): boolean {
    return !!this.graph?.ringBuffer;
  }

  private wirePort() {
    const node = this.graph?.ringBuffer;
    if (!node || this.portWired) return;
    this.portWired = true;
    node.port.addEventListener("message", (e: MessageEvent) => {
      const type = (e.data as { type?: string })?.type;
      if (!type) return;
      const resolver = this.portResolvers[type];
      if (resolver) {
        this.portResolvers[type] = null;
        resolver(e.data);
      }
    });
  }

  private postRequest<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
    const node = this.graph?.ringBuffer;
    if (!node) return Promise.reject(new Error("cache unavailable"));
    return new Promise<T>((resolve) => {
      this.portResolvers[type] = resolve as (data: unknown) => void;
      node.port.postMessage({ type, ...payload });
    });
  }

  /** How many seconds of audio are currently cached (0..60). */
  async cacheSeconds(): Promise<number> {
    if (!this.cacheAvailable) return 0;
    try {
      const r = await this.postRequest<{ seconds: number }>("status");
      return r.seconds;
    } catch {
      return 0;
    }
  }

  private async snapshot(seconds: number): Promise<AudioBuffer | null> {
    if (!this.ctx || !this.cacheAvailable) return null;
    const r = await this.postRequest<{
      channels: Float32Array[];
      sampleRate: number;
    }>("snapshot", { seconds });
    const ch = r.channels;
    if (!ch || ch.length < 1 || ch[0].length === 0) return null;
    const buf = this.ctx.createBuffer(2, ch[0].length, r.sampleRate);
    buf.getChannelData(0).set(ch[0]);
    buf.getChannelData(1).set(ch[1] ?? ch[0]);
    return buf;
  }

  /** Replays the last `secondsBack` of cached audio (pauses live stream). */
  async rewind(secondsBack: number): Promise<void> {
    if (!this.isStream || !this.ctx || !this.cacheAvailable) return;
    this.cancelRewind();
    const buf = await this.snapshot(secondsBack);
    if (!buf) return;
    // Pause the live stream so it doesn't overlap the replay.
    if (this.audioEl && !this.audioEl.paused) this.audioEl.pause();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // Route straight to analyser → destination so it is NOT re-captured.
    src.connect(this.graph!.analyser!);
    src.onended = () => {
      this.rewindSrc = null;
      this.rewindPlaying = false;
      this.onRewindEnd?.();
    };
    src.start();
    this.rewindSrc = src;
    this.rewindPlaying = true;
    this.onRewindStart?.(buf.duration);
  }

  /** Stops any replay and resumes the live stream at its current position. */
  backToLive(): void {
    this.cancelRewind();
    if (this.isStream && this.audioEl) {
      this.ctx?.resume();
      this.audioEl.play().catch((e) => console.warn(e));
      this.playing = true;
      this.enableCache(true);
    }
  }

  cancelRewind(): void {
    if (this.rewindSrc) {
      try {
        this.rewindSrc.stop();
      } catch {
        /* noop */
      }
      try {
        this.rewindSrc.disconnect();
      } catch {
        /* noop */
      }
      this.rewindSrc = null;
    }
    this.rewindPlaying = false;
  }

  /** Renders the last `seconds` of cache to a WAV blob. */
  async renderCacheWav(seconds = 60): Promise<Blob> {
    const buf = await this.snapshot(seconds);
    if (!buf) throw new Error("Nothing cached yet.");
    const { audioBufferToWav } = await import("./wav");
    return audioBufferToWav(buf);
  }

  async loadFile(file: File): Promise<void> {
    const buf = await file.arrayBuffer();
    await this.loadArrayBuffer(buf, file.name);
  }

  /** Connects any source node into the stereo FX input. */
  private connectInput(source: AudioNode, channels: number) {
    const ctx = this.ctx!;
    const inSplitter = ctx.createChannelSplitter(channels);
    const inMerger = ctx.createChannelMerger(2);

    source.connect(inSplitter);
    inSplitter.connect(inMerger, 0, 0);
    if (channels >= 2) {
      inSplitter.connect(inMerger, 1, 1);
    } else {
      inSplitter.connect(inMerger, 0, 1); // mono -> dual mono
    }

    const graph = this.graph!;
    inMerger.connect(graph.crushNode);
    inMerger.connect(graph.directGain);

    this.inSplitter = inSplitter;
    this.inMerger = inMerger;
  }

  /** Ensures a media element changes pitch (not just speed) when slowed. */
  private applyMediaPitch(el: HTMLAudioElement) {
    el.preservesPitch = false;
    (el as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = false;
    (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;
  }

  /** Tears down the stream (audio element + media source) if active. */
  private clearStream() {
    this.cancelRewind();
    this.enableCache(false);
    if (this.audioEl) {
      try {
        this.audioEl.pause();
      } catch {
        /* noop */
      }
      this.audioEl.removeAttribute("src");
      try {
        this.audioEl.load();
      } catch {
        /* noop */
      }
      this.audioEl = null;
    }
    if (this.mediaSource) {
      try {
        this.mediaSource.disconnect();
      } catch {
        /* noop */
      }
      this.mediaSource = null;
    }
    this.disconnectInput();
  }

  /** Disconnects the shared stereo input splitter/merger. */
  private disconnectInput() {
    if (this.inSplitter) {
      try {
        this.inSplitter.disconnect();
      } catch {
        /* noop */
      }
      this.inSplitter = null;
    }
    if (this.inMerger) {
      try {
        this.inMerger.disconnect();
      } catch {
        /* noop */
      }
      this.inMerger = null;
    }
  }

  private startSource() {
    if (!this.ctx || !this.buffer || !this.graph) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.params.playbackRate;
    source.onended = () => {
      if (this.manualStop) {
        this.manualStop = false;
        return;
      }
      this.playing = false;
      this.source = null;
      this.offset = 0;
      this.onEnded?.();
    };
    this.connectInput(source, this.buffer.numberOfChannels);
    // Drive the VHS wobble from the LFO (adds ±depth to playbackRate).
    try {
      this.graph.wobbleDepth.connect(source.playbackRate);
    } catch {
      /* noop */
    }
    source.start(0, this.offset);
    this.source = source;
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  private stopSource() {
    if (this.source) {
      this.manualStop = true;
      // Drop the wobble LFO's connection to this (now dead) source.
      if (this.graph) {
        try {
          this.graph.wobbleDepth.disconnect();
        } catch {
          /* noop */
        }
      }
      try {
        this.source.stop();
      } catch {
        /* already stopped */
      }
      try {
        this.source.disconnect();
      } catch {
        /* noop */
      }
      this.source = null;
    }
    this.disconnectInput();
  }

  private setAmbientGate(open: boolean) {
    if (this.graph) this.graph.ambientGate.gain.value = open ? 1 : 0;
  }

  play(): void {
    if (!this.ctx) return;
    if (this.isStream) {
      if (this.rewindPlaying) {
        // Stop the replay and resume live playback.
        this.cancelRewind();
      }
      if (this.playing || !this.audioEl) return;
      this.ctx.resume();
      this.playing = true;
      this.setAmbientGate(true);
      this.enableCache(true);
      this.audioEl.play().catch((e) => {
        this.playing = false;
        this.setAmbientGate(false);
        this.enableCache(false);
        this.onError?.(
          "Playback was blocked. Press play again — browsers require a click to start audio.",
        );
        console.warn(e);
      });
      return;
    }
    if (!this.buffer || this.playing) return;
    this.ctx.resume();
    this.setAmbientGate(true);
    this.startSource();
  }

  pause(): void {
    if (this.rewindPlaying) {
      // Can't pause a buffer source mid-flight — just stop the replay.
      this.cancelRewind();
      return;
    }
    if (!this.playing) return;
    if (this.isStream && this.audioEl) {
      this.audioEl.pause();
      this.enableCache(false);
    } else {
      this.offset = this.getPosition();
      this.stopSource();
    }
    this.playing = false;
    this.setAmbientGate(false);
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  stop(): void {
    this.cancelRewind();
    if (this.isStream && this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
      this.enableCache(false);
      this.clearCache();
    } else {
      this.stopSource();
      this.offset = 0;
    }
    this.playing = false;
    this.setAmbientGate(false);
  }

  seek(time: number): void {
    if (this.isStream) return; // live radio cannot be seeked
    if (!this.buffer) return;
    this.offset = Math.max(0, Math.min(this.duration, time));
    if (this.playing) {
      this.stopSource();
      this.startSource();
    }
  }

  setParams(patch: Partial<LofiParams>): void {
    const wasPlaying = this.playing;
    if (patch.playbackRate !== undefined && patch.playbackRate !== this.params.playbackRate) {
      // Rebase timing so the playhead doesn't jump when the tempo changes.
      if (wasPlaying) {
        this.offset = this.getPosition();
        this.startedAt = this.ctx!.currentTime;
      }
    }
    this.params = { ...this.params, ...patch };
    if (this.graph && this.ctx) {
      applyGraphParams(this.graph, this.ctx, this.params);
      if (this.isStream && this.audioEl && patch.playbackRate !== undefined) {
        this.audioEl.playbackRate = patch.playbackRate;
      } else if (this.source && patch.playbackRate !== undefined) {
        this.source.playbackRate.setValueAtTime(patch.playbackRate, this.ctx.currentTime);
      }
    }
  }

  /** Starts real-time capture of the processed output (for streams). */
  startRecording(): boolean {
    if (!this.ctx || !this.graph?.recordDest || this.recording) return false;
    const mime = pickRecorderMime();
    this.recChunks = [];
    try {
      this.recorder = new MediaRecorder(
        this.graph.recordDest.stream,
        mime ? { mimeType: mime } : undefined,
      );
    } catch (e) {
      console.warn("MediaRecorder unavailable", e);
      return false;
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.recChunks.push(e.data);
    };
    this.recorder.start(250);
    this.recording = true;
    return true;
  }

  /** Stops capture and resolves to the recorded audio Blob. */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.recorder;
      if (!rec || !this.recording) {
        resolve(new Blob());
        return;
      }
      const type = rec.mimeType || "audio/webm";
      rec.onstop = () => {
        const blob = new Blob(this.recChunks, { type });
        this.recChunks = [];
        this.recording = false;
        this.recorder = null;
        resolve(blob);
      };
      try {
        rec.stop();
      } catch {
        this.recording = false;
        this.recorder = null;
        resolve(new Blob());
      }
    });
  }

  /** Renders the processed track offline and returns a WAV blob. */
  async exportWav(): Promise<Blob> {
    if (!this.buffer || !this.ctx) throw new Error("No audio loaded.");
    const { audioBufferToWav } = await import("./wav");
    const sr = this.ctx.sampleRate;
    const rate = this.params.playbackRate;
    const outLen = Math.ceil((this.buffer.duration / rate) * sr);
    const off = new OfflineAudioContext(2, outLen, sr);

    let workletOk = false;
    try {
      await ensureWorklet(off);
      workletOk = true;
    } catch {
      /* ignore */
    }

    const g = createFxGraph(off, workletOk, false);
    applyGraphParams(g, off, this.params);
    // Offline render is "always playing" — open the ambient gate.
    g.ambientGate.gain.value = 1;

    const source = off.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = rate;
    // Apply the VHS wobble to the exported render too.
    try {
      g.wobbleDepth.connect(source.playbackRate);
    } catch {
      /* noop */
    }

    const channels = this.buffer.numberOfChannels;
    const inSplitter = off.createChannelSplitter(channels);
    const inMerger = off.createChannelMerger(2);
    source.connect(inSplitter);
    inSplitter.connect(inMerger, 0, 0);
    if (channels >= 2) inSplitter.connect(inMerger, 1, 1);
    else inSplitter.connect(inMerger, 0, 1);

    inMerger.connect(g.crushNode);
    inMerger.connect(g.directGain);

    source.start(0);
    const rendered = await off.startRendering();
    return audioBufferToWav(rendered);
  }

  dispose(): void {
    if (this.recording) {
      try {
        this.recorder?.stop();
      } catch {
        /* noop */
      }
      this.recording = false;
    }
    this.clearStream();
    this.stopSource();
    this.playing = false;
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.ready = false;
    this.graph = null;
  }
}
