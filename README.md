# FPV Sim

A browser quadcopter simulator. Fly with a real FPV radio (USB joystick mode) or
with the keyboard, through modular cartoon worlds, with a gate-course time trial.

**No live link yet** — runs locally as a static site (see below).

## Quick start

```bash
cd ~/Code/fpv-sim
python3 -m http.server 8099
# open http://localhost:8099/
```

A static server is required — the app uses ES modules, which browsers block over
`file:///`. Any static server works (`npx serve`, `python3 -m http.server`, etc).

## Controls

| Action | Keyboard | Radio |
|---|---|---|
| Throttle (left stick) | `W` / `S` | left stick up/down |
| Yaw (left stick) | `A` / `D` | left stick left/right |
| Pitch (right stick) | `↑` / `↓` | right stick up/down |
| Roll (right stick) | `←` / `→` | right stick left/right |
| Arm / disarm | `Q` (configurable) | pad button (configurable) |
| Settings | `Esc` | — |
| Respawn | `R` | — |
| Cycle view (FPV / chase / LOS) | `C` | — |

Keyboard throttle is integrated (hold `W` to spool up, `S` to spool down) so it
behaves like a ratchet throttle rather than snapping to full.

### Using a real controller

Plug the radio in as a USB joystick, move a stick, then open **Esc → Controller**.
The panel shows a live axis monitor, per-channel axis assignment, inversion, and
the arm button. "Learn pad button" binds arm to whatever button you press next.
Everything persists in `localStorage`.

Default mapping is `roll=axis 0, pitch=axis 1 (inverted), throttle=axis 2,
yaw=axis 3` — the common layout for radios that enumerate as a generic gamepad.
If your sticks come out crossed, just reassign the axes.

## Stack

- Three.js r160 (vendored locally in `vendor/three.module.js` — no CDN needed at runtime)
- Plain ES modules, no build step, no dependencies
- WebAudio motor whine + Gamepad API

## Project layout

```
index.html              import map + DOM overlay (OSD, sticks, screens)
style.css               HUD + panel styling
js/
  main.js               scene, cameras, frame loop, gate logic, crash/respawn
  physics.js            quadcopter flight model (acro + angle mode, drag, collisions)
  drone.js              the airframe mesh (props, camera pod, LEDs, battery)
  input.js              radio (Gamepad API) + keyboard dual-stick emulation
  settings.js           persisted settings + change bus
  settingsui.js         settings panel wiring, axis monitor, learn-button flow
  hud.js                OSD numbers, throttle bar, artificial horizon, sticks
  utils.js              clamp/lerp/expo/damped smoothing/RNG
  environments/
    index.js            environment registry + contract
    terrain.js          shared heightfield terrain builder + hill rings
    props.js            shared cartoon prop vocabulary (trees, rocks, barns, gates…)
    meadow.js           rolling farmland world + gate course
    canyon.js           red rock slot canyon + gate course
```

## Adding an environment

Write one module with the contract documented at the top of
`js/environments/index.js` and add it to the `ENVIRONMENTS` map. Nothing else in
the sim needs to change:

```js
export const myWorld = {
  id: 'myworld', label: 'My World', hint: '…',
  sky: 0x9fd8f0, fog: { color: 0xcfe8f5, density: 0.0035 },
  sun: { color: 0xfff3d6, intensity: 2.1, position: [120, 190, 80] },
  hemi: { sky: 0xbfe4ff, ground: 0x6a9a4a, intensity: 0.85 },
  spawn: { x: 0, y: 0.12, z: 0, yaw: Math.PI },
  bounds: { radius: 430, ceiling: 220 },
  colliders: [], gates: [],
  build(scene) { /* build meshes; fill this.colliders + this.gates;
                    assign this.groundHeight = (x, z) => y */ },
  update(dt) {},            // optional per-frame animation
  dispose(scene) {},
};
```

Colliders are `{type:'sphere', pos:Vector3, r}` or
`{type:'box', center:Vector3, half:Vector3}`. Gates are
`{index, mesh, center, normal, radius, passed}`.

## Flight model notes

Body frame is `+Z` nose, `+Y` up (so the body's right axis is `-X` — this is why
the roll/yaw signs look "backwards" next to the raw three.js convention). Sticks
map to body rates: pitch `-1` (stick up) = nose down, roll `+1` = bank right,
yaw `+1` = yaw right. Acro integrates rates directly; Angle mode runs a PD
attitude hold with a 35° tilt limit.

Impact above ~5.2 m/s bends props and ends the flight. Battery sag reduces
available thrust as the pack drains.
