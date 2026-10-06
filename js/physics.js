// Quadcopter flight dynamics.
//
// Body frame: +X left, +Y up, +Z nose forward. (three.js is right-handed with
// forward = -Z, so for a +Z-nosed airframe the body "right" axis is -X — this
// flips the sense of roll and yaw relative to the naive reading, and the signs
// below are chosen to match: stick right = bank right = yaw right.)
//
//   body pitch rate (p) about +X : positive = nose DOWN
//   body yaw rate   (r) about +Y : positive = yaw LEFT
//   body roll rate  (q) about +Z : positive = roll RIGHT
//
// Measured attitudes (from the quaternion) use the same convention:
//   pitchDeg > 0 = nose up, rollDeg > 0 = banked right.
//
// Sticks are -1..1 (throttle 0..1) exactly as the radio reports them, so the
// same model drives both keyboard and a real transmitter. Acro mode integrates
// raw angular rates (no self-levelling); angle mode runs an attitude hold.

import * as THREE from 'three';
import { clamp, damp } from './utils.js';

const G = 9.81;
const ANG_RESPONSE = 16;        // how fast the quad reaches the commanded rate
const ANG_DRAG = 0.55;          // rate decay with centred sticks (prop drag)
const LINEAR_DRAG = 0.06;       // parasitic drag coefficient (1/s)
const QUAD_DRAG = 0.011;        // v^2 drag (1/m) — gives ~35 m/s top speed and
                                // ~27 m/s freefall terminal velocity, i.e. a
                                // realistic 5" freestyle quad, not a floating camera
const RESTITUTION = 0.28;
const CRASH_SPEED = 5.2;        // m/s impact that bends props
const LEVEL_KP = 3.2;           // angle-mode attitude gain (1/s per rad)
const LEVEL_KD = 0.85;          // rate damping so it settles without overshoot
const MAX_TILT_DEG = 35;

export class FlightModel {
  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();     // body rates, rad/s
    this.armed = false;
    this.crashed = false;
    this.grounded = false;
    this.impactSpeed = 0;
    this.battery = 1;                      // 0..1
    this.motorLoad = 0;
    this.distance = 0;

