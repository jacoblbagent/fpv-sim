// AIRPORT TERMINAL — a glass-walled international departures hall: check-in
// counters, a security lane with metal detectors and x-ray scanners, a food
// court and newsstand, a mezzanine reached by escalators, and a baggage
// carousel — with a jet bridge, a parked widebody and a fuel truck out on the
// apron. Glass concourse, security lanes and a parked jet — tight quarters.

import * as THREE from 'three';
import { makeRng, rand } from '../utils.js';
import { toon, facet, flatBox, makePad, makeGate, makeCloud } from './props.js';

// ---- shell dimensions -------------------------------------------------------
const HX = 55;          // half length (building runs along X)
const ZF = -22;         // front / glass wall (faces the apron)
const ZB = 22;          // back wall
const CEIL = 9;         // head room
const MEZZ = 4.2;       // mezzanine deck height
const DOOR = 9;         // half width of the apron doorway in the glass wall

// ---- palette ---------------------------------------------------------------
const C = {
  floor: 0xd9d6cd, floorAlt: 0xc6c2b8,
  wall: 0xe8e4da, wallLow: 0xc8c3b6,
  column: 0xccd1d6, ceil: 0xf3f1eb, panel: 0xfdfbe6,
  glass: 0x9dc9e4, mullion: 0x6f757d,
  navy: 0x21395f, blue: 0x2f6fb0, teal: 0x1f7f8c,
  orange: 0xe2703a, red: 0xc0392b, yellow: 0xe3b02b,
  seat: 0x2b3a52, seatAlt: 0x3d5a80,
  metal: 0xbcc5cd, metalDark: 0x8b949c, rubber: 0x40464c,
  tarmac: 0x6e7277, tarmacDark: 0x5b5f64, line: 0xeceae1, taxi: 0xe0b429,
  grass: 0x74bd57, concrete: 0xb9b3a7,
  book: [0xc0392b, 0x2f6fb0, 0xe3b02b, 0x1f7f8c, 0x8e44ad, 0xd35400],
};

/** Local builder helpers return a Group with:
 *    userData.boxes    [{pos:[x,y,z], half:[x,y,z]}]   (axis-aligned colliders)
 *    userData.spheres  [{pos:[x,y,z], r}]
 *    userData.extra    anything the environment wants to animate
 *  All coordinates are local until place() drops the prop into the world. */

function makeGlassWall(len, h) {
  const g = new THREE.Group();
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(len, h),
    new THREE.MeshToonMaterial({
      color: C.glass, transparent: true, opacity: 0.20,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  pane.position.y = h / 2;
  g.add(pane);
  g.userData.tint = pane;   // frame pass adds the mullions
  return g;
}

function makeMullions(len, h, gap) {
  const g = new THREE.Group();
  const mat = toon(C.mullion);
  const n = Math.max(2, Math.round(len / 3.2));
  for (let i = 0; i <= n; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), mat);
    post.position.set(-len / 2 + (i / n) * len, h / 2, 0);
    g.add(post);
  }
  for (let i = 0; i <= 3; i++) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.2), mat);
    rail.position.set(0, (i / 3) * h, 0);
    g.add(rail);
  }
  if (gap) {
    // a doubled post either side of the doorway reads as a portal
    for (const s of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.34, h, 0.34), toon(C.navy));
      jamb.position.set(s * gap, h / 2, 0);
      g.add(jamb);
    }
  }
  return g;
}

function makeColumn(h = CEIL) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, h, 12), toon(C.column));
  shaft.position.y = h / 2;
  shaft.castShadow = true; shaft.receiveShadow = true;
  g.add(shaft);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 1.2), toon(C.wallLow));
  base.position.y = 0.09;
  g.add(base);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 1.3), toon(C.wall));
  cap.position.y = h - 0.3;
  g.add(cap);
  g.userData.spheres = [{ pos: [0, h * 0.5, 0], r: 0.55 }];
  return g;
}

/** Departure board: dark panel with rows of coloured flight strips. */
function makeBoard(w = 7, h = 3.4) {
  const g = new THREE.Group();
  const frame = flatBox(w + 0.4, h + 0.4, 0.34, C.navy);
  g.add(frame);
  const screen = flatBox(w, h, 0.12, 0x121a26);
  screen.position.z = 0.16;
  g.add(screen);
  const rng = makeRng(77 + Math.round(w * 13));
  for (let r = 0; r < 7; r++) {
    const y = h / 2 - 0.42 - r * (h / 8);
    const line = flatBox(w * rand(rng, 0.55, 0.92), 0.16, 0.06, r % 3 === 0 ? C.orange : 0xdfe6ee);
    line.position.set(-w * 0.06, y, 0.24);
    g.add(line);
    const tag = flatBox(0.7, 0.2, 0.06, r % 4 === 0 ? C.red : C.yellow);
    tag.position.set(w * 0.36, y, 0.24);
    g.add(tag);
  }
  return g;
}

/** Hanging sign with an arrow — abstract blocks instead of text. */
function makeSignPanel(w = 4.4, color = C.blue) {
  const g = new THREE.Group();
  const panel = flatBox(w, 1.2, 0.16, color);
  g.add(panel);
  const bar = flatBox(w * 0.5, 0.2, 0.05, 0xf4f2ea);
  bar.position.set(0, 0.16, 0.12);
  g.add(bar);
  const arrow = flatBox(0.9, 0.34, 0.05, 0xf4f2ea);
  arrow.position.set(-w * 0.22, -0.22, 0.12);
  g.add(arrow);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), toon(0xf4f2ea));
  head.rotation.z = -Math.PI / 2;
  head.position.set(-w * 0.22 + 0.66, -0.22, 0.12);
  g.add(head);
  for (const s of [-1, 1]) {
    const rod = flatBox(0.1, 1.6, 0.1, C.metalDark);
    rod.position.set(s * w * 0.34, 1.35, 0);
    g.add(rod);
  }
  return g;
}

