# FPV Sim

**🔗 Live:** https://jacoblbagent.github.io/fpv-sim/

A browser quadcopter simulator. Fly with a real FPV radio (USB joystick mode) or
with the keyboard, through modular cartoon worlds, with a gate-course time trial.

Deployed as a static site to GitHub Pages, served from the `main` branch root —
there is no build step, so what you see in the repo is exactly what runs.

## Running it

**Deployed:** https://jacoblbagent.github.io/fpv-sim/ — nothing to run, just open it
(a radio or gamepad works there too, since it's all client-side).

Locally, no install step and no build step — no `npm install`, no bundler.
Three.js is vendored in `vendor/three.module.js`, so nothing is fetched at runtime.

```bash
cd ~/Code/fpv-sim
python3 -m http.server 8099      # any static server works, any free port
# then open http://localhost:8099/
```

Leave the server running while you fly; stop it with Ctrl-C. Other options:

```bash
npx serve -l 8099                # node alternative
npx http-server -p 8099
```

Details that matter:

- **A static server is required.** The app is ES modules, and browsers block
  module imports over `file:///` — opening `index.html` directly gives a blank
  blue page with no error. Serve it.
- **Serve from the project root**, not a subdirectory. The import map resolves
  `three` to `./vendor/three.module.js` and every script is referenced relatively,
  so the app must be the server's document root.
- **`python3 -m http.server` binds only to localhost** by default. To fly from
  another device on your network (phone, tablet, another laptop), bind all
  interfaces: `python3 -m http.server 8099 --bind 0.0.0.0`, then browse to
  `http://<your-lan-ip>:8099/`. A phone has no WASD, so you'd want a radio
  plugged into that device, or a Bluetooth gamepad.
- **First run:** hardware requirements are just a WebGL2-capable browser. Gamepad
  support needs Chrome/Edge/Firefox; Safari's Gamepad API support is partial.
- Settings (controller mapping, rates, camera tilt, world, HUD toggles) are saved
  in `localStorage` per browser — clearing site data resets them to defaults, as
  does **Esc → World → Restore defaults**.

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

Keyboard keys ramp the simulated sticks instead of slamming to full deflection:
a tap is a small nudge, a hold builds smoothly, and the throttle behaves as a
ratchet (hold `W` to spool up, `S` to spool down). Defaults are deliberately
gentle — the sticks take ~2.9s to reach full throw and the throttle ~3.6s to
travel idle-to-full, so a press is a small nudge on every axis. Releasing a key
springs the stick home faster than it wound up (~0.6s), so letting go actually
stops the rotation rather than coasting while the stick crawls back. Expo and the
deadzone are gimbal-centre aids and are skipped on the keyboard path, where they
only made the first ~100ms of a press feel dead before the stick lurched. Tune
the ramp with **Esc → Flight → Keyboard response** (lower is gentler, up to 3×
for a snappier feel; it has no effect while a radio is being used).

### Arming

Arming never moves the quad:

- **While disarmed there is no motor authority at all** — the sticks are inert, so
  nothing twitches or creeps when you flip the switch, and the throttle bar
  stays at zero.
- **Arming resets the keyboard throttle to idle**, so a throttle wound up before
  arming cannot launch the quad the instant it arms. Thrust only ever comes from
  spooling up deliberately *after* arming.
- **With a radio, arming is inhibited while the throttle stick is above idle**
  (a real FC pre-arm check) and the OSD flashes `THROTTLE HIGH — LOWER THE STICK
  TO ARM`. If you see that with the stick physically down, your throttle channel
  is mis-assigned or inverted — fix it in **Esc → Controller**.

### First flight

1. Load the page — the start card appears over the world; the sim is live but frozen.
2. **FLY** starts the sim (and unlocks audio — browsers won't play the motor whine
   before a user gesture).
3. **Arm** (`Q`, or your pad button). You spawn disarmed on the launch pad with the
   throttle at idle; props only spin once armed. The front LED blinks while
   disarmed and goes solid when armed.
4. Hold **`W`** to spool up past hover (about 45% throttle) and climb.
5. Push the pitch stick forward (`↑`) to fly forward; `C` switches to the chase or
   line-of-sight view if you want to watch the airframe.
6. Arm/disarm toggles at any time. **`R`** respawns you on the pad; a hard impact
   (above ~5.2 m/s) destroys the props and shows the crash card, which respawns you.

Disarming in mid-air drops the quad — with no motor authority it falls ballistically
and a hard landing still breaks the props.

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
tools/verify/           headless browser checks (see Verification below)
vendor/three.module.js  Three.js r160, vendored — nothing loads from a CDN
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
available thrust as the pack drains. A disarmed quad has zero motor authority, so
its sticks are inert — and arming is gated on the throttle being at idle, which is
why flipping the arm switch can never move the airframe.

## Deploying

GitHub Pages serves this repo's `main` branch root directly — **there is no build
step, so deploying is just a commit and a push**:

```bash
git add -A && git commit -m "..." && git push origin main
```

Pages rebuilds in ~30-60s. Live: https://jacoblbagent.github.io/fpv-sim/

Because it's a project page it lives under `/fpv-sim/`, but every asset path in the
app is **relative** (`./js/…`, `./vendor/three.module.js`, including the import
map), so it resolves correctly under the subpath with no `base` config. `.nojekyll`
is committed so Jekyll doesn't touch the output. Local and deployed run the exact
same files.

Verify a deploy by pointing the test suite at the live URL:

```bash
BASE_URL=https://jacoblbagent.github.io/fpv-sim \
  NODE_PATH=/tmp/fpv-verify/node_modules node tools/verify/regression.js
```

## Verification

`tools/verify/` holds headless browser checks that drive the real app (Chromium
over CDP via `playwright-core`) — they are not unit tests, they load the sim and
fly it.

```bash
# with the static server already running on :8099
NODE_PATH=/path/to/node_modules node tools/verify/regression.js   # 25 checks
NODE_PATH=/path/to/node_modules node tools/verify/arming-and-keys.js  # 22 checks
NODE_PATH=/path/to/node_modules node tools/verify/input-signs.js  # stick directions
NODE_PATH=/path/to/node_modules node tools/verify/controller.js   # radio path
```

`playwright-core` is not a project dependency (the app itself has none) — point
`NODE_PATH` at wherever you have it installed, e.g.

```bash
mkdir -p /tmp/fpv-verify && cd /tmp/fpv-verify && npm i playwright-core
NODE_PATH=/tmp/fpv-verify/node_modules node tools/verify/regression.js
```

Env overrides: `CHROME_PATH` (a Chromium/Chrome binary; defaults to the Playwright
cache path) and `BASE_URL` (defaults to `http://localhost:8099`).

What `regression.js` covers: boot with a clean console, arming, climb and forward
flight, gate-pass detection, hard-impact crash → crash card → respawn, switching
worlds (including out of a crashed state, checking no environment meshes leak),
all three camera views, a custom arm key taking effect, settings persisting across
a reload, and restore-defaults. `arming-and-keys.js` asserts that arming never
moves the quad (throttle reset, inert sticks while disarmed, no drift on re-arm),
that a key tap is a small adjustment and a hold ramps to full throw, and the radio
pre-arm throttle refusal. `input-signs.js` asserts the six stick directions match
real FPV behaviour. `controller.js` fakes a gamepad to verify axis mapping, expo,
the pad arm button, the pre-arm refusal, the learn-button flow, and keyboard
fallback on unplug.
