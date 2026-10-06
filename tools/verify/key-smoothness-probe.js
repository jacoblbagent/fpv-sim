// Probe: how much does the quad rotate for a single short key tap?
// Samples roll/pitch at frame rate while tapping the key, so we can see the
// shape of the response (a step "jump" vs a smooth ramp).
const { chromium } = require('playwright-core');
const path = process.env.CHROME_PATH
  || '/home/jlbroughton/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8099';

(async () => {
  const browser = await chromium.launch({
    executablePath: path,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3200);
  await page.click('#btn-fly');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__fpv.S.set('flightMode', 'acro'));
  await page.keyboard.press('q');   // arm
  await page.waitForTimeout(200);

  const reset = () => page.evaluate(() => {
    const f = window.__fpv.flight;
    f.quaternion.identity(); f.angVel.set(0, 0, 0); f.velocity.set(0, 0, 0);
    f.position.set(0, 40, 0);
    window.__fpv.input.sticks.roll = window.__fpv.input.sticks.pitch = 0;
    window.__fpv.input.sticks.yaw = 0;
  });

  // start a frame-rate sampler in the page
  const startSampler = () => page.evaluate(() => {
    window.__samples = [];
    window.__t0 = performance.now();
    const tick = () => {
      const f = window.__fpv.flight;
      window.__samples.push({
        t: +(performance.now() - window.__t0).toFixed(0),
        roll: +f.rollDeg.toFixed(2),
        pitch: +f.pitchDeg.toFixed(2),
        sr: +window.__fpv.input.sticks.roll.toFixed(3),
        av: +f.angVel.z.toFixed(3),
      });
      window.__raf = requestAnimationFrame(tick);
    };
    tick();
  });
  const stopSampler = () => page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__samples; });

  async function tap(key, ms, label) {
    await reset();
    await startSampler();
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    await page.waitForTimeout(1200);
    const s = await stopSampler();
    const last = s[s.length - 1];
    console.log(`\n=== ${label}: ${key} held ${ms}ms  (${s.length} frames) ===`);
    console.log(`final roll=${last.roll}° pitch=${last.pitch}°  stick=${last.sr}`);
    // print a compact trace of roll
    const stride = Math.max(1, Math.round(s.length / 24));
    console.log(s.filter((_, i) => i % stride === 0).map(x => `${x.t}ms:${x.roll}`).join(' '));
  }

  await tap('ArrowRight', 30, 'very short tap');
  await tap('ArrowRight', 60, 'short tap');
  await tap('ArrowRight', 150, 'medium tap');
  await tap('ArrowUp', 60, 'pitch short tap');

  // hold profile: is the ramp smooth?
  await reset();
  await startSampler();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1000);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(600);
  const s = await stopSampler();
  console.log('\n=== hold 1000ms ArrowRight ===');
  const stride = Math.max(1, Math.round(s.length / 24));
  console.log(s.filter((_, i) => i % stride === 0).map(x => `${x.t}ms:roll=${x.roll} av=${x.av}`).join(' '));
  console.log('final roll', s[s.length - 1].roll);

  await browser.close();
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