function makeCheckInDesk() {
  const g = new THREE.Group();
  const w = 5.6;
  const counter = flatBox(w, 1.15, 1.5, C.wall);
  counter.position.y = 0.575;
  g.add(counter);
  const top = flatBox(w + 0.2, 0.12, 1.7, C.metalDark);
  top.position.y = 1.21;
  g.add(top);
  // back wall with a scaled-up airline board
  const back = flatBox(w + 1.0, 3.0, 0.3, C.wallLow);
  back.position.set(0, 1.5, -3.0);
  g.add(back);
  const plate = flatBox(w * 0.8, 0.9, 0.12, C.navy);
  plate.position.set(0, 2.4, -2.82);
  g.add(plate);
  const strip = flatBox(w * 0.6, 0.22, 0.06, C.orange);
  strip.position.set(0, 2.4, -2.72);
  g.add(strip);
  // monitor, scale and a divider
  const monitor = flatBox(0.9, 0.6, 0.1, 0x1b2430);
  monitor.position.set(-w * 0.24, 1.55, 0.2);
  g.add(monitor);
  for (const s of [-1, 1]) {
    const div = flatBox(0.18, 1.1, 1.3, C.blue);
    div.position.set(s * w * 0.5, 0.55, 0);
    g.add(div);
  }
  const scale = flatBox(1.1, 0.08, 0.9, C.metal);
  scale.position.set(w * 0.2, 1.28, 0.9);
  g.add(scale);
  g.userData.boxes = [
    { pos: [0, 0.61, 0], half: [w / 2, 0.61, 0.85] },
    { pos: [0, 1.5, -3.0], half: [(w + 1) / 2, 1.5, 0.15] },
  ];
  return g;
}

function makeMetalDetector() {
  const g = new THREE.Group();
  const mat = toon(C.navy);
  for (const s of [-1, 1]) {
    const post = flatBox(0.26, 2.3, 0.3, C.navy);
    post.position.set(s * 0.72, 1.15, 0);
    g.add(post);
    const foot = flatBox(0.7, 0.12, 0.9, C.metalDark);
    foot.position.set(s * 0.72, 0.06, 0);
    g.add(foot);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.32, 0.3), mat);
  beam.position.y = 2.35;
  beam.castShadow = true;
  g.add(beam);
  const lamp = flatBox(0.5, 0.12, 0.06, C.teal);
  lamp.position.set(0, 2.5, 0.18);
  g.add(lamp);
  g.userData.boxes = [
    { pos: [-0.72, 1.15, 0], half: [0.13, 1.15, 0.16] },
    { pos: [0.72, 1.15, 0], half: [0.13, 1.15, 0.16] },
  ];
  return g;
}

function makeXrayScanner() {
  const g = new THREE.Group();
  const body = flatBox(2.7, 1.5, 1.1, C.metalDark);
  body.position.y = 0.75;
  g.add(body);
  const arch = flatBox(2.9, 0.5, 1.2, C.navy);
  arch.position.y = 1.7;
  g.add(arch);
  for (const s of [-1, 1]) {
    const leg = flatBox(0.3, 1.5, 1.2, C.navy);
    leg.position.set(s * 1.3, 0.75, 0);
    g.add(leg);
  }
  const belt = flatBox(3.6, 0.16, 0.8, C.rubber);
  belt.position.set(0.5, 1.54, 0);
  g.add(belt);
  for (const s of [-1, 1]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.82, 8), toon(C.metal));
    roller.rotation.x = Math.PI / 2;
    roller.position.set(0.5 + s * 1.75, 1.54, 0);
    g.add(roller);
  }
  const tray = flatBox(0.7, 0.16, 0.6, 0xd8532f);
  tray.position.set(-0.3, 1.68, 0);
  g.add(tray);
  g.userData.boxes = [{ pos: [0, 0.78, 0], half: [1.5, 0.78, 0.6] }];
  return g;
}

function makeBenchRow(n = 6) {
  const g = new THREE.Group();
  const w = n * 0.78 + 0.3;
  const base = flatBox(w, 0.34, 0.62, C.metalDark);
  base.position.y = 0.17;
  g.add(base);
  const back = flatBox(w, 0.62, 0.16, C.seat);
  back.position.set(0, 0.72, -0.3);
  g.add(back);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.4 + i * 0.78;
    const cushion = flatBox(0.62, 0.14, 0.5, i % 2 ? C.seat : C.seatAlt);
    cushion.position.set(x, 0.41, 0.02);
    g.add(cushion);
    const arm = flatBox(0.12, 0.34, 0.56, C.metalDark);
    arm.position.set(x - 0.39, 0.62, 0);
    g.add(arm);
  }
  g.userData.boxes = [{ pos: [0, 0.42, 0], half: [w / 2, 0.42, 0.36] }];
  return g;
}

function makeFoodTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 14), toon(0xe4ded0));
  top.position.y = 0.75;
  top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.75, 8), toon(C.metalDark));
  ped.position.y = 0.375;
  g.add(ped);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12), toon(C.metalDark));
  foot.position.y = 0.03;
  g.add(foot);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const cx = Math.cos(a) * 1.05, cz = Math.sin(a) * 1.05;
    const seat = flatBox(0.42, 0.1, 0.42, C.orange);
    seat.position.set(cx, 0.46, cz);
    seat.rotation.y = -a;
    g.add(seat);
    const backr = flatBox(0.42, 0.5, 0.1, C.orange);
    backr.position.set(Math.cos(a) * 1.28, 0.7, Math.sin(a) * 1.28);
    backr.rotation.y = -a;
    g.add(backr);
    const leg = flatBox(0.08, 0.44, 0.08, C.metalDark);
    leg.position.set(cx, 0.22, cz);
    g.add(leg);
  }
  g.userData.boxes = [{ pos: [0, 0.5, 0], half: [1.5, 0.5, 1.5] }];
  return g;
}

