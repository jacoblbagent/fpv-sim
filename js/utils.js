// Small pure helpers shared across modules.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Move `current` toward `target` by at most `maxDelta` (rate limiter). */
export function approach(current, target, maxDelta) {
  const d = target - current;
  if (d > maxDelta) return current + maxDelta;
  if (d < -maxDelta) return current - maxDelta;
  return target;
}

/** Frame-rate independent smoothing factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Stick expo curve: softens the middle of the stick travel. */
export function expo(v, amount) {
  return v * (1 - amount) + v * v * v * amount;
}

/** Apply deadzone + expo to a raw -1..1 axis value. */
export function shapeAxis(raw, deadzone = 0.02, expoAmt = 0) {
  let v = clamp(raw, -1, 1);
  const s = Math.abs(v) < deadzone ? 0 : (v - Math.sign(v) * deadzone) / (1 - deadzone);
  return expo(clamp(s, -1, 1), expoAmt);
}

/** Deterministic pseudo-random generator so environments look identical each load. */
export function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function rand(rng, min, max) { return min + rng() * (max - min); }

/** Random point in an annulus around the origin. */
export function randRing(rng, minR, maxR) {
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(rand(rng, minR * minR, maxR * maxR));
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

export function formatTime(ms) {
  if (!isFinite(ms) || ms < 0) return '—';
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export function el(id) { return document.getElementById(id); }