/**
 * 夸克网盘：把「dsh传输」根目录下的旧存档包移进「旧测试」子目录。
 * 官方 CLI 没有删除命令（只有 upload/move/create-folder/rename），
 * 所以用「移入子目录」清理列表；子目录可以在夸克 App 里手动删。
 *
 * 用法：node tools/quark-cleanup.mjs [--dry]
 */
import quark from '../lib/quark.js';
import store from '../lib/store.js';

const dry = process.argv.includes('--dry');
const ROOT = '2f531a19c88c42f1a65179c793b87f81';
const TRASH = '旧测试';

function parseResults(out) {
  const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
  const objs = [];
  for (const l of lines) {
    try { objs.push(JSON.parse(l)); } catch (_) {}
  }
  return objs;
}

async function ensureFolder() {
  // 先看根目录里有没有同名文件夹
  const r = await quark.runCli(`browse --parent-fid ${ROOT} --all`, { cwdWsl: '/tmp/fuyan-quark' });
  const objs = parseResults(r.out);
  const res = objs.find((o) => o.action === 'browse' && o.type === 'result');
  const dirs = ((res && res.data && res.data.file_list) || []).filter(
    (f) => String(f.file_type) === '0' && (f.filename === TRASH || f.file_name === TRASH)
  );
  if (dirs.length) return dirs[0].fid;
  const c = await quark.runCli(`create-folder --dir-path '${TRASH}' --parent-fid ${ROOT}`, { cwdWsl: '/tmp/fuyan-quark' });
  const cObjs = parseResults(c.out);
  const cRes = cObjs.find((o) => o.action === 'create-folder' && o.type === 'result') || cObjs[cObjs.length - 1];
  const fid = cRes && cRes.data && (cRes.data.fid || cRes.data.file_id);
  if (!fid) throw new Error('创建文件夹失败：' + JSON.stringify(cRes).slice(0, 300));
  return fid;
}

async function main() {
  const list = await quark.list(ROOT);
  if (!list.ok) throw new Error(list.message || '列目录失败');
  const files = list.files;
  console.log('当前 dsh传输 根目录文件：');
  for (const f of files) console.log(`  - ${f.name}  ${(f.size / 1024).toFixed(0)} KB  ${f.updatedAt}`);
  if (!files.length) return console.log('没有文件，无需清理');
  if (dry) return console.log('[dry] 不执行');

  const trashFid = await ensureFolder();
  console.log('子目录「' + TRASH + '」fid =', trashFid);

  // 逐个移动，fid 里含 | 与 ~，必须单引号包起来
  for (const f of files) {
    const r = await quark.runCli(`move '${f.fid}' --target-fid '${trashFid}'`, { cwdWsl: '/tmp/fuyan-quark' });
    const objs = parseResults(r.out);
    const res = objs.find((o) => o.action === 'move' && o.type === 'result') || objs[objs.length - 1];
    const ok = res && res.code === 0;
    console.log(`${ok ? '已移动' : '移动失败'}  ${f.name}${ok ? '' : '  ' + (res && res.msg)}`);
    if (!ok) console.log('   ', (r.out || '').slice(-300));
  }

  const after = await quark.list(ROOT);
  console.log('\n清理后根目录：', after.files.length ? after.files.map((f) => f.name).join(' | ') : '（空）');
}

main().catch((e) => {
  console.error('失败：', e.message);
  process.exit(1);
});
