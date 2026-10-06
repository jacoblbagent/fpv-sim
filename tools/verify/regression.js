const { chromium } = require('playwright-core');
// CHROME_PATH: override if your Chromium lives elsewhere.
// BASE_URL: override if you serve the app on another port.
const path = process.env.CHROME_PATH
  || '/home/jlbroughton/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8099';
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + (detail || '')); };

// Poll the page until `expr` returns something truthy, or give up.
// These suites run on a software rasteriser, and the sim deliberately clamps
// its timestep (dt <= 0.05 s) so it cannot tunnel through geometry — which means
// at ~13 fps a wall-clock second only advances the sim ~0.65 s. Waiting on the
// sim's own progress instead of the clock keeps the mechanics checks honest on
// a slow (or a heavier, enclosed) world.
async function waitFor(page, expr, timeoutMs = 6000) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(expr);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await page.waitForTimeout(100);
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: path,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`[REQFAIL] ${r.url()}`));

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3200);

  check('boot: no error overlay', await page.evaluate(() => !document.getElementById('errbox')), '');
  check('boot: sim exposed', await page.evaluate(() => typeof window.__fpv === 'object'));
  check('boot: terminal is the default world', (await page.evaluate(() => window.__fpv.env.id)) === 'terminal');
  check('boot: 6 gates in terminal', (await page.evaluate(() => window.__fpv.env.gates.length)) === 6);
  check('boot: colliders built', (await page.evaluate(() => window.__fpv.env.colliders.length)) > 50);

  await page.click('#btn-fly');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__fpv.S.set('flightMode', 'angle');
    window.__fpv.S.set('wind', 0);   // fly the mechanics in still air; wind is tested on its own below
  });

  // --- arm with the configured key
  await page.keyboard.press('q');
  await page.waitForTimeout(250);
  check('arm via Q', await page.evaluate(() => window.__fpv.flight.armed));

  // --- takeoff + forward flight
  await page.evaluate(() => { window.__fpv.input.keyThrottle = 0.85; });
  const climb = await waitFor(page, () => {
    const y = window.__fpv.flight.position.y;
    return y > 2.5 ? +y.toFixed(1) : null;
  });
  check('climbs under throttle', climb !== null && climb > 2.5, 'alt ' + climb);

  // Give the run some airspace and start it from a level deck: at full power a
  // pitched quad climbs, and the terminal's concourse has a roof over it. This
  // keeps the check about forward translation, not about the nearest ceiling.
  await page.evaluate(() => {
    const f = window.__fpv.flight;
    f.position.set(0, 20, -50);
    f.velocity.set(0, 0, 0);
    f.angVel.set(0, 0, 0);
    f.quaternion.set(0, 1, 0, 0);      // 180° about Y: heading -Z, as on spawn
  });
  await page.keyboard.down('ArrowUp');
  const fwd = await waitFor(page, () => {
    const f = window.__fpv.flight;
    return f.distance > 12 && f.speed > 6
      ? { spd: +f.speed.toFixed(1), pitch: +f.pitchDeg.toFixed(0), dist: +f.distance.toFixed(1) }
      : null;
  });
  await page.keyboard.up('ArrowUp');
  check('forward flight translates', fwd ? (fwd.spd > 6 && fwd.dist > 10) : false, JSON.stringify(fwd));

  // --- gate detection by sitting in the ring plane
  await page.evaluate(() => {
    const f = window.__fpv.flight, g = window.__fpv.env.gates[0];
    f.velocity.set(0, 0, 0);
    f.position.copy(g.center);
  });
  await page.waitForTimeout(250);
  const passed = await page.evaluate(() => window.__fpv.env.gates.filter(g => g.passed).length);
  check('gate pass registers', passed >= 1, 'passed=' + passed);
  check('OSD gate counter updates', (await page.evaluate(() => document.getElementById('course-next').textContent)).includes('GATE 2'), await page.evaluate(() => document.getElementById('course-next').textContent));

  // --- crash + respawn (throttle off so it really falls)
  await page.evaluate(() => {
    const f = window.__fpv.flight;
    window.__fpv.input.keyThrottle = 0;
    f.position.set(0, 6, 0); f.velocity.set(0, -22, 0); f.quaternion.identity();
  });
  // dropped from just above the deck: a whoop's drag bleeds 22 m/s off fast, but
  // it still arrives well above the prop-bending impact speed
  await page.waitForTimeout(3000);
  check('hard impact crashes', await page.evaluate(() => window.__fpv.flight.crashed));
  check('crash screen shows', await page.evaluate(() => !document.getElementById('crashscreen').classList.contains('hidden')));
  await page.click('#btn-respawn');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ crashed: window.__fpv.flight.crashed, armed: window.__fpv.flight.armed, paused: window.__fpv.paused }));
  check('respawn clears crash + pause', !after.crashed && !after.paused, JSON.stringify(after));

  // --- env switching both ways, including from a crashed state
  await page.evaluate(() => {
    const f = window.__fpv.flight;
    window.__fpv.input.keyThrottle = 0;
    f.position.set(0, 6, 0); f.velocity.set(0, -22, 0);
  });
  await page.waitForTimeout(3000);   // crash in the terminal
  await page.evaluate(() => window.__fpv.S.set('env', 'canyon'));
  await page.waitForTimeout(2200);
  const cy = await page.evaluate(() => ({ env: window.__fpv.env.id, paused: window.__fpv.paused, crashed: window.__fpv.flight.crashed, gates: window.__fpv.env.gates.length, z: +window.__fpv.flight.position.z.toFixed(0) }));
  check('switch to canyon from crash state', cy.env === 'canyon' && !cy.paused && !cy.crashed, JSON.stringify(cy));
  check('canyon spawn is at its own pad', cy.z === 70, 'z=' + cy.z);
  await page.evaluate(() => window.__fpv.S.set('env', 'meadow'));
  await page.waitForTimeout(2000);
  check('switch back to meadow', (await page.evaluate(() => window.__fpv.env.id)) === 'meadow');
  check('no leaked env meshes', (await page.evaluate(() => window.__fpv.scene.children.filter(c => c.name && c.name.startsWith('env:')).length)) === 1);

  // --- views
  for (const v of ['chase', 'los', 'fpv']) {
    await page.evaluate((m) => window.__fpv.S.set('viewMode', m), v);
    await page.waitForTimeout(500);
    const ok = await page.evaluate((m) => {
      const c = window.__fpv.camera, f = window.__fpv.flight;
      const d = c.position.distanceTo(f.position);
      return m === 'fpv' ? d < 1 : d > 1;
    }, v);
    check('view ' + v + ' positions camera', ok);
  }
  check('airframe hidden in FPV', (await page.evaluate(() => window.__fpv.drone.group.visible)) === false);
  await page.evaluate(() => window.__fpv.S.set('viewMode', 'chase'));
  await page.waitForTimeout(400);
  check('airframe visible in chase', await page.evaluate(() => window.__fpv.drone.group.visible));
  await page.evaluate(() => window.__fpv.S.set('viewMode', 'fpv'));

  // --- custom arm key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.selectOption('#arm-key', 'KeyE');
  await page.waitForTimeout(200);
  await page.click('#btn-close');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__fpv.flight.armed);
  await page.keyboard.press('q');            // old key should do nothing now
  await page.waitForTimeout(250);
  const afterQ = await page.evaluate(() => window.__fpv.flight.armed);
  await page.keyboard.press('e');            // new key
  await page.waitForTimeout(250);
  const afterE = await page.evaluate(() => window.__fpv.flight.armed);
  check('custom arm key takes effect', before === afterQ && afterE !== before, `before=${before} afterQ=${afterQ} afterE=${afterE}`);

  // --- settings persistence across reload
  await page.evaluate(() => { window.__fpv.S.set('twr', 3.1); window.__fpv.S.set('armKey', 'KeyE'); });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const persisted = await page.evaluate(() => ({ twr: window.__fpv.S.get('twr'), armKey: window.__fpv.S.get('armKey') }));
  check('settings persist across reload', persisted.twr === 3.1 && persisted.armKey === 'KeyE', JSON.stringify(persisted));

  // --- restore defaults through the UI
  await page.click('#btn-fly');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="wld"]');
  await page.waitForTimeout(200);
  await page.click('#btn-defaults');
  await page.waitForTimeout(800);
  const restored = await page.evaluate(() => ({ twr: window.__fpv.S.get('twr'), armKey: window.__fpv.S.get('armKey'), env: window.__fpv.env.id }));
  check('restore defaults works', restored.twr === 4.0 && restored.armKey === 'KeyQ' && restored.env === 'terminal', JSON.stringify(restored));

  // --- wind: a breeze carries a hovering quad downwind ---------------------
