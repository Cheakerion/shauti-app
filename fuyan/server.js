/**
 * 复研 MedReview · 本地服务
 * 零 npm 依赖：node server.js [--port 5279] [--no-open]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

const store = require('./lib/store');
const archiveLib = require('./lib/archive');
const ai = require('./lib/ai');
const quark = require('./lib/quark');
const updateLib = require('./lib/update');
const winps = require('./lib/winps');

const WEB_DIR = path.join(store.APP_ROOT, 'web');
const VERSION = require('./version.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

/* ------------------------------------------------------------------ utils */
function send(res, status, obj, extraHeaders) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...(extraHeaders || {}),
  });
  res.end(body);
}

function fail(res, status, message, extra) {
  send(res, status, { ok: false, error: String(message || '未知错误'), ...(extra || {}) });
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('JSON 解析失败: ' + e.message));
      }
    });
    req.on('error', reject);
  });
}

function safeJoin(root, rel) {
  const p = path.resolve(root, '.' + path.sep + (rel || ''));
  if (!p.startsWith(path.resolve(root) + path.sep) && p !== path.resolve(root)) {
    throw new Error('非法路径');
  }
  return p;
}

async function sendFile(res, file, { noCache = false } = {}) {
  let st;
  try {
    st = await fsp.stat(file);
  } catch (_) {
    return fail(res, 404, '文件不存在');
  }
  if (st.isDirectory()) return fail(res, 404, '是目录');
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': noCache ? 'no-store' : 'no-cache',
    'Last-Modified': st.mtime.toUTCString(),
  });
  fs.createReadStream(file).pipe(res);
}

