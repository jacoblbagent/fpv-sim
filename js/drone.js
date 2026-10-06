// The quadcopter: a detailed 5-inch freestyle build with spinning props,
// camera pod, antenna, battery and status LEDs. Cartoon proportions, toon shading.

import * as THREE from 'three';

const FRAME_DARK = 0x3f4750;
const FRAME_ACCENT = 0xa8ef6f;
const PROP_A = 0xff8a3d;
const PROP_B = 0x4ecdc4;

function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, ...extra });
}

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/** One propeller: two tapered, pitched blades + hub + a translucent disc. */
function makeProp(bladeColor) {
  const g = new THREE.Group();
  const mat = toon(bladeColor, { transparent: true, opacity: 0.95 });

  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Group();
    const inner = box(0.050, 0.0028, 0.016, mat);
    inner.position.x = 0.030;
    inner.rotation.x = 0.34;                       // blade pitch
    const tip = box(0.026, 0.0024, 0.011, mat);
    tip.position.x = 0.070;
    tip.rotation.x = 0.34;
    blade.add(inner, tip);
    blade.rotation.y = i * Math.PI;
    g.add(blade);
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.012, 10), toon(FRAME_DARK));
  g.add(hub);

  // Spinning disc — fades in with RPM for a cartoon motion blur.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.086, 20),
    new THREE.MeshBasicMaterial({ color: bladeColor, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.006;
  g.add(disc);

  return { group: g, disc, blades: g.children.slice(0, 2) };
}

export class Drone {
  constructor() {
    this.group = new THREE.Group();
    this.props = [];
    this.leds = [];
    this._throttle = 0;

    const dark = toon(FRAME_DARK);
    const accent = toon(FRAME_ACCENT);

    // ---- bottom plate + top plate (stack) ---------------------------------
    const bottom = box(0.20, 0.012, 0.155, dark);
    bottom.position.y = -0.012;
    this.group.add(bottom);

    const top = box(0.15, 0.010, 0.115, accent);
    top.position.y = 0.036;
    this.group.add(top);

    // side rails connecting the plates
    for (const sx of [-1, 1]) {
      const rail = box(0.010, 0.036, 0.10, dark);
      rail.position.set(sx * 0.095, 0.012, 0);
      this.group.add(rail);
    }

    // ---- four arms + motors + props ---------------------------------------
    const armLen = 0.115;
    const armAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    armAngles.forEach((a, i) => {
      const arm = box(armLen, 0.010, 0.024, i % 2 === 0 ? accent : dark);
      arm.position.set(Math.cos(a) * armLen * 0.5, -0.004, Math.sin(a) * armLen * 0.5);
      arm.rotation.y = -a;
      this.group.add(arm);

      const mx = Math.cos(a) * armLen;
      const mz = Math.sin(a) * armLen;

      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.022, 12), toon(0x1f242a));
      bell.position.set(mx, 0.010, mz);
      this.group.add(bell);
      const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.016, 12), toon(0x3a4048));
      stator.position.set(mx, 0.028, mz);
      this.group.add(stator);

      const prop = makeProp(i < 2 ? PROP_A : PROP_B);
      prop.group.position.set(mx, 0.040, mz);
      prop.dir = i % 2 === 0 ? 1 : -1;               // alternating spin
      this.props.push(prop);
      this.group.add(prop.group);

      // motor bell glow follows throttle
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.006, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0 })
      );
      glow.position.set(mx, 0.014, mz);
      this.group.add(glow);
      this.leds.push(glow);
    });

    // ---- landing skids -----------------------------------------------------
    for (const sx of [-1, 1]) {
      const skid = box(0.010, 0.030, 0.115, toon(0x14171b));
      skid.position.set(sx * 0.075, -0.034, 0);
      this.group.add(skid);
      const foot = box(0.012, 0.008, 0.115, toon(0x14171b));
      foot.position.set(sx * 0.075, -0.050, 0);
      this.group.add(foot);
    }

    // ---- camera pod (tilts up for FPV) ------------------------------------
    this.camMount = new THREE.Group();
    this.camMount.position.set(0, 0.024, 0.075);
    this.group.add(this.camMount);

    const podBody = box(0.045, 0.040, 0.032, toon(0x1f242a));
    this.camMount.add(podBody);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.014, 12), toon(0x0d1013));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.022;
    this.camMount.add(lens);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x2b6fff })
    );
    glass.position.z = 0.029;
    glass.scale.z = 0.5;
    this.camMount.add(glass);
    this.camGlass = glass;

    // ---- antenna + battery -------------------------------------------------
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.085, 6), toon(0x14171b));
    antenna.position.set(-0.055, 0.075, -0.055);
    antenna.rotation.z = 0.45;
    antenna.rotation.x = -0.25;
    this.group.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), toon(0xff5c5c));
    tip.position.set(-0.075, 0.113, -0.062);
    this.group.add(tip);

    const batt = box(0.075, 0.026, 0.045, toon(0xf2f2f2));
    batt.position.set(0, 0.055, -0.020);
    this.group.add(batt);
    const strap = box(0.080, 0.028, 0.014, toon(0x2b2f36));
    strap.position.set(0, 0.055, -0.020);
    this.group.add(strap);

    // ---- status LEDs (front cyan, rear red) --------------------------------
    const ledGeo = new THREE.SphereGeometry(0.007, 8, 6);
    const front = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0x66ffe0 }));
    front.position.set(0, -0.006, 0.090);
    this.group.add(front);
    this.frontLed = front;

    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xff3355 }));
      r.position.set(sx * 0.082, -0.006, -0.078);
      this.group.add(r);
      this.leds.push(r);
    }

    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.radius = 0.17;   // collision radius
  }

  /** Update propeller spin, glow and LED state. */
  update(dt, throttle, armed, time) {
    this._throttle = throttle;
    const rpm = armed ? throttle * 92 : 0;   // rad/s at the prop
    for (const p of this.props) {
      p.group.rotation.y += rpm * p.dir * dt;
      p.disc.material.opacity = armed ? Math.min(0.22, throttle * 0.28) : 0;
    }
    const glow = armed ? Math.min(0.9, throttle * 1.2) : 0;
    for (const l of this.leds) {
      if (l.material.color.getHex() === 0x66ccff) l.material.opacity = glow;
    }
    // armed = solid front LED, disarmed = slow blink
    this.frontLed.material.color.setHex(armed ? 0x66ffe0 : (Math.sin(time * 4) > 0 ? 0xffb020 : 0x554400));
  }

  /** Local camera transform for the onboard FPV view. */
  setCameraTilt(deg) {
    this.camMount.rotation.x = -THREE.MathUtils.degToRad(deg);
  }
}