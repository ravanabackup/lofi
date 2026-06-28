// Bitcrusher implemented as an AudioWorkletProcessor.
// The processor source is kept as a string so it can be registered at runtime
// from a Blob URL — this keeps the whole app as a single bundled file
// (required by vite-plugin-singlefile / GitHub Pages hosting).

export const BITCRUSHER_WORKLET = /* js */ `
class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 16, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'normFreq', defaultValue: 1, minValue: 0.0001, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = null;
    this.last = null;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const chCount = input.length;
    if (!this.phase || this.phase.length !== chCount) {
      this.phase = new Float32Array(chCount);
      this.last = new Float32Array(chCount);
    }

    const bits = parameters.bits[0];
    const normFreq = parameters.normFreq[0];
    const step = Math.pow(0.5, bits);
    const len = input[0].length;

    for (let i = 0; i < len; i++) {
      for (let ch = 0; ch < chCount; ch++) {
        const inCh = input[ch];
        this.phase[ch] += normFreq;
        if (this.phase[ch] >= 1.0) {
          this.phase[ch] -= 1.0;
          this.last[ch] = step * Math.floor(inCh[i] / step + 0.5);
        }
        output[ch][i] = this.last[ch];
      }
    }
    return true;
  }
}

registerProcessor('bitcrusher-processor', BitcrusherProcessor);

// Continuous 1-minute timeshift ring buffer for live streams.
// Taps the processed master output and keeps the last N seconds in a
// fixed-size circular buffer. The main thread can request snapshots (the last
// N seconds as stereo PCM) for replay/export, and query how full the buffer is.
class RingBufferProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.maxSeconds = opts.duration || 60;
    this.ch = 2;
    this.cap = Math.max(1, Math.floor(sampleRate * this.maxSeconds));
    this.buf = [new Float32Array(this.cap), new Float32Array(this.cap)];
    this.write = 0;
    this.filled = 0; // samples written so far (clamped to cap)
    this.active = false; // start capturing only when enabled
    this.pending = null; // resolver keyed by message type
    this.port.onmessage = (e) => this._on(e);
  }

  process(inputs) {
    if (this.active) {
      const input = inputs[0];
      if (input && input.length > 0) {
        const inCh = input.length;
        const n = input[0].length;
        for (let i = 0; i < n; i++) {
          const idx = (this.write + i) % this.cap;
          const l = input[0][i];
          this.buf[0][idx] = l;
          this.buf[1][idx] = inCh > 1 ? input[1][i] : l;
        }
        this.write = (this.write + n) % this.cap;
        this.filled = Math.min(this.cap, this.filled + n);
      }
    }
    return true;
  }

  _on(e) {
    const d = e.data || {};
    if (d.type === 'start') {
      this.active = true;
    } else if (d.type === 'stop') {
      this.active = false;
    } else if (d.type === 'clear') {
      this.write = 0;
      this.filled = 0;
    } else if (d.type === 'status') {
      this.port.postMessage({
        type: 'status',
        seconds: this.filled / sampleRate,
        max: this.maxSeconds,
      });
    } else if (d.type === 'snapshot') {
      const avail = this.filled / sampleRate;
      const secs = Math.max(0.1, Math.min(d.seconds || this.maxSeconds, avail));
      const samples = Math.floor(secs * sampleRate);
      const start = (this.write - samples + this.cap) % this.cap;
      const out = [new Float32Array(samples), new Float32Array(samples)];
      for (let c = 0; c < 2; c++) {
        const src = this.buf[c];
        const dst = out[c];
        for (let i = 0; i < samples; i++) dst[i] = src[(start + i) % this.cap];
      }
      this.port.postMessage(
        { type: 'snapshot', channels: out, sampleRate, seconds: secs },
        [out[0].buffer, out[1].buffer],
      );
    }
  }
}

registerProcessor('ring-buffer-processor', RingBufferProcessor);
`;

let cachedUrl: string | null = null;
const loadedContexts = new WeakSet<BaseAudioContext>();

function getWorkletUrl(): string {
  if (!cachedUrl) {
    const blob = new Blob([BITCRUSHER_WORKLET], { type: "application/javascript" });
    cachedUrl = URL.createObjectURL(blob);
  }
  return cachedUrl;
}

/** Registers the bitcrusher worklet on a context (idempotent per context). */
export async function ensureWorklet(ctx: BaseAudioContext): Promise<void> {
  if (loadedContexts.has(ctx)) return;
  await ctx.audioWorklet.addModule(getWorkletUrl());
  loadedContexts.add(ctx);
}