await page.evaluate(() => {
    const f = window.__fpv.flight, i = window.__fpv.input;
    window.__fpv.S.set('wind', 8);
    f.crashed = false; f.armed = true; f.quaternion.identity(); f.angVel.set(0, 0, 0);
    f.velocity.set(0, 0, 0); f.position.set(0, 80, 0);
    i.armed = true; i.keyThrottle = 0.5;    // ~hover stick for the whoop curve
    i.sticks.thr = 0.5; i.sticks.yaw = i.sticks.pitch = i.sticks.roll = 0;
    window.__windFrom = f.position.clone();
  });
  await page.waitForTimeout(3000);
  const drift = await page.evaluate(() => {
    const f = window.__fpv.flight;
    return +f.position.distanceTo(window.__windFrom).toFixed(2);
  });
  check('wind carries the quad downwind', drift > 4, `drifted ${drift} m in 3 s of 8 m/s wind`);
  await page.evaluate(() => { window.__fpv.S.set('wind', 0); window.__fpv.input.keyThrottle = 0; });
  await page.keyboard.press('r');
  await page.waitForTimeout(400);

  // --- perf snapshot
  const perf = await page.evaluate(() => JSON.stringify({ calls: window.__fpv.renderer.info.render.calls, tris: window.__fpv.renderer.info.render.triangles }));
  console.log('render info: ' + perf);
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / 2)); };
    requestAnimationFrame(tick);
  }));
  console.log('fps (software rasteriser): ' + fps);

  const uniq = [...new Set(logs.map((l) => l.slice(0, 150)))];
  check('console clean', uniq.length === 0, uniq.slice(0, 5).join(' | '));

  const failed = results.filter(r => !r.ok);
  console.log('\n==== ' + (results.length - failed.length) + '/' + results.length + ' checks passed ====');
  if (failed.length) console.log('FAILURES: ' + failed.map(f => f.name).join(', '));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
