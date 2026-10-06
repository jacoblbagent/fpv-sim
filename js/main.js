// FPV SIM — entry point. Wires the scene, the environment, the flight model,
// the input layer and the HUD together, then runs the frame loop.

import * as THREE from 'three';
import { clamp, formatTime } from './utils.js';
import * as S from './settings.js';
import { getEnvironment } from './environments/index.js';
import { Drone } from './drone.js';
import { FlightModel } from './physics.js';
import { InputManager } from './input.js';
import { Hud } from './hud.js';
import { initSettingsUI } from './settingsui.js';
import { el } from './utils.js';

// ---------------------------------------------------------------- renderer
const canvas = el('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(88, window.innerWidth / window.innerHeight, 0.02, 3000);
scene.add(camera);

// ---------------------------------------------------------------- lighting
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 420;
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0009;
scene.add(sun);
scene.add(sun.target);

const hemi = new THREE.HemisphereLight(0xbfe4ff, 0x6a9a4a, 0.9);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// ---------------------------------------------------------------- sim objects
const drone = new Drone();
scene.add(drone.group);

const flight = new FlightModel();
const input = new InputManager();
const hud = new Hud();

let env = getEnvironment(S.get('env'));
let fog = new THREE.FogExp2(env.fog.color, env.fog.density);
scene.fog = fog;

let flying = false;      // started, not paused
let paused = false;
let elapsed = 0;         // seconds armed
let lapStart = 0;
let lapCount = 0;
let bestLap = Infinity;
let gatesPassed = 0;
let crashTimer = 0;

// Arming is inhibited unless the throttle is at idle (a real FC pre-arm check).
const PREARM_THR = 0.06;

// ---------------------------------------------------------------- audio
const audio = {
  ctx: null, master: null, oscs: [], noiseGain: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    const mk = (type, freq, gain, detune) => {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = detune || 0;
      const g = this.ctx.createGain(); g.gain.value = gain;
      o.connect(g); g.connect(this.master); o.start();
      return { o, g, base: freq };
    };
    this.oscs = [
      mk('sawtooth', 78, 0.34),
      mk('square', 118, 0.16, 12),
      mk('sawtooth', 158, 0.09, -9),
    ];
    // prop-wash hiss
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    const ng = this.ctx.createGain(); ng.gain.value = 0;
    src.connect(bp); bp.connect(ng); ng.connect(this.master); src.start();
    this.noiseGain = ng;
  },
  set(throttle, armed, enabled) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = armed && enabled;
    const lvl = on ? 0.035 + throttle * 0.11 : 0;
    this.master.gain.setTargetAtTime(lvl, t, 0.05);
    for (const { o, base } of this.oscs) {
      o.frequency.setTargetAtTime(base * (0.85 + throttle * 3.1), t, 0.06);
    }
    if (this.noiseGain) this.noiseGain.gain.setTargetAtTime(on ? throttle * 0.05 : 0, t, 0.08);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
};

// ---------------------------------------------------------------- environment swap
function loadEnvironment(id) {
  if (env && env.dispose) env.dispose(scene);
  env = getEnvironment(id);
  env.build(scene);
  // clear any crash/pause state so a world swap always leaves you flyable
  crashScreen.classList.add('hidden');
  paused = false;
  crashTimer = 0;
  flight.reset(env);
  input.setArmed(false);
  resetCourse();
  applyEnvironmentLook();
  drone.group.position.copy(flight.position);
  drone.group.quaternion.copy(flight.quaternion);
  updateShadowFollow();
}

function applyEnvironmentLook() {
  scene.background = new THREE.Color(env.sky);
  fog.color.set(env.fog.color);
  fog.density = env.fog.density;
  sun.color.set(env.sun.color);
  sun.intensity = env.sun.intensity;
  sun.userData.offset = new THREE.Vector3().fromArray(env.sun.position).setLength(160);
  hemi.color.set(env.hemi.sky);
  hemi.groundColor.set(env.hemi.ground);
  hemi.intensity = env.hemi.intensity;
}

function updateShadowFollow() {
  const off = sun.userData.offset || new THREE.Vector3(120, 190, 80).setLength(160);
  sun.position.copy(flight.position).add(off);
  sun.target.position.copy(flight.position);
}

function resetCourse() {
  for (const g of env.gates) g.passed = false;
  gatesPassed = 0;
  lapStart = 0;
  lapCount = 0;
  elapsed = 0;
}

