import { useEffect, useRef, useState } from 'react';
import { Activity, AudioLines, BookOpen, ChevronRight, CircleHelp, FlaskConical, Headphones, Mic, MicOff, Pause, Play, Radio, RotateCcw, ShieldCheck, Square, Target, Trash2, Volume2, Waves } from 'lucide-react';
import { LabAudio, type AudioStatus, type Frame } from './audio';
import { centsBetween, digitalLevel, MatchTracker, noteFor, physicsFor } from './physics';
import { Visual } from './Visual';
import { MicrophoneInput } from './MicrophoneInput';
import { HumChallenge, useHumRecord } from './HumChallenge';

type Tab = 'lab' | 'game' | 'notes';
type GamePhase = 'idle' | 'playing' | 'settling' | 'listening' | 'won' | 'complete';
const experiments = [
  ['Find your fundamental', 'Hum a steady note. Watch the frequency settle and find its nearest musical note.', 'PITCH'],
  ['Take it higher', 'Hum a higher note. Frequency increases and the period of each wave gets shorter.', 'FREQUENCY'],
  ['Same note, more energy', 'Hum the same note louder. The waveform grows taller while pitch stays approximately constant.', 'AMPLITUDE'],
  ['One pitch, two vowels', 'Say "aaa" and "eee" at a similar pitch. Compare the strengths of the harmonics in the spectrum.', 'TIMBRE'],
  ['Change the shape', 'Compare a sine and square wave at 220 Hz. Listen for the extra harmonics in the square wave.', 'HARMONICS'],
  ['A little friendly competition', 'Take turns matching five target notes. Compare your scores and steady-note technique.', 'CHALLENGE'],
];
const concepts = [
  ['Pitch', 'How high or low a sound seems. A higher fundamental frequency usually sounds higher.'],
  ['Amplitude', 'The size of the oscillation. Greater amplitude usually sounds louder, but your microphone settings also affect it.'],
  ['Timbre', 'The character of a sound. Different mixtures of harmonics make voices and instruments sound distinct.'],
  ['Harmonics', 'Frequencies at whole-number multiples of the fundamental: 2f, 3f, 4f, and so on.'],
  ['Period', 'The time for one complete cycle. Period and frequency are inverses: T = 1/f.'],
  ['Wavelength', 'The distance between repeating parts of a wave. In air, wavelength = sound speed / frequency.'],
];

