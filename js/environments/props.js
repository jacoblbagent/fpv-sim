// Reusable cartoon prop builders shared by every environment.
// Each builder returns a THREE.Group (or Mesh) plus optional collider hints,
// so new worlds can be assembled from the same vocabulary of shapes.

import * as THREE from 'three';
import { rand, randRing } from '../utils.js';

export const PALETTE = {
  grass: 0x7cc35a,
  grassDark: 0x5da844,
  dirt: 0xc9904f,
  trunk: 0x8a5a34,
  leafA: 0x54b04a,
  leafB: 0x6ecb57,
  pine: 0x2f7d4f,
  rock: 0x9aa3ab,
  rockDark: 0x7c858d,
  barn: 0xe0503a,
  roof: 0x8c3226,
  hay: 0xe8c45a,
  water: 0x4fb8e0,
  cloud: 0xfdfdff,
  wood: 0xa8763f,
  sand: 0xe8c07a,
  cactus: 0x4f9e5a,
  mesa: 0xd0703f,
  mesaTop: 0xe08f52,
  gate: 0x35d07f,
  gateAlt: 0xff8a3d,
  metal: 0xb9c3cc,
};

/** Toon material. MeshToonMaterial has no flatShading flag — use facet()
 *  on the geometry when you want a faceted low-poly look. */
export function toon(color, extra = {}) {
  const { flatShading, ...rest } = extra;   // eslint-disable-line no-unused-vars
  return new THREE.MeshToonMaterial({ color, ...rest });
}

/** Convert geometry to per-face normals so it shades faceted (low-poly look). */
export function facet(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

export function flatBox(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- vegetation

export function makePineTree(rng) {
  const g = new THREE.Group();
  const h = rand(rng, 3.2, 6.4);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, h * 0.42, 7), toon(PALETTE.trunk));
  trunk.position.y = h * 0.21;
  trunk.castShadow = true;
  g.add(trunk);

  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 1.75 * (1 - t * 0.55);
    const th = h * 0.34;
    const cone = new THREE.Mesh(
      facet(new THREE.ConeGeometry(r, th, 8)),
      toon(i % 2 ? PALETTE.pine : PALETTE.leafA)
    );
    cone.position.y = h * 0.34 + t * h * 0.42;
    cone.castShadow = true;
    g.add(cone);
  }
  g.userData.collider = { type: 'sphere', offset: h * 0.45, r: 0.45 };
  g.userData.height = h;
  return g;
}

export function makeRoundTree(rng) {
  const g = new THREE.Group();
  const h = rand(rng, 2.6, 4.6);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, h, 7), toon(PALETTE.trunk));
  trunk.position.y = h * 0.5;
  trunk.castShadow = true;
  g.add(trunk);

  const blobs = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < blobs; i++) {
    const r = rand(rng, 0.85, 1.35);
    const b = new THREE.Mesh(
      facet(new THREE.IcosahedronGeometry(r, 0)),
      toon(i % 2 ? PALETTE.leafA : PALETTE.leafB)
    );
    b.position.set(rand(rng, -0.6, 0.6), h + rand(rng, -0.35, 0.75), rand(rng, -0.6, 0.6));
    b.castShadow = true;
    g.add(b);
  }
  g.userData.collider = { type: 'sphere', offset: h, r: 1.35 };
  g.userData.height = h;
  return g;
}

export function makeBush(rng) {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const r = rand(rng, 0.35, 0.62);
    const b = new THREE.Mesh(facet(new THREE.IcosahedronGeometry(r, 0)), toon(PALETTE.leafB));
    b.position.set(rand(rng, -0.4, 0.4), r * 0.8, rand(rng, -0.4, 0.4));
    b.castShadow = true;
    g.add(b);
  }
  g.userData.collider = { type: 'sphere', offset: 0.5, r: 0.62 };
  return g;
}

export function makeFlower(rng) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 4), toon(0x4f8f3a));
  stem.position.y = 0.17;
  g.add(stem);
  const colors = [0xffd23f, 0xff6b8a, 0xffffff, 0xc08bff, 0xff9a3d];
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), toon(colors[Math.floor(rng() * colors.length)]));
  head.position.y = 0.36;
  g.add(head);
  return g;
}