function makeCafeCounter(len = 8) {
  const g = new THREE.Group();
  const counter = flatBox(len, 1.1, 1.0, 0xe6e1d5);
  counter.position.y = 0.55;
  g.add(counter);
  const top = flatBox(len + 0.2, 0.1, 1.2, 0x6b4a33);
  top.position.y = 1.15;
  g.add(top);
  const hood = flatBox(len, 1.3, 0.14, C.metal);
  hood.position.set(0, 2.6, -0.5);
  g.add(hood);
  for (let i = 0; i < 4; i++) {
    const lamp = flatBox(0.9, 0.14, 0.14, C.yellow);
    lamp.position.set(-len / 2 + 0.9 + i * (len - 1.8) / 3, 3.3, -0.42);
    g.add(lamp);
  }
  for (let i = 1; i < 3; i++) {
    const gast = flatBox(0.7, 0.6, 0.5, C.metalDark);
    gast.position.set(len / 2 + 0.5 + i * 0.9, 0.3, -0.4);
    g.add(gast);
  }
  g.userData.boxes = [
    { pos: [0, 0.6, 0], half: [len / 2, 0.6, 0.6] },
    { pos: [0, 2.6, -0.5], half: [len / 2, 0.65, 0.1] },
  ];
  return g;
}

function makeShelfUnit(len = 3.4) {
  const g = new THREE.Group();
  const rng = makeRng(311 + Math.round(len * 7));
  const frame = flatBox(len, 2.1, 0.5, 0xd8cfbc);
  frame.position.y = 1.05;
  frame.castShadow = true;
  g.add(frame);
  for (let r = 0; r < 4; r++) {
    const y = 0.45 + r * 0.5;
    const shelf = flatBox(len - 0.2, 0.06, 0.54, 0xb9ad95);
    shelf.position.set(0, y, 0.02);
    g.add(shelf);
    let x = -len / 2 + 0.25;
    while (x < len / 2 - 0.3) {
      const bw = rand(rng, 0.08, 0.2);
      const bk = flatBox(bw, rand(rng, 0.24, 0.34), 0.34, C.book[Math.floor(rng() * C.book.length)]);
      bk.position.set(x + bw / 2, y + 0.18, 0.06);
      g.add(bk);
      x += bw + 0.03;
    }
  }
  g.userData.boxes = [{ pos: [0, 1.05, 0], half: [len / 2, 1.05, 0.3] }];
  return g;
}

/** Escalator: stepped boxes climbing +Z from the deck to `rise`. */
function makeEscalator(len = 9.2, rise = MEZZ, width = 3.0) {
  const g = new THREE.Group();
  const steps = Math.max(6, Math.round(rise / 0.34));
  const stepD = len / steps;
  const boxes = [];
  for (let i = 0; i < steps; i++) {
    const y = (i + 1) * (rise / steps);
    const tread = flatBox(width, y, stepD + 0.08, 0xb9bec4);
    tread.position.set(0, y / 2, stepD * (i + 0.5));
    g.add(tread);
    // a bright step edge so the climb reads at speed
    const nose = flatBox(width, 0.05, 0.1, C.yellow);
    nose.position.set(0, y - 0.02, stepD * (i + 0.5) - stepD / 2 + 0.05);
    g.add(nose);
    if (i % 2 === 0) boxes.push({ pos: [0, y / 2, stepD * (i + 0.5)], half: [width / 2, y / 2, stepD / 2] });
  }
  // inclined balustrades + handrails
  const slope = Math.hypot(len, rise);
  const ang = Math.atan2(rise, len);
  for (const s of [-1, 1]) {
    const balu = flatBox(0.1, 1.0, slope, 0x9fb6c6);
    balu.position.set(s * (width / 2 + 0.06), rise / 2 + 0.5, len / 2);
    balu.rotation.x = -ang;
    g.add(balu);
    const rail = flatBox(0.16, 0.14, slope, C.rubber);
    rail.position.set(s * (width / 2 + 0.06), rise / 2 + 1.0, len / 2);
    rail.rotation.x = -ang;
    g.add(rail);
  }
  const landing = flatBox(width, 0.3, 1.4, 0xb0b5bb);
  landing.position.set(0, rise - 0.15, len + 0.7);
  g.add(landing);
  boxes.push({ pos: [0, rise - 0.15, len + 0.7], half: [width / 2, 0.15, 0.7] });
  g.userData.boxes = boxes;
  return g;
}

function makeMezzanineRail(len) {
  const g = new THREE.Group();
  const rng = makeRng(4242 + Math.round(len));
  const deck = flatBox(len, 0.4, 9.0, C.floorAlt);
  deck.position.set(0, MEZZ - 0.2, 4.5);
  deck.receiveShadow = true;
  g.add(deck);
  const lip = flatBox(len, 0.22, 0.4, C.metalDark);
  lip.position.set(0, MEZZ + 0.05, 0.1);
  g.add(lip);
  for (let i = 0; i <= Math.round(len / 2.4); i++) {
    const post = flatBox(0.1, 1.0, 0.1, C.metalDark);
    post.position.set(-len / 2 + i * (len / Math.round(len / 2.4)), MEZZ + 0.9, 0);
    g.add(post);
  }
  const rail = flatBox(len, 0.14, 0.18, C.navy);
  rail.position.set(0, MEZZ + 1.42, 0);
  g.add(rail);
  const mid = flatBox(len, 0.08, 0.1, C.metal);
  mid.position.set(0, MEZZ + 0.72, 0);
  g.add(mid);
  // a few seats and a plant up on the deck
  for (let i = 0; i < 3; i++) {
    const x = -len / 2 + 8 + i * 18;
    const b = makeBenchRow(4);
    b.position.set(x, MEZZ, 5.4);
    b.rotation.y = Math.PI;
    g.add(b);
  }
  for (let i = 0; i < 4; i++) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.7, 10), toon(0x8a6a4a));
    pot.position.set(-len / 2 + 5 + i * 28, MEZZ + 0.35, 8.2);
    g.add(pot);
    const bush = new THREE.Mesh(facet(new THREE.IcosahedronGeometry(0.85, 0)), toon(0x4f9e5a));
    bush.position.set(pot.position.x, MEZZ + 1.25, 8.2);
    g.add(bush);
  }
  g.userData.boxes = [
    { pos: [0, MEZZ - 0.2, 4.5], half: [len / 2, 0.2, 4.5] },
    { pos: [0, MEZZ + 0.9, 0], half: [len / 2, 0.55, 0.15] },
  ];
  g.userData.rng = rng;
  return g;
}

