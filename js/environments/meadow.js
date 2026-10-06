// MEADOW — rolling green farmland: pines, orchards, a barn and silo, pond,
// hay bales, fences and a windmill, with a 6-gate time-trial course.

import * as THREE from 'three';
import { makeRng, rand, randRing } from '../utils.js';
import { buildTerrain, ringHills } from './terrain.js';
import {
  PALETTE, toon, flatBox, makePineTree, makeRoundTree, makeBush, makeFlower,
  makeRock, makeBarn, makeSilo, makeHayBale, makeFencePost, makeWindmill,
  makePond, makeCloud, makePad, makeGate,
} from './props.js';

export const meadow = {
  id: 'meadow',
  label: 'Sunny Meadow',
  hint: 'Open farmland — watch the treeline on fast passes.',
  sky: 0x9fd8f0,
  fog: { color: 0xcfe8f5, density: 0.0035 },
  sun: { color: 0xfff3d6, intensity: 2.1, position: [120, 190, 80] },
  hemi: { sky: 0xbfe4ff, ground: 0x6a9a4a, intensity: 0.85 },
  spawn: { x: 0, y: 0.12, z: 0, yaw: Math.PI },
  bounds: { radius: 430, ceiling: 220 },

  colliders: [],
  gates: [],
  _dyn: [],

  build(scene) {
    const rng = makeRng(20260);
    this.colliders = [];
    this.gates = [];
    this._dyn = [];

    const root = new THREE.Group();
    root.name = 'env:meadow';
    this.root = root;
    scene.add(root);

    // ---- terrain -----------------------------------------------------------
    const bells = ringHills(rng, { count: 10, minR: 110, maxR: 400, hMin: 7, hMax: 24 });
    const grass = new THREE.Color(PALETTE.grass);
    const grassDark = new THREE.Color(PALETTE.grassDark);
    const dirt = new THREE.Color(PALETTE.dirt);

    const terrain = buildTerrain({
      size: 900, segs: 128, bells, skirtColor: 0x9fbf85,
      colorFn: (x, z, h, n, c) => {
        const patch = n * 0.55 + Math.sin(x * 0.02) * 0.2 + Math.cos(z * 0.017) * 0.2;
        c.copy(grass).lerp(grassDark, Math.min(1, patch));
        if (h > 6) c.lerp(dirt, Math.min(0.55, (h - 6) / 26));   // bare hilltops
      },
    });
    this.terrain = terrain;
    root.add(terrain.mesh);
    this.groundHeight = terrain.height;

    // ---- pond (kept on the flat spawn shelf) --------------------------------
    const pond = makePond(11, 7.5);
    pond.position.set(-34, 0, 26);
    root.add(pond);

    // ---- pad ---------------------------------------------------------------
    root.add(makePad(1.6));

    // ---- trees -------------------------------------------------------------
    const addTree = (x, z, node) => {
      const y = this.groundHeight(x, z);
      node.position.set(x, y, z);
      node.rotation.y = rng() * Math.PI * 2;
      root.add(node);
      const col = node.userData.collider;
      if (col) this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(x, y + col.offset, z), r: col.r });
    };

    for (let i = 0; i < 46; i++) {
      const p = randRing(rng, 26, 300);
      if (Math.hypot(p.x + 34, p.z - 26) < 16) continue;   // keep the pond clear
      addTree(p.x, p.z, makePineTree(rng));
    }
    for (let i = 0; i < 40; i++) {
      const p = randRing(rng, 22, 320);
      if (Math.hypot(p.x + 34, p.z - 26) < 16) continue;
      addTree(p.x, p.z, makeRoundTree(rng));
    }
    // orchard rows — a tidy grid so the world reads as designed, not random
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 70 + col * 9;
        const z = -52 + row * 9;
        addTree(x, z, makeRoundTree(rng));
      }
    }

    // ---- bushes, flowers, rocks -------------------------------------------
    for (let i = 0; i < 48; i++) {
      const p = randRing(rng, 16, 330);
      const b = makeBush(rng);
      b.position.set(p.x, this.groundHeight(p.x, p.z), p.z);
      root.add(b);
    }
    for (let i = 0; i < 90; i++) {
      const p = randRing(rng, 8, 200);
      const f = makeFlower(rng);
      f.position.set(p.x, this.groundHeight(p.x, p.z), p.z);
      f.rotation.y = rng() * 6.28;
      root.add(f);
    }
    for (let i = 0; i < 34; i++) {
      const p = randRing(rng, 20, 340);
      const r = makeRock(rng);
      r.position.set(p.x, this.groundHeight(p.x, p.z), p.z);
      r.rotation.y = rng() * 6.28;
      root.add(r);
      const col = r.userData.collider;
      this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(p.x, this.groundHeight(p.x, p.z) + col.offset, p.z), r: col.r });
    }

    // ---- farmyard ----------------------------------------------------------
    const barn = makeBarn();
    barn.position.set(-70, 0, -48);
    barn.rotation.y = 0.5;
    root.add(barn);
    for (const c of barn.userData.colliders) {
      const p = c.center.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5).add(barn.position);
      this.colliders.push({ type: 'box', center: p, half: c.half });
    }

    const silo = makeSilo();
    silo.position.set(-60, 0, -40);
    root.add(silo);
    const sc = silo.userData.collider;
    this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(-60, sc.offset, -40), r: sc.r });

    for (let i = 0; i < 9; i++) {
      const bale = makeHayBale(rng);
      const x = -52 + rand(rng, -8, 8);
      const z = -26 + rand(rng, -8, 8);
      bale.position.set(x, 0, z);
      bale.rotation.y = rng() * 6.28;
      root.add(bale);
      const bc = bale.userData.collider;
      this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(x, bc.offset, z), r: bc.r });
    }

    const mill = makeWindmill();
    mill.position.set(58, 0, 62);
    root.add(mill);
    const mc = mill.userData.collider;
    this.colliders.push({ type: 'sphere', pos: new THREE.Vector3(58, mc.offset, 62), r: mc.r });
    this._dyn.push(mill.userData.spin);

    // ---- fence line along the orchard -------------------------------------
    for (let i = 0; i < 16; i++) {
      const post = makeFencePost();
      const x = 62 + i * 1.9;
      post.position.set(x, this.groundHeight(x, -60), -60);
      root.add(post);
    }

    // ---- clouds ------------------------------------------------------------
    for (let i = 0; i < 14; i++) {
      const c = makeCloud(rng);
      const p = randRing(rng, 40, 400);
      c.position.set(p.x, 70 + rng() * 55, p.z);
      root.add(c);
    }

    // ---- gate course -------------------------------------------------------
    // A lap that weaves through the farm: low gates, a high gate, and a
    // direction change, so it rewards real throttle and yaw control.
    const layout = [
      { x: 0, z: -30, y: 4.0, yaw: 0 },
      { x: -26, z: -58, y: 6.5, yaw: -0.7 },
      { x: -62, z: -18, y: 9.5, yaw: -1.5 },
      { x: -34, z: 24, y: 5.0, yaw: -2.4 },
      { x: 16, z: 30, y: 7.5, yaw: 2.9 },
      { x: 40, z: -6, y: 12.0, yaw: 1.9 },
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

  /** Per-frame environment animation (windmill, etc.). */
  update(dt) {
    for (const s of this._dyn) if (s) s.rotation.z += dt * 0.55;
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