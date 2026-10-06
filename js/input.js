// Input layer: real FPV radio via the Gamepad API, or keyboard dual-stick emulation.
//
// Radio (left stick)  : throttle (up/down) + yaw (left/right)
// Radio (right stick) : pitch (up/down) + roll (left/right)
//
// Keyboard mapping mirrors the same two sticks:
//   W / S  -> throttle      A / D  -> yaw
//   Up/Down -> pitch        Left/Right -> roll
// Arm is a configurable key (default Q) and/or a configurable pad button.

import { clamp, shapeAxis, approach } from './utils.js';
import * as S from './settings.js';

const CONTROL_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

// Keyboard travel rates, in full-stick-travel per second (scaled by the
// "keyboard response" setting). Deliberately unhurried: a digital key is
// all-or-nothing, so ramping the simulated stick gives the pilot fine control
// instead of slamming to full deflection on every press.
const KEY_THR_RATE = 0.45;     // idle -> full throttle in ~2.2s
const KEY_STICK_RATE = 0.65;   // centre -> full deflection in ~1.5s
// Releasing a key springs the stick back to centre faster than it winds up, so
// letting go actually *stops* the rotation instead of coasting on while the
// stick crawls home (a real gimbal is sprung the same way).
const KEY_CENTRE_RATE = 1.7;

