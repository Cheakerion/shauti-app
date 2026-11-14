/**
 * 复研 · 软件更新检查
 * 远端清单：version.json {version, update, notes, url}
 * 源：设置里的 manifestUrl，或按 update.repo 自动拼 GitHub raw + jsDelivr 双源
 */
'use strict';

const fs = require('fs');
const path = require('path');
const store = require('./store');

const LOCAL = path.join(store.APP_ROOT, 'version.json');

function getLocal() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
  } catch (_) {
    return { version: '0.0.0', update: 0, notes: '', url: '' };
  }
}

function cmpVersion(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function fetchJSON(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? require('https') : require('http');
    const req = mod.get(url, { timeout, headers: { 'User-Agent': 'fuyan-app' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function sources(cfg) {
  const list = [];
  const u = cfg.update && cfg.update.manifestUrl;
  if (u) list.push(u);
  const repo = (cfg.update && cfg.update.repo) || '';
  if (repo && /^[\w.-]+\/[\w.-]+$/.test(repo)) {
    const b = (cfg.update && cfg.update.branch) || 'main';
    const branches = b === 'master' ? ['master'] : [b, 'master'];
    let p = (cfg.update && cfg.update.path) || '';
    p = String(p).replace(/^\/+/, '');
    if (p && !p.endsWith('/')) p += '/';
    // raw 反映最近一次 push（jsDelivr 的分支缓存可能滞后数小时），所以 raw 优先、jsDelivr 兜底
    for (const x of branches) list.push(`https://raw.githubusercontent.com/${repo}/${x}/${p}version.json`);
    for (const x of branches) list.push(`https://cdn.jsdelivr.net/gh/${repo}@${x}/${p}version.json`);
  }
  return list;
}

async function check() {
  const cfg = await store.getConfig();
  const local = getLocal();
  const urls = sources(cfg);
  if (!urls.length) {
    return {
      ok: false,
      configured: false,
      local,
      message: '还没有配置更新源：在「设置 → 软件更新」里填 GitHub 仓库（owner/repo）或 version.json 直链',
    };
  }
  let remote = null;
  let lastErr = null;
  let used = '';
  for (const url of urls) {
    try {
      remote = await fetchJSON(url, 6000);
      used = url;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!remote) {
    return { ok: false, configured: true, local, message: '检查更新失败：' + (lastErr ? lastErr.message : '未知错误'), sources: urls };
  }
  const versionNewer = cmpVersion(remote.version, local.version) > 0;
  const lag = Math.max(0, (remote.update || 0) - (local.update || 0));
  return {
    ok: true,
    configured: true,
    local,
    remote,
    source: used,
    hasUpdate: versionNewer || lag > 0,
    lag,
    downloadUrl: remote.url || '',
    message: versionNewer || lag > 0 ? `有新版本 ${remote.version}${lag > 0 ? `（落后 ${lag} 个更新）` : ''}` : '已是最新',
  };
}

module.exports = { check, getLocal, fetchJSON, cmpVersion, sources };
