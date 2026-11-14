/**
 * 复研 · 夸克网盘（经 WSL 里的官方 quark-drive CLI）
 * 只做两件事：列出「dsh传输」里的存档包；把指定文件下载到本机临时目录。
 */
'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const store = require('./store');

const DISTRO = process.env.FUYAN_WSL_DISTRO || 'Ubuntu-24.04';
const NODE20 = '/home/29866/.local/node20/bin';
const CLI = '/home/29866/quark_setup/pkg/scripts/quark-drive.cjs';
const PKG = '/home/29866/quark_setup/pkg';

function dshHomeWsl() {
  const home = os.homedir();
  const m = home.match(/^([A-Za-z]):\\(.*)$/);
  if (!m) return '/mnt/c/Users/' + path.basename(home) + '/.dsh';
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}/.dsh`;
}

function toWsl(p) {
  const abs = path.resolve(p);
  const m = abs.match(/^([A-Za-z]):\\(.*)$/);
  if (!m) throw new Error('只支持 Windows 盘符路径：' + abs);
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

function normalizeTime(v) {
  if (!v) return '';
  if (typeof v === 'number') return new Date(v).toISOString();
  return String(v);
}

function sessionId() {
  return (process.env.DSH_SESSION_ID || 'fuyan') + '-' + Math.floor(Date.now() / 1000);
}

function runCli(args, { cwdWsl = '/tmp', timeout = 180000 } = {}) {
  const sid = sessionId();
  const cmd =
    `export PATH='${NODE20}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'; ` +
    `export DSH_HOME='${dshHomeWsl()}'; ` +
    `export DSH_SESSION_ID='${process.env.DSH_SESSION_ID || 'fuyan'}'; ` +
    `mkdir -p ${cwdWsl} && cd ${cwdWsl} && ` +
    `node ${CLI} ${args} --session-input 'fuyan app netdisk request' --session-id '${sid}' 2>&1`;
  return new Promise((resolve, reject) => {
    execFile('wsl', ['-d', DISTRO, '--', 'bash', '-lc', cmd], { timeout, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = (stdout || '') + (stderr || '');
        resolve({ ok: !err, code: err ? err.code : 0, out });
      });
  });
}

function parseResults(out) {
  const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
  const objs = [];
  for (const l of lines) {
    try { objs.push(JSON.parse(l)); } catch (_) {}
  }
  return objs;
}

async function status() {
  const r = await runCli('get-user-info', { timeout: 60000 });
  const objs = parseResults(r.out);
  const res = objs.find((o) => o.action === 'get-user-info' && o.type === 'result') || objs[0] || null;
  const ok = !!(res && res.code === 0);
  return {
    ok,
    message: ok ? '已连接夸克网盘' : (res && res.msg) || 'WSL 或夸克授权不可用',
    raw: ok ? (res.data || null) : null,
  };
}

async function list(fid) {
  const targetFid = fid || '2f531a19c88c42f1a65179c793b87f81';
  const r = await runCli(`browse --parent-fid ${targetFid} --all`, { cwdWsl: '/tmp/fuyan-quark' });
  const objs = parseResults(r.out);
  const res = objs.find((o) => o.action === 'browse' && o.type === 'result');
  if (!res || res.code !== 0) {
    return { ok: false, message: (res && res.msg) || '列出网盘失败', files: [], raw: r.out.slice(-800) };
  }
  const list = (res.data && res.data.file_list) || [];
  // artifact 里有更完整的字段
  let items = list;
  const art = objs.find((o) => o.action === 'browse' && o.type === 'artifact');
  const artPath = art && art.data && art.data.file_path;
  if (artPath) {
    try {
      const txt = fs.readFileSync(artPath, 'utf8');
      const parsed = txt.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
      if (parsed.length) items = parsed;
    } catch (_) {}
  }
  const files = items.map((it) => ({
    fid: it.fid || it.file_id || it.id,
    name: it.file_name || it.filename || it.name || '',
    size: it.size || it.file_size || 0,
    isDir: String(it.file_type) === '0' || it.dir === true || it.is_dir === true,
    updatedAt: normalizeTime(it.updated_at || it.modified_at || it.mtime || it.update_time || ''),
    raw: it,
  }));
  files.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return { ok: true, files: files.filter((f) => !f.isDir && f.fid), raw: null };
}

async function download(file) {
  const dir = path.join(store.TMP_DIR, 'qdl-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const r = await runCli(`download --fid '${file.fid}' --output-dir '${toWsl(dir)}' --overwrite`, {
    cwdWsl: '/tmp/fuyan-quark',
    timeout: 600000,
  });
  const objs = parseResults(r.out);
  const res = objs.find((o) => o.action === 'download' && o.type === 'result') || objs[objs.length - 1];
  const ok = res && res.code === 0;
  if (!ok) throw new Error((res && res.msg) || '下载失败: ' + r.out.slice(-500));
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) {}
  if (!names.length) throw new Error('下载完成但没有文件：' + r.out.slice(-400));
  const filePath = path.join(dir, names[0]);
  return { file: filePath, dir };
}

/* ---------------------------------------------------------------- 发布（作者通道） */

/** 去掉网盘自动加的重名后缀：xxx(1).zip → xxx.zip */
function normBase(name) {
  return String(name || '').replace(/\s*\(\d+\)(?=\.)/, '');
}

async function ensureFolder(parentFid, name) {
  const r = await runCli(`browse --parent-fid ${parentFid} --all`, { cwdWsl: '/tmp/fuyan-quark' });
  const objs = parseResults(r.out);
  const res = objs.find((o) => o.action === 'browse' && o.type === 'result');
  const dirs = ((res && res.data && res.data.file_list) || []).filter(
    (f) => String(f.file_type) === '0' && (f.filename === name || f.file_name === name)
  );
  if (dirs.length) return dirs[0].fid;
  const c = await runCli(`create-folder --dir-path '${name}' --parent-fid ${parentFid}`, { cwdWsl: '/tmp/fuyan-quark' });
  const cObjs = parseResults(c.out);
  const cRes = cObjs.find((o) => o.action === 'create-folder' && o.type === 'result') || cObjs[cObjs.length - 1];
  const fid = cRes && cRes.data && (cRes.data.fid || cRes.data.file_id);
  if (!fid) throw new Error('创建文件夹失败：' + JSON.stringify(cRes || {}).slice(0, 300));
  return fid;
}

async function upload(filePath, fid) {
  const wsl = toWsl(filePath);
  const r = await runCli(`upload '${wsl}' --parent-fid ${fid}`, {
    cwdWsl: '/tmp/fuyan-quark',
    timeout: 900000,
  });
  const objs = parseResults(r.out);
  const res = objs.find((o) => o.action === 'upload' && o.type === 'result');
  if (!res || res.code !== 0) throw new Error((res && res.msg) || '上传失败：' + r.out.slice(-400));
  const names = (res.data && res.data.fileNames) || [];
  return {
    ok: true,
    fileName: names[0] || path.basename(filePath),
    fileNames: names,
    size: (res.data && res.data.totalSize) || fs.statSync(filePath).size,
  };
}

/**
 * 同名顶替：刚上传的那份保留，同名的旧版本全部移进「旧测试」。
 * 网盘重名上传会自动改名成 xxx(1).zip，所以按「去掉 (n) 的基名」判断。
 */
async function archiveOldVersions(parentFid, newName) {
  const r = await list(parentFid);
  if (!r.ok) return { ok: false, moved: [], kept: newName, message: r.message };
  const base = normBase(newName);
  const cands = r.files
    .filter((f) => normBase(f.name) === base)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const keep = cands[0] || null;
  const olds = cands.slice(1);
  if (!olds.length) return { ok: true, moved: [], kept: keep && keep.name, trashFid: '' };
  const trashFid = await ensureFolder(parentFid, '旧测试');
  const moved = [];
  for (const f of olds) {
    const mv = await runCli(`move '${f.fid}' --target-fid '${trashFid}'`, {
      cwdWsl: '/tmp/fuyan-quark',
      timeout: 120000,
    });
    const objs = parseResults(mv.out);
    const res = objs.find((o) => o.action === 'move' && o.type === 'result') || objs[objs.length - 1];
    if (res && res.code === 0) moved.push(f.name);
  }
  return { ok: true, moved, kept: keep && keep.name, trashFid };
}

module.exports = { status, list, download, upload, archiveOldVersions, ensureFolder, normBase, toWsl, runCli };
