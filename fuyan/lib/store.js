/**
 * 复研 · 数据层
 * - 配置、存档注册表、用户学习数据（批注 / 进度）的读写
 * - 全部走「临时文件 + rename」原子写，避免断电/杀进程写坏 JSON
 */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const LEGACY_DIR = path.join(APP_ROOT, 'data');

/** 数据目录放在程序目录之外：换新版本时整个文件夹替换也不会丢批注 / 对话 */
function defaultDataDir() {
  const base = process.env.APPDATA || (process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Roaming') : '');
  if (base) return path.join(base, 'fuyan');
  return path.join(os.homedir(), '.local', 'share', 'fuyan');
}

const DATA_DIR = process.env.FUYAN_DATA || defaultDataDir();

// 老版本数据在 <程序目录>/data：第一次启动时整份搬过去，之后程序目录可以随便覆盖
if (!process.env.FUYAN_DATA && DATA_DIR !== LEGACY_DIR) {
  try {
    const legacyCfg = path.join(LEGACY_DIR, 'config.json');
    const newCfg = path.join(DATA_DIR, 'config.json');
    if (fs.existsSync(legacyCfg) && !fs.existsSync(newCfg)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.cpSync(LEGACY_DIR, DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, '.migrated-from'), LEGACY_DIR + '\n', 'utf8');
      console.log('[store] 已把旧数据迁移到', DATA_DIR);
    }
  } catch (e) {
    console.warn('[store] 迁移旧数据失败（继续用新目录）：', e.message);
  }
}

const ARCHIVE_DIR = path.join(DATA_DIR, 'archives');
const USER_DIR = path.join(DATA_DIR, 'user');
const EXPORT_DIR = path.join(DATA_DIR, 'exports');
const TMP_DIR = path.join(DATA_DIR, 'tmp');

