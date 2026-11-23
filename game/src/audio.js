// Sound: WebAudio effects (engine hum, gunshots, sirens, cash) and three
// procedural radio stations — no audio files, everything is synthesised.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let station = 0;
  let muted = false;
  let engineOsc = null, engineGain = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch { return false; }
    return true;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.25, low = 400) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = low;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(t);
  }

  const STATIONS = [
    { name: 'Bay FM — Sunset Pop', bpm: 112, scale: [0, 2, 4, 7, 9], root: 220, wave: 'triangle' },
    { name: 'Static 88 — Synthwave', bpm: 96, scale: [0, 3, 5, 7, 10], root: 164.8, wave: 'sawtooth' },
    { name: 'Harbour Talk', bpm: 0, scale: [0], root: 110, wave: 'sine' },
  ];

  function playNote(freq, dur, wave, vol) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur);
  }

  let beat = 0;
  function musicStep() {
    if (!ctx || muted) return;
    const st = STATIONS[station];
    if (st.bpm === 0) { // talk station: soft blips
      if (beat % 4 === 0) tone(180 + Math.random() * 120, 0.08, 'sine', 0.05);
      beat++;
      return;
    }
    const stepDur = 60 / st.bpm / 2;
    const degree = st.scale[beat % st.scale.length];
    const octave = beat % 16 >= 8 ? 2 : 1;
    const freq = st.root * Math.pow(2, degree / 12) * octave;
    playNote(freq, stepDur * 0.9, st.wave, station === 1 ? 0.06 : 0.09);
    if (beat % 4 === 0) playNote(st.root / 2, stepDur * 1.8, 'sine', 0.12);
    if (beat % 8 === 6) noise(0.05, 0.05, 3000); // hi-hat tick
    beat++;
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    setStation(i) {
      station = i % STATIONS.length;
      beat = 0;
      if (musicTimer) clearInterval(musicTimer);
      const st = STATIONS[station];
      if (st.bpm > 0) musicTimer = setInterval(musicStep, (60 / st.bpm / 2) * 1000);
      else musicTimer = setInterval(musicStep, 500);
    },
    stationName() { return STATIONS[station].name; },
    shoot(kind) {
      if (kind === 'smg') noise(0.08, 0.3, 1800);
      else if (kind === 'shotgun') noise(0.22, 0.5, 900);
      else noise(0.12, 0.35, 1400);
    },
    punch() { noise(0.07, 0.25, 600); tone(120, 0.08, 'sine', 0.2, 60); },
    crash() { noise(0.3, 0.5, 500); },
    siren() { tone(700, 0.4, 'sine', 0.06, 950); },
    cash() { tone(880, 0.1, 'sine', 0.15); setTimeout(() => tone(1320, 0.14, 'sine', 0.15), 90); },
    mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.16), i * 110)); },
    engine(speed, on) {
      if (!ensure()) return;
      if (!on) {
        if (engineOsc) { engineOsc.stop(); engineOsc = null; }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.03;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 500;
        engineOsc.connect(filter); filter.connect(engineGain); engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + Math.abs(speed) * 2.4;
      engineGain.gain.value = 0.02 + Math.abs(speed) * 0.0009;
    },
  };
}