export default function App() {
  const [engine] = useState(() => new LabAudio());
  const [frame, setFrame] = useState<Frame>({ ...engine.frame });
  const [status, setStatus] = useState<AudioStatus>('demo');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('lab');
  const [gameMode, setGameMode] = useState<'match' | 'peak'>('match');
  const [frozen, setFrozen] = useState(false);
  const [spectroPaused, setSpectroPaused] = useState(false);
  const [clear, setClear] = useState(0);
  const [toneFrequency, setToneFrequency] = useState(220);
  const [shape, setShape] = useState<OscillatorType>('sine');
  const [volume, setVolume] = useState(0.04);
  const [tonePlaying, setTonePlaying] = useState(false);
  const [range, setRange] = useState({ min: 130, max: 440 });
  const [target, setTarget] = useState(220);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [round, setRound] = useState(1);
  const [points, setPoints] = useState(0);
  const [hold, setHold] = useState(0);
  const [lastAward, setLastAward] = useState(0);
  const tracker = useRef(new MatchTracker());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameGeneration = useRef(0);
  const humRecord = useHumRecord(frame, status === 'live' && !tonePlaying && phase !== 'playing' && phase !== 'settling');

  useEffect(() => {
    engine.onFrame = value => setFrame({ ...value });
    engine.onStatus = (value, message) => { setStatus(value); setError(message ?? ''); setClear(value => value + 1); setFrozen(false); setSpectroPaused(false); };
    engine.run();
    return () => { ++gameGeneration.current; if (timer.current) clearTimeout(timer.current); engine.dispose(); };
  }, [engine]);
  useEffect(() => { engine.updateTone(toneFrequency, shape, volume); }, [engine, toneFrequency, shape, volume]);
  useEffect(() => {
    if (status !== 'live' && phase === 'listening') { tracker.current.reset(); setHold(0); setPhase('idle'); }
  }, [status, phase]);
  useEffect(() => {
    if (phase !== 'listening' || status !== 'live') return;
    const cents = frame.frequency ? centsBetween(frame.frequency, target) : null;
    const progress = tracker.current.update(cents, frame.stable, frame.time);
    setHold(progress);
    if (progress >= 1) {
      const award = Math.round(100 - Math.min(25, Math.abs(cents ?? 25)) * 2);
      setPoints(value => value + award); setLastAward(award);
      setPhase(round === 5 ? 'complete' : 'won');
    }
  }, [frame.time, frame.frequency, frame.stable, phase, round, status, target]);

  function pauseGame() {
    ++gameGeneration.current;
    if (timer.current) clearTimeout(timer.current);
    engine.stopTone(); setTonePlaying(false);
    tracker.current.reset(); setHold(0);
    if (phase === 'playing' || phase === 'settling' || phase === 'listening') setPhase('idle');
  }
  function resetGame() {
    ++gameGeneration.current;
    if (timer.current) clearTimeout(timer.current);
    engine.stopTone(); setTonePlaying(false);
    tracker.current.reset(); setHold(0); setPhase('idle'); setPoints(0); setRound(1); setLastAward(0);
  }
  async function playTarget(nextRound = round, reuse = false) {
    const generation = ++gameGeneration.current;
    if (timer.current) clearTimeout(timer.current);
    setTonePlaying(false); tracker.current.reset(); setHold(0); setRound(nextRound);
    const frequency = reuse ? target : Math.round(range.min * (range.max / range.min) ** Math.random());
    setTarget(frequency); setPhase('playing');
    try {
      await engine.playTone(frequency, 'sine', 0.045);
      if (generation !== gameGeneration.current) return;
      timer.current = setTimeout(() => {
        engine.stopTone(); setPhase('settling');
        timer.current = setTimeout(() => {
          if (generation === gameGeneration.current) setPhase(engine.live ? 'listening' : 'idle');
        }, 550);
      }, 1100);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not play audio.'); setPhase('idle'); }
  }
  async function toggleTone() {
    if (tonePlaying) { engine.stopTone(); setTonePlaying(false); return; }
    try { await engine.playTone(toneFrequency, shape, volume); setTonePlaying(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not play audio.'); }
  }
  function switchTab(next: Tab) {
    if (next === tab) return;
    ++gameGeneration.current; if (timer.current) clearTimeout(timer.current);
    engine.stopTone(); setTonePlaying(false);
    if (phase === 'playing' || phase === 'settling' || phase === 'listening') { setPhase('idle'); setHold(0); tracker.current.reset(); }
    setTab(next);
  }
  const frequency = frame.frequency;
  const shownPitch = frequency ?? (status === 'live' ? humRecord.last : null);
  const pitchSaved = frequency === null && shownPitch !== null;
  const signalMessage = status !== 'live' ? 'Simulated signal / demo mode' : frame.clipping ? 'Input near clipping: reduce microphone gain or move farther away.' : frequency !== null ? 'Clear pitch detected' : frame.level < 0.00001 ? 'No microphone signal. Check the selected input and device mute.' : frame.level < 0.003 ? 'Input is very quiet. Move closer or increase microphone input gain.' : 'Sound is arriving, but no clear pitch. Hum a steady note.';
  const physics = frequency ? physicsFor(frequency) : null;
  const levelDb = digitalLevel(frame.level);
  const cents = status === 'live' && frequency ? centsBetween(frequency, target) : null;
  const busy = phase === 'playing' || phase === 'settling';
  const feedback = phase === 'playing' ? 'Listen to the target' : phase === 'settling' ? 'Get ready to hum' : phase === 'complete' ? 'Five rounds. Nicely done.' : phase === 'won' ? 'You found the frequency!' : phase !== 'listening' ? 'Ready when you are' : cents === null ? 'Hum a steady note' : Math.abs(cents) <= 25 ? 'Good match' : cents < 0 ? 'Go higher' : 'Go lower';

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); switchTab('lab'); }}><span className="brand-mark"><AudioLines size={23}/></span><span>Voice Lab<span className="brand-sub">SEE YOUR SOUND</span></span></a>
      <nav aria-label="Main navigation">
        <button className={tab === 'lab' ? 'nav-button selected' : 'nav-button'} onClick={() => switchTab('lab')}><Activity size={16}/>Live lab</button>
        <button className={tab === 'game' ? 'nav-button selected' : 'nav-button'} onClick={() => switchTab('game')}><Target size={16}/>Match pitch</button>
        <button className={tab === 'notes' ? 'nav-button selected' : 'nav-button'} onClick={() => switchTab('notes')}><BookOpen size={16}/>Field notes</button>
      </nav>
      <span className="project-label"><FlaskConical size={15}/>A SOUND PHYSICS PROJECT</span>
    </header>
    <main>
      <div className="page-heading"><div><p className="eyebrow">THE SOUND EXPLORER / {tab === 'lab' ? '01' : tab === 'game' ? '02' : '03'}</p><h1>{tab === 'lab' ? 'See your sound.' : tab === 'game' ? 'Find the frequency.' : 'Small experiments. Big discoveries.'}</h1><p className="subtitle">{tab === 'lab' ? 'A closer look at the invisible waves in your voice.' : tab === 'game' ? 'One target tone. Your voice. How close can you get?' : 'Take a curious question and turn it into something you can observe.'}</p></div><div className="heading-symbol" aria-hidden="true">{tab === 'lab' ? <AudioLines/> : tab === 'game' ? <Target/> : <FlaskConical/>}</div></div>
      <div className="session-bar"><div className="session-status"><span className={`status-dot ${status === 'live' ? 'live' : ''}`}/><strong>{status === 'live' ? 'Microphone live' : status === 'requesting' ? 'Awaiting permission' : 'Demo mode'}</strong><span className="session-description">{status === 'live' ? 'Your voice, in real time' : 'Simulated voice signal'}</span></div><div className="session-actions"><span className="private-label"><ShieldCheck size={14}/>Local & private</span>{status === 'demo' ? <button className="primary" onClick={() => void engine.startMic()}><Mic size={16}/>Start Microphone</button> : <button className="stop-button" onClick={() => { pauseGame(); engine.stopMic(); }}><MicOff size={16}/>{status === 'requesting' ? 'Cancel' : 'Stop Microphone'}</button>}</div></div>
      <MicrophoneInput live={status === 'live'} label={engine.inputLabel} onChange={deviceId => { pauseGame(); void engine.startMic(deviceId); }}/>
      {error && <div role="alert" className="error-banner"><CircleHelp size={18}/><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}>Dismiss</button></div>}
      {tab === 'lab' && <>
        <div className="lab-grid">
          <section className="instrument waveform-panel"><PanelHeading icon={<Waves size={17}/>} title="Live waveform" label="TIME DOMAIN"><button className="icon-button" title={frozen ? 'Resume waveform' : 'Freeze waveform'} aria-label={frozen ? 'Resume waveform' : 'Freeze waveform'} onClick={() => setFrozen(!frozen)}>{frozen ? <Play size={15}/> : <Pause size={15}/>}</button></PanelHeading><div className="chart-status"><span className="legend"><i className="mint"/>{status === 'live' ? 'MICROPHONE' : 'SIMULATED SIGNAL'}</span><span>{frozen ? 'FROZEN' : '25 ms window'}</span></div><div className="wave-readings"><div><span>Detected pitch</span><strong className="wave-frequency">{frequency !== null ? frequency.toFixed(1) : '--'}<small> Hz</small></strong></div><div><span>{status === 'live' ? 'Microphone level' : 'Demo level'}</span><strong className="wave-level">{levelDb.toFixed(0)}<small> dBFS</small></strong></div></div><p className={`signal-message ${status === 'live' && frequency === null ? 'needs-signal' : ''}`} role="status">{signalMessage}</p><div className="wave-chart"><span className="axis-vertical">Relative amplitude</span><div className="chart-inner"><Visual kind="wave" frame={frame} paused={frozen}/><div className="axis-labels"><span>0</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25 ms</span></div></div></div><p className="panel-note">A louder voice makes taller waves. A higher pitch fits more cycles into the same time.</p></section>
          <section className="instrument pitch-panel"><PanelHeading icon={<Radio size={17}/>} title="Voice pitch" label="FUNDAMENTAL"/><p className="pitch-state">{pitchSaved ? 'Last clear hum / saved' : 'Detected pitch'}</p><div className="pitch-reading"><span className="big-frequency" data-reading={pitchSaved ? 'saved' : frequency !== null ? 'current' : 'none'}>{shownPitch !== null ? shownPitch.toFixed(1) : '--'}</span><span className="unit">Hz</span></div><div className="pitch-meta"><span className="note-label">{shownPitch !== null ? noteFor(shownPitch) : '--'}</span><span className={`stability ${frequency && frame.stable ? 'stable' : ''}`}><span className="status-dot"/>{!frequency ? 'No clear pitch detected' : frame.stable ? 'Stable pitch' : 'Finding stability'}</span></div><p className="panel-note">Your voice contains many frequencies. This estimates the lowest repeating frequency: the fundamental.</p><div className="level-heading"><span>Microphone level (dBFS)</span><strong>{status === 'live' ? `${levelDb.toFixed(0)} dBFS` : 'DEMO'}</strong></div><div className={frame.clipping ? "level-meter clipping" : "level-meter"} role="meter" aria-label="Microphone level (dBFS)" aria-valuemin={-100} aria-valuemax={0} aria-valuenow={levelDb}><div style={{ width: `${Math.max(0, Math.min(100, (levelDb + 60) / 60 * 100))}%` }}/></div><div className="level-caption"><span>Quiet</span><span>Strong signal</span></div><p className="tiny-note">0 dBFS is the digital maximum; quieter signals are negative. This is not calibrated dB SPL.{frame.clipping && <span role="status" className="clipping-warning">Clipping / near maximum: move farther from the microphone or reduce input gain. Pitch may be unreliable.</span>}</p></section>
          <section className="instrument spectrum-panel"><PanelHeading icon={<Activity size={17}/>} title="Frequency spectrum" label="FREQUENCY DOMAIN"/><div className="chart-status"><span className="legend"><i className="lavender"/>SIGNAL STRENGTH</span><span className="legend"><i className="mint"/>FUNDAMENTAL</span></div><Visual kind="spectrum" frame={frame}/><div className="log-axis">{[65, 200, 500, 1000, 2000, 8000].map(hz => <span key={hz} style={{ left: `${Math.log(hz / 65) / Math.log(8000 / 65) * 100}%` }}>{hz >= 1000 ? `${hz / 1000}k` : hz}{hz === 8000 ? ' Hz' : ''}</span>)}</div><p className="panel-note">Harmonics repeat at 2f, 3f, 4f... Their strengths give your voice its character. The axis is logarithmic.</p></section>
          <section className="instrument spectrogram-panel"><PanelHeading icon={<AudioLines size={17}/>} title="Spectrogram" label="SOUND OVER TIME"><button className="icon-button" title={spectroPaused ? 'Resume spectrogram' : 'Pause spectrogram'} aria-label={spectroPaused ? 'Resume spectrogram' : 'Pause spectrogram'} onClick={() => setSpectroPaused(!spectroPaused)}>{spectroPaused ? <Play size={15}/> : <Pause size={15}/>}</button><button className="icon-button" title="Clear spectrogram" aria-label="Clear spectrogram" onClick={() => setClear(value => value + 1)}><Trash2 size={15}/></button></PanelHeading><div className="spectrogram-layout"><div className="frequency-ticks">{[8000, 2000, 500, 65].map(hz => <span key={hz} style={{ top: `${(1 - Math.log(hz / 65) / Math.log(8000 / 65)) * 100}%` }}>{hz >= 1000 ? `${hz / 1000}k` : hz}{hz === 65 ? ' Hz' : ''}</span>)}</div><Visual kind="spectrogram" frame={frame} paused={spectroPaused} clear={clear}/></div><div className="spectrogram-footer"><span>Earlier <span aria-hidden="true">&rarr;</span> Now</span><span className="intensity-legend">Quiet <i/> Strong</span></div><p className="panel-note">Frequency runs vertically. Brighter colors mean a stronger signal. A steady hum draws horizontal bands.</p></section>
        </div>
        <section className="physics-strip"><div className="physics-intro"><span className="eyebrow">THE PHYSICS, LIVE</span><h2>One sound. <br/>Three measurements.</h2><span className="source-tag">{status === 'live' ? 'MICROPHONE PITCH' : 'DEMO PITCH'}</span></div><div className="physics-item"><span>Frequency <b>f</b></span><strong>{frequency ? frequency.toFixed(1) : '--'}<small>Hz</small></strong><p>Cycles per second</p></div><div className="physics-item"><span>Period <b>T = 1/f</b></span><strong>{physics ? physics.periodMs.toFixed(2) : '--'}<small>ms</small></strong><p>Time for one cycle</p></div><div className="physics-item"><span>Wavelength <b>&lambda; = v/f</b></span><strong>{physics ? physics.wavelength.toFixed(2) : '--'}<small>m</small></strong><p>Distance for one cycle</p></div><div className="physics-footnote"><span>Sound speed: 343 m/s in air at about 20 &deg;C.</span><span>Example: 200 Hz &rarr; 5 ms &rarr; 1.72 m</span></div></section>
        <section className="generator-section"><div className="section-intro"><p className="eyebrow">MAKE SOME WAVES</p><h2>Tone generator</h2><p>Same frequency, different character. Explore how a wave's shape changes its timbre.</p><span className="small-tag"><Headphones size={14}/>Start with a low volume</span></div><div className="generator-controls"><div className="control-heading"><label htmlFor="tone-frequency">Generated frequency</label><div className="numeric-input"><NumberInput id="tone-frequency" value={toneFrequency} min={80} max={2000} onValue={setToneFrequency}/><span>Hz</span></div></div><input aria-label="Generated frequency slider" className="frequency-slider" type="range" min="80" max="2000" value={toneFrequency} onChange={event => setToneFrequency(Number(event.target.value))}/><div className="range-labels"><span>80 Hz</span><span>2,000 Hz</span></div><fieldset className="shape-controls"><legend>Waveform</legend>{(['sine', 'square', 'triangle', 'sawtooth'] as OscillatorType[]).map(value => <button key={value} aria-pressed={shape === value} className={shape === value ? 'shape selected' : 'shape'} onClick={() => setShape(value)}>{value}</button>)}</fieldset><div className="generator-bottom"><button className={tonePlaying ? 'stop-button' : 'primary'} onClick={() => void toggleTone()}>{tonePlaying ? <Square size={15}/> : <Play size={15}/>} {tonePlaying ? 'Stop tone' : 'Play tone'}</button><label className="volume-control"><Volume2 size={16}/><input aria-label="Tone volume" type="range" min="0" max="0.15" step="0.005" value={volume} onChange={event => setVolume(Number(event.target.value))}/><span>{Math.round(volume / 0.15 * 100)}%</span></label></div></div><div className="tone-preview"><span className="eyebrow amber">GENERATED WAVE / {shape.toUpperCase()}</span><Visual kind="tone" frame={frame} shape={shape} toneFrequency={toneFrequency}/><p>{shape === 'sine' ? 'A pure tone: just one frequency.' : shape === 'square' ? 'Odd harmonics give this wave its bright, hollow sound.' : shape === 'triangle' ? 'Odd harmonics fade quickly, creating a softer tone.' : 'Both even and odd harmonics create a bright, buzzy tone.'}</p><span className="tiny-note">Generated frequency is separate from detected voice pitch.</span></div></section>
        <button className="experiment-link" onClick={() => switchTab('notes')}><span><FlaskConical size={20}/><strong>A little curiosity goes a long way.</strong><span>Try six classroom experiments</span></span><ChevronRight size={20}/></button>
      </>}
      {tab === 'game' && <><div className="challenge-modes" role="group" aria-label="Challenge mode"><button aria-pressed={gameMode === 'match'} className={gameMode === 'match' ? 'selected' : ''} onClick={() => { pauseGame(); setGameMode('match'); }}><Target size={16}/>Match a note</button><button aria-pressed={gameMode === 'peak'} className={gameMode === 'peak' ? 'selected' : ''} onClick={() => { pauseGame(); setGameMode('peak'); }}><Activity size={16}/>Highest hum</button></div>{gameMode === 'peak' ? <HumChallenge frame={frame} live={status === 'live'} record={humRecord}/> : <div className="game-layout"><section className="game-main"><div className="game-topline"><span className="eyebrow">ROUND {round} / 5</span><span className="score">{points}<small> / 500 POINTS</small></span></div><div className="target-pitch"><span>TARGET FREQUENCY</span><strong>{target}<small> Hz</small></strong><span>{noteFor(target)}</span></div><div className="match-line"><span>{status === 'live' && frequency ? 'Your voice now' : 'Last hum / saved'}</span><strong>{status === 'live' && frequency ? `${frequency.toFixed(1)} Hz` : humRecord.last !== null ? `${humRecord.last.toFixed(1)} Hz` : '-- Hz'}</strong></div><p className="hum-status">{status !== 'live' ? 'Start the microphone to measure' : frame.clipping ? 'Input near clipping: reduce gain or move farther away' : frequency === null ? `No clear pitch detected / ${levelDb.toFixed(0)} dBFS` : 'Live microphone pitch'}</p><div className="tuning-scale"><span>Lower</span><div><i className="match-zone"/><i className="tuning-needle" style={{ left: `${50 + Math.max(-48, Math.min(48, (cents ?? 0) / 4))}%`, opacity: phase === 'listening' && cents !== null ? 1 : 0.3 }}/></div><span>Higher</span></div><h2 className={phase === 'won' || phase === 'complete' || (phase === 'listening' && cents !== null && Math.abs(cents) <= 25) ? 'match-success' : ''} aria-live="polite">{feedback}</h2><p className="cents-reading">{phase === 'listening' && cents !== null ? `${cents > 0 ? '+' : ''}${Math.round(cents)} cents from target` : phase === 'won' || phase === 'complete' ? `+${lastAward} points this round` : 'Hold within 25 cents for 1.2 seconds'}</p><div className="hold-meter" role="progressbar" aria-label="Stable match duration" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hold * 100)}><div style={{ width: `${hold * 100}%` }}/></div><div className="game-actions">{phase === 'complete' ? <button className="primary" onClick={resetGame}><RotateCcw size={16}/>Play again</button> : <button className="primary" disabled={status !== 'live' || busy} onClick={() => void playTarget(phase === 'won' ? round + 1 : round, phase === 'listening')}><Play size={16}/>{phase === 'won' ? 'Next round' : phase === 'listening' ? 'Replay target' : busy ? 'Playing target...' : 'Play target'}</button>}<button className="icon-button" title="Restart game" aria-label="Restart game" onClick={resetGame}><RotateCcw size={17}/></button></div>{status !== 'live' && <p className="game-hint">Start your microphone to play. Demo signals do not earn points.</p>}</section><aside className="game-aside"><span className="eyebrow">YOUR COMFORT ZONE</span><h2>Set your voice range</h2><p>Pick notes you can hum comfortably. Your range can be different from someone else's.</p><div className="range-inputs"><label>Lowest<NumberInput label="Lowest target frequency" min={80} max={range.max - 20} value={range.min} disabled={phase !== 'idle'} onValue={min => setRange(value => ({ ...value, min }))}/><span>Hz</span></label><label>Highest<NumberInput label="Highest target frequency" min={range.min + 20} max={800} value={range.max} disabled={phase !== 'idle'} onValue={max => setRange(value => ({ ...value, max }))}/><span>Hz</span></label></div><div className="game-explanation"><Target size={24}/><h3>A match is more than a moment.</h3><p>Listen, then hum after the tone stops. Keep your pitch stable for 1.2 seconds to complete a round.</p><p>A cent measures musical pitch difference. 100 cents is one semitone. Closer matches earn up to 100 points.</p><p className="tiny-note">Listening starts 550 ms after playback stops. Headphones help prevent room echoes from affecting the reading.</p></div></aside></div>}</>}
      {tab === 'notes' && <><div className="notes-heading"><h2>Six ways to explore sound</h2><span>OBSERVE / COMPARE / DISCOVER</span></div><div className="experiment-grid">{experiments.map(([title, description, tag], i) => <article key={title} className="experiment"><div className="experiment-top"><span className="experiment-number">0{i + 1}</span><span className="eyebrow">{tag}</span></div><h3>{title}</h3><p>{description}</p><button onClick={() => switchTab(i === 5 ? 'game' : 'lab')}>{i === 5 ? 'Match pitch' : 'Open the lab'}<ChevronRight size={15}/></button></article>)}</div><section className="concepts-section"><div className="section-intro"><p className="eyebrow">THE SOUND DICTIONARY</p><h2>Words behind <br/>the waves.</h2><p>Six ideas that connect what you hear to what you see.</p></div><dl>{concepts.map(([name, description]) => <div key={name}><dt>{name}</dt><dd>{description}</dd></div>)}</dl></section><div className="worked-example"><FlaskConical size={24}/><div><h3>Follow a 200 Hz sound wave</h3><p>200 cycles each second means T = 1 / 200 = 0.005 s, or 5 ms per cycle. In air at about 20 &deg;C, wavelength = 343 / 200 = 1.715 m, or about 1.72 m.</p></div></div></>}
      <footer><span><AudioLines size={16}/>VOICE LAB <span className="footer-divider">/</span> A little science in every sound.</span><span><ShieldCheck size={14}/>No recording. No uploads. Just physics.</span></footer>
      <p className="browser-note">Microphone access requires HTTPS or localhost. Audio is processed only in this browser. Devices may still process audio even when echo cancellation, noise suppression, and automatic gain are requested off.{window.self !== window.top && <> This preview may block microphone access. <a href={window.location.href} target="_blank" rel="noopener noreferrer">Open directly in a browser tab</a>.</>}</p>
    </main>
  </div>;
}

function PanelHeading({ icon, title, label, children }: { icon: React.ReactNode; title: string; label: string; children?: React.ReactNode }) {
  return <div className="panel-heading"><h2>{icon}{title}</h2><span>{label}</span><div className="panel-tools">{children}</div></div>;
}

function NumberInput({ value, min, max, onValue, label, id, disabled }: { value: number; min: number; max: number; onValue: (value: number) => void; label?: string; id?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const parsed = Number(draft);
    const next = draft.trim() && Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : value;
    setDraft(String(next)); onValue(next);
  }
  return <input id={id} aria-label={label} type="number" min={min} max={max} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>;
}