for (const d of [DATA_DIR, ARCHIVE_DIR, USER_DIR, EXPORT_DIR, TMP_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const DEFAULT_CONFIG = {
  schema: 'fuyan/config@1',
  ai: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    apiKey: '',
    temperature: 0.3,
    maxTokens: 1600,
    stream: true,
  },
  ui: { theme: 'auto', fontSize: 1 },
  quark: { enabled: true, transferDir: 'dsh传输', fid: '2f531a19c88c42f1a65179c793b87f81' },
  archives: { catalogUrl: '' },
  update: { repo: '', branch: 'main', path: '', manifestUrl: '' },
};

function nowISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset() / 60;
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}${sign}${pad(Math.abs(off))}:00`;
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function readJSON(file, fallback) {
  try {
    const txt = await fsp.readFile(file, 'utf8');
    return JSON.parse(txt.replace(/^\uFEFF/, ''));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    // 坏文件：备份后返回兜底值，不让整个应用起不来
    try {
      await fsp.rename(file, file + '.broken-' + Date.now());
    } catch (_) {}
    console.warn('[store] 读取失败，已备份坏文件:', file, e.message);
    return fallback;
  }
}

async function writeJSON(file, obj) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 1), 'utf8');
  await fsp.rename(tmp, file);
}

/* ---------------------------------------------------------------- config */
async function getConfig() {
  const file = path.join(DATA_DIR, 'config.json');
  const cur = await readJSON(file, null);
  if (!cur) {
    await writeJSON(file, DEFAULT_CONFIG);
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  return deepMerge(DEFAULT_CONFIG, cur);
}

async function saveConfig(patch) {
  const cur = await getConfig();
  const next = deepMerge(cur, patch || {});
  await writeJSON(path.join(DATA_DIR, 'config.json'), next);
  return next;
}

/* ---------------------------------------------------------------- archives */
function safeId(id) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(id || ''))) throw new Error('非法存档 id');
  return id;
}

function archivePath(id) {
  return path.join(ARCHIVE_DIR, safeId(id));
}

async function listArchives() {
  const out = [];
  let names = [];
  try {
    names = await fsp.readdir(ARCHIVE_DIR);
  } catch (_) {
    return out;
  }
  for (const name of names) {
    const dir = path.join(ARCHIVE_DIR, name);
    let st;
    try {
      st = await fsp.stat(dir);
    } catch (_) {
      continue;
    }
    if (!st.isDirectory()) continue;
    const m = await readJSON(path.join(dir, 'manifest.json'), null);
    if (!m) continue;
    let questions = null;
    try {
      questions = JSON.parse(await fsp.readFile(path.join(dir, 'questions.json'), 'utf8'));
    } catch (_) {}
    out.push({
      id: m.id || name,
      dir,
      title: m.title || name,
      subtitle: m.subtitle || '',
      version: m.version || '0.0.0',
      builtAt: m.builtAt || '',
      accent: m.accent || '#0f766e',
      theme: m.theme || null,
      nav: m.nav || [],
      quiz: m.quiz || { total: questions ? questions.count || (questions.questions || []).length : 0 },
      source: m.source || {},
      counts: {
        naming: (m.nav || []).reduce((s, n) => s + (n.count ? 1 : 0), 0),
        quiz: (m.quiz && m.quiz.total) || (questions ? (questions.questions || []).length : 0),
      },
      hasQuestions: !!(questions && (questions.questions || []).length),
    });
  }
  out.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh'));
  return out;
}

async function getArchive(id) {
  const dir = archivePath(id);
  const manifest = await readJSON(path.join(dir, 'manifest.json'), null);
  if (!manifest) throw new Error('存档不存在：' + id);
  let quiz = { questions: [] };
  try {
    quiz = JSON.parse(await fsp.readFile(path.join(dir, 'questions.json'), 'utf8'));
  } catch (_) {}
  return { dir, manifest, questions: quiz.questions || [] };
}

/* ---------------------------------------------------------------- user data */
function userFile(id, name) {
  return path.join(USER_DIR, safeId(id), name);
}

const EMPTY_NOTES = { schema: 'fuyan/notes@1', archiveId: '', items: [], updatedAt: '' };
const EMPTY_PROGRESS = {
  schema: 'fuyan/progress@1',
  archiveId: '',
  quiz: { records: {}, wrong: {}, fav: {} },
  sessions: {},
  naming: { mastered: {} },
  modules: { mastered: {} },
  read: { anchor: '', scrollY: 0 },
  stats: { seconds: 0 },
  updatedAt: '',
};

async function getNotes(id) {
  const v = await readJSON(userFile(id, 'annotations.json'), null);
  return v ? { ...EMPTY_NOTES, ...v } : { ...EMPTY_NOTES, archiveId: id };
}

async function saveNotes(id, items) {
  const next = {
    schema: 'fuyan/notes@1',
    archiveId: id,
    items: Array.isArray(items) ? items : [],
    updatedAt: nowISO(),
  };
  await writeJSON(userFile(id, 'annotations.json'), next);
  return next;
}

const EMPTY_THREADS = { schema: 'fuyan/ai-threads@1', archiveId: '', items: [], updatedAt: '' };

/** AI 对话记录（选区问答 + 自由追问），和批注分开存，关闭软件也在 */
async function getAiThreads(id) {
  const v = await readJSON(userFile(id, 'ai-threads.json'), null);
  return v ? { ...EMPTY_THREADS, ...v } : { ...EMPTY_THREADS, archiveId: id };
}

async function saveAiThreads(id, items) {
  const next = {
    schema: 'fuyan/ai-threads@1',
    archiveId: id,
    items: (Array.isArray(items) ? items : []).slice(0, 300),
    updatedAt: nowISO(),
  };
  await writeJSON(userFile(id, 'ai-threads.json'), next);
  return next;
}

async function getProgress(id) {
  const v = await readJSON(userFile(id, 'progress.json'), null);
  if (!v) return { ...JSON.parse(JSON.stringify(EMPTY_PROGRESS)), archiveId: id };
  return deepMerge(JSON.parse(JSON.stringify(EMPTY_PROGRESS)), v);
}

async function saveProgress(id, data) {
  const next = deepMerge(await getProgress(id), data || {});
  next.archiveId = id;
  next.updatedAt = nowISO();
  await writeJSON(userFile(id, 'progress.json'), next);
  return next;
}

async function resetProgress(id, what) {
  const cur = await getProgress(id);
  if (!what || what === 'quiz' || what === 'all') {
    cur.quiz = { records: {}, wrong: {}, fav: {} };
    cur.sessions = {};
  }
  if (!what || what === 'all') {
    cur.naming = { mastered: {} };
    cur.modules = { mastered: {} };
    cur.read = { anchor: '', scrollY: 0 };
    cur.stats = { seconds: 0 };
  }
  cur.updatedAt = nowISO();
  await writeJSON(userFile(id, 'progress.json'), cur);
  return cur;
}

module.exports = {
  APP_ROOT,
  DATA_DIR,
  ARCHIVE_DIR,
  USER_DIR,
  EXPORT_DIR,
  TMP_DIR,
  DEFAULT_CONFIG,
  nowISO,
  readJSON,
  writeJSON,
  getConfig,
  saveConfig,
  listArchives,
  getArchive,
  archivePath,
  safeId,
  getNotes,
  saveNotes,
  getAiThreads,
  saveAiThreads,
  getProgress,
  saveProgress,
  resetProgress,
};
