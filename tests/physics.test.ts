import test from 'node:test';
import assert from 'node:assert/strict';
import { BUFFER_SIZE, estimatePitch, centsBetween, noteFor, physicsFor, PitchSmoother, MatchTracker, HumPeakTracker, signalLevel, digitalLevel } from '../src/physics';

function signal(frequency: number, sampleRate: number, harmonic = false) {
  return Float32Array.from({ length: BUFFER_SIZE }, (_, i) => {
    const phase = 2 * Math.PI * frequency * i / sampleRate;
    return harmonic ? 0.15 * Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.05 * Math.sin(3 * phase) : 0.4 * Math.sin(phase);
  });
}
for (const rate of [44100, 48000]) {
  for (const frequency of [80, 130, 220, 330, 440, 880]) {
    test(`detects ${frequency} Hz at ${rate} samples/s`, () => {
      const result = estimatePitch(signal(frequency, rate), rate);
      assert.ok(result); assert.ok(Math.abs(centsBetween(result.frequency, frequency)) < 3);
    });
  }
  test(`finds the fundamental with a stronger second harmonic at ${rate} samples/s`, () => {
    const result = estimatePitch(signal(220, rate, true), rate);
    assert.ok(result); assert.ok(Math.abs(centsBetween(result.frequency, 220)) < 3);
  });
}
test('rejects silence, near silence, and deterministic broadband noise', () => {
  assert.equal(estimatePitch(new Float32Array(BUFFER_SIZE), 48000), null);
  assert.equal(estimatePitch(Float32Array.from(signal(220, 48000), n => n * 0.001), 48000), null);
  let seed = 17;
  const noise = Float32Array.from({ length: BUFFER_SIZE }, () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 - 0.5; });
  assert.equal(estimatePitch(noise, 48000), null);
});
test('note and physics calculations match known examples', () => {
  assert.equal(noteFor(440), 'A4'); assert.equal(noteFor(220), 'A3');
  assert.equal(centsBetween(440, 220), 1200);
  assert.deepEqual(physicsFor(200), { periodMs: 5, wavelength: 1.715 });
});
test('detects a quiet but periodic hum and a low voice fundamental', () => {
  const quiet = Float32Array.from(signal(156, 48000), sample => sample * 0.0175);
  assert.ok(Math.abs(centsBetween(estimatePitch(quiet, 48000)!.frequency, 156)) < 3);
  assert.ok(Math.abs(centsBetween(estimatePitch(signal(60, 48000), 48000)!.frequency, 60)) < 3);
});
test('highest hum requires a sustained pitch and rejects transient octave spikes', () => {
  const tracker = new HumPeakTracker();
  assert.equal(tracker.update(220, true, 0).peak, null);
  for (let time = 100; time <= 400; time += 100) assert.equal(tracker.update(220, true, time).peak, null);
  assert.equal(tracker.update(220, true, 500).peak, 220);
  assert.equal(tracker.update(880, true, 600).peak, null);
  assert.equal(tracker.update(null, false, 700).progress, 0);
  assert.equal(tracker.update(330, false, 800).peak, null);
  tracker.update(330, true, 900);
  assert.equal(tracker.update(330, true, 1400).peak, null, 'A missing frame gap cannot count as a sustained hold');
});
test('increasing amplitude changes RMS without changing detected pitch', () => {
  const quiet = Float32Array.from(signal(330, 48000), sample => sample * 0.1);
  const loud = Float32Array.from(signal(330, 48000), sample => sample * 2);
  assert.ok(signalLevel(loud).rms > signalLevel(quiet).rms * 19);
  assert.ok(Math.abs(centsBetween(estimatePitch(quiet, 48000)!.frequency, estimatePitch(loud, 48000)!.frequency)) < 1);
});
test('dBFS has a finite silence floor and clipping prevents unreliable pitch', () => {
  assert.equal(digitalLevel(0), -100);
  assert.equal(digitalLevel(1), 0);
  assert.ok(Math.abs(digitalLevel(0.5) + 6.0206) < 0.001);
  const clipped = Float32Array.from(signal(220, 48000), sample => Math.max(-1, Math.min(1, sample * 4)));
  assert.equal(signalLevel(clipped).clipping, true);
  assert.equal(estimatePitch(clipped, 48000), null);
});
test('stability needs history and clears immediately on silence or a pitch jump', () => {
  const smoother = new PitchSmoother();
  assert.equal(smoother.update(220, 0).stable, false);
  smoother.update(220.1, 70); smoother.update(219.9, 140);
  assert.equal(smoother.update(220, 210).stable, true);
  assert.deepEqual(smoother.update(null, 280), { frequency: null, stable: false });
  assert.equal(smoother.update(440, 350).stable, false);
  assert.equal(smoother.update(220, 420).frequency, 220);
});
test('matching requires 1.2 seconds continuously stable and resets after interruptions', () => {
  const tracker = new MatchTracker();
  assert.equal(tracker.update(10, true, 0), 0);
  assert.equal(tracker.update(10, true, 600), 0.5);
  assert.equal(tracker.update(10, true, 1200), 1);
  assert.equal(tracker.update(null, true, 1300), 0);
  assert.equal(tracker.update(0, true, 1400), 0);
  assert.equal(tracker.update(40, true, 1600), 0);
  assert.equal(tracker.update(0, false, 1800), 0);
});
