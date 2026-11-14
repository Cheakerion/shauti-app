/* 复研 · 存档库 */
import { state, $, esc, fmtDate, toast, openModal, closeModal, confirmDialog, timeAgo } from './core.js';
import { api } from './api.js';
import { App } from './app.js';

function statLine(m) {
  const parts = [];
  const nav = m.nav || [];
  for (const n of nav) {
    if (n.count) parts.push(`<span><b>${n.count}</b>${esc(n.title)}</span>`);
    if (parts.length >= 3) break;
  }
  if (m.quiz && m.quiz.total) parts.push(`<span><b>${m.quiz.total}</b>题库</span>`);
  return parts.join('') || '<span class="muted">无统计</span>';
}

function sourceLabel(m) {
  const s = m.source || {};
  if (s.kind === 'quark') return `☁ 网盘 · ${esc(s.quarkName || '')}`;
  return `本地导入${s.file ? ' · ' + esc(s.file) : ''}`;
}

function card(m) {
  const upd = state.archiveUpdates && state.archiveUpdates[m.id];
  return `<div class="arc" data-id="${esc(m.id)}" style="--arc-accent:${esc(m.accent || '#0f766e')}">
    <h3>${esc(m.title)}${upd ? ` <span class="tag warn" data-update="${esc(m.id)}" title="网盘上有新版本，点这里拉取">网盘有更新</span>` : ''}</h3>
    <div class="sub">${esc(m.subtitle || '')}${m.version ? ' · v' + esc(m.version) : ''}</div>
    <div class="nums">${statLine(m)}</div>
    <div class="meta">
      <span class="tag plain">${sourceLabel(m)}</span>
      <span>${m.builtAt ? fmtDate(m.builtAt) : ''}</span>
      <div class="acts">
        <button class="btn sm" data-open="${esc(m.id)}">打开</button>
        <button class="btn sm" data-quiz="${esc(m.id)}" ${m.quiz && m.quiz.total ? '' : 'disabled'}>刷题</button>
        <button class="btn sm" data-more="${esc(m.id)}">⋯</button>
      </div>
    </div>
  </div>`;
}

export async function render() {
  const main = document.getElementById('main');
  main.className = 'main scroll';
  App.setCrumbs(`<b>存档库</b>`);
  const archives = state.archives || [];
  main.innerHTML = `<div class="wrap">
    <div class="lib-hero">
      <h1>我的存档</h1>
      <p>一个存档 = 一门课的内容 + 题库。导入后就能阅读、刷题、做批注、问 DeepSeek。</p>
    </div>
    <div class="lib-bar">
      <button class="btn primary" data-import="zip">＋ 导入存档包</button>
      <button class="btn" data-import="url">🔗 从链接导入</button>
      <button class="btn" data-import="quark" title="作者自己的网盘通道，普通用户请用 GitHub / 本地包">☁ 网盘（作者通道）</button>
      <span class="spacer"></span>
      <span class="muted small">共 ${archives.length} 个存档</span>
    </div>
    <div id="online-catalog"></div>
    ${archives.length ? `<div class="lib-grid">${archives.map(card).join('')}</div>`
      : `<div class="lib-empty"><div class="big">还没有存档</div>
         <p>点「导入存档包」选一个 <code>.zip</code>，或从夸克网盘「dsh传输」里拉一份。</p></div>`}
    <p class="muted small" style="margin-top:26px">存档格式 <code>fuyan/archive@1</code>：<code>manifest.json</code> + <code>content.html</code> + <code>questions.json</code>。
      换课程只需要换存档，软件本身不用改。</p>
  </div>`;

  main.querySelectorAll('[data-import]').forEach((b) => {
    b.onclick = () => doImport(b.dataset.import, b);
  });
  bindCards(main);

  // 后台检查网盘来源的存档有没有更新（不阻塞界面）
  checkUpdates();
  loadCatalog();
}

