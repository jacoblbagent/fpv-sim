// Environment registry. Adding a world = write one module with the contract
// below and add it to ENVIRONMENTS. Nothing else in the sim needs to change.
//
// CONTRACT
//   id           unique string (also the settings value)
//   label        human name shown in the UI
//   hint         one-line description shown on the OSD
//   sky          sky/clear colour (hex)
//   fog          {color, density}  THREE.FogExp2
//   sun          {color, intensity, position:[x,y,z]}
//   hemi         {sky, ground, intensity}
//   spawn        {x, y, z, yaw}
//   bounds       {radius, ceiling} — soft world limits
//   build(scene) build the world, fill this.colliders + this.gates
//   update(dt)   optional per-frame animation
//   dispose(scene)
//   groundHeight(x, z) -> y   (assigned in build)
//   colliders    [{type:'sphere', pos:Vector3, r} | {type:'box', center, half}]
//   gates        [{index, mesh, center:Vector3, normal:Vector3, radius, passed}]

import { meadow } from './meadow.js';
import { canyon } from './canyon.js';

export const ENVIRONMENTS = { meadow, canyon };

export function listEnvironments() {
  return Object.values(ENVIRONMENTS).map((e) => ({ id: e.id, label: e.label }));
}

export function getEnvironment(id) {
  return ENVIRONMENTS[id] || ENVIRONMENTS.meadow;
}