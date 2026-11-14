/**
 * 复研 · 无头浏览器 E2E 驱动
 * 用 Edge 的 DevTools 协议（Node 24 自带 WebSocket）跑页面内脚本并取结果。
 *
 * 用法：node tools/e2e.mjs reader [--port 5279] [--url http://127.0.0.1:5279]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const EDGE = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
const scenario = process.argv[2] || 'reader';
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const BASE = arg('url', 'http://127.0.0.1:5279');
const PORT = Number(arg('devtools-port', 9333));
const profile = path.join(os.tmpdir(), 'fuyan-e2e-' + Date.now());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

async function main() {
  if (!EDGE) throw new Error('找不到 Edge/Chrome');
  const child = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1480,980',
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch (_) {}
    await sleep(250);
  }
  if (!target) throw new Error('连不上 Edge DevTools');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const consoleLines = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleLines.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');
  const shot = arg('screenshot', '');
  const nosum = shot ? '&nosum=1' : '';
  await send('Page.navigate', { url: `${BASE}/?e2e=${encodeURIComponent(scenario)}${nosum}` });

  // 轮询页面里的结果
  let result = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    await sleep(700);
    try {
      const r = await send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__E2E_RESULT || null)',
        returnByValue: true,
        awaitPromise: false,
      });
      const v = r.result && r.result.value;
      if (v && v !== 'null') {
        result = JSON.parse(v);
        break;
      }
      const t = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
      if (t.result && /E2E ERROR/.test(t.result.value || '')) {
        result = { scenario, pass: 0, fail: 1, err: t.result.value, results: [] };
        break;
      }
    } catch (e) {
      consoleLines.push('eval error: ' + e.message);
    }
  }

  // 场景结束后截图（用于人工看交互态）
  const shotPath = arg('screenshot', '');
  if (shotPath) {
    try {
      const cap = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(path.resolve(shotPath)), { recursive: true });
      fs.writeFileSync(path.resolve(shotPath), Buffer.from(cap.data, 'base64'));
      console.log('截图：' + path.resolve(shotPath));
    } catch (e) {
      console.error('截图失败：' + e.message);
    }
  }

  try { await send('Browser.close'); } catch (_) {}
  try { child.kill(); } catch (_) {}
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}

  if (!result) {
    console.error('没有拿到结果。控制台输出：');
    console.error(consoleLines.join('\n'));
    process.exit(2);
  }

  console.log(`\n== E2E ${result.scenario} : ${result.pass} pass / ${result.fail} fail ==`);
  for (const r of result.results || []) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '   [' + r.extra + ']' : ''}`);
  }
  if (result.err) console.log('ERR:', result.err);
  const errs = consoleLines.filter((l) => /EXCEPTION|error/i.test(l));
  if (errs.length) console.log('\n控制台异常：\n' + errs.slice(0, 10).join('\n'));
  process.exit(result.fail || result.err ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E 驱动失败:', e);
  process.exit(2);
});
