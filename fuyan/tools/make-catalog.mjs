/**
 * 生成「在线存档库」清单 archives.json + 可直接上传 GitHub Release 的 zip。
 *
 * 用法：
 *   node tools/make-catalog.mjs --base https://github.com/<owner>/<repo>/releases/download/v0.1.0
 *   node tools/make-catalog.mjs --base https://raw.githubusercontent.com/<owner>/<repo>/main/archives --out dist
 *
 * 产物：
 *   dist/<id>-<version>.zip      ← 传到 GitHub Release（或仓库）的资产
 *   dist/archives.json           ← 清单；把它的 raw 地址填进「设置 → 在线存档库」
 *
 * 注意：--base 是「资产所在的目录 URL」，脚本会用 `<base>/<id>-<version>.zip` 拼下载地址。
 *       需要本机服务已经在跑（脚本通过本地 API 导出 zip，保证和软件里的导出逻辑一致）。
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const BASE_RAW = (arg('base', '') || '').replace(/\/+$/, '');
const REPO = arg('repo', '');
const BASE = BASE_RAW || (REPO ? `https://cdn.jsdelivr.net/gh/${REPO}@main/dist` : '');
const OUT = path.resolve(arg('out', 'dist'));
const API = arg('api', 'http://127.0.0.1:5279');

if (!BASE) {
  console.error('缺少 --repo 或 --base，例如：');
  console.error('  node tools/make-catalog.mjs --repo makainuo/fuyan');
  console.error('  node tools/make-catalog.mjs --base https://github.com/you/repo/releases/download/v0.1.0');
  process.exit(1);
}

async function json(url, opt) {
  const res = await fetch(url, opt);
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { archives } = await json(API + '/api/archives');
  if (!archives.length) throw new Error('本地没有存档，先导入 / 生成存档');

  const items = [];
  for (const a of archives) {
    const { manifest } = await json(API + `/api/archives/${encodeURIComponent(a.id)}`);
    const exp = await json(API + `/api/archives/${encodeURIComponent(a.id)}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const assetName = `${a.id}-${manifest.version}.zip`;
    const dest = path.join(OUT, assetName);
    fs.copyFileSync(exp.zip, dest);
    const size = fs.statSync(dest).size;

    const navCounts = {};
    for (const n of manifest.nav || []) if (n.count) navCounts[n.anchor] = n.count;
    const bits = [];
    if (navCounts.naming) bits.push(`${navCounts.naming} 名解`);
    if (navCounts.qa || navCounts.shorts) bits.push(`${navCounts.qa || navCounts.shorts} 简答`);
    if (navCounts.case || navCounts.cases) bits.push(`${navCounts.case || navCounts.cases} 病例`);
    if (manifest.quiz && manifest.quiz.total) bits.push(`${manifest.quiz.total} 题`);

    items.push({
      id: a.id,
      title: manifest.title,
      subtitle: manifest.subtitle || '',
      version: manifest.version,
      accent: manifest.accent || '#0f766e',
      notes: bits.join(' · '),
      size,
      updatedAt: (manifest.builtAt || '').slice(0, 10),
      url: `${BASE}/${encodeURIComponent(assetName)}`,
    });
    console.log(`[ok] ${assetName}  ${(size / 1024).toFixed(0)} KB`);
  }

  const catalog = {
    schema: 'fuyan/catalog@1',
    updatedAt: new Date().toISOString().slice(0, 10),
    archives: items,
  };
  fs.writeFileSync(path.join(OUT, 'archives.json'), JSON.stringify(catalog, null, 1), 'utf8');
  console.log('\n清单已生成：' + path.join(OUT, 'archives.json'));
  console.log('把 dist/*.zip 传到 GitHub Release，把 archives.json 的 raw 地址填进「设置 → 在线存档库」。');
}

main().catch((e) => {
  console.error('失败：', e.message);
  process.exit(1);
});
