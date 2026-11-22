// Sound, synthesized live with WebAudio — no audio files, no network.
// Effects: engine hum, siren, gunshots, crashes, pickups, UI clicks.
// Radio: three procedural stations that loop a bass + lead pattern, switched
// with C. Everything is created lazily on the first user gesture.

const STATIONS = [
  { name: 'NEON 88 — SYNTHWAVE', bpm: 96, root: 45, minor: true, wave: 'sawtooth', lead: true },
  { name: 'SOL 101 — LATIN GROOVE', bpm: 112, root: 43, minor: false, wave: 'triangle', lead: true },
  { name: 'BAY FM — CHILL', bpm: 72, root: 48, minor: true, wave: 'sine', lead: false },
];

const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    station: 0,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    nextNoteTime: 0,
    step: 0,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      this.engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: a sine that wails between two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.step = 0;
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
    },

    setStation(i) {
      this.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
      this.step = 0;
      return STATIONS[this.station].name;
    },

    stationName() {
      return STATIONS[this.station].name;
    },

    blip(freq, dur, type, vol) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type ?? 'square';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol ?? 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    noise(dur, vol, filterFreq) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq ?? 1200;
      const g = this.ctx.createGain();
      g.gain.value = vol ?? 0.2;
      src.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      src.start(t);
    },

    gunshot() {
      this.noise(0.12, 0.3, 2600);
      this.blip(160, 0.08, 'square', 0.1);
    },

    crash() { this.noise(0.3, 0.35, 500); },

    pickup() {
      this.blip(660, 0.09, 'sine', 0.16);
      this.blip(990, 0.12, 'sine', 0.14);
    },

    click() { this.blip(520, 0.05, 'square', 0.08); },

    mission() {
      this.blip(523, 0.12, 'sine', 0.16);
      setTimeout(() => this.blip(659, 0.12, 'sine', 0.16), 120);
      setTimeout(() => this.blip(784, 0.2, 'sine', 0.18), 240);
    },

    siren(on) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (on) {
        this.sirenGain.gain.setTargetAtTime(0.035, t, 0.2);
        this.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(t * 3.2) * 220, t, 0.05);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, t, 0.2);
      }
    },

    engine(speed, driving) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const target = driving ? 0.05 + Math.abs(speed) / 9000 : 0;
      this.engineGain.gain.setTargetAtTime(target, t, 0.08);
      this.engineOsc.frequency.setTargetAtTime(46 + Math.abs(speed) * 0.22, t, 0.08);
    },

    /** Schedule the radio's next notes; call every frame. */
    radioTick() {
      if (!this.ctx || this.muted) return;
      const st = STATIONS[this.station];
      const stepDur = 60 / st.bpm / 2; // eighth notes
      while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
        const s = this.step;
        const scale = st.minor ? MINOR_STEPS : MAJOR_STEPS;
        const t = this.nextNoteTime;
        // Bass on beats 0 and 4 of each 8-step bar, root or fifth.
        if (s % 8 === 0 || s % 8 === 4) {
          const note = st.root + (s % 16 === 4 ? 7 : 0);
          this.noteAt(midiToFreq(note - 12), t, stepDur * 1.8, 'triangle', 0.16);
        }
        // Lead arpeggio.
        if (st.lead && s % 2 === 0) {
          const idx = [0, 2, 4, 6, 4, 2][(s / 2) % 6];
          const note = st.root + 12 + scale[idx % scale.length] + 12 * Math.floor(idx / scale.length);
          this.noteAt(midiToFreq(note), t, stepDur * 0.9, st.wave, 0.055);
        }
        // Hat tick.
        if (s % 2 === 1) this.hatAt(t);
        this.nextNoteTime += stepDur;
        this.step += 1;
      }
    },

    noteAt(freq, t, dur, type, vol) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    hatAt(t) {
      const len = Math.floor(this.ctx.sampleRate * 0.03);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const g = this.ctx.createGain();
      g.gain.value = 0.05;
      src.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      src.start(t);
    },
  };
  return audio;
}
