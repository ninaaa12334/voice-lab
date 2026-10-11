# Voice Lab - See Your Sound

A school physics project built with React, TypeScript, Vite, and the browser Web Audio API. No backend or accounts. Microphone samples stay in memory in your browser and are never recorded or uploaded.

## Run locally

Install Node.js 20.19+ or 22.12+, then run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`. Microphone access requires localhost or HTTPS; opening the app over plain HTTP on a LAN IP will not work. For hosting, publish the `dist` folder on an HTTPS static host.

```sh
npm test
npm run build
npm run preview
```

## Explore

- The app starts in **Demo mode**, showing a simulated 220 Hz voice with harmonics. The demo spectrum is an illustrative synthesized spectrum, not a microphone FFT. Every microphone reading and calculation is labeled as demo until you start the microphone.
- Click **Start Microphone**, grant permission, and hum a steady note. Humming or singing works better than consonants or ordinary speech. Stop Microphone releases the device. Permission-denied, missing-device, unsupported-browser, and insecure-origin messages are handled.
- Freeze the waveform, inspect the spectrum's fundamental and harmonic markers, and pause or clear the scrolling spectrogram. These controls pause only their display, not pitch analysis.
- The tone generator plays 80-2000 Hz sine, square, triangle, or sawtooth waves. Start at low volume. Its generated frequency is separate from your voice pitch.
- In **Match pitch**, start the microphone, adjust your comfortable range, then play a target. Playback lasts 1.1 seconds. The app waits another 550 ms before scoring. Hold within 25 cents of the target for 1.2 seconds with a stable pitch to win. Five rounds, up to 100 points each. Headphones reduce echoes. Changing views or restarting cancels playback and listening. Demo signals cannot score.
- **Field notes** includes six experiments and a simple sound dictionary.

## Physics

Frequency is cycles per second (Hz). Period is the time for one cycle: `T = 1/f`. Wavelength is the distance for one cycle: `wavelength = v/f`. We assume a sound speed of `343 m/s`, approximately air at 20 degrees Celsius. At 200 Hz, period is 5 ms and wavelength is about 1.72 m. Values become placeholders if pitch is unclear.

Pitch usually follows the fundamental frequency. Harmonics are its whole-number multiples. Their relative strengths change timbre. Wave amplitude is a relative microphone signal, affected by distance, hardware, and gain. RMS is converted to digital decibels using `20 * log10(RMS)` and displayed as **dBFS**, never calibrated dB SPL.

One semitone is 100 cents. Pitch difference is `1200 * log2(detected / target)`. A completed round awards `100 - 2 * abs(cents)`, rounded, where the final stable reading must be within 25 cents.

## Test with your own microphone

1. In PowerShell, run `cd C:\xampp\htdocs\wordpress\wp-content\themes\dem-tech\voice-lab`, then `npm.cmd install` if dependencies are missing, and `npm.cmd run dev -- --port 5174`.
2. Open `http://127.0.0.1:5174/` directly in a browser tab. An embedded preview may block microphone access even when the same address works directly. If Vite reports another port, use the address it prints.
3. Click **Start Microphone**, choose your input device if prompted, and click **Allow**. The session bar must say **Microphone live**. If denied, open the browser's site permissions beside the address, allow microphone access, and click Start again. Also check your operating system's microphone privacy settings if access remains blocked.
4. Hum a comfortable note for two seconds. The waveform, spectrum, and spectrogram should respond, pitch should settle, and the period and wavelength should follow it. Hum higher: Hz increases and period decreases.
5. Keep the same note and hum louder. The RMS/dBFS level and waveform amplitude should increase without a large frequency change. Move farther away if the clipping warning appears. Silence should show **No clear pitch detected** and placeholder physics values.
6. Click **Stop Microphone**. The tracks stop, microphone nodes disconnect, and the session returns to labeled demo data. The shared AudioContext remains reusable for generated tones until the page unmounts, when it closes.

**Microphone level (dBFS)** is `20 * log10(RMS)`, floored at -100 dBFS. Zero dBFS is the digital maximum; quieter signals are negative. A peak at or above 0.98 full scale triggers a near-clipping warning, briefly held for visibility, and that analysis window's pitch is rejected. This measurement is not calibrated environmental sound pressure or dB SPL. The microphone never connects to speaker output.

The app requests echo cancellation, noise suppression, and automatic gain control off for constraints the browser supports. Microphones, operating systems, or browsers may still process the signal. Headphones and a quiet room improve testing.

The live waveform shows detected Hz and microphone dBFS directly above the chart. If input remains at -100 dBFS, no usable signal is reaching the app: select the correct device in **Microphone input**, check hardware mute and operating-system input settings, or use **Reconnect microphone**. A quiet signal and a strong but nonperiodic signal have different status messages. The pitch card retains your last clear hum with an explicit **saved** label; the waveform's current pitch and physics calculations still become placeholders when no reliable live pitch exists. dBFS remains available even without a detectable pitch.

## How it works

- `src/physics.ts`: Pitchy's McLeod pitch detector, clarity, silence, and clipping gates, median smoothing, pitch stability, physics formulas, and sustained-match timing. McLeod uses the waveform's periodicity, so the largest FFT peak does not define the pitch. Pitch is accepted between 55 and 1400 Hz with at least 0.90 clarity and RMS at least 0.003, and rejected for peaks at or above 0.98. This lower input floor supports quiet periodic humming while silence and noise are still rejected.
- `src/audio.ts`: One reusable AudioContext, microphone lifecycle, oscillator ramps, and sample-rate-aware analysis. Analysis runs about 15 times a second with 4096-sample buffers. An AnalyserNode performs the live FFT. The microphone is never connected to speakers. Device processing is requested off, though browsers and hardware may override it.
- `src/Visual.tsx`: Canvas waveform, logarithmic spectrum, logarithmic spectrogram, and generated-wave preview. The waveform shows 25 ms; the spectrum and spectrogram show 65-8000 Hz. Spectrogram time advances by three pixels per analyzed frame, so its visible history depends on display width.
- `src/App.tsx`: UI, tone controls, classroom content, and the five-round game.
- `src/styles.css`: Responsive lab layout and visual theme. Google Fonts are optional; local font fallbacks work offline. Only the font stylesheet contacts an external service, never audio data.

## Validation

Automated unit checks cover 80, 130, 220, 330, 440, and 880 Hz at both 44100 and 48000 samples/s, a 220 Hz tone whose second harmonic is stronger, silence, quiet signals, deterministic noise, note labels, physics calculations, smoothing reset, continuous match duration, microphone cleanup, and a late permission result after cancellation.

Additional checks cover loud-versus-quiet pitch invariance, dBFS and clipping rejection, and cleanup after audio-node setup failure. The browser suite changes live synthetic microphone input from 220 to 330 Hz, increases amplitude without changing pitch, checks clipping, checks silent pitch/physics placeholders and the -100 dBFS floor, and then plays all five game rounds. Synthetic input passes through real browser MediaStreamAudioSourceNode and AnalyserNode processing.

## Highest hum challenge

Open **Match pitch**, choose **Highest hum**, and start the microphone. Hum a comfortable note, then raise it gradually. Current Hz is separate from your score: a score is the median pitch over a steady half-second hold after pitch stability is established. A gap, unstable pitch, clipping, or a jump greater than 35 cents resets the hold. Brief octave spikes cannot become a maximum.

The last detected hum stays visible during pauses with a **saved** label. Session maximum stays when you stop the microphone; **New attempt** clears only the current attempt. Personal best is stored in this browser's local storage and survives reloads. **Clear saved best** removes it. No names, audio, or scores are uploaded. Storage-disabled browsers retain results only until reload. The existing matching game's points also remain when you stop the microphone; only its Restart or Play again control resets them.

Set a goal in Hz or use **Beat my best** for a target one semitone above your saved record, capped at the detector's 1400 Hz upper bound. Hum comfortably; higher pitch is not the same as louder input. The 55-1400 Hz range is a detector range, not a claimed maximum for human voices. Demo signals and generated target playback do not create records.

Real microphone permission prompts, microphone hardware on different browsers, voice tracking in your room, speaker echoes, listening volume, and mobile Safari audio activation still need a person to test. The 550 ms wait reduces direct playback leakage but cannot identify a voice versus a persistent external sound; use headphones for the game.

Browser checks run in installed Microsoft Edge using Playwright. Start the dev server with `npm run dev -- --port 5174`, then run `npm run test:browser`. These check canvas pixels, pause/freeze/clear, tone controls, a synthetic 220 Hz microphone, all five game rounds, scoring only after playback, restart, permission denial, microphone stop, and layouts at 390 and 320 pixels. Screenshots are saved under the ignored `.local` folder. Use `VOICE_LAB_URL` to test a different local address. The browser checks do not replace a real microphone test.
