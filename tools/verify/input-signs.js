const { chromium } = require('playwright-core');
// CHROME_PATH / BASE_URL overrides, same as regression.js
const path = process.env.CHROME_PATH
  || '/home/jlbroughton/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8099';

(async () => {
  const browser = await chromium.launch({
    executablePath: path,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('#btn-fly');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__fpv.S.set('flightMode', 'acro'));

  const pulse = async (label, key, expect) => {
    await page.evaluate(() => {
      const f = window.__fpv.flight;
      const i = window.__fpv.input;
      f.quaternion.identity(); f.angVel.set(0, 0, 0); f.velocity.set(0, 0, 0);
      f.position.set(0, 60, 0); f.crashed = false;
      i.keyThrottle = 0;
      // clear any residual stick ramp from the previous pulse, and arm both the
      // model and the input layer (sticks are inert while disarmed)
      i.sticks.thr = i.sticks.yaw = i.sticks.pitch = i.sticks.roll = 0;
      i.armed = true;
      f.armed = true;
    });
    await page.keyboard.down(key);
    // keyboard sticks ramp at ~1.2 stick-travel/s, so hold long enough for the
    // simulated gimbal to reach a clear deflection before sampling body rates
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const f = window.__fpv.flight;
      const V = window.__fpv.camera.position.constructor;
      const v = new V();
      v.set(0, 0, 1).applyQuaternion(f.quaternion);
      const nose = { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) };
      v.set(-1, 0, 0).applyQuaternion(f.quaternion);
      const rw = { y: +v.y.toFixed(2) };
      return {
        angVel: { x: +f.angVel.x.toFixed(2), y: +f.angVel.y.toFixed(2), z: +f.angVel.z.toFixed(2) },
        nose, rightWingY: rw.y,
        pitch: +f.pitchDeg.toFixed(1), roll: +f.rollDeg.toFixed(1),
      };
    });
    await page.keyboard.up(key);
    console.log(label.padEnd(18), JSON.stringify(r), '\n', ' '.repeat(17), 'expect', expect);
  };

  await pulse('pitch UP', 'ArrowUp', 'angVel.x > 0 (nose down)');
  await pulse('pitch DOWN', 'ArrowDown', 'angVel.x < 0 (nose up)');
  await pulse('roll RIGHT', 'ArrowRight', 'angVel.z > 0 & rightWingY < 0');
  await pulse('roll LEFT', 'ArrowLeft', 'angVel.z < 0 & rightWingY > 0');
  await pulse('yaw RIGHT', 'KeyD', 'angVel.y < 0 & nose.x < 0');
  await pulse('yaw LEFT', 'KeyA', 'angVel.y > 0 & nose.x > 0');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
