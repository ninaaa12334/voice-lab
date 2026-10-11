import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Target, Trash2, Trophy } from 'lucide-react';
import type { Frame } from './audio';
import { digitalLevel, HumPeakTracker, noteFor } from './physics';

const RECORD_KEY = 'voice-lab.hum-best.v1';
function readBest() {
  try { const value = Number(localStorage.getItem(RECORD_KEY)); return Number.isFinite(value) && value >= 55 && value <= 1400 ? value : 0; }
  catch { return 0; }
}
export function useHumRecord(frame: Frame, eligible: boolean) {
  const tracker = useRef(new HumPeakTracker());
  const [last, setLast] = useState<number | null>(null);
  const [sessionBest, setSessionBest] = useState(0);
  const [best, setBest] = useState(readBest);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const frequency = eligible && !frame.clipping ? frame.frequency : null;
    if (frequency !== null) setLast(frequency);
    const result = tracker.current.update(frequency, frame.stable, frame.time);
    setProgress(result.progress);
    if (result.peak !== null) { setSessionBest(value => Math.max(value, result.peak!)); setBest(value => Math.max(value, result.peak!)); }
  }, [eligible, frame.frequency, frame.stable, frame.time, frame.clipping]);
  useEffect(() => { try { best ? localStorage.setItem(RECORD_KEY, String(best)) : localStorage.removeItem(RECORD_KEY); } catch { /* Scores still work when browser storage is unavailable. */ } }, [best]);
  function restart() { tracker.current.reset(); setLast(null); setSessionBest(0); setProgress(0); }
  function clearBest() { restart(); setBest(0); }
  return { last, sessionBest, best, progress, restart, clearBest };
}
export function HumChallenge({ frame, live, record }: { frame: Frame; live: boolean; record: ReturnType<typeof useHumRecord> }) {
  const [goal, setGoal] = useState(440);
  const [goalDraft, setGoalDraft] = useState('440');
  const current = live && !frame.clipping ? frame.frequency : null;
  const shown = current ?? record.last;
  const reached = record.sessionBest >= goal;
  function setTarget(value: number) { setGoal(value); setGoalDraft(String(value)); }
  return <div className="game-layout hum-layout"><section className="game-main">
    <div className="game-topline"><span className="eyebrow">HIGHEST SUSTAINED HUM</span><Trophy size={20} className="hum-trophy"/></div>
    <div className="target-pitch hum-current"><span>{current !== null ? 'YOUR HUM NOW' : record.last !== null ? 'LAST DETECTED HUM / SAVED' : 'YOUR HUM'}</span><strong>{shown === null ? '--' : shown.toFixed(1)}<small> Hz</small></strong><span>{shown !== null ? noteFor(shown) : 'Waiting for a clear hum'}</span></div>
    <div className="hum-records"><div><span>SESSION MAXIMUM</span><strong className="session-peak">{record.sessionBest ? record.sessionBest.toFixed(1) : '--'}<small> Hz</small></strong></div><div><span>PERSONAL BEST</span><strong className="best-peak">{record.best ? record.best.toFixed(1) : '--'}<small> Hz</small></strong></div></div>
    <h2 className={reached ? 'match-success' : ''} aria-live="polite">{!live ? 'Your scores are saved' : frame.clipping ? 'Input is too strong' : reached ? 'Goal reached!' : current === null ? 'Waiting for your next hum' : frame.stable ? 'Hold that note' : 'Finding a steady pitch'}</h2>
    <p className="cents-reading">{reached ? `You reached your ${goal} Hz goal` : `Challenge goal: ${goal} Hz`}</p>
    <div className="hold-meter" role="progressbar" aria-label="Sustained hum verification" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(record.progress * 100)}><div style={{ width: `${record.progress * 100}%` }}/></div>
    <p className="hum-status">{live ? `${digitalLevel(frame.level).toFixed(0)} dBFS / ${current === null ? 'No clear pitch detected; saved results remain visible' : 'Live microphone reading'}` : 'Start your microphone to measure. Demo data never scores.'}</p>
    <div className="game-actions"><button onClick={record.restart}><RotateCcw size={16}/>New attempt</button></div>
  </section><aside className="game-aside"><span className="eyebrow">BEAT YOUR BEST</span><h2>How high can you hum?</h2><p>Your score is the highest reliable frequency held steady for half a second after the pitch settles. Short spikes and clipped input do not count.</p><label className="hum-goal-label" htmlFor="hum-goal">Goal frequency<div className="hum-goal-input"><input id="hum-goal" type="number" min="55" max="1400" value={goalDraft} onChange={event => setGoalDraft(event.target.value)} onBlur={() => setTarget(Math.round(Math.max(55, Math.min(1400, Number(goalDraft) || goal))))} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/><span>Hz</span></div></label><button className="primary" onClick={() => setTarget(record.best ? Math.min(1400, Math.ceil(record.best * 2 ** (1 / 12))) : 440)}><Target size={16}/>Beat my best</button><div className="game-explanation"><Trophy size={24}/><h3>Your result stays put.</h3><p>Current Hz becomes a labeled saved reading when you pause. Session maximum stays until New attempt; personal best stays after a reload on this browser.</p><p>Hum comfortably and raise the pitch gradually. Higher Hz means higher pitch, not louder sound. The detector measures 55-1400 Hz; this is its range, not a limit for every human voice.</p><button className="clear-best-button" onClick={record.clearBest}><Trash2 size={14}/>Clear saved best</button></div></aside></div>;
}
