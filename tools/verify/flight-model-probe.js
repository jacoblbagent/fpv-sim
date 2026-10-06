// Measures the flight model's headline numbers so tuning is done against
// measurements, not vibes:
//   - freefall terminal velocity (m/s)
//   - hover throttle (stick position that holds altitude)
//   - level top speed (m/s) held at a fixed cruise tilt
// The sim pauses itself when the quad crashes, so each phase respawns first.
const { chromium } = require('playwright-core');
const path = process.env.CHROME_PATH
  || '/home/jlbroughton/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8099';

(async () => {
  const browser = await chromium.launch({
    executablePath: path,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3200);
  await page.click('#btn-fly');
  await page.waitForTimeout(300);

  const cfg = await page.evaluate(() => {
    window.__fpv.S.set('wind', 0);   // measure the airframe itself, not the weather
    return {
      twr: window.__fpv.S.get('twr'), rate: window.__fpv.S.get('rate'),
      yawRate: window.__fpv.S.get('yawRate'), mode: window.__fpv.S.get('flightMode'),
      wind: window.__fpv.S.get('wind'),
    };
  });
  console.log('settings:', JSON.stringify(cfg));

  const respawn = async () => { await page.keyboard.press('r'); await page.waitForTimeout(250); };

  const place = (y, thr, pitchStick) => page.evaluate(([yy, t, p]) => {
    const f = window.__fpv.flight, i = window.__fpv.input;
    f.crashed = false; f.armed = true;
    f.quaternion.identity(); f.angVel.set(0, 0, 0); f.velocity.set(0, 0, 0);
    f.position.set(0, yy, 0);
    i.armed = true; i.keyThrottle = t;
    i.sticks.thr = t; i.sticks.pitch = p; i.sticks.roll = 0; i.sticks.yaw = 0;
  }, [y, thr, pitchStick]);

  // ---- 1. freefall terminal velocity ---------------------------------------
  await respawn();
  await place(200, 0, 0);
  const fall = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1000);
    fall.push(await page.evaluate(() => +window.__fpv.flight.velocity.y.toFixed(2)));
  }
  console.log('freefall vertical speed (m/s) per second:', fall.join(', '));

  // ---- 2. hover throttle (bisect the stick that holds altitude) ------------
  await respawn();
  let lo = 0, hi = 1, hover = null;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    await place(150, mid, 0);
    await page.waitForTimeout(1600);
    const vs = await page.evaluate(() => window.__fpv.flight.verticalSpeed);
    if (vs > 0) hi = mid; else lo = mid;
    hover = (lo + hi) / 2;
  }
  console.log('hover throttle:', hover.toFixed(3), '  (1/twr =', (1 / cfg.twr).toFixed(3) + ')');

  // ---- 3. level top speed at a held cruise tilt ----------------------------
  await respawn();
  await page.evaluate(() => {
    const f = window.__fpv.flight, i = window.__fpv.input;
    f.crashed = false; f.armed = true;
    f.angVel.set(0, 0, 0); f.velocity.set(0, 0, 0); f.position.set(0, 120, 0);
    i.armed = true; i.keyThrottle = 1;
    i.sticks.thr = 1; i.sticks.pitch = 0; i.sticks.roll = 0; i.sticks.yaw = 0;
    const E = f.quaternion.constructor;
    window.__hold = setInterval(() => {
      // keep a fixed 63deg nose-down cruise attitude at a constant altitude so
      // only the horizontal component of thrust is doing work
      f.quaternion.setFromEuler(new (window.__fpv.camera.rotation.constructor)(-63 * Math.PI / 180, 0, 0, 'XYZ'));
      f.velocity.y = 0; f.position.y = 120;
    }, 8);
  });
  const spd = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    spd.push(await page.evaluate(() => +window.__fpv.flight.speed.toFixed(1)));
  }
  await page.evaluate(() => clearInterval(window.__hold));
  console.log('level cruise speed (m/s) per second:', spd.join(', '));

  console.log('\nSUMMARY');
  console.log('  freefall terminal:', Math.abs(fall[fall.length - 1]).toFixed(1), 'm/s');
  console.log('  hover throttle  :', hover.toFixed(2));
  console.log('  level top speed :', Math.max(...spd).toFixed(1), 'm/s =', (Math.max(...spd) * 3.6).toFixed(0), 'km/h');
  await browser.close();
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });