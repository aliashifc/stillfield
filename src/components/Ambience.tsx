import { useEffect, useRef, useState } from 'react';

/*
  Entry gate + ambient sound, in one component so a single AudioContext owns
  the brown noise. On load the gate covers the screen ("Enter the field");
  choosing to enter fades it away to reveal the dome, and — for the sound
  path — starts the brown-noise wash on that same click (the user gesture
  browsers require to begin audio). The topbar [data-sound] toggle, rendered
  server-side and hidden until JS, is revealed and wired to the same audio,
  so it stays in sync however you entered. No-JS visitors never see the gate
  (it is client-rendered) and land on the dome directly.
*/

const LEVEL = 0.10; // gentle resting volume (heavy low-pass makes it quieter)

type Phase = 'open' | 'closing' | 'gone';

export default function Ambience() {
  const [phase, setPhase] = useState<Phase>('open');
  const [soundOn, setSoundOn] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const soundOnRef = useRef(false);

  const fadeTo = (value: number, secs: number) => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(value, now + secs);
  };

  const build = () => {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();

    // 12-second loop of soft brown noise. A leaky-integrated random walk
    // gives the deep -6 dB/oct brown tilt; a low integrator corner makes it
    // extra low-heavy — the deep, rumbling "distant waterfall" that's found
    // most calming. The long buffer keeps the loop imperceptible.
    const length = ctx.sampleRate * 12;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.022 * white) / 1.022;
      data[i] = last * 3.4;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    // Trim inaudible sub-rumble, then roll the highs off hard so only the
    // deep, soothing low end remains — no hiss. Three cascaded low-passes
    // (≈ -18 dB/oct) sitting low, for a soft, enveloping wash.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 95;
    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.frequency.value = 300;
    lp1.Q.value = 0.5;
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 480;
    lp2.Q.value = 0.4;
    const lp3 = ctx.createBiquadFilter();
    lp3.type = 'lowpass';
    lp3.frequency.value = 760;
    lp3.Q.value = 0.3;

    // a very slow, shallow "tide": drift the cutoff so the wash gently
    // swells and recedes like calm breathing — ~50 s per cycle, subtle
    // enough that it never pulls focus.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.02; // ~50s per cycle
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 70;
    lfo.connect(lfoDepth).connect(lp1.frequency);
    lfo.start();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(hp).connect(lp1).connect(lp2).connect(lp3).connect(gain).connect(ctx.destination);
    src.start();
    ctxRef.current = ctx;
    gainRef.current = gain;
  };

  const startSound = () => {
    if (!ctxRef.current) build();
    else ctxRef.current.resume();
    fadeTo(LEVEL, 1.8);
    soundOnRef.current = true;
    setSoundOn(true);
  };

  const stopSound = () => {
    fadeTo(0, 0.6);
    soundOnRef.current = false;
    setSoundOn(false);
  };

  const toggleSound = () => {
    if (soundOnRef.current) stopSound();
    else startSound();
  };

  // step inside: ignite the dome (the lamp kindles from black on this signal),
  // reveal the room, and start the wash if entering with sound
  const enter = (withSound: boolean) => {
    if (withSound) startSound();
    window.dispatchEvent(new Event('stillfield:enter'));
    setPhase('closing');
    window.setTimeout(() => setPhase('gone'), 700);
  };


  // reveal + wire the topbar sound toggle (static markup, hidden until JS)
  useEffect(() => {
    const btn = document.querySelector<HTMLButtonElement>('[data-sound]');
    if (!btn) return;
    btn.removeAttribute('hidden');
    const handler = () => toggleSound();
    btn.addEventListener('click', handler);
    return () => btn.removeEventListener('click', handler);
  }, []);

  // reflect sound state on the toggle (icon swap + a11y)
  useEffect(() => {
    const btn = document.querySelector<HTMLButtonElement>('[data-sound]');
    if (!btn) return;
    btn.classList.toggle('is-on', soundOn);
    btn.setAttribute('aria-pressed', String(soundOn));
  }, [soundOn]);

  // ?lit (OG/screenshot renders): skip the gate so the lit room shows directly
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('lit')) setPhase('gone');
  }, []);

  if (phase === 'gone') return null;

  return (
    <div className={`gate${phase === 'closing' ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Enter Stillfield">
      <div className="gate-inner">
        <span className="gate-word">STILLFIELD</span>
        <p className="gate-hint">Find somewhere quiet. Best heard with sound.</p>
        <button className="gate-enter" type="button" autoFocus onClick={() => enter(true)}>
          Enter the field
        </button>
        <button className="gate-silent" type="button" onClick={() => enter(false)}>
          Enter in silence
        </button>
      </div>
    </div>
  );
}