// ---------------------------------------------------------------- views
function applyView() {
  const mode = S.get('viewMode');
  if (mode === 'fpv') {
    drone.camMount.add(camera);
    // The airframe's nose is +Z, but a three.js camera looks down its own -Z,
    // so the onboard camera is yawed 180° to face forward (this also puts the
    // drone's right wing on the right of the image).
    camera.position.set(0, 0.002, 0.052);
    camera.rotation.set(0, Math.PI, 0);
    camera.fov = 88;
  } else {
    scene.add(camera);
    camera.fov = mode === 'chase' ? 70 : 45;
  }
  // In FPV the camera sits inside the frame, so hide the airframe itself —
  // otherwise spinning props fill the view (standard practice in sims).
  drone.group.visible = mode !== 'fpv';
  camera.updateProjectionMatrix();
  chasePos.set(NaN, 0, 0);
}
const chasePos = new THREE.Vector3();
const _look = new THREE.Vector3();

function updateCamera(dt) {
  const mode = S.get('viewMode');
  if (mode === 'fpv') {
    // shake is applied on top of the fixed 180° yaw
    if (S.get('shake') && flight.armed) {
      const amp = (0.0016 + flight.motorLoad * 0.0042) * (1 + flight.speed * 0.05);
      camera.rotation.x = (Math.random() - 0.5) * amp;
      camera.rotation.y = Math.PI + (Math.random() - 0.5) * amp;
      camera.rotation.z = (Math.random() - 0.5) * amp * 1.4;
    } else {
      camera.rotation.set(0, Math.PI, 0);
    }
    return;
  }

  if (mode === 'chase') {
    const yaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, flight.headingDeg * Math.PI / 180, 0));
    const back = new THREE.Vector3(0, 0.7, -2.2).applyQuaternion(yaw);
    const target = flight.position.clone().add(back);
    if (isNaN(chasePos.x)) chasePos.copy(target);
    chasePos.lerp(target, clamp(dt * 5.5, 0, 1));
    camera.position.copy(chasePos);
    _look.copy(flight.position).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(yaw), 2.2);
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);
    return;
  }

  // line of sight: a spectator tripod at a fixed bearing that tracks the quad
  _look.copy(flight.position).add(_losOffset);
  if (isNaN(chasePos.x)) chasePos.copy(_look);
  chasePos.lerp(_look, clamp(dt * 3.2, 0, 1));
  camera.position.copy(chasePos);
  camera.up.set(0, 1, 0);
  camera.lookAt(flight.position);
}
const _losOffset = new THREE.Vector3(7.5, 3.4, -7.5);

// ---------------------------------------------------------------- gate logic
function checkGates(dt) {
  if (!S.get('gates') || env.gates.length === 0) { hud.setCourse(null); return; }

  const total = env.gates.length;
  const next = env.gates.findIndex((g) => !g.passed);
  if (next >= 0) {
    const g = env.gates[next];
    const to = _look.copy(flight.position).sub(g.center);
    const along = to.dot(g.normal);
    const radial = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
    if (Math.abs(along) < 0.6 && radial < g.radius * 0.95) {
      g.passed = true;
      gatesPassed++;
      if (lapStart === 0) lapStart = performance.now();
      if (gatesPassed === total) {
        const lap = performance.now() - lapStart;
        if (lap < bestLap) bestLap = lap;
        lapCount++;
        for (const gg of env.gates) gg.passed = false;
        gatesPassed = 0;
        lapStart = performance.now();
      }
    }
  }

  const lapTime = lapStart > 0 ? performance.now() - lapStart : 0;
  hud.setCourse({
    name: 'GATE COURSE · LAP ' + (lapCount + 1),
    next: 'GATE ' + (gatesPassed + 1) + ' / ' + total,
    count: bestLap < Infinity ? 'BEST ' + formatTime(bestLap) : '—',
    timer: lapStart > 0 ? formatTime(lapTime) : '—',
    done: false,
  });
}

// ---------------------------------------------------------------- world bounds
function applyBounds() {
  const r = Math.hypot(flight.position.x, flight.position.z);
  if (r > env.bounds.radius) {
    const k = (r - env.bounds.radius) * 0.9;
    flight.velocity.x -= (flight.position.x / r) * k * 1.4;
    flight.velocity.z -= (flight.position.z / r) * k * 1.4;
  }
  if (flight.position.y > env.bounds.ceiling) {
    flight.position.y = env.bounds.ceiling;
    if (flight.velocity.y > 0) flight.velocity.y = 0;
  }
}

// ---------------------------------------------------------------- screens
const startScreen = el('startscreen');
const settingsScreen = el('settings');
const crashScreen = el('crashscreen');

function showCrash() {
  el('crash-sub').textContent = `Impact at ${flight.impactSpeed.toFixed(1)} m/s — props destroyed.`;
  crashScreen.classList.remove('hidden');
  paused = true;
}

function respawn() {
  crashScreen.classList.add('hidden');
  flight.reset(env);
  input.setArmed(false);
  resetCourse();
  crashTimer = 0;
  paused = false;
}

function toggleSettings(force) {
  const open = force !== undefined ? force : settingsScreen.classList.contains('hidden');
  settingsScreen.classList.toggle('hidden', !open);
  paused = open;
}

