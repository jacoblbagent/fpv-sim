// Persisted user settings (localStorage) + a tiny change-notification bus.

const KEY = 'fpvsim.settings.v1';

export const DEFAULTS = {
  // input
  armKey: 'KeyQ',
  armPadButton: 0,
  useGamepad: true,
  axisMap: { roll: 0, pitch: 1, throttle: 2, yaw: 3 },
  invert: { roll: false, pitch: true, throttle: false, yaw: false },
  deadzone: 0.02,

  // flight
  flightMode: 'acro',      // acro | angle
  rate: 720,               // deg/s roll+pitch
  yawRate: 360,            // deg/s
  expo: 0.30,
  keySens: 1.0,            // keyboard stick/throttle travel multiplier
  camTilt: 22,             // degrees
  twr: 2.2,                // thrust-to-weight ratio
  wind: 0.0,               // 0..1 turbulence amount
  viewMode: 'fpv',         // fpv | chase | los
  sound: true,

  // world / hud
  env: 'meadow',
  gates: true,
  showSticks: true,
  showOsd: true,
  shake: true,
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    // shallow-merge with defaults, deep for the two nested maps
    const out = { ...structuredClone(DEFAULTS), ...parsed };
    out.axisMap = { ...DEFAULTS.axisMap, ...(parsed.axisMap || {}) };
    out.invert = { ...DEFAULTS.invert, ...(parsed.invert || {}) };
    return out;
  } catch (e) {
    return structuredClone(DEFAULTS);
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
}

export function get(k) { return k === undefined ? state : state[k]; }

export function set(k, v) {
  if (state[k] === v) return;
  state[k] = v;
  persist();
  emit(k);
}

export function patch(obj) {
  Object.assign(state, obj);
  persist();
  emit('*');
}

export function resetAll() {
  state = structuredClone(DEFAULTS);
  persist();
  emit('*');
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(k) { for (const fn of listeners) fn(k, state); }

/** Arm-key choices exposed in the UI. */
export const ARM_KEY_CHOICES = [
  ['KeyQ', 'Q'], ['KeyE', 'E'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyR', 'R'],
  ['KeyT', 'T'], ['KeyC', 'C'], ['KeyV', 'V'], ['Space', 'Space'], ['Enter', 'Enter'],
  ['ShiftLeft', 'Left Shift'], ['Tab', 'Tab'], ['Backslash', '\\'],
];