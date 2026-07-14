// ── Procedural spatial audio (Web Audio, no asset files) ─────────
//
// Every sound is synthesized: oscillator sweeps for lasers/warp, filtered
// noise bursts for explosions and impacts. Each one-shot goes through a
// StereoPanner whose pan/volume the caller derives from the 3D position, so
// combat reads spatially (an enemy exploding on your left sounds left).
// The AudioContext is created lazily on the first user gesture, which is
// required by browser autoplay policies.
let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);
  // 1s of cached white noise, reused by every impact/explosion
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

export function unlock() {
  if (ensure() && ctx.state === 'suspended') ctx.resume();
}

const ready = () => ctx && ctx.state === 'running';

function out(pan, vol, t0, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(master); }
  else g.connect(master);
  return g;
}

export function laser(pan = 0, ours = true) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = ours ? 'sawtooth' : 'square';
  const f0 = ours ? 1100 : 620;
  o.frequency.setValueAtTime(f0 * (0.94 + Math.random() * 0.12), t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.18, t + 0.13);
  o.connect(out(pan, ours ? 0.12 : 0.15, t, 0.15));
  o.start(t); o.stop(t + 0.16);
}

export function explosion(pan = 0, big = 1) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.5 + Math.random() * 0.3;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900 * big, t);
  f.frequency.exponentialRampToValueAtTime(70, t + 0.5 * big);
  src.connect(f);
  f.connect(out(pan, Math.min(0.5, 0.3 * big), t, 0.55 * big));
  src.start(t); src.stop(t + 0.6 * big);
}

export function hit(pan = 0) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  o.connect(out(pan, 0.2, t, 0.14));
  o.start(t); o.stop(t + 0.15);
}

export function warp() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(1400, t + 0.45);
  o.connect(out(0, 0.16, t, 0.55));
  o.start(t); o.stop(t + 0.6);
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(80, t);
  o2.frequency.exponentialRampToValueAtTime(700, t + 0.5);
  o2.connect(out(0, 0.1, t, 0.6));
  o2.start(t); o2.stop(t + 0.65);
}
