// Procedural ambient noise layers (rain, vinyl crackle, storm, tape hiss…).
// Each layer is a short loopable buffer of shaped noise that gets mixed under
// the main signal, so presets like "Dusty Vinyl" or "Window Seat" actually
// deliver their described texture.

export type AmbientLayer =
  | "none"
  | "vinyl"
  | "rain"
  | "storm"
  | "tape"
  | "leaves"
  | "cafe";

export interface AmbientSpec {
  noise: "white" | "pink" | "brown";
  filter: BiquadFilterType;
  freq: number;
  q: number;
  /** 0..1 amplitude modulation (slow tremolo) for organic movement. */
  tremolo: number;
  /** Relative loudness (combined with the Ambient Level control). */
  level: number;
}

export const AMBIENT_SPECS: Record<Exclude<AmbientLayer, "none">, AmbientSpec> = {
  vinyl: { noise: "pink", filter: "highpass", freq: 2600, q: 0.7, tremolo: 0, level: 0.32 },
  rain: { noise: "pink", filter: "bandpass", freq: 1600, q: 0.6, tremolo: 0.25, level: 0.6 },
  storm: { noise: "pink", filter: "bandpass", freq: 700, q: 0.5, tremolo: 0.4, level: 0.8 },
  tape: { noise: "pink", filter: "highpass", freq: 3200, q: 0.7, tremolo: 0.05, level: 0.22 },
  leaves: { noise: "brown", filter: "lowpass", freq: 900, q: 0.5, tremolo: 0.35, level: 0.7 },
  cafe: { noise: "brown", filter: "lowpass", freq: 520, q: 0.5, tremolo: 0.2, level: 0.6 },
};

export const AMBIENT_LABELS: { id: AmbientLayer; emoji: string; label: string }[] = [
  { id: "none", emoji: "🚫", label: "None" },
  { id: "vinyl", emoji: "📀", label: "Vinyl" },
  { id: "rain", emoji: "🌧️", label: "Rain" },
  { id: "storm", emoji: "⛈️", label: "Storm" },
  { id: "tape", emoji: "📼", label: "Tape" },
  { id: "leaves", emoji: "🍂", label: "Leaves" },
  { id: "cafe", emoji: "☕", label: "Café" },
];

/** Builds a ~5s loopable noise buffer for the given ambient layer. */
export function makeNoiseBuffer(ctx: BaseAudioContext, layer: AmbientLayer): AudioBuffer {
  const duration = 5;
  const sr = ctx.sampleRate;
  const len = Math.floor(duration * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const spec = AMBIENT_SPECS[layer as Exclude<AmbientLayer, "none">];
  if (!spec) return buf;

  // Coloured noise source.
  if (spec.noise === "white") {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (spec.noise === "pink") {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    // brown
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }

  // Vinyl: hush the bed and overlay random pops & crackle.
  if (layer === "vinyl") {
    for (let i = 0; i < len; i++) d[i] *= 0.12;
    let i = 0;
    while (i < len) {
      if (Math.random() < 0.014) {
        const amp = (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? 1 : -1);
        const decay = 25 + Math.floor(Math.random() * 130);
        for (let j = 0; j < decay && i + j < len; j++) {
          d[i + j] += amp * Math.exp(-j / (decay * 0.4));
        }
        i += decay;
      } else {
        i++;
      }
    }
  }

  // Storm: overlay occasional low rumbles.
  if (layer === "storm") {
    let i = 0;
    while (i < len) {
      if (Math.random() < 0.0016) {
        const decay = Math.floor(sr * (0.3 + Math.random() * 0.9));
        const amp = 0.5 + Math.random() * 0.5;
        for (let j = 0; j < decay && i + j < len; j++) {
          d[i + j] += amp * Math.exp(-j / (decay * 0.5)) * (Math.random() * 2 - 1) * 0.5;
        }
        i += decay;
      } else {
        i++;
      }
    }
  }

  // Fade the loop edges so it clicks seamlessly.
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    d[i] *= g;
    d[len - 1 - i] *= g;
  }
  return buf;
}
