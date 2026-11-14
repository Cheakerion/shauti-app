/**
 * 复研 · 存档管理
 * 导入（文件夹 / zip）、导出 zip、删除、内容文档拼装
 */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const store = require('./store');
const winps = require('./winps');

const RUNTIME_TAGS = `
<link rel="stylesheet" href="/content/overlay.css">
<style id="fuyan-host-fix">
  /* 宿主环境修正：iframe 内不需要站点自己的滚动条样式 */
  html{scrollbar-width:thin}
  ::selection{background:rgba(15,118,110,.22)}
</style>
`;

const RUNTIME_SCRIPT = `
<script src="/content/runtime.js"></script>
`;

async function findManifestRoot(dir) {
  const direct = path.join(dir, 'manifest.json');
  if (fs.existsSync(direct)) return dir;
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch (_) {}
  const subs = [];
  for (const n of names) {
    const p = path.join(dir, n);
    try {
      if ((await fsp.stat(p)).isDirectory() && fs.existsSync(path.join(p, 'manifest.json'))) subs.push(p);
    } catch (_) {}
  }
  if (subs.length === 1) return subs[0];
  throw new Error('这个文件夹里没有找到 manifest.json（不是有效存档）');
}

async function validateArchiveDir(dir) {
  const m = await store.readJSON(path.join(dir, 'manifest.json'), null);
  if (!m) throw new Error('manifest.json 解析失败');
  if (!m.schema || !String(m.schema).startsWith('fuyan/archive')) {
    throw new Error('不是复研存档（schema 不匹配）');
  }
  if (!fs.existsSync(path.join(dir, 'content.html'))) throw new Error('缺少 content.html');
  if (!m.id) throw new Error('manifest 缺少 id');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(m.id)) throw new Error('存档 id 只能包含字母数字._-');
  return m;
}

/** 导入：src 为文件夹或 .zip；返回 manifest */
async function importArchive(src, { mode = 'replace' } = {}) {
  if (!src || !fs.existsSync(src)) throw new Error('路径不存在：' + src);
  const st = await fsp.stat(src);
  let workDir = src;
  let tmpDir = null;
  if (st.isFile()) {
    if (!/\.(zip|fuyan)$/i.test(src)) throw new Error('只支持文件夹或 .zip 存档包');
    tmpDir = path.join(store.TMP_DIR, 'import-' + Date.now());
    await winps.expandZip(src, tmpDir);
    workDir = await findManifestRoot(tmpDir);
  } else {
    workDir = await findManifestRoot(src);
  }

  const manifest = await validateArchiveDir(workDir);
  const id = manifest.id;
  const target = store.archivePath(id);

  let backup = null;
  if (fs.existsSync(target)) {
    if (mode !== 'replace') throw new Error('同名存档已存在：' + id);
    backup = target + '.bak-' + Date.now();
    await fsp.rename(target, backup);
  }
  try {
    await fsp.cp(workDir, target, { recursive: true });
    await validateArchiveDir(target);
  } catch (e) {
    if (backup && fs.existsSync(backup) && !fs.existsSync(target)) await fsp.rename(backup, target);
    throw e;
  }
  if (backup) { try { await fsp.rm(backup, { recursive: true, force: true }); } catch (_) {} }
  if (tmpDir) { try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch (_) {} }

  // 导入草稿：保留用户学习数据（批注/进度）不动，只更新内容
  return { id, manifest, replaced: !!backup };
}

async function exportArchive(id) {
  const dir = store.archivePath(id);
  if (!fs.existsSync(dir)) throw new Error('存档不存在');
  const m = await store.readJSON(path.join(dir, 'manifest.json'), {});
  const safe = String(m.title || id).replace(/[\\/:*?"<>|\s]+/g, '_');
  const zip = path.join(store.EXPORT_DIR, `${safe}_v${m.version || '0'}_${id}.zip`);
  await winps.compressDir(dir, zip);
  return zip;
}

async function deleteArchive(id) {
  const dir = store.archivePath(id);
  if (!fs.existsSync(dir)) throw new Error('存档不存在');
  await fsp.rm(dir, { recursive: true, force: true });
  return true;
}

/** 内容文档：把 runtime + overlay 注入存档自带的 content.html */
async function buildContentDoc(id) {
  const file = path.join(store.archivePath(id), 'content.html');
  let html = await fsp.readFile(file, 'utf8');
  if (!html.includes('/content/overlay.css')) {
    html = html.replace(/<\/head>/i, RUNTIME_TAGS + '</head>');
  }
  if (!html.includes('/content/runtime.js')) {
    html = html.replace(/<\/body>/i, RUNTIME_SCRIPT + '</body>');
  }
  return html;
}

/** 从 URL 下载存档包到临时目录（供「从链接导入」用） */
async function downloadToFile(url, { maxBytes = 300 * 1024 * 1024, timeout = 120000 } = {}) {
  const http = require('http');
  const https = require('https');
  const dir = path.join(store.TMP_DIR, 'url-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });

  const fetchOne = (u, redirects = 0) => new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('重定向次数过多'));
    const client = u.startsWith('https') ? https : http;
    const req = client.get(u, { timeout, headers: { 'User-Agent': 'fuyan-app', Accept: '*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, u).toString();
        return resolve(fetchOne(next, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const name = decodeURIComponent((u.split('/').pop() || 'archive.zip').split('?')[0]);
      const safeName = /\.(zip|fuyan)$/i.test(name) ? name : 'archive.zip';
      const file = path.join(dir, safeName);
      let size = 0;
      const out = fs.createWriteStream(file);
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy(new Error('文件超过 300MB 限制'));
        }
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve({ file, size })));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('下载超时')));
  });

  const r = await fetchOne(url);
  if (!/\.(zip|fuyan)$/i.test(r.file)) throw new Error('链接不是 .zip 存档包');
  return { ...r, dir };
}

module.exports = { importArchive, exportArchive, deleteArchive, buildContentDoc, findManifestRoot, downloadToFile };
