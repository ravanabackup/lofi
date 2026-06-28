// Central type + preset definitions for the LoFi engine.

import type { AmbientLayer } from "./ambient";

export interface LofiParams {
  /** Playback rate. <1 = slowed (lowers tempo AND pitch). 0.6 - 1.25 */
  playbackRate: number;
  /** Reverb wet mix 0 - 1 */
  reverbWet: number;
  /** Reverb tail length in seconds 0.5 - 6 */
  reverbDecay: number;
  /** Low-pass cutoff in Hz (the "muffled vinyl" character) 400 - 20000 */
  cutoff: number;
  /** Low-shelf bass boost in dB 0 - 14 */
  bassGain: number;
  /** Stereo width 0 (mono) - 1.4 (wide / surround) */
  width: number;
  /** Bitcrusher amount 0 - 1 */
  crush: number;
  /** Master volume 0 - 1.5 */
  volume: number;
  /** Bypass all FX (A/B against dry source) */
  bypass: boolean;
  /** Pitch wow/flutter (VHS wobble) 0 - 1 (buffer sources only). */
  wobble: number;
  /** Procedural ambience layer mixed under the signal. */
  ambient: AmbientLayer;
  /** Ambience loudness 0 - 1. */
  ambientLevel: number;
}

export const DEFAULT_PARAMS: LofiParams = {
  playbackRate: 0.85,
  reverbWet: 0.35,
  reverbDecay: 2.4,
  cutoff: 7000,
  bassGain: 4,
  width: 1.2,
  crush: 0.22,
  volume: 1,
  bypass: false,
  wobble: 0,
  ambient: "none",
  ambientLevel: 0.5,
};

export interface Preset {
  name: string;
  emoji: string;
  desc: string;
  params: Partial<LofiParams>;
}

export interface PresetCategory {
  id: string;
  title: string;
  presets: Preset[];
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: "classics",
    title: "The Classics & Tempo Tweaks",
    presets: [
      {
        name: "Slowed + Reverb",
        emoji: "🌙",
        desc: "The classic viral late-night vibe. Heavy echo and a relaxed, drawn-out pace.",
        params: { playbackRate: 0.82, reverbWet: 0.42, reverbDecay: 3.0, cutoff: 7500, bassGain: 5, width: 1.25, crush: 0.18, wobble: 0.08 },
      },
      {
        name: "Nightcore",
        emoji: "⚡",
        desc: "Sped-up and pitched-up energy. High-tempo, bright, and nostalgic.",
        params: { playbackRate: 1.2, reverbWet: 0.18, reverbDecay: 1.4, cutoff: 11500, bassGain: 3, width: 1.2, crush: 0.06, wobble: 0 },
      },
      {
        name: "VHS Cassette",
        emoji: "📼",
        desc: "Wobbly pitch-warping, tracking errors, and warm, vintage tape hiss.",
        params: { playbackRate: 0.9, reverbWet: 0.28, cutoff: 5500, bassGain: 4, width: 1.1, crush: 0.4, wobble: 0.7, ambient: "tape", ambientLevel: 0.45 },
      },
      {
        name: "Dusty Vinyl",
        emoji: "📀",
        desc: "Crispy, lo-bit record crackle with warm, pops-and-clicks analog texture.",
        params: { playbackRate: 0.93, reverbWet: 0.25, cutoff: 4800, bassGain: 4, width: 1.0, crush: 0.55, wobble: 0.12, ambient: "vinyl", ambientLevel: 0.55 },
      },
    ],
  },
  {
    id: "study",
    title: "Study & Chill Beats",
    presets: [
      {
        name: "Chillhop",
        emoji: "☕",
        desc: "Warm, muffled study beats, boom-bap rhythms, and jazzy undertones.",
        params: { playbackRate: 0.9, reverbWet: 0.22, cutoff: 5200, bassGain: 6, width: 1.1, crush: 0.32 },
      },
      {
        name: "Matcha Morning",
        emoji: "🍵",
        desc: "Soft, acoustic piano keys, gentle rain, and a fresh, calm start to the day.",
        params: { playbackRate: 0.92, reverbWet: 0.3, cutoff: 6500, bassGain: 4, width: 1.1, crush: 0.15, ambient: "rain", ambientLevel: 0.35 },
      },
      {
        name: "Midnight Drive",
        emoji: "🏙️",
        desc: "Synthwave-tinted, nostalgic highway grooves with neon basslines.",
        params: { playbackRate: 0.95, reverbWet: 0.3, cutoff: 7000, bassGain: 6, width: 1.3, crush: 0.2 },
      },
    ],
  },
  {
    id: "ambient",
    title: "Ambient & Immersion",
    presets: [
      {
        name: "Window Seat",
        emoji: "🌧️",
        desc: "Heavy thunderstorm ambience mixed with distant, melancholic jazz chords.",
        params: { playbackRate: 0.8, reverbWet: 0.45, cutoff: 6200, bassGain: 5, width: 1.3, crush: 0.1, ambient: "storm", ambientLevel: 0.7 },
      },
      {
        name: "Library Corner",
        emoji: "📚",
        desc: "Muffled, distant background chatter, ticking clocks, and soft page-turns.",
        params: { playbackRate: 0.88, reverbWet: 0.32, cutoff: 4500, bassGain: 3, width: 1.0, crush: 0.4, ambient: "cafe", ambientLevel: 0.5 },
      },
      {
        name: "Autumn Nostalgia",
        emoji: "🍂",
        desc: "Melancholic guitar strums, crisp leaf rustles, and deep analog warmth.",
        params: { playbackRate: 0.85, reverbWet: 0.38, cutoff: 5500, bassGain: 5, width: 1.2, crush: 0.3, ambient: "leaves", ambientLevel: 0.5 },
      },
      {
        name: "Deep Sleep",
        emoji: "😴",
        desc: "Ultra-slow, dreamy, sub-bass heavy, and ambient drone pads.",
        params: { playbackRate: 0.72, reverbWet: 0.5, reverbDecay: 4.2, cutoff: 6000, bassGain: 7, width: 1.35, crush: 0.12, wobble: 0.15, ambient: "rain", ambientLevel: 0.4 },
      },
    ],
  },
];

// Flat list (handy for A/B "Original" reset + detection helpers).
export const ORIGINAL_PRESET: Preset = {
  name: "Original",
  emoji: "✨",
  desc: "Untouched source, FX off.",
  params: { playbackRate: 1, reverbWet: 0, reverbDecay: 1.5, cutoff: 20000, bassGain: 0, width: 1, crush: 0, wobble: 0, ambient: "none", ambientLevel: 0.5, bypass: true },
};

export const ALL_PRESETS: Preset[] = [
  ...PRESET_CATEGORIES.flatMap((c) => c.presets),
  ORIGINAL_PRESET,
];