function openExternal(target) {
  try {
    if (process.platform !== 'win32') return;
    if (fs.existsSync(target)) {
      const st = fs.statSync(target);
      if (st.isDirectory()) spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
      else spawn('explorer.exe', ['/select,' + target], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (_) {}
}

/* ------------------------------------------------------------------ api */
const api = {
  async health(req, res) {
    send(res, 200, { ok: true, app: 'fuyan', version: VERSION.version, pid: process.pid, dataDir: store.DATA_DIR });
  },

  async getConfig(req, res) {
    const cfg = await store.getConfig();
    const hasKey = !!ai.resolveApiKey(cfg);
    send(res, 200, { ok: true, config: { ...cfg, ai: { ...cfg.ai, apiKey: cfg.ai.apiKey ? '***' : '' } }, hasKey });
  },

  async putConfig(req, res) {
    const body = await readBody(req);
    const patch = { ...(body || {}) };
    if (patch.ai && patch.ai.apiKey === '***') delete patch.ai.apiKey;
    const cfg = await store.saveConfig(patch);
    send(res, 200, { ok: true, config: { ...cfg, ai: { ...cfg.ai, apiKey: cfg.ai.apiKey ? '***' : '' } } });
  },

  async listArchives(req, res) {
    send(res, 200, { ok: true, archives: await store.listArchives() });
  },

  async getArchive(req, res, ctx) {
    const { manifest } = await store.getArchive(ctx.params.id);
    send(res, 200, { ok: true, manifest });
  },

  async getQuestions(req, res, ctx) {
    const { questions } = await store.getArchive(ctx.params.id);
    send(res, 200, { ok: true, count: questions.length, questions });
  },

  async deleteArchive(req, res, ctx) {
    await archiveLib.deleteArchive(ctx.params.id);
    send(res, 200, { ok: true });
  },

  async importArchive(req, res) {
    const body = await readBody(req);
    if (!body.path) return fail(res, 400, '缺少 path');
    const r = await archiveLib.importArchive(body.path, { mode: body.mode || 'replace' });
    send(res, 200, { ok: true, ...r });
  },

  async pickAndImport(req, res) {
    const body = await readBody(req);
    const kind = body.kind || 'zip';
    let picked = '';
    if (kind === 'folder') picked = await winps.pickFolder('选择存档文件夹（包含 manifest.json）');
    else picked = await winps.pickFile('选择存档压缩包', '复研存档 (*.zip;*.fuyan)|*.zip;*.fuyan|所有文件 (*.*)|*.*');
    if (!picked) return send(res, 200, { ok: false, canceled: true, error: '已取消' });
    const r = await archiveLib.importArchive(picked, { mode: body.mode || 'replace' });
    send(res, 200, { ok: true, ...r, path: picked });
  },

  async exportArchive(req, res, ctx) {
    const zip = await archiveLib.exportArchive(ctx.params.id);
    send(res, 200, { ok: true, zip });
  },

  async getNotes(req, res, ctx) {
    send(res, 200, { ok: true, notes: await store.getNotes(ctx.params.id) });
  },

  async putNotes(req, res, ctx) {
    const body = await readBody(req);
    const notes = await store.saveNotes(ctx.params.id, body.items || []);
    send(res, 200, { ok: true, notes });
  },

  async getProgress(req, res, ctx) {
    send(res, 200, { ok: true, progress: await store.getProgress(ctx.params.id) });
  },

  async putProgress(req, res, ctx) {
    const body = await readBody(req);
    const progress = await store.saveProgress(ctx.params.id, body);
    send(res, 200, { ok: true, progress });
  },

  async resetProgress(req, res, ctx) {
    const body = await readBody(req);
    const progress = await store.resetProgress(ctx.params.id, body.what);
    send(res, 200, { ok: true, progress });
  },

  async quarkStatus(req, res) {
    const cfg = await store.getConfig();
    const st = await quark.status();
    send(res, 200, { ok: true, status: st, transferDir: cfg.quark.transferDir });
  },

  async quarkList(req, res) {
    const cfg = await store.getConfig();
    const r = await quark.list(cfg.quark.fid);
    send(res, 200, { ...r, transferDir: cfg.quark.transferDir });
  },

  async quarkPull(req, res) {
    const body = await readBody(req);
    if (!body.fid) return fail(res, 400, '缺少 fid');
    const dl = await quark.download({ fid: body.fid, name: body.name });
    let r;
    try {
      r = await archiveLib.importArchive(dl.file, { mode: body.mode || 'replace' });
    } finally {
      try { await fsp.rm(dl.dir, { recursive: true, force: true }); } catch (_) {}
    }
    // 记录来源，便于之后比对更新
    const mfile = path.join(store.archivePath(r.id), 'manifest.json');
    const manifest = await store.readJSON(mfile, r.manifest);
    manifest.source = {
      ...(manifest.source || {}),
      kind: 'quark',
      quarkFid: body.fid,
      quarkName: body.name || '',
      quarkSize: body.size || 0,
      quarkUpdatedAt: body.updatedAt || '',
      importedAt: store.nowISO(),
    };
    await store.writeJSON(mfile, manifest);
    send(res, 200, { ok: true, ...r, manifest });
  },

  async checkArchiveUpdate(req, res, ctx) {
    const { manifest } = await store.getArchive(ctx.params.id);
    const src = manifest.source || {};
    if (src.kind !== 'quark' || !src.quarkName) {
      return send(res, 200, { ok: true, supported: false, message: '这个存档不是从网盘导入的，无法比对更新' });
    }
    const cfg = await store.getConfig();
    const r = await quark.list(cfg.quark.fid);
    if (!r.ok) return send(res, 200, { ok: false, supported: true, message: r.message });
    // 网盘重名上传会变成 xxx(1).zip；导出名里带存档 id，也一起认
    const norm = (n) => String(n || '').replace(/\s*\(\d+\)(?=\.)/, '');
    const want = norm(src.quarkName);
    const sameBase = (n) => norm(n) === want;
    const sameId = (n) => n.includes('_' + ctx.params.id + '.zip') || n.includes('_' + ctx.params.id + '.fuyan');
    let cands = r.files.filter((f) => sameBase(f.name) || sameId(f.name));
    if (!cands.length) cands = r.files.filter((f) => f.name === src.quarkName);
    if (!cands.length) {
      return send(res, 200, { ok: true, supported: true, hasUpdate: false, missing: true, message: '网盘里已找不到这个文件' });
    }
    cands.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const remote = cands[0];
    const sizeChanged = Number(remote.size) !== Number(src.quarkSize || 0);
    const timeChanged = String(remote.updatedAt || '') !== String(src.quarkUpdatedAt || '');
    send(res, 200, {
      ok: true,
      supported: true,
      hasUpdate: sizeChanged || timeChanged,
      remote,
      candidates: cands.length,
      local: { size: src.quarkSize, updatedAt: src.quarkUpdatedAt },
      message: sizeChanged || timeChanged ? '网盘上的这个存档已更新' : '网盘上的存档就是最新版',
    });
  },

  async aiChat(req, res) {
    const body = await readBody(req);
    const cfg = await store.getConfig();
    let archiveTitle = '';
    if (body.archiveId) {
      try {
        const a = await store.getArchive(body.archiveId);
        archiveTitle = a.manifest.title;
      } catch (_) {}
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const sendEvt = (obj) => {
      try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (_) {}
    };
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    try {
      const { text, model } = await ai.chat({
        cfg,
        archiveTitle,
        sectionTitle: body.sectionTitle || '',
        quote: body.quote || '',
        messages: body.messages || [],
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === 'delta') sendEvt({ type: 'delta', text: e.text });
          else if (e.type === 'usage') sendEvt({ type: 'usage', usage: e.usage });
        },
      });
      sendEvt({ type: 'done', text, model });
    } catch (e) {
      sendEvt({ type: 'error', message: e.message || String(e) });
    }
    res.end();
  },

  async aiTest(req, res) {
    const cfg = await store.getConfig();
    try {
      const models = await ai.listModels(cfg);
      const ids = ((models && models.data) || []).map((m) => m.id);
      send(res, 200, { ok: true, models: ids, hasKey: !!ai.resolveApiKey(cfg) });
    } catch (e) {
      send(res, 200, { ok: false, error: e.message });
    }
  },

  async appUpdate(req, res) {
    const r = await updateLib.check();
    send(res, 200, r);
  },

  async quit(req, res) {
    send(res, 200, { ok: true, message: '正在退出' });
    setTimeout(() => process.exit(0), 250);
  },

  async importUrl(req, res) {
    const body = await readBody(req);
    if (!/^https?:\/\//i.test(body.url || '')) return fail(res, 400, '只支持 http(s) 链接');
    const dl = await archiveLib.downloadToFile(body.url);
    try {
      const r = await archiveLib.importArchive(dl.file, { mode: body.mode || 'replace' });
      send(res, 200, { ok: true, ...r, bytes: dl.size });
    } finally {
      fsp.rm(dl.dir, { recursive: true, force: true }).catch(() => {});
    }
  },

  /** 在线存档库清单（放 GitHub 的 archives.json；raw 不通时自动回落 jsDelivr） */
  async catalog(req, res) {
    const cfg = await store.getConfig();
    const url = cfg.archives && cfg.archives.catalogUrl;
    if (!url) return send(res, 200, { ok: true, configured: false, items: [] });
    const urls = [url];
    const m = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url);
    if (m) urls.push(`https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}/${m[4]}`);
    const m2 = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/.exec(url);
    if (m2) urls.push(`https://cdn.jsdelivr.net/gh/${m2[1]}/${m2[2]}@${m2[3]}/${m2[4]}`);
    let data = null;
    let used = '';
    let lastErr = null;
    for (const u of urls) {
      try {
        data = await updateLib.fetchJSON(u, 12000);
        used = u;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!data) {
      return send(res, 200, { ok: false, configured: true, url, items: [], message: '读取在线存档库失败：' + (lastErr ? lastErr.message : '未知错误') });
    }
    const items = (data && (data.archives || data.items)) || [];
    send(res, 200, { ok: true, configured: true, url, source: used, updatedAt: data.updatedAt || '', items });
  },

  /** 发布到网盘（作者通道）：导出 zip → 上传 → 同名旧版本移进「旧测试」 */
  async publishArchive(req, res, ctx) {
    const { manifest } = await store.getArchive(ctx.params.id);
    const cfg = await store.getConfig();
    const zip = await archiveLib.exportArchive(ctx.params.id);
    const up = await quark.upload(zip, cfg.quark.fid);
    let arch = { moved: [], kept: up.fileName };
    try {
      arch = await quark.archiveOldVersions(cfg.quark.fid, up.fileName);
    } catch (e) {
      arch.error = e.message;
    }
    send(res, 200, {
      ok: true,
      id: ctx.params.id,
      title: manifest.title,
      version: manifest.version,
      file: up.fileName,
      size: up.size,
      kept: arch.kept || up.fileName,
      moved: arch.moved || [],
      error: arch.error || '',
    });
  },

  async reveal(req, res) {
    const body = await readBody(req);
    if (body.path) openExternal(body.path);
    send(res, 200, { ok: true });
  },

  async openExternal(req, res) {
    const body = await readBody(req);
    if (!/^https?:\/\//i.test(body.url || '')) return fail(res, 400, '只允许 http(s)');
    openExternal(body.url);
    send(res, 200, { ok: true });
  },
};

/* ------------------------------------------------------------------ routing */
const ROUTES = [
  ['GET', /^\/api\/health$/, api.health],
  ['GET', /^\/api\/config$/, api.getConfig],
  ['PUT', /^\/api\/config$/, api.putConfig],
  ['GET', /^\/api\/archives$/, api.listArchives],
  ['GET', /^\/api\/archives\/catalog$/, api.catalog],
  ['POST', /^\/api\/archives\/import$/, api.importArchive],
  ['POST', /^\/api\/archives\/import-url$/, api.importUrl],
  ['POST', /^\/api\/archives\/pick$/, api.pickAndImport],
  ['POST', /^\/api\/archives\/([\w.-]+)\/publish$/, api.publishArchive],
  ['GET', /^\/api\/archives\/([\w.-]+)$/, api.getArchive],
  ['DELETE', /^\/api\/archives\/([\w.-]+)$/, api.deleteArchive],
  ['GET', /^\/api\/archives\/([\w.-]+)\/questions$/, api.getQuestions],
  ['POST', /^\/api\/archives\/([\w.-]+)\/export$/, api.exportArchive],
  ['GET', /^\/api\/archives\/([\w.-]+)\/notes$/, api.getNotes],
  ['PUT', /^\/api\/archives\/([\w.-]+)\/notes$/, api.putNotes],
  ['GET', /^\/api\/archives\/([\w.-]+)\/progress$/, api.getProgress],
  ['PUT', /^\/api\/archives\/([\w.-]+)\/progress$/, api.putProgress],
  ['POST', /^\/api\/archives\/([\w.-]+)\/reset$/, api.resetProgress],
  ['POST', /^\/api\/archives\/([\w.-]+)\/check-update$/, api.checkArchiveUpdate],
  ['GET', /^\/api\/quark\/status$/, api.quarkStatus],
  ['GET', /^\/api\/quark\/list$/, api.quarkList],
  ['POST', /^\/api\/quark\/pull$/, api.quarkPull],
  ['POST', /^\/api\/ai\/chat$/, api.aiChat],
  ['POST', /^\/api\/ai\/test$/, api.aiTest],
  ['GET', /^\/api\/app\/update$/, api.appUpdate],
  ['POST', /^\/api\/reveal$/, api.reveal],
  ['POST', /^\/api\/quit$/, api.quit],
  ['POST', /^\/api\/open-external$/, api.openExternal],
];

function matchRoute(method, pathname) {
  for (const [m, re, fn] of ROUTES) {
    if (m !== method) continue;
    const mt = re.exec(pathname);
    if (mt) return { fn, params: { id: mt[1] ? decodeURIComponent(mt[1]) : undefined } };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let pathname = '/';
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    pathname = decodeURIComponent(u.pathname);
  } catch (_) {}

  res.on('finish', () => {
    if (!pathname.startsWith('/api/')) return;
    if (process.env.FUYAN_QUIET) return;
    console.log(`[api] ${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
  });

  try {
    // 1) API
    if (pathname.startsWith('/api/')) {
      const route = matchRoute(req.method, pathname);
      if (!route) return fail(res, 404, '接口不存在: ' + pathname);
      return await route.fn(req, res, { params: route.params });
    }

    // 2) 存档内容文档（注入 runtime）
    let m = /^\/archive\/([\w.-]+)\/content\.html$/.exec(pathname);
    if (m) {
      const html = await archiveLib.buildContentDoc(m[1]);
      const buf = Buffer.from(html, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
      });
      return res.end(buf);
    }
    // 3) 存档内资源（图片等）
    m = /^\/archive\/([\w.-]+)\/(.+)$/.exec(pathname);
    if (m) {
      const file = safeJoin(store.archivePath(m[1]), m[2]);
      return sendFile(res, file);
    }

    // 4) 静态前端
    let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let file = safeJoin(WEB_DIR, rel);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // SPA 回退
      file = path.join(WEB_DIR, 'index.html');
    }
    return sendFile(res, file, { noCache: true });
  } catch (e) {
    console.error('[error]', req.method, pathname, e);
    if (!res.headersSent) fail(res, 500, e.message || String(e));
    else try { res.end(); } catch (_) {}
  }
});

/* ------------------------------------------------------------------ boot */
function parseArgs() {
  const args = process.argv.slice(2);
  const out = { port: Number(process.env.FUYAN_PORT) || 5279, open: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') out.port = Number(args[++i]);
    if (args[i] === '--no-open') out.open = false;
  }
  return out;
}

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const onError = (e) => {
      server.removeListener('listening', onOk);
      reject(e);
    };
    const onOk = () => {
      server.removeListener('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onOk);
    server.listen(port, '127.0.0.1');
  });
}

function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((p) => fs.existsSync(p)) || '';
}

function openWindow(url) {
  const edge = findEdge();
  if (edge) {
    spawn(edge, [`--app=${url}`, '--window-size=1480,980', '--disable-features=Translate'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
}

/** 已经有一个复研在跑？返回它的地址 */
function probeRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 900 }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve(j && j.app === 'fuyan' ? `http://127.0.0.1:${port}` : null);
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function main() {
  const opts = parseArgs();

  // 单实例：已经在跑就直接开窗口，不再起第二个服务
  const running = await probeRunning(opts.port);
  if (running) {
    console.log('复研已经在运行：' + running);
    if (opts.open) openWindow(running);
    return;
  }

  let port = opts.port;
  let lastErr = null;
  for (let i = 0; i < 30; i++) {
    try {
      await listenOn(port + i);
      port = port + i;
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) {
    console.error('无法监听端口：', lastErr.message);
    process.exit(1);
  }
  const url = `http://127.0.0.1:${port}`;
  await store.writeJSON(path.join(store.DATA_DIR, 'runtime.json'), {
    port,
    url,
    pid: process.pid,
    startedAt: store.nowISO(),
    version: VERSION.version,
  });
  console.log('');
  console.log('  复研 MedReview v' + VERSION.version);
  console.log('  ' + url);
  console.log('  数据目录：' + store.DATA_DIR);
  console.log('');
  if (opts.open) openWindow(url);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { server };
