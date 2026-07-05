// CRASH OUT audio: looping "Crash Out" music bed + procedurally synthesized
// fight SFX layered over it via the Web Audio API. No SFX files required.

export class AudioSystem {
  constructor(musicUrl = '/assets/audio/crashout.mp3') {
    this.musicUrl = musicUrl;
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicEl = null;
    this.musicSource = null;
    this.musicGain = null;
    this.muted = false;
    this.started = false;
    this.noiseBuffer = null;
  }

  // Must be called from a user gesture (button click) to satisfy autoplay policy.
  async start() {
    if (this.started) { this.resume(); return; }
    this.started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);

    // pre-baked noise for whooshes/impacts
    const len = this.ctx.sampleRate * 1.0;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // music via <audio> element routed through Web Audio (falls back gracefully)
    this.musicEl = new Audio(this.musicUrl);
    this.musicEl.loop = true;
    this.musicEl.crossOrigin = 'anonymous';
    try {
      this.musicSource = this.ctx.createMediaElementSource(this.musicEl);
      this.musicSource.connect(this.musicGain);
    } catch (_) {
      // if routing fails, just play the element directly
      this.musicEl.volume = 0.55;
    }
    this.playMusic();
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); this.playMusic(); }
  playMusic() { this.musicEl?.play?.().catch(() => {}); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
    if (this.musicEl && !this.musicSource) this.musicEl.muted = m;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---- SFX primitives ----
  _noise(dur, freq, q, gain, type = 'bandpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + dur);
  }

  // ---- named fight sounds ----
  whoosh(kind = 'punch') {
    const f = kind === 'heavy' ? 900 : kind === 'kick' ? 1300 : 1800;
    this._noise(0.16, f, 1.2, kind === 'heavy' ? 0.5 : 0.35, 'bandpass');
  }
  hit(heavy = false) {
    this._tone(heavy ? 90 : 150, heavy ? 0.22 : 0.14, heavy ? 0.9 : 0.6, 'sine', heavy ? 45 : 70);
    this._noise(0.08, heavy ? 1200 : 2400, 0.7, heavy ? 0.6 : 0.4, 'lowpass');
  }
  block() {
    this._noise(0.05, 3600, 3, 0.35, 'bandpass');
    this._tone(520, 0.06, 0.25, 'square', 340);
  }
  jump() { this._tone(320, 0.16, 0.3, 'sine', 620); }
  land() { this._tone(120, 0.12, 0.4, 'sine', 60); this._noise(0.06, 500, 0.6, 0.25, 'lowpass'); }
  ko() {
    this._tone(80, 0.6, 1.0, 'sine', 30);
    this._noise(0.4, 800, 0.6, 0.7, 'lowpass');
    this._tone(220, 0.5, 0.4, 'sawtooth', 55);
  }
  bell() { this._tone(880, 0.5, 0.5, 'triangle'); setTimeout(() => this._tone(1320, 0.6, 0.4, 'triangle'), 90); }
  // Menu UI sounds
  uiBlip() { this._tone(680, 0.05, 0.12, 'square', 900); }
  uiSelect() { this._tone(520, 0.08, 0.22, 'triangle', 800); setTimeout(() => this._tone(1040, 0.1, 0.16, 'sine'), 30); }

  // event bus entry point used by fighters
  event(type, payload = {}) {
    switch (type) {
      case 'whoosh': this.whoosh(payload.kind); break;
      case 'hit': this.hit(payload.heavy); break;
      case 'block': this.block(); break;
      case 'jump': this.jump(); break;
      case 'land': this.land(); break;
      case 'ko': this.ko(); break;
      case 'bell': this.bell(); break;
      default: break;
    }
  }
}