/** 在线存档库（GitHub 上的 archives.json） */
async function loadCatalog() {
  const host = $('#online-catalog');
  if (!host) return;
  try {
    const r = await api.catalog();
    if (!r.configured) return;
    if (!r.ok) {
      host.innerHTML = `<div class="note" style="margin-bottom:16px">${esc(r.message || '在线存档库读取失败')}</div>`;
      return;
    }
    if (!r.items.length) return;
    host.innerHTML = `<h3 style="font-size:16px;margin:20px 0 10px">GitHub 在线存档 <span class="muted small" style="font-weight:400">· 作者发布</span></h3>
      <div class="lib-grid">${r.items.map((it) => {
        const installed = (state.archives || []).some((a) => a.id === it.id);
        return `
        <div class="arc" style="--arc-accent:${esc(it.accent || '#0f766e')}">
          <h3>${esc(it.title || it.id)}${installed ? ' <span class="tag plain">已安装</span>' : ''}</h3>
          <div class="sub">${esc(it.subtitle || '')}${it.version ? ' · v' + esc(it.version) : ''}</div>
          <div class="nums">${it.notes ? `<span>${esc(it.notes)}</span>` : ''}</div>
          <div class="meta">
            <span class="tag plain">${it.size ? Math.round(it.size / 1024) + ' KB' : '在线'}</span>
            <span>${esc(it.updatedAt || '')}</span>
            <div class="acts"><button class="btn sm" data-curl='${esc(JSON.stringify(it.url || ''))}'>${installed ? '重新下载' : '下载导入'}</button></div>
          </div>
        </div>`;
      }).join('')}</div>`;
    host.querySelectorAll('[data-curl]').forEach((b) => {
      b.onclick = async () => {
        const url = JSON.parse(b.dataset.curl);
        if (!url) return toast('这个条目没有下载地址', 'bad');
        b.disabled = true;
        b.textContent = '下载中…';
        try {
          const res = await api.importUrl(url);
          toast(`已导入「${res.manifest.title}」`, 'ok');
          await App.reloadArchives();
          await render();
        } catch (e) {
          b.disabled = false;
          b.textContent = '下载导入';
          toast(e.message, 'bad', 5000);
        }
      };
    });
  } catch (_) {}
}

async function checkUpdates() {
  const quarkArchives = (state.archives || []).filter((a) => (a.source || {}).kind === 'quark');
  if (!quarkArchives.length) return;
  state.archiveUpdates = state.archiveUpdates || {};
  let changed = false;
  for (const a of quarkArchives) {
    try {
      const r = await api.checkArchiveUpdate(a.id);
      if (r && r.supported) {
        state.archiveUpdates[a.id] = r.hasUpdate ? r : null;
        if (r.hasUpdate) changed = true;
      }
    } catch (_) {}
  }
  if (changed) {
    const main = document.getElementById('main');
    if (main && main.querySelector('.lib-grid')) {
      // 只重画卡片，不打断滚动
      const grid = main.querySelector('.lib-grid');
      grid.innerHTML = state.archives.map(card).join('');
      bindCards(grid);
      toast('有存档在网盘上更新了，点卡片上的「网盘有更新」可拉取', '', 4200);
    }
  }
}

async function doImport(kind, btn) {
  if (kind === 'quark') return openQuark();
  if (kind === 'url') return openUrlImport();
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = '等待选择…';
  try {
    const r = await api.pickImport('zip');
    if (r.canceled) return;
    toast(`已导入「${r.manifest.title}」`, 'ok');
    await App.reloadArchives();
    await render();
  } catch (e) {
    toast(e.message, 'bad', 4200);
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function openUrlImport(prefill = '') {
  openModal(
    `<h3>从链接导入</h3>
     <p class="sub">GitHub Releases / 对象存储 / 任何 http(s) 直链，文件需是 <code>.zip</code> 存档包。</p>
     <label class="field"><span>存档包地址</span>
       <input id="url-input" type="text" placeholder="https://github.com/…/传染病学_v1.3.0_infectious.zip" value="${esc(prefill)}">
     </label>
     <div class="foot"><button class="btn" data-u="cancel">取消</button>
       <button class="btn primary" data-u="go">下载并导入</button></div>`,
    {
      onMount(box) {
        const input = box.querySelector('#url-input');
        const go = box.querySelector('[data-u=go]');
        box.querySelector('[data-u=cancel]').onclick = closeModal;
        const run = async () => {
          const url = input.value.trim();
          if (!/^https?:\/\//i.test(url)) return toast('请填写 http(s) 链接', 'bad');
          go.disabled = true;
          go.textContent = '下载中…';
          try {
            const r = await api.importUrl(url);
            toast(`已导入「${r.manifest.title}」`, 'ok');
            closeModal();
            await App.reloadArchives();
            await render();
          } catch (e) {
            go.disabled = false;
            go.textContent = '下载并导入';
            toast(e.message, 'bad', 5000);
          }
        };
        go.onclick = run;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
      },
    }
  );
}

/* ---------------------------------------------------------------- 更多 */
function bindCards(root) {
  root.querySelectorAll('[data-open]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); App.go(`#/read/${b.dataset.open}`); };
  });
  root.querySelectorAll('[data-quiz]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); if (!b.disabled) App.go(`#/quiz/${b.dataset.quiz}`); };
  });
  root.querySelectorAll('[data-more]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); openMore(b.dataset.more); };
  });
  root.querySelectorAll('[data-update]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.update;
      const a = findArchive(id);
      openQuark({ highlight: (a.source || {}).quarkFid, highlightName: (a.source || {}).quarkName, archiveId: id });
    };
  });
  root.querySelectorAll('.arc').forEach((c) => {
    c.onclick = () => App.go(`#/read/${c.dataset.id}`);
  });
}

