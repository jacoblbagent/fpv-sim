// CANYON — red rock desert: a flyable slot canyon cut between two ridge walls,
// mesas, arches, cacti, tumbleweed, and a fast gate course down the valley.

import * as THREE from 'three';
import { makeRng, rand, randRing } from '../utils.js';
import { buildTerrain } from './terrain.js';
import {
  PALETTE, toon, facet, flatBox, makeRock, makeMesa, makeCactus, makeCloud, makePad, makeGate,
} from './props.js';

const SAND = 0xe8c07a;
const SAND_DARK = 0xd8a95f;
const ROCK_TINT = 0xc4784a;

export const canyon = {
  id: 'canyon',
  label: 'Red Rock Canyon',
  hint: 'Fast and tight — the canyon floor funnels you into the gates.',
  sky: 0x8ccbe8,
  fog: { color: 0xe6c79c, density: 0.0042 },
  sun: { color: 0xffe0b0, intensity: 2.4, position: [-140, 170, -60] },
  hemi: { sky: 0xffe3c0, ground: 0xb07a45, intensity: 0.75 },
  spawn: { x: 0, y: 0.12, z: 70, yaw: Math.PI },
  bounds: { radius: 430, ceiling: 200 },

  colliders: [],
  gates: [],
  _dyn: [],

  build(scene) {
    const rng = makeRng(90210);
    this.colliders = [];
    this.gates = [];
    this._dyn = [];

    const root = new THREE.Group();
    root.name = 'env:canyon';
    this.root = root;
    scene.add(root);

    // ---- terrain: dune field plus two ridge walls forming the slot ---------
    const bells = [];
    // canyon walls: overlapping bells along z at x = -46 and x = +46
    for (let z = -220; z <= 240; z += 34) {
      const jitter = rand(rng, -8, 8);
      bells.push({ x: -46 + jitter, z, r: 58, h: rand(rng, 16, 27) });
      bells.push({ x: 46 + rand(rng, -8, 8), z: z + 17, r: 58, h: rand(rng, 15, 26) });
    }
    // scattered dunes and buttes further out
    for (let i = 0; i < 26; i++) {
      const p = randRing(rng, 130, 400);
      bells.push({ x: p.x, z: p.z, r: rand(rng, 40, 100), h: rand(rng, 4, 20) });
    }

    const sand = new THREE.Color(SAND);
    const sandDark = new THREE.Color(SAND_DARK);
    const rockTint = new THREE.Color(ROCK_TINT);

    const terrain = buildTerrain({
      size: 900, segs: 150, bells, skirtColor: 0xd9a86a,
      colorFn: (x, z, h, n, c) => {
        c.copy(sand).lerp(sandDark, n * 0.6);
        if (h > 4) c.lerp(rockTint, Math.min(0.85, (h - 4) / 16));
      },
    });
    this.terrain = terrain;
    root.add(terrain.mesh);
    this.groundHeight = terrain.height;

    root.add(makePad(1.6));

    // ---- mesas standing on the ridges --------------------------------------
    for (let i = 0; i < 14; i++) {
      const p = randRing(rng, 60, 380);
      const y = this.groundHeight(p.x, p.z);
      const m = makeMesa(rng);
      m.position.set(p.x, y, p.z);
      m.rotation.y = rng() * 6.28;
      root.add(m);
      const col = m.userData.collider;
      this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(p.x, y + col.offset, p.z), r: col.r });
    }

    // ---- rock arches -------------------------------------------------------
    for (let i = 0; i < 5; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * rand(rng, 26, 34);
      const z = -60 + i * 42;
      const y = this.groundHeight(x, z);
      const arch = makeArch(rng);
      arch.position.set(x, y, z);
      arch.rotation.y = rand(rng, -0.4, 0.4);
      root.add(arch);
      for (const c of arch.userData.colliders) {
        this.colliders.push({ type: 'sphere', pos: c.pos.clone().add(arch.position), r: c.r });
      }
    }

    // ---- cacti + rocks -----------------------------------------------------
    for (let i = 0; i < 70; i++) {
      const p = randRing(rng, 12, 380);
      const y = this.groundHeight(p.x, p.z);
      if (y > 14) continue;                         // nothing on the cliff faces
      const c = makeCactus(rng);
      c.position.set(p.x, y, p.z);
      c.rotation.y = rng() * 6.28;
      root.add(c);
      const col = c.userData.collider;
      this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(p.x, y + col.offset, p.z), r: col.r });
    }
    for (let i = 0; i < 90; i++) {
      const p = randRing(rng, 10, 400);
      const y = this.groundHeight(p.x, p.z);
      const r = makeRock(rng);
      r.position.set(p.x, y, p.z);
      r.rotation.y = rng() * 6.28;
      root.add(r);
      const col = r.userData.collider;
      this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(p.x, y + col.offset, p.z), r: col.r });
    }
    // ---- tumbleweeds (they roll, because of course they do) ----------------
    const tumbleMat = toon(0xb99a5c);
    for (let i = 0; i < 14; i++) {
      const p = randRing(rng, 20, 160);
      const t = new THREE.Mesh(facet(new THREE.IcosahedronGeometry(rand(rng, 0.35, 0.6), 0)), tumbleMat);
      t.position.set(p.x, this.groundHeight(p.x, p.z) + 0.5, p.z);
      t.castShadow = true;
      root.add(t);
      this._dyn.push({ mesh: t, speed: rand(rng, 1.2, 3.4), dir: rng() * 6.28 });
    }

    // ---- clouds ------------------------------------------------------------
    for (let i = 0; i < 16; i++) {
      const c = makeCloud(rng);
      const p = randRing(rng, 60, 400);
      c.position.set(p.x, 80 + rng() * 50, p.z);
      root.add(c);
    }

    // ---- gate course: a run down the canyon ---------------------------------
    const layout = [
      { x: 0, z: 40, y: 4.5, yaw: Math.PI },
      { x: -12, z: 0, y: 5.5, yaw: Math.PI },
      { x: 10, z: -40, y: 6.5, yaw: Math.PI },
      { x: -8, z: -80, y: 9.0, yaw: Math.PI },
      { x: 6, z: -120, y: 7.0, yaw: Math.PI },
      { x: 0, z: -160, y: 12.0, yaw: Math.PI * 0.5 },
    ];
    layout.forEach((g, i) => {
      const node = makeGate(i);
      const gh = this.groundHeight(g.x, g.z);
      node.position.set(g.x, gh, g.z);
      node.rotation.y = g.yaw;
      root.add(node);
      const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw);
      this.gates.push({
        index: i,
        mesh: node,
        center: new THREE.Vector3(g.x, gh + g.y, g.z),
        normal,
        radius: 1.9,
        passed: false,
      });
    });
  },

  update(dt) {
    for (const t of this._dyn) {
      t.mesh.position.x += Math.cos(t.dir) * t.speed * dt;
      t.mesh.position.z += Math.sin(t.dir) * t.speed * dt;
      t.mesh.rotation.x += t.speed * dt * 1.6;
      t.mesh.rotation.z += t.speed * dt * 1.1;
      // keep them on the sand
      const gh = this.groundHeight(t.mesh.position.x, t.mesh.position.z);
      t.mesh.position.y = gh + 0.5;
      if (Math.hypot(t.mesh.position.x, t.mesh.position.z) > 200) t.dir += Math.PI;
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

/** Sandstone arch: two pillars and a capstone. */
function makeArch(rng) {
  const g = new THREE.Group();
  const span = rand(rng, 5, 9);
  const h = rand(rng, 5, 8);
  const mat = toon(PALETTE.mesa);
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(facet(new THREE.CylinderGeometry(1.1, 1.6, h, 8)), mat);
    pillar.position.set(s * span * 0.5, h / 2, 0);
    pillar.castShadow = true; pillar.receiveShadow = true;
    g.add(pillar);
  }
  const cap = flatBox(span + 2.6, 1.7, 3.2, PALETTE.mesaTop);
  cap.position.y = h + 0.6;
  g.add(cap);

  g.userData.colliders = [
    { pos: new THREE.Vector3(-span * 0.5, h * 0.5, 0), r: 1.5 },
    { pos: new THREE.Vector3(span * 0.5, h * 0.5, 0), r: 1.5 },
  ];
  return g;
}