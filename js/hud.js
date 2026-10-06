// Flight HUD: OSD numbers, throttle bar, artificial horizon, stick visualiser
// and the gate-course readout. Pure DOM — no per-frame allocation.

import { el, clamp, formatTime } from './utils.js';

export class Hud {
  constructor() {
    this.osd = el('osd');
    this.crosshair = el('crosshair');
    this.sticks = el('sticks');
    this.course = el('course');
    this.horizon = el('horizon');
    this.thrFill = el('thr-fill');
    this.dotLeft = el('dot-left');
    this.dotRight = el('dot-right');

    this.arm = el('osd-arm');
    this.env = el('osd-env');
    this.mode = el('osd-mode');
    this.input = el('osd-input');
    this.alt = el('osd-alt');
    this.spd = el('osd-spd');
    this.vsi = el('osd-vsi');
    this.dist = el('osd-dist');
    this.batt = el('osd-batt');
    this.time = el('osd-time');

    this.courseName = el('course-name');
    this.courseNext = el('course-next');
    this.courseCount = el('course-count');
    this.courseTimer = el('course-timer');

    this._last = {};
  }

  setVisibility({ osd, sticks, crosshair }) {
    if (osd !== undefined) this.osd.classList.toggle('hidden', !osd);
    if (sticks !== undefined) this.sticks.classList.toggle('hidden', !sticks);
    if (crosshair !== undefined) this.crosshair.classList.toggle('hidden', !crosshair);
  }

  update(f) {
    const set = (node, key, value) => {
      if (this._last[key] === value) return;
      this._last[key] = value;
      node.textContent = value;
    };

    const armedLabel = f.crashed ? 'CRASHED' : (f.armed ? 'ARMED' : 'DISARMED');
    set(this.arm, 'arm', armedLabel);
    this.arm.classList.toggle('armed', f.armed && !f.crashed);
    this.arm.classList.toggle('disarmed', !f.armed || f.crashed);

    set(this.env, 'env', f.envLabel.toUpperCase());
    set(this.mode, 'mode', f.modeLabel.toUpperCase());
    set(this.input, 'input', f.inputLabel);

    set(this.alt, 'alt', f.altitude.toFixed(1));
    set(this.spd, 'spd', (f.speed * 3.6).toFixed(1));
    set(this.vsi, 'vsi', f.vsi.toFixed(1));
    set(this.dist, 'dist', Math.round(f.distance));
    set(this.batt, 'batt', Math.round(f.battery * 100));
    set(this.time, 'time', formatTime(f.elapsed * 1000));

    // throttle bar
    const pct = Math.round(clamp(f.sticks.thr, 0, 1) * 100);
    if (this._last.thr !== pct) {
      this._last.thr = pct;
      this.thrFill.style.height = pct + '%';
    }

    // stick dots (throttle vertical inverted: up = full)
    const lx = 50 + clamp(f.sticks.yaw, -1, 1) * 40;
    const ly = 50 - (clamp(f.sticks.thr, 0, 1) * 2 - 1) * 40;
    const rx = 50 + clamp(f.sticks.roll, -1, 1) * 40;
    const ry = 50 + clamp(f.sticks.pitch, -1, 1) * 40;
    if (this._last.lx !== lx || this._last.ly !== ly) {
      this._last.lx = lx; this._last.ly = ly;
      this.dotLeft.setAttribute('cx', lx.toFixed(1));
      this.dotLeft.setAttribute('cy', ly.toFixed(1));
    }
    if (this._last.rx !== rx || this._last.ry !== ry) {
      this._last.rx = rx; this._last.ry = ry;
      this.dotRight.setAttribute('cx', rx.toFixed(1));
      this.dotRight.setAttribute('cy', ry.toFixed(1));
    }

    // artificial horizon: tilts with bank (clockwise for a right bank) and
    // slides down as the nose comes up
    const rot = f.rollDeg;
    const shift = clamp(f.pitchDeg * 1.1, -34, 34);
    this.horizon.style.transform = `translateY(${shift.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
  }

  setCourse(info) {
    if (!info) { this.course.classList.add('hidden'); return; }
    this.course.classList.remove('hidden');
    this.courseName.textContent = info.name;
    this.courseNext.textContent = info.next;
    this.courseCount.textContent = info.count;
    this.courseTimer.textContent = info.timer;
    this.courseTimer.style.color = info.done ? '#8ee06a' : '#4ecdc4';
  }
}