function makeCarousel() {
  const g = new THREE.Group();
  const bed = flatBox(12, 0.5, 3.4, 0x5b6167);
  bed.position.y = 0.9;
  bed.receiveShadow = true;
  g.add(bed);
  const belt = flatBox(11.2, 0.14, 2.6, C.rubber);
  belt.position.y = 1.18;
  g.add(belt);
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.5, 16), toon(0x5b6167));
    end.position.set(s * 6, 0.9, 0);
    g.add(end);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.14, 16), toon(C.rubber));
    cap.position.set(s * 6, 1.18, 0);
    g.add(cap);
  }
  const rng = makeRng(5150);
  const bags = [];
  for (let i = 0; i < 7; i++) {
    const bag = flatBox(rand(rng, 0.5, 0.8), 0.36, rand(rng, 0.34, 0.5),
      [C.navy, C.red, 0x8a6a4a, C.teal][Math.floor(rng() * 4)]);
    bag.position.set(rand(rng, -5, 5), 1.4, rand(rng, -1.4, 1.4));
    bag.rotation.y = rng() * 0.6;
    g.add(bag);
    bags.push(bag);
  }
  // a sloped chute feeding the belt
  const chute = flatBox(1.4, 0.12, 3.0, C.metal);
  chute.position.set(-7.6, 1.4, 0);
  chute.rotation.z = -0.5;
  g.add(chute);
  g.userData.boxes = [{ pos: [0, 0.9, 0], half: [7.3, 0.5, 1.7] }];
  g.userData.bags = bags;
  return g;
}

/** Telescoping jet bridge tube, nose at local +Z, angled by the caller. */
function makeJetBridge() {
  const g = new THREE.Group();
  const rotunda = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.4, 14), toon(0xd7d3c8));
  rotunda.position.y = 1.7;
  rotunda.castShadow = true;
  g.add(rotunda);
  const tube = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.8, 11.0), toon(0xe2ded3));
  tube.position.set(0, 3.0, 6.4);
  tube.castShadow = true;
  g.add(tube);
  const tube2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.4, 6.0), toon(0xd0ccc0));
  tube2.position.set(0, 3.0, 14.0);
  g.add(tube2);
  for (let i = 0; i < 6; i++) {
    const win = flatBox(0.06, 0.7, 0.9, C.glass);
    win.position.set(1.5, 3.4, 2.6 + i * 1.7);
    g.add(win);
    const win2 = win.clone();
    win2.position.x = -1.5;
    g.add(win2);
  }
  const door = flatBox(2.3, 2.2, 0.14, C.navy);
  door.position.set(0, 2.6, 17.1);
  g.add(door);
  const cabTop = flatBox(3.2, 0.3, 4.0, 0xc9c5b9);
  cabTop.position.set(0, 4.5, 16.0);
  g.add(cabTop);
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 12), toon(C.rubber));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 1.6, 0.62, 14.0);
    g.add(wheel);
    const stanch = flatBox(0.2, 2.4, 0.2, C.metalDark);
    stanch.position.set(s * 1.6, 2.0, 14.0);
    g.add(stanch);
  }
  g.userData.boxes = [{ pos: [0, 3.0, 8.0], half: [1.6, 1.5, 8.0] }];
  return g;
}

