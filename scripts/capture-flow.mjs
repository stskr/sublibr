#!/usr/bin/env node
/**
 * Drive Sublibr (dev + SUBLIBR_SCREENSHOTS=1) and capture the local
 * transcribe → German translate flow at 1440×900.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'readme-screenshots');
const VIDEO = join(
  ROOT,
  'example video file',
  'Short Tears of Steel - 4k version (in HD) - Blender Foundation channel - Blender (720p, h264).mp4',
);
const CDP = 'http://127.0.0.1:9333';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCdp(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${CDP}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && /localhost|127\.0\.0\.1/.test(t.url));
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('Electron CDP did not come up on port 9333');
}

function createCdp(wsUrl) {
  let id = 0;
  const pending = new Map();
  const ws = new WebSocket(wsUrl);
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  async function send(method, params = {}) {
    await ready;
    const next = ++id;
    return new Promise((resolve, reject) => {
      pending.set(next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  }
  return { send, close: () => ws.close() };
}

async function evalExpr(cdp, expression, returnByValue = true) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function clickPoint(cdp, x, y) {
  const opts = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...opts });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...opts });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...opts });
}

async function clickSelector(cdp, selector) {
  const box = await evalExpr(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: el.disabled };
  })()`);
  if (!box) throw new Error(`No element: ${selector}`);
  await clickPoint(cdp, box.x, box.y);
}

async function clickButtonText(cdp, text, { exact = false } = {}) {
  const box = await evalExpr(cdp, `(() => {
    const want = ${JSON.stringify(text)};
    const exact = ${exact};
    const buttons = [...document.querySelectorAll('button')];
    const el = buttons.find((b) => {
      const t = (b.innerText || '').replace(/\\s+/g, ' ').trim();
      return exact ? t === want : t.includes(want);
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: el.disabled, text: el.innerText };
  })()`);
  if (!box) throw new Error(`No button: ${text}`);
  if (box.disabled) throw new Error(`Button disabled: ${text}`);
  await clickPoint(cdp, box.x, box.y);
}

async function waitFor(cdp, expression, { timeout = 30_000, interval = 300 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await evalExpr(cdp, `Boolean(${expression})`);
    if (value) return value;
    await sleep(interval);
  }
  throw new Error(`Timeout waiting for: ${expression}`);
}

async function screenshot(cdp, name) {
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const dest = join(OUT, `${name}.png`);
  await writeFile(dest, Buffer.from(shot.data, 'base64'));
  console.log('wrote', dest);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const page = await waitForCdp();
  console.log('CDP page', page.url);
  const cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await sleep(1500);

  await waitFor(cdp, `document.body && !document.querySelector('.setup-modal')`, { timeout: 20_000 });

  await screenshot(cdp, '1-home');

  await clickSelector(cdp, 'button[aria-label="Settings"]');
  await waitFor(cdp, `document.querySelector('.settings-modal')`);
  await sleep(400);

  const transcribeCloud = await evalExpr(cdp, `document.querySelector('#transcribeMode')?.checked === true`);
  if (transcribeCloud) {
    await clickSelector(cdp, '#transcribeMode');
    await sleep(800);
  }
  const translateCloud = await evalExpr(cdp, `document.querySelector('#translateMode')?.checked === true`);
  if (translateCloud) {
    await clickSelector(cdp, '#translateMode');
    await sleep(800);
  }

  await waitFor(cdp, `(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('Save settings'));
    return btn && !btn.disabled;
  })()`, { timeout: 60_000 });

  await screenshot(cdp, '2-settings-local');
  await clickButtonText(cdp, 'Save settings');
  await waitFor(cdp, `!document.querySelector('.settings-modal')`, { timeout: 10_000 });
  await sleep(500);

  await evalExpr(cdp, `window.dispatchEvent(new CustomEvent('sublibr-open-media', { detail: ${JSON.stringify(VIDEO)} }))`);
  await waitFor(cdp, `document.querySelector('.editor-container')`, { timeout: 60_000 });
  await waitFor(cdp, `[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('Generate subtitles') && !b.disabled)`, { timeout: 90_000 });

  // Spoken language → English
  await evalExpr(cdp, `(() => {
    const selectLang = [...document.querySelectorAll('.toggle-btn')].find((b) => (b.innerText || '').includes('Select language'));
    if (selectLang) selectLang.click();
  })()`);
  await sleep(200);
  await evalExpr(cdp, `(() => {
    const input = document.querySelector('.language-autocomplete input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'English');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    return true;
  })()`);
  await sleep(400);
  await evalExpr(cdp, `(() => {
    const item = [...document.querySelectorAll('.language-dropdown li')].find((li) => li.textContent.trim() === 'English');
    if (item) { item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true; }
    return false;
  })()`);
  await sleep(400);

  await screenshot(cdp, '3-generate');

  await clickButtonText(cdp, 'Generate subtitles');
  await waitFor(cdp, `document.querySelector('.progress-indicator')`, { timeout: 60_000 });
  await sleep(600);
  await screenshot(cdp, '4-transcribe-start');

  await waitFor(cdp, `document.querySelectorAll('.subtitle-entry').length > 0`, { timeout: 20 * 60_000, interval: 2000 });
  await waitFor(cdp, `!document.querySelector('.progress-indicator')`, { timeout: 60_000 });
  await sleep(800);
  await screenshot(cdp, '5-transcribe-done');

  await clickButtonText(cdp, 'Translate', { exact: false });
  await waitFor(cdp, `document.querySelector('.language-autocomplete input')`);
  await sleep(300);
  await evalExpr(cdp, `(() => {
    const input = document.querySelector('.language-autocomplete input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'German');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    return true;
  })()`);
  await sleep(400);
  await evalExpr(cdp, `(() => {
    const item = [...document.querySelectorAll('.language-dropdown li')].find((li) => li.textContent.trim() === 'German');
    if (item) { item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true; }
    return false;
  })()`);
  await sleep(400);
  await screenshot(cdp, '6-translate-german');

  await clickButtonText(cdp, 'Translate');
  await waitFor(cdp, `document.querySelector('.progress-indicator')`, { timeout: 120_000 });
  await sleep(800);
  await screenshot(cdp, '7-translate-start');

  await waitFor(cdp, `!document.querySelector('.progress-indicator') && document.querySelectorAll('.subtitle-entry').length > 0`, { timeout: 25 * 60_000, interval: 2000 });
  await sleep(1000);
  await screenshot(cdp, '8-translate-done');

  await clickButtonText(cdp, 'Preview');
  await waitFor(cdp, `document.querySelector('.preview-subtitle, .preview-cinema')`, { timeout: 20_000 });
  await sleep(800);
  await screenshot(cdp, '9-preview');

  cdp.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
