import test from 'node:test';
import assert from 'node:assert/strict';
import { LabAudio } from '../src/audio';

test('microphone stop disconnects nodes and stops tracks; unmount closes the context', async () => {
  let stops = 0, disconnects = 0, closes = 0;
  const track = { onended: null, stop: () => stops++ };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class MockContext {
    state = 'running'; sampleRate = 48000;
    createAnalyser() { return { disconnect: () => disconnects++ }; }
    createMediaStreamSource() { return { connect: () => {}, disconnect: () => disconnects++ }; }
    close() { closes++; return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, AudioContext: MockContext } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: MockContext });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: () => {} });
  const engine = new LabAudio();
  await engine.startMic(); assert.equal(engine.live, true);
  engine.stopMic(); assert.equal(engine.live, false); assert.equal(stops, 1); assert.equal(disconnects, 2);
  engine.dispose(); assert.equal(closes, 1); assert.equal(stops, 1);
});
test('cancelled permission request stops a stream that arrives late', async () => {
  let resolve!: (stream: unknown) => void, stops = 0;
  let notifyRequested!: () => void;
  const requested = new Promise<void>(resolve => { notifyRequested = resolve; });
  const delayed = new Promise(resolvePromise => { resolve = resolvePromise; });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => { notifyRequested(); return delayed; } } } });
  const engine = new LabAudio();
  const request = engine.startMic();
  await requested;
  engine.stopMic();
  resolve({ getTracks: () => [{ stop: () => stops++ }] });
  await request;
  assert.equal(stops, 1); assert.equal(engine.live, false); engine.dispose();
});

test('a failed audio-node setup releases the microphone instead of leaving it active', async () => {
  const previousContext = globalThis.AudioContext;
  let stops = 0;
  class BrokenContext extends previousContext {
    createMediaStreamSource(): MediaStreamAudioSourceNode { throw new Error('Audio input setup failed'); }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: BrokenContext });
  const stream = { getTracks: () => [{ stop: () => stops++, onended: null }] };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
  const engine = new LabAudio();
  let status = '', message = '';
  engine.onStatus = (next, error) => { status = next; message = error ?? ''; };
  await engine.startMic();
  assert.equal(engine.live, false); assert.equal(stops, 1);
  assert.equal(status, 'demo'); assert.equal(message, 'Audio input setup failed');
  engine.dispose();
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: previousContext });
});
