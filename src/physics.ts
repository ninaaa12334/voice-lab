import { PitchDetector } from 'pitchy';

export const BUFFER_SIZE = 4096;
export const detector = PitchDetector.forFloat32Array(BUFFER_SIZE);
export function rms(samples: Float32Array) {
  return signalLevel(samples).rms;
}
export function signalLevel(samples: Float32Array) {
  let sum = 0;
  let peak = 0;
  for (const sample of samples) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  return { rms: samples.length ? Math.sqrt(sum / samples.length) : 0, peak, clipping: peak >= 0.98 };
}
export function digitalLevel(amplitude: number) {
  return Math.max(-100, Math.min(0, 20 * Math.log10(Math.max(amplitude, 0.00001))));
}
export function estimatePitch(samples: Float32Array, sampleRate: number, level = signalLevel(samples)) {
  if (level.rms < 0.003 || level.clipping) return null;
  const [frequency, clarity] = detector.findPitch(samples, sampleRate);
  return clarity >= 0.90 && frequency >= 55 && frequency <= 1400 ? { frequency, clarity } : null;
}
export function centsBetween(frequency: number, target: number) {
  return 1200 * Math.log2(frequency / target);
}
export function noteFor(frequency: number) {
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
export function physicsFor(frequency: number) {
  return { periodMs: 1000 / frequency, wavelength: 343 / frequency };
}
export class PitchSmoother {
  private history: { frequency: number; time: number }[] = [];
  reset() { this.history = []; }
  update(frequency: number | null, time: number) {
    if (frequency === null) { this.reset(); return { frequency: null, stable: false }; }
    const previous = this.history.at(-1);
    if (previous && Math.abs(centsBetween(frequency, previous.frequency)) > 120) this.reset();
    this.history.push({ frequency, time });
    this.history = this.history.filter(item => time - item.time <= 350);
    const sorted = this.history.map(item => item.frequency).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const stable = this.history.length >= 4 && time - this.history[0].time >= 200 && this.history.every(item => Math.abs(centsBetween(item.frequency, median)) <= 22);
    return { frequency: median, stable };
  }
}
export class MatchTracker {
  private since: number | null = null;
  reset() { this.since = null; }
  update(cents: number | null, stable: boolean, now: number) {
    if (cents === null || Math.abs(cents) > 25 || !stable) { this.reset(); return 0; }
    this.since ??= now;
    return Math.min(1, (now - this.since) / 1200);
  }
}

export class HumPeakTracker {
  private samples: { frequency: number; time: number }[] = [];
  reset() { this.samples = []; }
  update(frequency: number | null, stable: boolean, now: number) {
    if (frequency === null || !stable) { this.reset(); return { peak: null, progress: 0 }; }
    const first = this.samples[0], previous = this.samples.at(-1);
    if ((first && Math.abs(centsBetween(frequency, first.frequency)) > 35) || (previous && now - previous.time > 180)) this.reset();
    this.samples.push({ frequency, time: now });
    const progress = Math.min(1, (now - this.samples[0].time) / 500);
    const values = this.samples.map(sample => sample.frequency).sort((a, b) => a - b);
    const peak = progress === 1 ? values[Math.floor(values.length / 2)] : null;
    if (progress === 1) this.samples = this.samples.filter(sample => now - sample.time <= 500);
    return { peak, progress };
  }
}