    this._dq = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._levelQ = new THREE.Quaternion();
  }

  reset(env) {
    const s = env.spawn;
    this.position.set(s.x, s.y, s.z);
    this.velocity.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.quaternion.setFromEuler(new THREE.Euler(0, s.yaw || 0, 0, 'YXZ'));
    this.armed = false;
    this.crashed = false;
    this.grounded = true;
    this.battery = 1;
    this.distance = 0;
  }

  get speed() { return this.velocity.length(); }

  /** Speed in km/h for the OSD. */
  get speedKmh() { return this.speed * 3.6; }

  get verticalSpeed() { return this.velocity.y; }

  /** Nose-up angle in degrees (positive = climbing attitude). */
  get pitchDeg() {
    this._fwd.set(0, 0, 1).applyQuaternion(this.quaternion);
    return THREE.MathUtils.radToDeg(Math.asin(clamp(this._fwd.y, -1, 1)));
  }

  /** Bank angle in degrees, positive = right wing down. */
  get rollDeg() {
    this._fwd.set(-1, 0, 0).applyQuaternion(this.quaternion);   // right wing is -X
    return -THREE.MathUtils.radToDeg(Math.atan2(this._fwd.y, Math.hypot(this._fwd.x, this._fwd.z)));
  }

  get headingDeg() {
    this._fwd.set(0, 0, 1).applyQuaternion(this.quaternion);
    return (THREE.MathUtils.radToDeg(Math.atan2(this._fwd.x, this._fwd.z)) + 360) % 360;
  }

  /**
   * @param dt      seconds
   * @param sticks  {thr, yaw, pitch, roll}
   * @param cfg     {rate, yawRate, twr, flightMode, wind}
   * @param env     environment (ground height + colliders)
   */
  update(dt, sticks, cfg, env) {
    if (this.crashed) {
      // Dead props: just fall.
      this.velocity.y -= G * dt;
      this.velocity.multiplyScalar(1 - 0.6 * dt);
      this.position.addScaledVector(this.velocity, dt);
      const gh = env.groundHeight(this.position.x, this.position.z);
      if (this.position.y - 0.05 < gh) {
        this.position.y = gh + 0.05;
        this.velocity.set(0, 0, 0);
      }
      return;
    }

    const dtc = Math.min(dt, 0.033);
    const maxRate = THREE.MathUtils.degToRad(cfg.rate);
    const maxYawRate = THREE.MathUtils.degToRad(cfg.yawRate);

    // ---- commanded body rates ---------------------------------------------
    let tp = -sticks.pitch * maxRate;   // stick up (negative) -> nose down
    let tq = sticks.roll * maxRate;     // stick right -> roll right
    let tr = -sticks.yaw * maxYawRate;  // stick right -> yaw right

    if (cfg.flightMode === 'angle') {
      // Attitude hold: sticks command a tilt angle, a PD law turns that into
      // body rates. Sign care: pitchDeg/rollDeg are measured angles (nose-up
      // and right-bank positive), while d(pitch)/dt = -angVel.x and
      // d(roll)/dt = +angVel.z.
      const maxTilt = THREE.MathUtils.degToRad(MAX_TILT_DEG);
      const targetPitch = sticks.pitch * maxTilt;    // stick up -> nose down
      const targetRoll = sticks.roll * maxTilt;      // stick right -> bank right
      const errPitch = targetPitch - THREE.MathUtils.degToRad(this.pitchDeg);
      const errRoll = targetRoll - THREE.MathUtils.degToRad(this.rollDeg);
      tp = clamp(-LEVEL_KP * errPitch - LEVEL_KD * this.angVel.x, -maxRate, maxRate);
      tq = clamp(LEVEL_KP * errRoll - LEVEL_KD * this.angVel.z, -maxRate, maxRate);
      tr = -sticks.yaw * maxYawRate * 0.85;
    }

    // ---- angular dynamics --------------------------------------------------
    const f = damp(ANG_RESPONSE, dtc);
    const hasInput = Math.abs(sticks.pitch) > 0.01 || Math.abs(sticks.roll) > 0.01 || Math.abs(sticks.yaw) > 0.01;
    this.angVel.x += (tp - this.angVel.x) * f;
    this.angVel.y += (tr - this.angVel.y) * f;
    this.angVel.z += (tq - this.angVel.z) * f;
    if (!hasInput && cfg.flightMode === 'acro') {
      // Slow rotation decay so the quad stops cleanly when the sticks centre.
      this.angVel.multiplyScalar(1 - Math.min(0.95, ANG_DRAG * dtc));
    }

    // integrate orientation (body-frame rotation -> post-multiply)
    const w = this.angVel.length();
    if (w > 1e-6) {
      this._axis.copy(this.angVel).multiplyScalar(1 / w);
      this._dq.setFromAxisAngle(this._axis, w * dtc);
      this.quaternion.multiply(this._dq).normalize();
    }

    // ---- thrust + gravity --------------------------------------------------
    this._up.set(0, 1, 0).applyQuaternion(this.quaternion);
    const twr = clamp(cfg.twr + this.batteryDip() * 0.25, 1, 4.5);
    const throttle = this.armed ? clamp(sticks.thr, 0, 1) : 0;
    this.motorLoad = throttle;
    const thrustAccel = throttle * twr * G;
    const accel = this._tmp.set(0, -G, 0).addScaledVector(this._up, thrustAccel);

    // ---- drag --------------------------------------------------------------
    const sp = this.velocity.length();
    const dragMag = LINEAR_DRAG + QUAD_DRAG * sp;
    accel.addScaledVector(this.velocity, -dragMag);

    // ---- wind / turbulence -------------------------------------------------
    if (cfg.wind > 0) {
      const t = performance.now() * 0.001;
      accel.x += Math.sin(t * 1.7) * cfg.wind * 2.2;
      accel.z += Math.cos(t * 2.3) * cfg.wind * 2.2;
      accel.y += Math.sin(t * 3.1) * cfg.wind * 1.1;
    }

    this.velocity.addScaledVector(accel, dtc);

    // ---- integrate position ------------------------------------------------
    const before = this._tmp.copy(this.position);
    this.position.addScaledVector(this.velocity, dtc);
    this.distance += before.distanceTo(this.position);

    // ---- collisions --------------------------------------------------------
    this.grounded = false;
    this._resolveColliders(env);
    this._resolveGround(env);

    // ---- battery -----------------------------------------------------------
    const drain = 0.0016 + throttle * 0.010 + Math.abs(this.angVel.length()) * 0.0006;
    this.battery = clamp(this.battery - drain * dtc, 0, 1);
  }

  /** Battery voltage sag: less punch as the pack empties. */
  batteryDip() { return (1 - this.battery) * -0.6; }

  _resolveGround(env) {
    const gh = env.groundHeight(this.position.x, this.position.z);
    const r = 0.055;   // skid height
    if (this.position.y - r <= gh) {
      const impact = -this.velocity.y;
      this.position.y = gh + r;
      if (impact > CRASH_SPEED) { this._crash(impact); return; }
      if (this.velocity.y < 0) this.velocity.y *= -RESTITUTION;
      // ground friction: skids scrub speed
      this.velocity.x *= 1 - Math.min(0.9, 4.5 * 0.016);
      this.velocity.z *= 1 - Math.min(0.9, 4.5 * 0.016);
      this.grounded = true;
      // kill the bounce jitter
      if (Math.abs(this.velocity.y) < 0.4) this.velocity.y = 0;
    }
  }

  _resolveColliders(env) {
    const R = 0.19;
    for (const c of env.colliders) {
      if (c.type === 'sphere') {
        const dx = this.position.x - c.pos.x;
        const dy = this.position.y - c.pos.y;
        const dz = this.position.z - c.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const rr = c.r + R;
        if (d2 < rr * rr && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const speed = this.speed;
          if (speed > CRASH_SPEED) { this._crash(speed); return; }
          const push = rr - d;
          this.position.x += nx * push;
          this.position.y += ny * push;
          this.position.z += nz * push;
          const vn = this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz;
          if (vn < 0) {
            this.velocity.x -= nx * vn * (1 + RESTITUTION);
            this.velocity.y -= ny * vn * (1 + RESTITUTION);
            this.velocity.z -= nz * vn * (1 + RESTITUTION);
          }
        }
      } else if (c.type === 'box') {
        const p = this.position;
        const hx = c.half.x + R, hy = c.half.y + R, hz = c.half.z + R;
        const dx = p.x - c.center.x, dy = p.y - c.center.y, dz = p.z - c.center.z;
        if (Math.abs(dx) < hx && Math.abs(dy) < hy && Math.abs(dz) < hz) {
          const speed = this.speed;
          if (speed > CRASH_SPEED) { this._crash(speed); return; }
          // push out along the shallowest axis
          const ox = hx - Math.abs(dx), oy = hy - Math.abs(dy), oz = hz - Math.abs(dz);
          if (ox <= oy && ox <= oz) {
            p.x = c.center.x + Math.sign(dx || 1) * hx;
            this.velocity.x *= -RESTITUTION;
          } else if (oy <= oz) {
            p.y = c.center.y + Math.sign(dy || 1) * hy;
            if (this.velocity.y < 0) this.velocity.y *= -RESTITUTION;
            if (Math.abs(this.velocity.y) < 0.4) this.velocity.y = 0;
          } else {
            p.z = c.center.z + Math.sign(dz || 1) * hz;
            this.velocity.z *= -RESTITUTION;
          }
        }
      }
    }
  }

  _crash(speed) {
    if (this.crashed) return;
    this.crashed = true;
    this.armed = false;
    this.impactSpeed = speed;
    this.velocity.multiplyScalar(0.25);
    this.angVel.set(0, 0, 0);
  }
}