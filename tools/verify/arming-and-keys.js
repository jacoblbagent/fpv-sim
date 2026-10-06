// Behaviour checks for the two fixes:
//  1. arming must never move the quad
//  2. keyboard keys must produce gentle, ramped adjustments (sticks + throttle)
const { chromium } = require('playwright-core');
const path = process.env.CHROME_PATH
  || '/home/jlbroughton/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8099';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + (detail === undefined ? '' : detail)); };

const snap = (page) => page.evaluate(() => {
  const f = window.__fpv.flight;
  return {
    armed: f.armed,
    pos: f.position.toArray().map(n => +n.toFixed(3)),
    alt: +f.position.y.toFixed(3),
    roll: +f.rollDeg.toFixed(1),
    pitch: +f.pitchDeg.toFixed(1),
    thr: +window.__fpv.input.sticks.thr.toFixed(3),
    keyThr: +window.__fpv.input.keyThrottle.toFixed(3),
    sr: +window.__fpv.input.sticks.roll.toFixed(3),
    crash: f.crashed,
    msg: document.getElementById('osd-msg').classList.contains('hidden') ? '' : document.getElementById('osd-msg').textContent,
  };
});

(async () => {
  const browser = await chromium.launch({
    executablePath: path,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3200);
  await page.click('#btn-fly');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__fpv.S.set('flightMode', 'angle'));

  // 1. disarmed: throttle must not respond to W
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  let s = await snap(page);
  check('disarmed: W does nothing', s.keyThr === 0 && s.thr === 0, `keyThr=${s.keyThr} thr=${s.thr}`);
  check('disarmed: sticks are inert', Math.abs(s.roll) < 0.5, `roll=${s.roll}`);

  // 2. arm while W is held, with the old winding having been attempted
  const beforeArm = await snap(page);
  await page.keyboard.press('q');
  await page.waitForTimeout(120);
  const justArmed = await snap(page);
  const posAtArm = justArmed.pos.slice();
  await page.waitForTimeout(1000);
  s = await snap(page);
  const moved = Math.hypot(s.pos[0] - posAtArm[0], s.pos[1] - posAtArm[1], s.pos[2] - posAtArm[2]);
  check('arm itself does not move the quad', moved < 0.05, `moved ${moved.toFixed(4)} m (armed=${justArmed.armed})`);
  check('arm resets throttle to idle', justArmed.thr < 0.06, `thr at arm=${justArmed.thr} (was ${beforeArm.keyThr} before)`);

  // 3. throttle ramps gently rather than jumping to full
  const t1 = await snap(page);
  await page.waitForTimeout(1000);
  const t2 = await snap(page);
  const rate = t2.thr - t1.thr;
  check('throttle ramps gently (~0.45/s, not instant)', rate > 0.2 && rate < 0.75, `+${rate.toFixed(2)} throttle per second`);
  const climbFrom = t2.alt;
  await page.waitForTimeout(1500);
  s = await snap(page);
  check('sustained W does eventually spool up', s.thr > 0.6, `thr=${s.thr}`);
  check('throttle burst gives a modest climb (not a launch)', (s.alt - climbFrom) < 14, `climb ${(s.alt - climbFrom).toFixed(1)} m in 1.5s`);
  await page.keyboard.up('w');

  // 4. keyboard stick: a tap is a small adjustment
  await page.evaluate(() => { const f = window.__fpv.flight; f.quaternion.identity(); f.angVel.set(0, 0, 0); f.velocity.set(0, 0, 0); f.position.set(0, 30, 0); });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(150);
  s = await snap(page);
  check('keyboard tap: stick barely moves (150ms)', s.sr > 0.05 && s.sr < 0.35, `stick=${s.sr} roll=${s.roll}°`);
  check('keyboard tap: small bank angle', Math.abs(s.roll) < 8, `roll=${s.roll}°`);
  await page.waitForTimeout(1400);
  s = await snap(page);
  check('keyboard hold: reaches full deflection', s.sr > 0.75, `stick=${s.sr}`);

  // releasing a key springs the stick home faster than it winds up, so letting
  // go stops the rotation instead of coasting on while the stick crawls back
  const relT0 = Date.now();
  await page.keyboard.up('ArrowRight');
  let relMs = null;
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => Math.abs(window.__fpv.input.sticks.roll)) < 0.05) { relMs = Date.now() - relT0; break; }
    await page.waitForTimeout(40);
  }
  check('keyboard release springs home (<0.8s)', relMs !== null && relMs < 800, `centred in ${relMs} ms`);
  await page.waitForTimeout(2400);
  s = await snap(page);
  check('keyboard release: stick returns to centre + levels out', Math.abs(s.sr) < 0.1 && Math.abs(s.roll) < 5, `stick=${s.sr} roll=${s.roll}°`);

  // 5. disarm: sticks inert again, throttle reset
  await page.keyboard.press('q');
  await page.waitForTimeout(200);
  await page.evaluate(() => { const f = window.__fpv.flight; f.quaternion.identity(); f.angVel.set(0, 0, 0); });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  s = await snap(page);
  check('disarmed: sticks inert after disarm', Math.abs(s.pitch) < 0.5, `pitch=${s.pitch}°`);
  await page.keyboard.up('ArrowUp');

  // 6. re-arm after a wound-up throttle: still no movement
  await page.keyboard.press('q');            // arm
  await page.waitForTimeout(150);
  await page.keyboard.down('w');
  await page.waitForTimeout(1800);           // spool up
  await page.keyboard.up('w');
  s = await snap(page);
  check('spooled up before disarm', s.thr > 0.5, `thr=${s.thr}`);
  await page.keyboard.press('q');            // disarm -> throttle reset
  await page.waitForTimeout(200);
  await page.evaluate(() => { const f = window.__fpv.flight; f.quaternion.identity(); f.velocity.set(0, 0, 0); f.position.set(0, 25, 0); });
  await page.keyboard.press('q');            // arm again
  await page.waitForTimeout(150);
  const rearmed = await snap(page);
  const p2 = rearmed.pos.slice();
  await page.waitForTimeout(900);
  s = await snap(page);
  const drift2 = Math.hypot(s.pos[0] - p2[0], s.pos[2] - p2[2]);
  check('re-arm after spool-up: throttle clean', rearmed.thr === 0, `thr=${rearmed.thr}`);
  check('re-arm after spool-up: no drift', drift2 < 0.05, `drift ${drift2.toFixed(4)} m`);

  // 7. radio pre-arm throttle check
  // Make sure we start disarmed (the previous step left it armed).
  if (await page.evaluate(() => window.__fpv.flight.armed)) {
    await page.keyboard.press('q');
    await page.waitForTimeout(300);
  }
  check('disarmed before the radio test', !(await page.evaluate(() => window.__fpv.flight.armed)));

  // Install the pad at rest first so its baseline is captured where a real
  // radio would sit, then raise the throttle stick.
  await page.evaluate(() => {
    window.__pad = {
      id: 'RadioMaster TX16S Joystick', connected: true, index: 0, mapping: 'standard',
      axes: [0, 0, -1, 0, 0, 0, 0, 0],            // throttle at idle
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
      timestamp: 0,
    };
    navigator.getGamepads = () => [window.__pad];
  });
  await page.waitForTimeout(700);                 // baseline capture at rest
  let padState = await page.evaluate(() => ({ seen: window.__fpv.input.radioSeen, source: window.__fpv.input.source }));
  check('radio: detected while idle', padState.seen === true && padState.source === 'keyboard', JSON.stringify(padState));

  await page.evaluate(() => { window.__pad.axes[2] = 0.7; });   // throttle to ~85%
  await page.waitForTimeout(400);
  s = await snap(page);
  const padSrc = await page.evaluate(() => window.__fpv.input.source);
  check('radio: stick movement takes over input', padSrc === 'radio' && s.thr > 0.6, `source=${padSrc} thr=${s.thr}`);

  await page.keyboard.press('q');              // try to arm over the radio
  await page.waitForTimeout(300);
  s = await snap(page);
  check('radio: refuses to arm with throttle up', s.armed === false, `armed=${s.armed} crash=${s.crash}`);
  check('radio: shows the pre-arm warning', /THROTTLE HIGH/i.test(s.msg), `msg="${s.msg}"`);
  await page.screenshot({ path: '/tmp/fpv-verify/60-prearm-warning.png' });

  await page.evaluate(() => { window.__pad.axes[2] = -1; });   // stick to idle
  await page.waitForTimeout(400);
  await page.keyboard.press('q');
  await page.waitForTimeout(300);
  s = await snap(page);
  check('radio: arms once throttle is at idle', s.armed === true, `armed=${s.armed} thr=${s.thr}`);

  const uniq = [...new Set(logs.map((l) => l.slice(0, 140)))];
  check('console clean', uniq.length === 0, uniq.slice(0, 3).join(' | '));

  const failed = results.filter(r => !r.ok);
  console.log('\n==== ' + (results.length - failed.length) + '/' + results.length + ' checks passed ====');
  if (failed.length) console.log('FAILURES: ' + failed.map(f => f.name).join(', '));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
