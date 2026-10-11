import { BUFFER_SIZE, estimatePitch, PitchSmoother, signalLevel } from './physics';

export type Frame = { samples: Float32Array; spectrum: Uint8Array; sampleRate: number; frequency: number | null; stable: boolean; level: number; clipping: boolean; time: number };
export type AudioStatus = 'demo' | 'requesting' | 'live';
export class LabAudio {
  frame: Frame = { samples: new Float32Array(BUFFER_SIZE), spectrum: new Uint8Array(BUFFER_SIZE / 2), sampleRate: 48000, frequency: null, stable: false, level: 0, clipping: false, time: 0 };
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private smoother = new PitchSmoother();
  private requestId = 0;
  private toneRequestId = 0;
  private animation = 0;
  private lastAnalysis = 0;
  private demoPhase = 0;
  private disposed = false;
  private clippingUntil = 0;
  onFrame: (frame: Frame) => void = () => {};
  onStatus: (status: AudioStatus, error?: string) => void = () => {};
  get live() { return !!this.stream; }
  get inputLabel() { return this.stream?.getAudioTracks()[0]?.label || 'Default microphone'; }
  private async getContext() {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }
  run() {
    if (this.animation || this.disposed) return;
    const loop = (time: number) => {
      if (this.disposed) return;
      this.animation = requestAnimationFrame(loop);
      if (time - this.lastAnalysis < 65) return;
      this.lastAnalysis = time;
      const frame = this.frame;
      if (this.analyser) {
        frame.sampleRate = this.context!.sampleRate;
        this.analyser.getFloatTimeDomainData(frame.samples);
        this.analyser.getByteFrequencyData(frame.spectrum);
      } else {
        const frequency = 220 + 1.2 * Math.sin(time / 1800);
        const amplitude = 0.22 + 0.06 * Math.sin(time / 1100);
        for (let i = 0; i < frame.samples.length; i++) {
          const phase = this.demoPhase + 2 * Math.PI * frequency * i / frame.sampleRate;
          frame.samples[i] = amplitude * (Math.sin(phase) + 0.45 * Math.sin(2 * phase) + 0.22 * Math.sin(3 * phase));
        }
        this.demoPhase += 0.15;
        for (let i = 0; i < frame.spectrum.length; i++) {
          const hz = i * frame.sampleRate / BUFFER_SIZE;
          let power = 0;
          for (let harmonic = 1; harmonic <= 8; harmonic++) power += (210 / harmonic) * Math.exp(-Math.pow((hz - frequency * harmonic) / 18, 2));
          frame.spectrum[i] = Math.max(0, Math.min(255, power + 5 * Math.sin(i * 13 + time / 1300) ** 2));
        }
      }
      const level = signalLevel(frame.samples);
      if (this.live && level.clipping) this.clippingUntil = time + 600;
      frame.clipping = this.live && time < this.clippingUntil;
      const pitch = estimatePitch(frame.samples, frame.sampleRate, level);
      const smooth = this.smoother.update(pitch?.frequency ?? null, time);
      frame.frequency = smooth.frequency;
      frame.stable = smooth.stable;
      frame.level = level.rms;
      frame.time = time;
      this.onFrame(frame);
    };
    this.animation = requestAnimationFrame(loop);
  }
  async startMic(deviceId?: string) {
    const request = ++this.requestId;
    this.releaseMic();
    this.clearFrame();
    this.onStatus('requesting');
    try {
      if (!window.isSecureContext) throw new Error('Microphone access needs HTTPS or localhost. Open the local address in your browser.');
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new Error('This browser does not support microphone analysis. Try a recent Chrome, Edge, Firefox, or Safari.');
      const policy = (document as Document & { permissionsPolicy?: { allowsFeature: (feature: string) => boolean } }).permissionsPolicy;
      if (window.self !== window.top && policy?.allowsFeature('microphone') === false) throw new Error('This embedded preview blocks microphone access. Open this website directly in a browser tab using its localhost or HTTPS address, then start the microphone.');
      const context = await this.getContext();
      if (request !== this.requestId || this.disposed) return;
      const supported = navigator.mediaDevices.getSupportedConstraints?.();
      const audio: MediaTrackConstraints = {};
      if (deviceId) audio.deviceId = { exact: deviceId };
      for (const option of ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const) if (!supported || supported[option]) audio[option] = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      if (request !== this.requestId || this.disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      this.releaseMic();
      this.stream = stream;
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = BUFFER_SIZE;
      this.analyser.minDecibels = -95;
      this.analyser.maxDecibels = -15;
      this.analyser.smoothingTimeConstant = 0.65;
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      stream.getAudioTracks().forEach(track => { track.onended = () => this.stopMic('Microphone disconnected. Reconnect it and start again.'); });
      this.smoother.reset();
      this.clearFrame(context.sampleRate);
      this.onStatus('live');
    } catch (error) {
      if (request !== this.requestId || this.disposed) return;
      this.releaseMic();
      const name = error instanceof DOMException ? error.name : '';
      const message = name === 'NotAllowedError' ? 'Microphone permission was denied. Allow access in your browser site settings, then try again. If an embedded preview blocks access, open this website directly in a browser tab.' : name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.' : name === 'NotReadableError' ? 'The microphone is unavailable or busy. Close other apps using it and try again.' : error instanceof Error ? error.message : 'Could not start the microphone.';
      this.onStatus('demo', message);
    }
  }
  private releaseMic() {
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream = null; this.source = null; this.analyser = null;
    this.smoother.reset();
    this.clippingUntil = 0;
  }
  private clearFrame(sampleRate = this.frame.sampleRate) {
    this.frame = { samples: new Float32Array(BUFFER_SIZE), spectrum: new Uint8Array(BUFFER_SIZE / 2), sampleRate, frequency: null, stable: false, level: 0, clipping: false, time: performance.now() };
    this.onFrame(this.frame);
  }
  stopMic(error?: string) { ++this.requestId; this.releaseMic(); this.clearFrame(); this.onStatus('demo', error); }
  async playTone(frequency: number, type: OscillatorType, volume: number) {
    this.stopTone();
    const request = ++this.toneRequestId;
    const context = await this.getContext();
    if (this.disposed || request !== this.toneRequestId) return;
    this.oscillator = context.createOscillator();
    this.gain = context.createGain();
    this.oscillator.type = type;
    this.oscillator.frequency.value = frequency;
    this.gain.gain.setValueAtTime(0, context.currentTime);
    this.gain.gain.linearRampToValueAtTime(volume, context.currentTime + 0.06);
    this.oscillator.connect(this.gain).connect(context.destination);
    this.oscillator.start();
  }
  updateTone(frequency: number, type: OscillatorType, volume: number) {
    if (!this.oscillator || !this.gain || !this.context) return;
    this.oscillator.type = type;
    this.oscillator.frequency.setTargetAtTime(frequency, this.context.currentTime, 0.025);
    this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.025);
  }
  stopTone() {
    ++this.toneRequestId;
    if (this.oscillator && this.gain && this.context) {
      const oscillator = this.oscillator; const gain = this.gain;
      gain.gain.cancelScheduledValues(this.context.currentTime);
      gain.gain.setTargetAtTime(0, this.context.currentTime, 0.015);
      oscillator.stop(this.context.currentTime + 0.1);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    this.oscillator = null; this.gain = null;
  }
  dispose() { this.disposed = true; this.onFrame = () => {}; this.onStatus = () => {}; cancelAnimationFrame(this.animation); this.animation = 0; this.stopMic(); this.stopTone(); void this.context?.close(); }
}