/** Parked widebody. Fuselage runs along +X so the colliders stay axis-aligned. */
function makeAircraft() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 40, 18), toon(0xf1f2f0));
  body.rotation.z = Math.PI / 2;
  body.position.y = 3.6;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(3.0, 4.5, 18), toon(0xe9eae8));
  nose.rotation.z = Math.PI / 2;
  nose.position.set(-22.2, 3.6, 0);
  g.add(nose);
  const tailcone = new THREE.Mesh(new THREE.ConeGeometry(3.0, 5.0, 18), toon(0xe9eae8));
  tailcone.rotation.z = -Math.PI / 2;
  tailcone.position.set(22.4, 3.6, 0);
  g.add(tailcone);
  // belly stripe + tail livery
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.05, 40, 18, 1, true, 0, Math.PI * 0.42), toon(C.blue));
  stripe.rotation.z = Math.PI / 2;
  stripe.position.y = 3.6;
  g.add(stripe);
  // wings sweep back from mid-span
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.55, 30), toon(0xe4e6e4));
  wing.position.set(0, 3.05, 0);
  wing.rotation.y = 0.22;
  wing.castShadow = true;
  g.add(wing);
  const wingtip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 4.2), toon(C.blue));
  wingtip.position.set(0.9, 3.1, 14.6);
  wingtip.rotation.y = 0.22;
  g.add(wingtip);
  const wingtip2 = wingtip.clone();
  wingtip2.position.z = -14.6;
  g.add(wingtip2);
  // tail fin + stabilisers
  const fin = new THREE.Mesh(new THREE.BoxGeometry(4.6, 8.4, 0.9), toon(0xe4e6e4));
  fin.position.set(17.0, 7.4, 0);
  fin.rotation.z = -0.34;
  fin.castShadow = true;
  g.add(fin);
  const finTip = flatBox(2.4, 2.4, 0.95, C.orange);
  finTip.position.set(18.2, 10.6, 0);
  g.add(finTip);
  for (const s of [-1, 1]) {
    const stab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 11), toon(0xe4e6e4));
    stab.position.set(21.5, 5.4, s * 4.4);
    stab.rotation.y = -s * 0.3;
    g.add(stab);
  }
  // engines under the wing
  for (const s of [-1, 1]) {
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 4.6, 14), toon(0xd8dad8));
    nac.rotation.z = Math.PI / 2;
    nac.position.set(2.4, 2.5, s * 9.0);
    nac.castShadow = true;
    g.add(nac);
    const inlet = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.4, 14), toon(0x2c3138));
    inlet.rotation.z = Math.PI / 2;
    inlet.position.set(0.1, 2.5, s * 9.0);
    g.add(inlet);
    const pylon = flatBox(1.4, 1.2, 0.5, C.metalDark);
    pylon.position.set(2.4, 3.4, s * 9.0);
    g.add(pylon);
  }
  // cabin windows + doors
  for (let i = 0; i < 16; i++) {
    const x = -17 + i * 2.2;
    for (const s of [-1, 1]) {
      const w = flatBox(0.5, 0.42, 0.08, 0x3d4a58);
      w.position.set(x, 4.0, s * 2.98);
      g.add(w);
    }
  }
  for (const x of [-18.5, -4, 13]) {
    const d = flatBox(1.7, 2.4, 0.12, 0xd5d7d5);
    d.position.set(x, 3.3, -2.96);
    g.add(d);
  }
  // landing gear
  for (const p of [[-13, 5.2], [-13, -5.2], [9, 2.4], [9, -2.4]]) {
    const strut = flatBox(0.3, 2.4, 0.3, C.metalDark);
    strut.position.set(p[0], 1.3, p[1]);
    g.add(strut);
  }
  for (const p of [[-13, 3.7], [-13, -3.7], [11, 3.7], [11, -3.7]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.42, 12), toon(C.rubber));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(p[0], 0.75, p[1]);
    g.add(wheel);
  }
  // Fuselage runs along X, so every collider can stay axis-aligned.
  g.userData.boxes = [
    { pos: [0, 3.6, 0], half: [20.5, 3.05, 3.05] },
    { pos: [0, 3.05, 0], half: [3.6, 0.4, 14.5] },
    { pos: [17.0, 7.6, 0], half: [2.6, 4.4, 0.6] },
    { pos: [2.4, 2.5, 9.0], half: [2.4, 1.8, 1.8] },
    { pos: [2.4, 2.5, -9.0], half: [2.4, 1.8, 1.8] },
  ];
  g.userData.spheres = [];
  return g;
}

function makeFuelTruck() {
  const g = new THREE.Group();
  const cab = flatBox(2.4, 1.9, 2.8, 0xe8e4d6);
  cab.position.set(0, 1.15, 3.6);
  g.add(cab);
  const wind = flatBox(2.1, 0.8, 0.12, 0x3d4a58);
  wind.position.set(0, 1.7, 5.0);
  g.add(wind);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 5.4, 16), toon(0xc9cfd4));
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 1.9, -0.6);
  tank.castShadow = true;
  g.add(tank);
  const chassis = flatBox(2.4, 0.5, 8.4, C.metalDark);
  chassis.position.set(0, 0.7, 0.8);
  g.add(chassis);
  for (const p of [[-1.1, 3.6], [1.1, 3.6], [-1.1, -1.4], [1.1, -1.4], [-1.1, -2.8], [1.1, -2.8]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.36, 12), toon(C.rubber));
    w.rotation.z = Math.PI / 2;
    w.position.set(p[0], 0.52, p[1]);
    g.add(w);
  }
  const hose = flatBox(0.28, 0.28, 3.4, 0x2c3138);
  hose.position.set(0, 2.6, -3.4);
  hose.rotation.x = 0.4;
  g.add(hose);
  g.userData.boxes = [{ pos: [0, 1.6, 0.4], half: [1.3, 1.6, 4.6] }];
  return g;
}

function makeBus() {
  const g = new THREE.Group();
  const body = flatBox(2.6, 2.7, 10.5, 0xdfe3e6);
  body.position.y = 1.75;
  body.castShadow = true;
  g.add(body);
  const stripe = flatBox(2.64, 0.5, 10.52, C.blue);
  stripe.position.y = 1.1;
  g.add(stripe);
  for (const s of [-1, 1]) {
    const win = flatBox(0.08, 1.0, 9.4, 0x3d4a58);
    win.position.set(s * 1.32, 2.3, 0);
    g.add(win);
  }
  const wind = flatBox(2.3, 1.2, 0.1, 0x3d4a58);
  wind.position.set(0, 2.2, 5.28);
  g.add(wind);
  for (const p of [[-1.2, 3.6], [1.2, 3.6], [-1.2, -3.4], [1.2, -3.4]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12), toon(C.rubber));
    w.rotation.z = Math.PI / 2;
    w.position.set(p[0], 0.6, p[1]);
    g.add(w);
  }
  g.userData.boxes = [{ pos: [0, 1.75, 0], half: [1.4, 1.5, 5.3] }];
  return g;
}

function makeBaggageCart(rng) {
  const g = new THREE.Group();
  const bed = flatBox(1.5, 0.22, 2.4, 0x9aa0a6);
  bed.position.y = 0.72;
  g.add(bed);
  for (const s of [-1, 1]) {
    const rail = flatBox(0.1, 0.7, 2.4, C.metalDark);
    rail.position.set(s * 0.72, 1.1, 0);
    g.add(rail);
  }
  const handle = flatBox(0.9, 0.1, 0.1, C.metalDark);
  handle.position.set(0, 0.95, 1.35);
  g.add(handle);
  for (const p of [[-0.6, 0.8], [0.6, 0.8], [-0.6, -0.8], [0.6, -0.8]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 10), toon(C.rubber));
    w.rotation.z = Math.PI / 2;
    w.position.set(p[0], 0.26, p[1]);
    g.add(w);
  }
  for (let i = 0; i < 3; i++) {
    const bag = flatBox(rand(rng, 0.5, 0.7), 0.34, rand(rng, 0.4, 0.6), [C.navy, C.red, 0x8a6a4a][Math.floor(rng() * 3)]);
    bag.position.set(rand(rng, -0.4, 0.4), 1.0 + (i === 2 ? 0.34 : 0), rand(rng, -0.8, 0.8));
    bag.rotation.y = rng() * 0.6;
    g.add(bag);
  }
  g.userData.boxes = [{ pos: [0, 0.85, 0], half: [0.8, 0.6, 1.25] }];
  return g;
}