export function makeCactus(rng) {
  const g = new THREE.Group();
  const h = rand(rng, 1.8, 3.6);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, h, 4, 8), toon(PALETTE.cactus));
  body.position.y = h * 0.5 + 0.26;
  body.castShadow = true;
  g.add(body);

  const arms = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < arms; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const armH = rand(rng, 0.7, 1.2);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, armH, 4, 7), toon(PALETTE.cactus));
    arm.position.set(side * 0.42, h * rand(rng, 0.5, 0.75), 0);
    arm.rotation.z = side * -0.35;
    arm.castShadow = true;
    g.add(arm);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.55, 4, 7), toon(PALETTE.cactus));
    up.position.set(side * 0.62, arm.position.y + armH * 0.5 + 0.2, 0);
    g.add(up);
  }
  g.userData.collider = { type: 'sphere', offset: h * 0.6, r: 0.5 };
  return g;
}

// -------------------------------------------------------------------- rocks

export function makeRock(rng) {
  const s = rand(rng, 0.5, 2.1);
  const geo = new THREE.DodecahedronGeometry(s, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) * rand(rng, 0.8, 1.25),
      pos.getY(i) * rand(rng, 0.6, 1.0),
      pos.getZ(i) * rand(rng, 0.8, 1.25));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(facet(geo), toon(rng() > 0.5 ? PALETTE.rock : PALETTE.rockDark));
  m.position.y = s * 0.45;
  m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  g.userData.collider = { type: 'sphere', offset: s * 0.45, r: s * 0.85 };
  return g;
}

export function makeMesa(rng) {
  const g = new THREE.Group();
  const rTop = rand(rng, 4, 9);
  const h = rand(rng, 5, 13);
  const lower = new THREE.Mesh(facet(new THREE.CylinderGeometry(rTop * 1.12, rTop * 1.35, h * 0.6, 9)), toon(PALETTE.mesa));
  lower.position.y = h * 0.3;
  lower.castShadow = true; lower.receiveShadow = true;
  g.add(lower);
  const upper = new THREE.Mesh(facet(new THREE.CylinderGeometry(rTop, rTop * 1.12, h * 0.4, 9)), toon(PALETTE.mesaTop));
  upper.position.y = h * 0.8;
  upper.castShadow = true;
  g.add(upper);
  g.userData.collider = { type: 'sphere', offset: h * 0.5, r: rTop * 1.15 };
  return g;
}

// ------------------------------------------------------------------ man-made

export function makeBarn() {
  const g = new THREE.Group();
  const w = 7, d = 10, h = 4.4;
  const body = flatBox(w, h, d, PALETTE.barn);
  body.position.y = h / 2;
  g.add(body);

  // gable roof from two slabs
  for (const s of [-1, 1]) {
    const roof = flatBox(w * 0.68, 0.22, d + 0.5, PALETTE.roof);
    roof.position.set(s * w * 0.26, h + 1.25, 0);
    roof.rotation.z = s * -0.72;
    g.add(roof);
  }
  const gableGeo = new THREE.BufferGeometry();
  const gable = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 2.2, d * 0.98), toon(PALETTE.barn));
  gable.position.y = h + 0.6;
  gable.castShadow = true;
  g.add(gable);

  // big door
  const door = flatBox(3.2, 3.2, 0.2, 0xd9d2c4);
  door.position.set(0, 1.6, d / 2 + 0.05);
  g.add(door);
  const doorX = flatBox(0.22, 3.2, 0.24, PALETTE.roof);
  doorX.position.set(0, 1.6, d / 2 + 0.12);
  doorX.rotation.z = 0.62;
  g.add(doorX);
  const doorX2 = doorX.clone();
  doorX2.rotation.z = -0.62;
  g.add(doorX2);

  const trim = flatBox(w + 0.2, 0.3, d + 0.2, 0xf2ece0);
  trim.position.y = 0.15;
  g.add(trim);

  g.userData.colliders = [{ type: 'box', center: new THREE.Vector3(0, h / 2, 0), half: new THREE.Vector3(w / 2, h / 2, d / 2) }];
  return g;
}

export function makeSilo() {
  const g = new THREE.Group();
  const r = 1.5, h = 8;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), toon(PALETTE.metal));
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xd6dde2));
  dome.position.y = h;
  dome.castShadow = true;
  g.add(dome);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.06, 5, 16), toon(0x8b949c));
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.4 + i * 2.4;
    g.add(band);
  }
  g.userData.collider = { type: 'sphere', offset: h * 0.5, r: r + 0.1 };
  return g;
}