el('btn-fly').addEventListener('click', () => {
  startScreen.classList.add('hidden');
  flying = true;
  audio.init();
  audio.resume();
  input.source = input.pad ? 'radio' : 'keyboard';
});

el('btn-respawn').addEventListener('click', respawn);

window.addEventListener('keydown', (e) => {
  if (!flying) return;
  if (e.code === 'Escape') { toggleSettings(); }
  else if (e.code === 'KeyR' && e.code !== S.get('armKey')) { respawn(); }
  else if (e.code === 'KeyC') {
    const order = ['fpv', 'chase', 'los'];
    const i = order.indexOf(S.get('viewMode'));
    S.set('viewMode', order[(i + 1) % order.length]);
    el('view-mode').value = S.get('viewMode');
    applyView();
  }
});

// ---------------------------------------------------------------- settings UI
const ui = initSettingsUI({
  input,
  hooks: {
    onReset: () => respawn(),
    onClose: () => toggleSettings(false),
  },
});
S.onChange((key) => {
  if (key === 'camTilt' || key === '*') drone.setCameraTilt(S.get('camTilt'));
  if (key === 'viewMode' || key === '*') applyView();
  if (key === 'env' || key === '*') loadEnvironment(S.get('env'));
  if (key === 'showSticks' || key === 'showOsd' || key === '*') {
    hud.setVisibility({ osd: S.get('showOsd'), sticks: S.get('showSticks'), crosshair: S.get('showOsd') });
  }
});

// ---------------------------------------------------------------- resize
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------- boot
loadEnvironment(S.get('env'));
drone.setCameraTilt(S.get('camTilt'));
applyView();
hud.setVisibility({ osd: S.get('showOsd'), sticks: S.get('showSticks'), crosshair: S.get('showOsd') });
el('hint').innerHTML = `ESC settings &nbsp;·&nbsp; R reset &nbsp;·&nbsp; C view &nbsp;·&nbsp; ${el('arm-key').options[el('arm-key').selectedIndex]?.textContent || 'Q'} arm`;
el('osd-env').textContent = env.label.toUpperCase();

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let simTime = 0;

function frame() {
  requestAnimationFrame(frame);
  let dt = clock.getDelta();
  if (dt > 0.05) dt = 0.05;
  simTime += dt;

  // Input is always polled so the axis monitor works while paused.
  const sticks = input.update(dt);
  const armEdge = input.takeArmEdge();

  if (!paused && flying) {
    if (armEdge && !flight.crashed) {
      if (flight.armed) {
        flight.armed = false;
        input.setArmed(false);
      } else if (input.source === 'radio' && sticks.thr > PREARM_THR) {
        // Don't let a raised throttle stick launch the quad on arm.
        hud.flash('THROTTLE HIGH — LOWER THE STICK TO ARM');
      } else {
        flight.armed = true;
        input.setArmed(true);          // also zeroes the keyboard throttle
        if (lapStart === 0) lapStart = performance.now();
      }
    }
    if (flight.armed) elapsed += dt;

    const cfg = {
      rate: S.get('rate'),
      yawRate: S.get('yawRate'),
      twr: S.get('twr'),
      flightMode: S.get('flightMode'),
      wind: S.get('wind'),
    };
    flight.update(dt, sticks, cfg, env);
    applyBounds();
    env.update(dt);
    checkGates(dt);

    if (flight.crashed) {
      crashTimer += dt;
      if (crashTimer > 0.45) showCrash();
    }
  } else if (armEdge) {
    // ignore arm toggles while paused (edge consumed)
  }

  drone.group.position.copy(flight.position);
  drone.group.quaternion.copy(flight.quaternion);
  drone.update(dt, sticks.thr, flight.armed, simTime);
  updateShadowFollow();
  updateCamera(dt);

  audio.set(sticks.thr, flight.armed && !flight.crashed, S.get('sound'));

  hud.update({
    armed: flight.armed,
    crashed: flight.crashed,
    altitude: flight.position.y - env.groundHeight(flight.position.x, flight.position.z),
    speed: flight.speed,
    vsi: flight.verticalSpeed,
    distance: flight.distance,
    battery: flight.battery,
    elapsed,
    sticks,
    pitchDeg: flight.pitchDeg,
    rollDeg: flight.rollDeg,
    envLabel: env.label,
    modeLabel: S.get('flightMode') === 'acro' ? 'ACRO' : 'ANGLE',
    inputLabel: input.sourceLabel,
  });

  ui.tick(dt);
  renderer.render(scene, camera);
}

onResize();
frame();

// expose for debugging / headless verification (env is a live getter because
// swapping worlds rebinds the module-level variable)
window.__fpv = {
  scene, camera, drone, flight, input, renderer, S, hud,
  get env() { return env; },
  get paused() { return paused; },
  get flying() { return flying; },
};