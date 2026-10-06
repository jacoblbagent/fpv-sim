// Shared rolling-terrain builder. Vertices are laid out natively on the XZ
// plane so Y is height (no rotated PlaneGeometry axis confusion), with
// per-vertex colours for a hand-painted cartoon look.

import * as THREE from 'three';

/**
 * @param opts.size    world extent (square, centred on origin)
 * @param opts.segs    grid subdivisions
 * @param opts.bells   [{x, z, r, h}] cosine-bell hills
 * @param opts.colorFn (x, z, h, rngHash) -> THREE.Color
 * @param opts.skirtColor  optional colour for a huge flat plane beyond the
 *                         grid so the world edge is hidden by fog
 */
export function buildTerrain({ size = 900, segs = 130, bells = [], colorFn, skirtColor }) {
  const n = segs + 1;
  const verts = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const half = size / 2;
  const step = size / segs;

  // deterministic hash for colour speckle
  const hash = (x, z) => {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  const c = new THREE.Color();

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const i = row * n + col;
      const x = -half + col * step;
      const z = -half + row * step;
      let h = 0;
      for (const b of bells) {
        const dx = x - b.x, dz = z - b.z;
        const d2 = dx * dx + dz * dz;
        const r2 = b.r * b.r;
        if (d2 < r2) h += b.h * 0.5 * (1 + Math.cos(Math.PI * Math.sqrt(d2 / r2)));
      }
      verts[i * 3] = x;
      verts[i * 3 + 1] = h;
      verts[i * 3 + 2] = z;
      colorFn(x, z, h, hash(x, z), c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }

  const idx = [];
  for (let row = 0; row < segs; row++) {
    for (let col = 0; col < segs; col++) {
      const a = row * n + col;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      idx.push(a, d, b, d, e, b);   // CCW viewed from above (up-facing normals)
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshToonMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = 'terrain';
  group.add(mesh);

  // Distant skirt: hides the hard edge of the terrain grid behind fog.
  if (skirtColor !== undefined) {
    const skirt = new THREE.Mesh(
      new THREE.CircleGeometry(size * 2.2, 40),
      new THREE.MeshBasicMaterial({ color: skirtColor, fog: true })
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = -2.5;
    group.add(skirt);
  }

  const height = (x, z) => {
    let h = 0;
    for (const b of bells) {
      const dx = x - b.x, dz = z - b.z;
      const d2 = dx * dx + dz * dz;
      const r2 = b.r * b.r;
      if (d2 < r2) h += b.h * 0.5 * (1 + Math.cos(Math.PI * Math.sqrt(d2 / r2)));
    }
    return h;
  };

  return { mesh: group, height };
}

/** Ring of cosine-bell hills placed outside the play clearing. */
export function ringHills(rng, { count = 9, minR = 90, maxR = 380, hMin = 8, hMax = 26, rMin = 55, rMax = 120 }) {
  const bells = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.5;
    const d = minR + rng() * (maxR - minR);
    bells.push({
      x: Math.cos(a) * d,
      z: Math.sin(a) * d,
      r: rMin + rng() * (rMax - rMin),
      h: hMin + rng() * (hMax - hMin),
    });
  }
  return bells;
}