export function makeHayBale(rng) {
  const g = new THREE.Group();
  const r = rand(rng, 0.55, 0.8);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 1.5, 12), toon(PALETTE.hay));
  m.rotation.z = Math.PI / 2;
  m.position.y = r;
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  g.userData.collider = { type: 'sphere', offset: r, r: r * 1.05 };
  return g;
}

export function makeFencePost() {
  const g = new THREE.Group();
  const post = flatBox(0.16, 1.25, 0.16, PALETTE.wood);
  post.position.y = 0.62;
  g.add(post);
  for (let i = 0; i < 2; i++) {
    const rail = flatBox(1.9, 0.11, 0.08, 0xc08c4f);
    rail.position.set(0.95, 0.5 + i * 0.42, 0);
    g.add(rail);
  }
  return g;
}

export function makeWindmill() {
  const g = new THREE.Group();
  const h = 9;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, h, 8), toon(0xe8e2d4));
  tower.position.y = h / 2;
  tower.castShadow = true;
  g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.6, 8), toon(PALETTE.roof));
  cap.position.y = h + 0.8;
  g.add(cap);

  const hub = new THREE.Group();
  hub.position.set(0, h + 0.2, 1.4);
  g.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = flatBox(0.3, 3.1, 0.08, 0xf6f1e4);
    blade.position.set(Math.sin(i * Math.PI / 2) * 1.55, Math.cos(i * Math.PI / 2) * 1.55, 0);
    blade.rotation.z = -i * Math.PI / 2;
    hub.add(blade);
  }
  g.userData.spin = hub;
  g.userData.collider = { type: 'sphere', offset: h * 0.5, r: 1.35 };
  return g;
}

export function makePond(rx, rz) {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 26), new THREE.MeshToonMaterial({ color: PALETTE.water }));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(rx, rz, 1);
  water.position.y = 0.02;
  g.add(water);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.1, 26), toon(PALETTE.dirt));
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(rx, rz, 1);
  rim.position.y = 0.03;
  g.add(rim);
  return g;
}

export function makeCloud(rng) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = rand(rng, 1.6, 3.4);
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshBasicMaterial({ color: PALETTE.cloud }));
    p.position.set(rand(rng, -3.4, 3.4), rand(rng, -0.5, 0.9), rand(rng, -2, 2));
    g.add(p);
  }
  return g;
}

/** Launch pad — a marked circle the quad spawns on. */
export function makePad(radius = 1.5) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 22), toon(0x3b4149));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.035;
  disc.receiveShadow = true;
  g.add(disc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.72, radius * 0.9, 22), toon(0xffd23f));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  const h = flatBox(radius * 0.8, 0.05, 0.16, 0xffd23f);
  h.position.y = 0.05;
  g.add(h);
  const v = flatBox(0.16, 0.05, radius * 0.8, 0xffd23f);
  v.position.y = 0.05;
  g.add(v);
  return g;
}

/** A race gate: torus ring on two legs, with a numbered banner. */
export function makeGate(index, radius = 1.9) {
  const g = new THREE.Group();
  const color = index % 2 === 0 ? PALETTE.gate : PALETTE.gateAlt;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.10, 8, 22), toon(color));
  ring.position.y = radius + 0.55;
  ring.castShadow = true;
  g.add(ring);
  // stripe
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.105, 6, 22, Math.PI * 0.42), toon(0xffffff));
  stripe.position.copy(ring.position);
  stripe.rotation.z = Math.PI * 0.28;
  g.add(stripe);

  for (const s of [-1, 1]) {
    const leg = flatBox(0.16, radius + 0.55, 0.16, 0x3b4149);
    leg.position.set(s * radius, (radius + 0.55) / 2, 0);
    g.add(leg);
    const foot = flatBox(0.5, 0.12, 0.5, 0x3b4149);
    foot.position.set(s * radius, 0.06, 0);
    g.add(foot);
  }

  const banner = flatBox(0.9, 0.6, 0.06, 0xf7f3e8);
  banner.position.set(0, radius * 2 + 1.35, 0);
  g.add(banner);
  return g;
}

/** Distribute props around the origin, skipping the spawn clearing. */
export function scatter(rng, count, minR, maxR, fn, clearing = 14) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 12) {
    const p = randRing(rng, minR, maxR);
    if (Math.hypot(p.x, p.z) < clearing) continue;
    out.push({ x: p.x, z: p.z, node: fn(rng) });
  }
  return out;
}