function findArchive(id) {
  return (state.archives || []).find((a) => a.id === id) || {};
}

function openMore(id) {
  const m = findArchive(id);
  const isQuark = (m.source || {}).kind === 'quark';
  openModal(
    `<h3>${esc(m.title)}</h3><p class="sub">${esc(m.subtitle || '')} · v${esc(m.version || '')}</p>
     <div class="btns" style="display:flex;flex-direction:column;gap:8px">
       <button class="btn" data-a="open">打开阅读</button>
       <button class="btn" data-a="quiz" ${m.quiz && m.quiz.total ? '' : 'disabled'}>开始刷题</button>
       <button class="btn" data-a="notes">批注管理</button>
       <button class="btn" data-a="export">导出存档包（.zip）</button>
       <button class="btn" data-a="publish">发布到网盘（作者通道）</button>
       ${isQuark ? '<button class="btn" data-a="update">检查网盘更新</button>' : ''}
       <button class="btn danger" data-a="delete">删除存档</button>
     </div>`,
    {
      onMount(box) {
        box.querySelector('[data-a=open]').onclick = () => { closeModal(); App.go(`#/read/${id}`); };
        box.querySelector('[data-a=quiz]').onclick = () => { closeModal(); App.go(`#/quiz/${id}`); };
        box.querySelector('[data-a=notes]').onclick = () => { closeModal(); App.go(`#/notes/${id}`); };
        box.querySelector('[data-a=export]').onclick = async () => {
          const b = box.querySelector('[data-a=export]');
          b.disabled = true; b.textContent = '正在打包…';
          try {
            const r = await api.exportArchive(id);
            b.textContent = '已导出';
            toast('已导出：' + r.zip, 'ok', 4000);
            api.reveal(r.zip).catch(() => {});
          } catch (e) {
            b.disabled = false; b.textContent = '导出存档包（.zip）';
            toast(e.message, 'bad');
          }
        };
        box.querySelector('[data-a=delete]').onclick = async () => {
          closeModal();
          const ok = await confirmDialog('删除存档？', `「${m.title}」的内容与题库会被删除；你的批注与做题记录会保留在数据目录里。`, { okText: '删除', danger: true });
          if (!ok) return;
          try {
            await api.deleteArchive(id);
            toast('已删除', 'ok');
            await App.reloadArchives();
            await render();
          } catch (e) { toast(e.message, 'bad'); }
        };
        box.querySelector('[data-a=publish]').onclick = async () => {
          const b = box.querySelector('[data-a=publish]');
          b.disabled = true;
          b.textContent = '正在导出并上传…';
          try {
            const r = await api.publishArchive(id);
            const extra = r.moved && r.moved.length ? `，旧版本 ${r.moved.length} 个已移入「旧测试」` : '';
            b.textContent = '已发布';
            toast(`已发布 ${r.file}${extra}`, 'ok', 5600);
            if (r.error) toast('旧版本清理失败：' + r.error, 'bad', 5000);
          } catch (e) {
            b.disabled = false;
            b.textContent = '发布到网盘（作者通道）';
            toast(e.message, 'bad', 5000);
          }
        };
        const ub = box.querySelector('[data-a=update]');
        if (ub) ub.onclick = async () => {
          ub.disabled = true; ub.textContent = '正在比对…';
          try {
            const r = await api.checkArchiveUpdate(id);
            ub.disabled = false; ub.textContent = '检查网盘更新';
            if (!r.ok) return toast(r.message || '检查失败', 'bad', 4000);
            if (r.hasUpdate) {
              closeModal();
              openQuark({ highlight: (m.source || {}).quarkFid });
              toast('网盘上有新版本，重新导入即可更新（阅读记录与批注会保留）', '', 4500);
            } else {
              toast(r.message || '已是最新', 'ok');
            }
          } catch (e) { ub.disabled = false; ub.textContent = '检查网盘更新'; toast(e.message, 'bad'); }
        };
      },
    }
  );
}

