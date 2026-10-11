import { useEffect, useRef } from 'react';
import type { Frame } from './audio';

type Props = { kind: 'wave' | 'spectrum' | 'spectrogram' | 'tone'; frame: Frame; paused?: boolean; clear?: number; shape?: OscillatorType; toneFrequency?: number };
const LOW = 65, HIGH = 8000;
function color(value: number) {
  const stops = [[15, 20, 32], [30, 48, 82], [74, 60, 133], [195, 63, 126], [245, 131, 105], [255, 220, 148]];
  const p = Math.min(stops.length - 1.001, value / 255 * (stops.length - 1));
  const i = Math.floor(p), t = p - i;
  return stops[i].map((v, channel) => Math.round(v + (stops[i + 1][channel] - v) * t));
}
export function Visual(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props); latest.current = props;
  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext('2d')!;
    let animation = 0, lastTime = -1, lastClear = -1;
    const draw = () => {
      animation = requestAnimationFrame(draw);
      const { frame, kind, paused, clear = 0, shape = 'sine', toneFrequency = 220 } = latest.current;
      const width = Math.max(1, Math.floor(element.clientWidth));
      const height = Math.max(1, Math.floor(element.clientHeight));
      if (element.width !== width || element.height !== height) { element.width = width; element.height = height; lastTime = -1; }
      if (clear !== lastClear) { context.clearRect(0, 0, width, height); lastClear = clear; }
      if (paused || (kind !== 'tone' && frame.time === lastTime)) return;
      lastTime = frame.time;
      if (kind === 'spectrogram') {
        context.drawImage(element, -3, 0);
        const column = context.createImageData(3, height);
        for (let y = 0; y < height; y++) {
          const hz = LOW * (HIGH / LOW) ** (1 - y / height);
          const bin = Math.min(frame.spectrum.length - 1, Math.round(hz * frame.samples.length / frame.sampleRate));
          const rgb = color(frame.spectrum[bin]);
          for (let x = 0; x < 3; x++) { const offset = (y * 3 + x) * 4; column.data.set([...rgb, 255], offset); }
        }
        context.putImageData(column, width - 3, 0);
        return;
      }
      context.clearRect(0, 0, width, height);
      context.strokeStyle = '#ffffff0b'; context.lineWidth = 1;
      for (let x = 0; x < width; x += width / 12) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
      for (let y = 0; y <= height; y += height / 4) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
      if (kind === 'spectrum') {
        const positions: { x: number; y: number }[] = [];
        for (let x = 0; x < width; x += 2) {
          const hz = LOW * (HIGH / LOW) ** (x / width);
          const bin = Math.min(frame.spectrum.length - 1, Math.round(hz * frame.samples.length / frame.sampleRate));
          positions.push({ x, y: height - 10 - frame.spectrum[bin] / 255 * (height - 25) });
        }
        context.beginPath(); context.moveTo(0, height);
        positions.forEach(p => context.lineTo(p.x, p.y)); context.lineTo(width, height); context.closePath();
        context.fillStyle = '#bc98ef22'; context.fill();
        context.beginPath(); positions.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
        context.strokeStyle = '#bd9bef'; context.lineWidth = 1.6; context.stroke();
        if (frame.frequency) for (let harmonic = 1; harmonic <= 5; harmonic++) {
          const x = Math.log(frame.frequency * harmonic / LOW) / Math.log(HIGH / LOW) * width;
          context.strokeStyle = harmonic === 1 ? '#82e9be' : '#e9bb7444';
          context.setLineDash([3, 4]); context.beginPath(); context.moveTo(x, 20); context.lineTo(x, height); context.stroke(); context.setLineDash([]);
          context.fillStyle = harmonic === 1 ? '#82e9be' : '#e9bb74'; context.font = '10px sans-serif'; context.fillText(harmonic === 1 ? 'f0' : `${harmonic}f`, Math.min(width - 20, x + 4), 13);
        }
        return;
      }
      context.beginPath();
      const count = Math.min(frame.samples.length, Math.round(frame.sampleRate * 0.025));
      for (let x = 0; x < width; x++) {
        let value = frame.samples[Math.floor(x / width * count)] ?? 0;
        if (kind === 'tone') {
          const phase = x / width * toneFrequency * 0.025;
          const t = phase - Math.floor(phase);
          value = 0.7 * (shape === 'square' ? (t < 0.5 ? 1 : -1) : shape === 'triangle' ? 1 - 4 * Math.abs(t - 0.5) : shape === 'sawtooth' ? 2 * t - 1 : Math.sin(phase * Math.PI * 2));
        }
        const y = height / 2 - value * height * 0.42;
        x === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
      }
      context.strokeStyle = kind === 'tone' ? '#efba75' : '#77dfc9'; context.lineWidth = 1.8;
      context.shadowColor = context.strokeStyle; context.shadowBlur = 6; context.stroke(); context.shadowBlur = 0;
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, []);
  return <canvas ref={canvas} className={`visual visual-${props.kind}`} role="img" aria-label={props.kind === 'wave' ? 'Sound waveform: time horizontally, relative amplitude vertically' : props.kind === 'spectrum' ? 'Frequency spectrum from 65 to 8000 Hz' : props.kind === 'tone' ? 'Generated tone waveform' : 'Scrolling spectrogram: time horizontally, frequency vertically, color indicates intensity'} />;
}
