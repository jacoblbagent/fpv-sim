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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('#btn-fly');
  await page.waitForTimeout(300);

  // ---- install a fake FPV radio (USB joystick mode) -----------------------
  await page.evaluate(() => {
    window.__pad = {
      id: 'RadioMaster TX16S Joystick',
      connected: true,
      index: 0,
      mapping: 'standard',
      axes: [0, 0, -1, 0, 0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
      timestamp: 0,
    };
    navigator.getGamepads = () => [window.__pad];
  });
  await page.waitForTimeout(600);   // let the baseline capture at rest
  const detected = await page.evaluate(() => ({
    seen: window.__fpv.input.radioSeen,
    padName: window.__fpv.input.padName,
    axisCount: window.__fpv.input.axisCount,
    source: window.__fpv.input.source,
  }));
  console.log('pad detected   ', JSON.stringify(detected));

  // move a stick -> source should flip to radio
  await page.evaluate(() => { window.__pad.axes[3] = 0.4; });
  await page.waitForTimeout(300);
  console.log('after stick move', await page.evaluate(() => JSON.stringify({
    source: window.__fpv.input.source, label: window.__fpv.input.sourceLabel,
    sticks: { thr: +window.__fpv.input.sticks.thr.toFixed(2), yaw: +window.__fpv.input.sticks.yaw.toFixed(2) },
  })), '(yaw should be ~0.4)');

  // full channel mapping test: set every axis and check the stick values
  await page.evaluate(() => {
    const a = window.__pad.axes;
    a[0] = 0.6;    // roll  -> +0.6
    a[1] = 0.5;    // pitch (default inverted) -> -0.5
    a[2] = 1.0;    // throttle -> 1.0
    a[3] = -0.5;   // yaw -> -0.5
  });
  await page.waitForTimeout(300);
  console.log('channel map    ', await page.evaluate(() => JSON.stringify({
    roll: +window.__fpv.input.sticks.roll.toFixed(2),
    pitch: +window.__fpv.input.sticks.pitch.toFixed(2),
    thr: +window.__fpv.input.sticks.thr.toFixed(2),
    yaw: +window.__fpv.input.sticks.yaw.toFixed(2),
  })), 'expect roll .6 pitch -.5 thr 1 yaw -.5');

  // arm via pad button 0
  await page.evaluate(() => { window.__pad.buttons[0] = { pressed: true, value: 1 }; });
  await page.waitForTimeout(250);
  const armedViaPad = await page.evaluate(() => ({ armed: window.__fpv.flight.armed, osd: document.getElementById('osd-arm').textContent }));
  console.log('pad arm button ', JSON.stringify(armedViaPad));
  await page.evaluate(() => { window.__pad.buttons[0] = { pressed: false, value: 0 }; });
  await page.waitForTimeout(400);

  // take off on the radio and fly for a bit
  await page.evaluate(() => { window.__pad.axes[2] = 0.75; window.__pad.axes[1] = 0.25; });
  await page.waitForTimeout(2500);
  const flying = await page.evaluate(() => ({
    alt: +window.__fpv.flight.position.y.toFixed(2),
    spd: +window.__fpv.flight.speed.toFixed(2),
    source: window.__fpv.input.sourceLabel,
    osdInput: document.getElementById('osd-input').textContent,
  }));
  console.log('radio flight   ', JSON.stringify(flying), '(alt should rise)');
  await page.screenshot({ path: '/tmp/fpv-verify/50-radio-fpv.png' });

  // learn-button flow
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.click('#learn-pad');
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__pad.buttons[5] = { pressed: true, value: 1 }; });
  await page.waitForTimeout(400);
  console.log('learn result   ', await page.evaluate(() => JSON.stringify({
    bound: window.__fpv.S.get('armPadButton'), out: document.getElementById('learn-out').textContent,
  })), 'expect bound 5');
  await page.evaluate(() => { window.__pad.buttons[5] = { pressed: false, value: 0 }; });
  await page.screenshot({ path: '/tmp/fpv-verify/51-settings-radio.png' });
  await page.click('#btn-close');
  await page.waitForTimeout(400);

  // unplug -> falls back to keyboard
  await page.evaluate(() => { window.__pad.connected = false; });
  await page.waitForTimeout(400);
  console.log('pad unplugged  ', await page.evaluate(() => JSON.stringify({
    seen: window.__fpv.input.radioSeen, source: window.__fpv.input.source,
  })), 'expect keyboard fallback');

  // canyon sky check
  await page.evaluate(() => window.__fpv.S.set('env', 'canyon'));
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const f = window.__fpv.flight;
    f.position.set(0, 10, 30); f.velocity.set(0, 0, 0); f.quaternion.identity();
    f.armed = true; window.__fpv.input.keyThrottle = 0.6;
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/fpv-verify/52-canyon-sky.png' });
  await page.evaluate(() => window.__fpv.S.set('viewMode', 'los'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/fpv-verify/53-los.png' });

  const uniq = [...new Set(logs.map((l) => l.slice(0, 140)))];
  console.log('--- CONSOLE (' + logs.length + ' / ' + uniq.length + ' unique) ---');
  console.log(uniq.slice(0, 12).join('\n') || '(clean)');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