function makeControlTower() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.8, 26, 12), toon(C.concrete));
  shaft.position.y = 13;
  shaft.castShadow = true;
  g.add(shaft);
  const cab = flatBox(6.0, 3.0, 6.0, 0x8fa6b8);
  cab.position.y = 27.5;
  g.add(cab);
  const band = flatBox(6.2, 0.6, 6.2, C.navy);
  band.position.y = 25.8;
  g.add(band);
  const roof = flatBox(5.0, 0.5, 5.0, C.metalDark);
  roof.position.y = 29.3;
  g.add(roof);
  const radarPole = flatBox(0.2, 2.2, 0.2, C.metalDark);
  radarPole.position.y = 30.6;
  g.add(radarPole);
  const hub = new THREE.Group();
  hub.position.y = 31.6;
  const dish = flatBox(1.8, 0.12, 0.3, 0xd8dde2);
  dish.rotation.z = 0.5;
  hub.add(dish);
  g.add(hub);
  g.userData.boxes = [{ pos: [0, 13, 0], half: [2.6, 13, 2.6] }];
  g.userData.extra = hub;
  return g;
}

// ---------------------------------------------------------------------------

export const terminal = {
  id: 'terminal',
  label: 'Airport Terminal',
  hint: 'Glass concourse, security lanes and a parked jet — tight quarters.',
  sky: 0x9ec9e8,
  fog: { color: 0xcfe0ea, density: 0.0022 },
  sun: { color: 0xfff2d8, intensity: 2.0, position: [-90, 160, -140] },
  hemi: { sky: 0xdceaf5, ground: 0x9a968c, intensity: 1.05 },
  spawn: { x: 0, y: 0.12, z: 4, yaw: Math.PI },
  bounds: { radius: 150, ceiling: 70 },

  colliders: [],
  gates: [],
  _dyn: [],

  build(scene) {
    const rng = makeRng(20091);
    this.colliders = [];
    this.gates = [];
    this._dyn = [];

    const root = new THREE.Group();
    root.name = 'env:terminal';
    this.root = root;
    scene.add(root);

    // ---- flat world: everything sits on the same deck -----------------------
    this.groundHeight = () => 0;

    const addFlat = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.receiveShadow = true; root.add(mesh); };
    const plane = (w, d, color, y = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), toon(color));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      return m;
    };

    addFlat(plane(900, 900, C.grass, -0.08), 0, -0.08, 0);
    addFlat(plane(340, 250, C.tarmac, -0.05), 0, -0.05, -55);
    addFlat(plane(16, 300, C.tarmacDark, -0.045), 0, -0.045, -140);
    // runway markings
    for (let i = 0; i < 22; i++) {
      addFlat(plane(0.7, 12, C.line, -0.04), 0, -0.04, -30 - i * 12);
    }
    // terminal apron + taxi lines
    for (let i = 0; i < 5; i++) {
      addFlat(plane(60, 0.5, C.taxi, -0.04), 0, -0.04, -30 - i * 8);
    }

    // ---- terminal floor (tiled) --------------------------------------------
    addFlat(plane(HX * 2, ZB - ZF, C.floor, -0.02), 0, -0.02, (ZF + ZB) / 2);
    for (let i = -5; i <= 5; i++) {
      addFlat(plane(0.14, ZB - ZF, C.floorAlt, -0.012), i * 9, -0.012, (ZF + ZB) / 2);
    }
    for (let i = -2; i <= 2; i++) {
      addFlat(plane(HX * 2, 0.14, C.floorAlt, -0.012), 0, -0.012, i * 9);
    }

    // ---- shell: walls, glass, ceiling, columns ------------------------------
    const wallMat = toon(C.wall);
    const shellBoxes = [];
    const addShell = (w, h, d, x, y, z, mat = wallMat, project = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      m.castShadow = false;              // keep the sun lighting the interior
      root.add(m);
      if (project) shellBoxes.push({ pos: [x, y, z], half: [w / 2, h / 2, d / 2] });
      return m;
    };

    // back + side walls (solid, with a lower bulkhead band)
    addShell(HX * 2, CEIL, 1.0, 0, CEIL / 2, ZB);
    addShell(1.0, CEIL, ZB - ZF, -HX, CEIL / 2, (ZF + ZB) / 2);
    addShell(1.0, CEIL, ZB - ZF, HX, CEIL / 2, (ZF + ZB) / 2);
    addShell(HX * 2, 1.6, 0.35, 0, 0.8, ZB - 0.6, toon(C.wallLow));
    addShell(0.35, 1.6, ZB - ZF, -HX + 0.6, 0.8, (ZF + ZB) / 2, toon(C.wallLow));
    addShell(0.35, 1.6, ZB - ZF, HX - 0.6, 0.8, (ZF + ZB) / 2, toon(C.wallLow));

    // glass curtain wall on the apron side, split by the doorway
    const glassLen = HX - DOOR;
    for (const s of [-1, 1]) {
      const cx = s * (DOOR + glassLen / 2);
      const glass = makeGlassWall(glassLen, CEIL);
      glass.position.set(cx, 0, ZF);
      root.add(glass);
      root.add(makeMullions(glassLen, CEIL, null).translateX(cx).translateZ(ZF));
      shellBoxes.push({ pos: [cx, CEIL / 2, ZF], half: [glassLen / 2, CEIL / 2, 0.3] });
    }
    // lintel over the doorway
    addShell(DOOR * 2, CEIL - 5.6, 1.0, 0, 5.6 + (CEIL - 5.6) / 2, ZF);
    // doorway portal frame
    for (const s of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.6, 1.4), toon(C.navy));
      jamb.position.set(s * DOOR, 2.8, ZF);
      root.add(jamb);
    }

    // ceiling slab (collider only — castShadow is off so the hall stays lit)
    const ceil = flatBox(HX * 2 + 1, 0.6, ZB - ZF + 1, C.ceil);
    ceil.position.set(0, CEIL + 0.3, (ZF + ZB) / 2);
    ceil.castShadow = false;
    ceil.receiveShadow = false;
    root.add(ceil);
    shellBoxes.push({ pos: [0, CEIL + 0.3, (ZF + ZB) / 2], half: [HX + 0.5, 0.3, (ZB - ZF) / 2 + 0.5] });
    // ceiling light troughs
    for (let ix = -4; ix <= 4; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        const lamp = flatBox(6.5, 0.18, 1.4, C.panel);
        lamp.position.set(ix * 11, CEIL - 0.25, iz * 13);
        root.add(lamp);
      }
    }
    // roof fascia over the apron so the facade reads from outside
    addShell(HX * 2 + 3, 1.2, 0.6, 0, CEIL + 0.4, ZF - 0.4, toon(C.concrete), false);
    for (let i = -5; i <= 5; i++) {
      addShell(2.2, 0.25, 12, i * 10, CEIL + 1.4, ZF - 6, toon(C.concrete), false);
    }

    // columns
    for (const cx of [-36, -12, 12, 36]) {
      for (const cz of [-16, 0, 16]) {
        const col = makeColumn();
        col.position.set(cx, 0, cz);
        root.add(col);
        for (const s of col.userData.spheres) {
          this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(cx + s.pos[0], s.pos[1], cz + s.pos[2]), r: s.r });
        }
      }
    }

    // ---- shared prop placement ---------------------------------------------
    // Colliders are axis-aligned, so a prop rotated about Y gets the exact
    // AABB of its rotated boxes (|hx·cos| + |hz·sin| etc.) and its offsets
    // spun into world space.
    const place = (node, x, z, rotY = 0) => {
      node.position.set(x, 0, z);
      node.rotation.y = rotY;
      root.add(node);
      const cos = Math.cos(rotY), sin = Math.sin(rotY);
      const ca = Math.abs(cos), sa = Math.abs(sin);
      for (const b of node.userData.boxes || []) {
        const [ox, oy, oz] = b.pos;
        const wx = ox * cos + oz * sin;
        const wz = -ox * sin + oz * cos;
        this.colliders.push({
          type: 'box',
          center: new THREE.Vector3(x + wx, oy, z + wz),
          half: new THREE.Vector3(
            b.half[0] * ca + b.half[2] * sa,
            b.half[1],
            b.half[0] * sa + b.half[2] * ca
          ),
        });
      }
      for (const s of node.userData.spheres || []) {
        const [ox, oy, oz] = s.pos;
        const wx = ox * cos + oz * sin;
        const wz = -ox * sin + oz * cos;
        this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(x + wx, oy, z + wz), r: s.r });
      }
      return node;
    };
    this._place = place;

    // ---- check-in row along the back wall -----------------------------------
    for (const x of [-42, -30, -18, 6, 18, 30, 42]) {
      place(makeCheckInDesk(), x, 19.3, Math.PI);
    }

    // ---- security lane ------------------------------------------------------
    for (const x of [-7.5, -0.5, 6.5]) place(makeMetalDetector(), x, -13.5, 0);
    place(makeXrayScanner(), -16.5, -13.5, 0);
    place(makeXrayScanner(), 15.0, -13.5, 0);
    // queue stanchions
    for (let i = 0; i < 7; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.95, 8), toon(C.metal));
      post.position.set(-16 + i * 5.4, 0.48, -10.5);
      root.add(post);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 10), toon(C.rubber));
      base.position.set(post.position.x, 0.03, -10.5);
      root.add(base);
    }

    // ---- seating blocks -----------------------------------------------------
    for (const blockX of [-44, 24]) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          place(makeBenchRow(6), blockX + c * 6.6, -8 + r * 3.4, Math.PI);
        }
      }
      // a few single benches facing the windows
      for (let c = 0; c < 3; c++) place(makeBenchRow(4), blockX + c * 4.6, 6.5, 0);
    }

    // ---- food court (right, back) -------------------------------------------
    place(makeCafeCounter(9), 48.5, 13.5, Math.PI / 2);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) place(makeFoodTable(), 30 + c * 5.5, 6 + r * 5.5, 0);
    }
    // tray stations
    for (const x of [26, 44]) {
      const st = flatBox(1.6, 1.0, 0.9, C.wallLow);
      st.position.set(x, 0.5, 18.6);
      root.add(st);
      this.colliders.push({ type: 'box', center: new THREE.Vector3(x, 0.5, 18.6), half: new THREE.Vector3(0.8, 0.5, 0.45) });
    }

    // ---- newsstand (left, back) --------------------------------------------
    for (const x of [-50, -46.4]) place(makeShelfUnit(3.4), x, 12, Math.PI / 2);
    for (const x of [-50, -46.4]) place(makeShelfUnit(3.4), x, 16.5, Math.PI / 2);
    const magRack = new THREE.Group();
    const rack = flatBox(3.2, 1.7, 0.5, 0xb0a892);
    rack.position.y = 0.85;
    magRack.add(rack);
    magRack.userData.boxes = [{ pos: [0, 0.85, 0], half: [1.6, 0.85, 0.25] }];
    place(magRack, -36, 14.5, Math.PI / 2);
    const till = flatBox(2.6, 1.1, 1.0, 0xe6e1d5);
    till.position.set(-36, 0.55, 9.0);
    root.add(till);
    this.colliders.push({ type: 'box', center: new THREE.Vector3(-36, 0.55, 9.0), half: new THREE.Vector3(1.3, 0.55, 0.5) });

    // ---- mezzanine + escalators --------------------------------------------
    place(makeMezzanineRail(HX * 2 - 8), 0, 12, 0);
    place(makeEscalator(9.2, MEZZ, 3.0), -30, 2.0, 0);
    place(makeEscalator(9.2, MEZZ, 3.0), -22, 2.0, 0);
    place(makeEscalator(9.2, MEZZ, 3.0), 30, 2.0, 0);

    // ---- baggage carousel ---------------------------------------------------
    const carousel = makeCarousel();
    place(carousel, 34, -15, 0);
    this._dyn.push({ belts: [carousel.userData.bags] });
    place(makeSignPanel(4.8, C.blue), 34, -10.5, 0);

    // ---- boards + signage ---------------------------------------------------
    const board = makeBoard(8, 3.6);
    board.position.set(-2, 6.2, -6);
    root.add(board);
    const board2 = makeBoard(6, 3.0);
    board2.position.set(20, 6.2, 16);
    board2.rotation.y = Math.PI;
    root.add(board2);
    const bHang = flatBox(8, 0.14, 0.3, C.metalDark);
    bHang.position.set(-2, 8.1, -6);
    root.add(bHang);
    place(makeSignPanel(5.2, C.blue), -14, -12, 0);
    place(makeSignPanel(4.4, C.teal), 26, 0, Math.PI / 2);
    place(makeSignPanel(4.4, C.orange), -40, 0, -Math.PI / 2);
    place(makeSignPanel(5.0, C.blue), 0, ZF + 1.2, 0);

    // ---- apron: jet bridge, aircraft, ground vehicles -----------------------
    const bridge = makeJetBridge();
    bridge.position.set(2, 0, -24);
    bridge.rotation.y = Math.atan2(12, -13);
    root.add(bridge);
    {
      const cos = Math.cos(bridge.rotation.y), sin = Math.sin(bridge.rotation.y);
      const ca = Math.abs(cos), sa = Math.abs(sin);
      for (const b of bridge.userData.boxes) {
        const [ox, oy, oz] = b.pos;
        this.colliders.push({
          type: 'box',
          center: new THREE.Vector3(2 + ox * cos + oz * sin, oy, -24 - ox * sin + oz * cos),
          half: new THREE.Vector3(b.half[0] * ca + b.half[2] * sa, b.half[1], b.half[0] * sa + b.half[2] * ca),
        });
      }
    }
    place(makeAircraft(), 26, -42, 0);
    place(makeFuelTruck(), -24, -36, Math.PI / 2);
    place(makeBus(), -46, -48, 0.25);
    for (let i = 0; i < 3; i++) place(makeBaggageCart(rng), 6 + i * 3.4, -50, 0.1 * i);
    // tow tractor
    const tractor = flatBox(1.6, 1.2, 2.6, 0xe3d24a);
    tractor.position.set(-8, 0.9, -46);
    root.add(tractor);
    this.colliders.push({ type: 'box', center: new THREE.Vector3(-8, 0.9, -46), half: new THREE.Vector3(0.8, 0.7, 1.3) });
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 10), toon(C.rubber));
      w.rotation.z = Math.PI / 2;
      w.position.set(-8 + (i < 2 ? -0.85 : 0.85), 0.4, -46 + (i % 2 ? 0.8 : -0.8));
      root.add(w);
    }
    // cones along the taxi line
    for (let i = 0; i < 10; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), toon(C.orange));
      cone.position.set(-18 + i * 3.6, 0.3, -26);
      root.add(cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 8), toon(0xf4f2ea));
      band.position.set(cone.position.x, 0.33, cone.position.z);
      root.add(band);
    }
    const tower = makeControlTower();
    place(tower, -92, -84, 0);
    if (tower.userData.extra) this._dyn.push({ radar: tower.userData.extra });

    // ---- clouds -------------------------------------------------------------
    for (let i = 0; i < 12; i++) {
      const c = makeCloud(rng);
      c.position.set(rand(rng, -220, 220), 46 + rng() * 40, rand(rng, -260, 60));
      root.add(c);
    }

    // ---- launch pad + gate course -------------------------------------------
    root.add(makePad(1.6));

    // A lap that threads the hall, drops through the security lane, exits the
    // doorway onto the apron, and swings back past the parked jet.
    const layout = [
      { x: 0, z: -3, y: 3.0, yaw: 0 },
      { x: -26, z: -8, y: 3.2, yaw: 0 },
      { x: -26, z: -18, y: 3.4, yaw: Math.PI * 0.5 },
      { x: 0, z: -22, y: 3.0, yaw: 0 },
      { x: 0, z: -44, y: 7.2, yaw: 0 },
      { x: 18, z: -30, y: 8.5, yaw: 2.35 },
    ];
    layout.forEach((g, i) => {
      const node = makeGate(i);
      node.position.set(g.x, 0, g.z);
      node.rotation.y = g.yaw;
      root.add(node);
      const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw);
      this.gates.push({
        index: i,
        mesh: node,
        center: new THREE.Vector3(g.x, g.y, g.z),
        normal,
        radius: 1.9,
        passed: false,
      });
    });

    // shell colliders last
    for (const b of shellBoxes) {
      this.colliders.push({
        type: 'box',
        center: new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]),
        half: new THREE.Vector3(b.half[0], b.half[1], b.half[2]),
      });
    }
  },

  /** Per-frame animation: carousel belt, tower radar. */
  update(dt) {
    for (const d of this._dyn) {
      if (d.belts) {
        for (const bag of d.belts[0]) {
          bag.position.x += dt * 0.55;
          if (bag.position.x > 5.6) bag.position.x = -5.6;
        }
      }
      if (d.radar) d.radar.rotation.y += dt * 0.6;
    }
  },

  dispose(scene) {
    if (!this.root) return;
    scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.root = null;
    this.colliders = [];
    this.gates = [];
    this._dyn = [];
  },
};