/* ---------------------------------------------------------------- 网盘 */
export async function openQuark(opts = {}) {
  openModal(
    `<h3>夸克网盘 · 作者通道</h3><p class="sub">这里是你自己账号的网盘传输目录，用来发布/取回存档；普通用户请用「从链接导入」或 GitHub 在线存档。<br>同名存档会被新版本替换，批注与做题记录保留。</p>
     <div id="qk-body"><div class="muted small">正在连接夸克网盘…</div></div>
     <div class="foot"><button class="btn" data-q="close">关闭</button><button class="btn" data-q="refresh">刷新列表</button></div>`,
    {
      async onMount(box) {
        const body = box.querySelector('#qk-body');
        box.querySelector('[data-q=close]').onclick = closeModal;
        const load = async () => {
          body.innerHTML = '<div class="muted small">正在连接夸克网盘…</div>';
          try {
            const st = await api.quarkStatus();
            if (!st.status.ok) {
              body.innerHTML = `<div class="note">网盘不可用：${esc(st.status.message)}<br>
                可以改用「导入存档包（.zip）」走本地导入。</div>`;
              return;
            }
            const r = await api.quarkList();
            if (!r.ok) {
              body.innerHTML = `<div class="note">${esc(r.message || '列出失败')}</div>`;
              return;
            }
            if (!r.files.length) {
              body.innerHTML = `<div class="note">「${esc(r.transferDir || 'dsh传输')}」里还没有文件。<br>
                把存档 .zip 传到网盘这个目录，再点「刷新列表」。</div>`;
              return;
            }
            const files = [...r.files].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
            const installed = new Set((state.archives || []).map((a) => a.id));
            body.innerHTML = `<div class="qk-list">${files.map((f, i) => {
              const tags = [];
              if (i === 0) tags.push('<span class="tag ok">推荐</span>');
              const hit = String(f.name).match(/_([A-Za-z0-9._-]+)\.(zip|fuyan)$/);
              if (hit && installed.has(hit[1])) tags.push('<span class="tag plain">已安装</span>');
              const isNew = (opts.highlight && opts.highlight === f.fid) || (opts.highlightName && opts.highlightName === f.name);
              if (isNew) tags.push('<span class="tag warn">网盘上的新版本</span>');
              return `
              <div class="kv" style="align-items:center;gap:12px;${i === 0 ? 'background:color-mix(in srgb,var(--accent) 6%,transparent);border-radius:8px' : ''}">
                <span style="flex:1;min-width:0">
                  <b style="color:var(--ink);font-weight:600;display:flex;gap:6px;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    <span style="overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</span>${tags.join('')}</b>
                  <small class="muted">${(f.size / 1024).toFixed(0)} KB · ${esc(fmtDate(f.updatedAt) || '')}</small>
                </span>
                <button class="btn sm ${i === 0 ? 'primary' : ''}" data-pull='${esc(JSON.stringify({ fid: f.fid, name: f.name, size: f.size, updatedAt: f.updatedAt }))}'>导入</button>
              </div>`;
            }).join('')}</div>`;
            body.querySelectorAll('[data-pull]').forEach((b) => {
              b.onclick = async () => {
                const info = JSON.parse(b.dataset.pull);
                b.disabled = true; b.textContent = '下载中…';
                try {
                  const res = await api.quarkPull(info);
                  toast(`已导入「${res.manifest.title}」v${res.manifest.version}`, 'ok', 3600);
                  closeModal();
                  await App.reloadArchives();
                  await render();
                } catch (e) {
                  b.disabled = false; b.textContent = '导入';
                  toast(e.message, 'bad', 5000);
                }
              };
            });
          } catch (e) {
            body.innerHTML = `<div class="note">${esc(e.message)}</div>`;
          }
        };
        box.querySelector('[data-q=refresh]').onclick = load;
        load();
      },
      wide: true,
    }
  );
}

export function destroy() {}