export class InputManager {
  constructor() {
    this.keys = Object.create(null);
    this.source = 'keyboard';     // 'keyboard' | 'radio'
    this.radioSeen = false;
    this.padName = '';
    this.pad = null;
    this.axisCount = 0;
    this.axes = new Array(8).fill(0);
    this.baseline = new Array(8).fill(null);

    this._armPending = false;     // latched arm/disarm request
    this._keyArmHeld = false;
    this._padArmHeld = false;
    this._learning = null;

    this.keyThrottle = 0;
    this.armed = false;           // keyboard throttle only responds once armed
    this.sticks = { thr: 0, yaw: 0, pitch: 0, roll: 0 };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => { this.keys = Object.create(null); });
    window.addEventListener('gamepadconnected', (e) => {
      this.padName = e.gamepad.id || 'Gamepad';
      this.radioSeen = true;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.radioSeen = false;
      if (this.source === 'radio') this.source = 'keyboard';
    });
  }

  _onKeyDown(e) {
    if (e.repeat) return;
    if (CONTROL_KEYS.has(e.code)) {
      e.preventDefault();
      this.keys[e.code] = true;
      this.source = 'keyboard';
    }
    if (e.code === S.get('armKey')) {
      if (!this._keyArmHeld) this._armPending = true;
      this._keyArmHeld = true;
      this.source = 'keyboard';
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    }
  }

  _onKeyUp(e) {
    if (CONTROL_KEYS.has(e.code)) this.keys[e.code] = false;
    if (e.code === S.get('armKey')) this._keyArmHeld = false;
  }

  /** True once per arm/disarm request; consumed by main.js. */
  takeArmEdge() {
    if (!this._armPending) return false;
    this._armPending = false;
    return true;
  }

  /**
   * Arm/disarm bookkeeping: the keyboard throttle is zeroed on every change so
   * flipping the arm switch can never launch the quad — thrust only ever comes
   * from the pilot deliberately spooling up *after* arming.
   */
  setArmed(armed) {
    this.armed = !!armed;
    this.keyThrottle = 0;
    if (!this.armed) {
      this.sticks.thr = 0;
      this.sticks.yaw = this.sticks.pitch = this.sticks.roll = 0;
    }
    return this.armed;
  }

  /** Resolve with the index of the next gamepad button pressed (for "Learn"). */
  learnPadButton() {
    return new Promise((resolve) => { this._learning = { resolve }; });
  }

  _pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) { if (p && p.connected) { pad = p; break; } }
    this.pad = pad;
    if (!pad) {
      this.radioSeen = false;
      // Don't leave the pilot stuck on a radio that went away.
      if (this.source === 'radio') this.source = 'keyboard';
      return null;
    }

    this.radioSeen = true;
    this.padName = pad.id || 'Gamepad';
    this.axisCount = pad.axes.length;
    for (let i = 0; i < Math.min(8, pad.axes.length); i++) {
      const v = pad.axes[i];
      this.axes[i] = v;
      if (this.baseline[i] === null) this.baseline[i] = v;
    }

    // Stick movement or any button press means the pilot is on the radio.
    if (S.get('useGamepad')) {
      for (let i = 0; i < this.axisCount && i < 8; i++) {
        if (Math.abs(this.axes[i] - this.baseline[i]) > 0.09) { this.source = 'radio'; break; }
      }
      if (pad.buttons.some((b) => b.pressed)) this.source = 'radio';
    }
    return pad;
  }

  update(dt) {
    const pad = this._pollPad();
    const dz = S.get('deadzone');
    const expoAmt = S.get('expo');

    // ---- gamepad arm button (rising edge) ----------------------------------
    if (pad) {
      const armBtn = S.get('armPadButton');
      const pressed = !!(pad.buttons[armBtn] && pad.buttons[armBtn].pressed);
      if (pressed && !this._padArmHeld) { this._armPending = true; this.source = 'radio'; }
      this._padArmHeld = pressed;
      if (this._learning) {
        const idx = pad.buttons.findIndex((b) => b.pressed);
        if (idx >= 0) { const r = this._learning.resolve; this._learning = null; r(idx); }
      }
    } else {
      this._padArmHeld = false;
    }

    // ---- sticks ------------------------------------------------------------
    if (this.source === 'radio' && pad) {
      const map = S.get('axisMap');
      const inv = S.get('invert');
      const rd = (idx, invert) => {
        const raw = this.axes[clamp(idx | 0, 0, 7)] || 0;
        return shapeAxis(invert ? -raw : raw, dz, expoAmt);
      };
      this.sticks.roll = rd(map.roll, inv.roll);
      this.sticks.pitch = rd(map.pitch, inv.pitch);
      this.sticks.yaw = rd(map.yaw, inv.yaw);
      this.sticks.thr = clamp((rd(map.throttle, inv.throttle) + 1) * 0.5, 0, 1);
      this.keyThrottle = this.sticks.thr;   // keep keyboard in sync
    } else {
      const k = this.keys;
      const sens = clamp(S.get('keySens') || 1, 0.2, 4);

      // Throttle only responds once armed, so a wound-up stick can never
      // launch the quad the instant it arms.
      if (this.armed) {
        if (k['KeyW']) this.keyThrottle += KEY_THR_RATE * sens * dt;
        if (k['KeyS']) this.keyThrottle -= KEY_THR_RATE * sens * dt;
      }
      this.keyThrottle = clamp(this.keyThrottle, 0, 1);

      const yaw = (k['KeyA'] ? -1 : 0) + (k['KeyD'] ? 1 : 0);
      const pitch = (k['ArrowUp'] ? -1 : 0) + (k['ArrowDown'] ? 1 : 0);
      const roll = (k['ArrowLeft'] ? -1 : 0) + (k['ArrowRight'] ? 1 : 0);

      // Digital keys command a stick *position*, ramped linearly toward it.
      // Expo and the deadzone are gimbal-centre aids — applied to an
      // already-ramped digital key they just make the first ~100 ms feel dead
      // and then lurch, so the keyboard path bypasses both and uses the raw
      // ±1 key value as the target.
      const step = KEY_STICK_RATE * sens * dt;
      const centreStep = KEY_CENTRE_RATE * sens * dt;
      const ramped = (cur, dir) => approach(cur, dir, dir === 0 ? centreStep : step);
      this.sticks.yaw = ramped(this.sticks.yaw, yaw);
      this.sticks.pitch = ramped(this.sticks.pitch, pitch);
      this.sticks.roll = ramped(this.sticks.roll, roll);
      this.sticks.thr = this.keyThrottle;
    }

    return this.sticks;
  }

  get sourceLabel() {
    return this.source === 'radio' && this.radioSeen ? 'RADIO' : 'KEYBOARD';
  }
}