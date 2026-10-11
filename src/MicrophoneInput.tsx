import { useEffect, useState } from 'react';
import { Mic, RotateCcw } from 'lucide-react';

export function MicrophoneInput({ live, label, onChange }: { live: boolean; label: string; onChange: (deviceId?: string) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    if (!live) return;
    let active = true;
    async function refresh() {
      try { const devices = await navigator.mediaDevices.enumerateDevices(); if (active) setDevices(devices.filter(device => device.kind === 'audioinput' && device.deviceId)); }
      catch { /* The default input remains usable if device enumeration is unavailable. */ }
    }
    void refresh();
    navigator.mediaDevices.addEventListener?.('devicechange', refresh);
    return () => { active = false; navigator.mediaDevices.removeEventListener?.('devicechange', refresh); };
  }, [live]);
  if (!live) return null;
  return <div className="microphone-input"><label htmlFor="microphone-source"><Mic size={14}/>Microphone input</label><select id="microphone-source" value={selected} onChange={event => { setSelected(event.target.value); onChange(event.target.value || undefined); }}><option value="">System default</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select><span className="input-device-name">{label}</span><button className="icon-button" aria-label="Reconnect microphone" title="Reconnect microphone" onClick={() => onChange(selected || undefined)}><RotateCcw size={14}/></button></div>;
}
