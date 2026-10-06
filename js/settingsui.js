// Settings panel: tabs, live controller axis monitor, channel mapping,
// arm-button learning, flight tuning and world options.

import { el, clamp } from './utils.js';
import * as S from './settings.js';
import { listEnvironments } from './environments/index.js';

const CHANNELS = [
  ['roll', 'Roll'],
  ['pitch', 'Pitch'],
  ['throttle', 'Throttle'],
  ['yaw', 'Yaw'],
];

export function initSettingsUI({ input, hooks }) {
  const panel = el('settings');

  // ---- tabs ---------------------------------------------------------------
  const tabs = [...panel.querySelectorAll('.tab')];
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('active', x === t));
    panel.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('hidden', p.id !== 'tab-' + t.dataset.tab);
    });
  }));

  // ---- arm key ------------------------------------------------------------
  const armKey = el('arm-key');
  for (const [code, label] of S.ARM_KEY_CHOICES) {
    const o = document.createElement('option');
    o.value = code; o.textContent = label;
    armKey.appendChild(o);
  }
  armKey.value = S.get('armKey');
  armKey.addEventListener('change', () => {
    S.set('armKey', armKey.value);
    el('hint').innerHTML = `ESC settings &nbsp;·&nbsp; R reset &nbsp;·&nbsp; C view &nbsp;·&nbsp; ${armKey.options[armKey.selectedIndex].textContent} arm`;
  });

  // ---- channel mapping grid ----------------------------------------------
  const grid = el('map-grid');
  const mapSelects = {};
  const invBoxes = {};
  for (const [key, label] of CHANNELS) {
    const wrap = document.createElement('div');
    wrap.className = 'g';
    const name = document.createElement('span');
    name.textContent = label;
    const sel = document.createElement('select');
    for (let i = 0; i < 8; i++) {
      const o = document.createElement('option');
      o.value = String(i); o.textContent = 'axis ' + i;
      sel.appendChild(o);
    }
    sel.value = String(S.get('axisMap')[key]);
    sel.addEventListener('change', () => {
      const m = { ...S.get('axisMap'), [key]: parseInt(sel.value, 10) };
      S.set('axisMap', m);
    });
    const invWrap = document.createElement('label');
    invWrap.style.cssText = 'display:flex;gap:5px;align-items:center;font-size:11px;color:#5b6875';
    const inv = document.createElement('input');
    inv.type = 'checkbox';
    inv.checked = !!S.get('invert')[key];
    inv.addEventListener('change', () => {
      const v = { ...S.get('invert'), [key]: inv.checked };
      S.set('invert', v);
    });
    invWrap.append(inv, document.createTextNode('inv'));
    wrap.append(name, sel, invWrap);
    grid.appendChild(wrap);
    mapSelects[key] = sel;
    invBoxes[key] = inv;
  }

  // ---- arm button ---------------------------------------------------------
  const armIdx = el('arm-btn-idx');
  armIdx.value = String(S.get('armPadButton'));
  armIdx.addEventListener('change', () => {
    S.set('armPadButton', clamp(parseInt(armIdx.value, 10) || 0, 0, 31));
  });
  const learnOut = el('learn-out');
  el('learn-pad').addEventListener('click', async () => {
    learnOut.textContent = 'press a button on the radio…';
    const idx = await input.learnPadButton();
    S.set('armPadButton', idx);
    armIdx.value = String(idx);
    learnOut.textContent = 'bound to button ' + idx;
  });

  // ---- flight sliders -----------------------------------------------------
  const bindRange = (id, key, fmt) => {
    const s = el(id);
    const out = el('v-' + id.slice(2));
    s.value = String(S.get(key));
    out.textContent = fmt(S.get(key));
    s.addEventListener('input', () => {
      const v = parseFloat(s.value);
      S.set(key, v);
      out.textContent = fmt(v);
    });
  };
  bindRange('s-rate', 'rate', (v) => v + '°/s');
  bindRange('s-yaw', 'yawRate', (v) => v + '°/s');
  bindRange('s-expo', 'expo', (v) => v.toFixed(2));
  bindRange('s-keysens', 'keySens', (v) => v.toFixed(1) + '×');
  bindRange('s-tilt', 'camTilt', (v) => v + '°');
  bindRange('s-twr', 'twr', (v) => v.toFixed(1));
  bindRange('s-wind', 'wind', (v) => v.toFixed(1));

  // ---- selects / checkboxes ----------------------------------------------
  const bindSelect = (id, key) => {
    const s = el(id);
    s.value = S.get(key);
    s.addEventListener('change', () => S.set(key, s.value));
  };
  const bindCheck = (id, key) => {
    const c = el(id);
    c.checked = !!S.get(key);
    c.addEventListener('change', () => S.set(key, c.checked));
  };
  bindSelect('flight-mode', 'flightMode');
  bindSelect('view-mode', 'viewMode');
  bindCheck('sound', 'sound');
  bindCheck('gates-on', 'gates');
  bindCheck('show-sticks', 'showSticks');
  bindCheck('show-osd', 'showOsd');
  bindCheck('shake', 'shake');

  // ---- environment --------------------------------------------------------
  const envSel = el('env-select');
  for (const e of listEnvironments()) {
    const o = document.createElement('option');
    o.value = e.id; o.textContent = e.label;
    envSel.appendChild(o);
  }
  envSel.value = S.get('env');
  envSel.addEventListener('change', () => S.set('env', envSel.value));

  // ---- reset / defaults / close -------------------------------------------
  el('btn-reset').addEventListener('click', () => hooks.onReset());
  el('btn-defaults').addEventListener('click', () => {
    S.resetAll();              // emits '*' -> main.js rebuilds env + view
    syncFromSettings();
    hooks.onReset();
  });
  el('btn-close').addEventListener('click', () => hooks.onClose());

  function syncFromSettings() {
    armKey.value = S.get('armKey');
    armIdx.value = String(S.get('armPadButton'));
    for (const [key] of CHANNELS) {
      mapSelects[key].value = String(S.get('axisMap')[key]);
      invBoxes[key].checked = !!S.get('invert')[key];
    }
    el('s-rate').value = String(S.get('rate'));
    el('v-rate').textContent = S.get('rate') + '°/s';
    el('s-yaw').value = String(S.get('yawRate'));
    el('v-yaw').textContent = S.get('yawRate') + '°/s';
    el('s-expo').value = String(S.get('expo'));
    el('v-expo').textContent = S.get('expo').toFixed(2);
    el('s-keysens').value = String(S.get('keySens'));
    el('v-keysens').textContent = S.get('keySens').toFixed(1) + '×';
    el('s-tilt').value = String(S.get('camTilt'));
    el('v-tilt').textContent = S.get('camTilt') + '°';
    el('s-twr').value = String(S.get('twr'));
    el('v-twr').textContent = S.get('twr').toFixed(1);
    el('s-wind').value = String(S.get('wind'));
    el('v-wind').textContent = S.get('wind').toFixed(1);
    el('flight-mode').value = S.get('flightMode');
    el('view-mode').value = S.get('viewMode');
    el('sound').checked = !!S.get('sound');
    el('gates-on').checked = !!S.get('gates');
    el('show-sticks').checked = !!S.get('showSticks');
    el('show-osd').checked = !!S.get('showOsd');
    el('shake').checked = !!S.get('shake');
    envSel.value = S.get('env');
  }

  // ---- live axis monitor --------------------------------------------------
  const axesWrap = el('axes');
  const bars = [];
  for (let i = 0; i < 8; i++) {
    const d = document.createElement('div');
    d.className = 'ax';
    d.innerHTML = `axis ${i}<div class="axbar"><i></i></div>`;
    axesWrap.appendChild(d);
    bars.push(d.querySelector('i'));
  }
  const padStatus = el('pad-status');

  let monitorTimer = 0;
  function tick(dt) {
    monitorTimer += dt;
    if (monitorTimer < 0.06) return;      // ~16fps is plenty for a monitor
    monitorTimer = 0;
    if (input.pad) {
      const name = input.padName.length > 46 ? input.padName.slice(0, 44) + '…' : input.padName;
      padStatus.textContent = `${name} — ${input.axisCount} axes, ${input.pad.buttons.length} buttons · active: ${input.sourceLabel}`;
    } else {
      padStatus.textContent = 'No controller detected — keyboard active. Plug a radio in and move a stick.';
    }
    for (let i = 0; i < bars.length; i++) {
      const v = clamp(input.axes[i] || 0, -1, 1);
      const pct = ((v + 1) / 2) * 100;
      bars[i].style.left = pct + '%';
      bars[i].style.opacity = i < input.axisCount ? '1' : '0.25';
    }
  }

  return { tick, syncFromSettings };
}