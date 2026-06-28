// Generates a synthetic stereo impulse response for the reverb convolver.
// A decaying noise burst gives a smooth, diffuse reverb tail.

export function makeImpulse(
  ctx: BaseAudioContext,
  duration: number,
  decay: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const impulse = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // Slight left/right decorrelation for a wider reverb.
      const n = Math.random() * 2 - 1;
      data[i] = n * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}
