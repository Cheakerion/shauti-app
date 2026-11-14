/* 复研 · 阅读器（同源 iframe + 内容运行时） */
import { state, $, esc, toast, openModal, closeModal, confirmDialog, debounce, fmtDate } from './core.js';
import { api } from './api.js';
import { App } from './app.js';
import { bindDrawer, openDrawer, askWithSelection, closeDrawer, openChat, mergeDuplicateAiNotes } from './ai.js';

let iframe = null;
let currentId = '';
let bubble = null;
let pendingSel = null;
let enteredAt = 0;
let saveTimer = null;
let lastSection = '';

const saveProgressSoon = debounce(() => flushProgress(), 900);

// 外壳切日夜时，把主题同步进存档 iframe（只注册一次）
window.addEventListener('fuyan:theme', () => {
  const fy = state.reader && state.reader.fy;
  if (fy && fy.api && fy.api.setTheme) fy.api.setTheme(document.documentElement.dataset.theme || 'light');
});

/* ---------------------------------------------------------------- 渲染 */
export async function render(params, query) {
  const id = params.id || state.archiveId;
  if (!id) return App.go('#/');
  const { manifest } = await App.loadArchive(id);
  currentId = id;
  await App.loadUserData(id);
  enteredAt = Date.now();
  lastSection = '';
  // 老数据里同一个词查过多次会叠出多条 AI 批注：进存档时合并一次
  await mergeDuplicateAiNotes().catch(() => {});

  App.setCrumbs(`<a href="#/">存档库</a><span class="sep">/</span><b>${esc(manifest.title)}</b><span class="sep">·</span><span>${esc(manifest.subtitle || '')}</span>`);
  document.title = `${manifest.title} · 复研`;

  if (manifest.accent) {
    document.documentElement.style.setProperty('--accent', manifest.accent);
    document.documentElement.style.setProperty('--accent-weak', manifest.accent + '18');
  }

  const sections = (manifest.nav || []).filter((n) => n.sectionId).map((n) => ({ id: n.sectionId, title: n.title }));
  App.renderSide(manifest, '');

  const main = $('#main');
  main.className = 'main';
  main.innerHTML = `<div class="reader">
    <div class="reader-progress"><i id="read-bar"></i></div>
    <iframe id="reader-frame" title="${esc(manifest.title)}" src="/archive/${encodeURIComponent(id)}/content.html" style="opacity:0;visibility:hidden;transition:opacity .1s ease"></iframe>
    <div id="reader-veil" style="position:absolute;inset:0;background:var(--bg);z-index:2"></div>
    <div class="reader-loading" id="reader-loading">正在载入内容…</div>
    <div class="reader-fab">
      <button class="btn primary" id="reader-ai" title="问 DeepSeek（也可以先选中正文）">✦ 问 AI</button>
      <button class="btn" id="reader-top" title="回到顶部">↑</button>
    </div>
  </div>`;

  iframe = $('#reader-frame');
  bindDrawer();
  $('#reader-ai').onclick = () => openChat();
  $('#reader-top').onclick = () => {
    if (state.reader && state.reader.fy) state.reader.fy.api.scrollToY(0);
  };

  const setup = () => {
    const w = iframe.contentWindow;
    const fy = w && w.__fuyan;
    if (!fy || !fy.api) return;
    $('#reader-loading') && $('#reader-loading').remove();
    const total = (manifest.quiz && manifest.quiz.total) || 0;
    const counts = {};
    for (const n of manifest.nav || []) if (n.count && n.anchor) counts[n.anchor] = n.count;

    // 先登记 reader，再回填统计（applyHomeProgress 依赖 state.reader）
    state.reader = {
      id,
      manifest,
      fy,
      goto(sectionId) {
        fy.api.goto(sectionId);
        App.markSideActive(sectionId);
        state.reader.sectionTitle = titleOfSection(manifest, sectionId);
      },
      focusNote(noteId) {
        return fy.api.focusNote(noteId);
      },
      sections,
      sectionTitle: titleOfSection(manifest, lastSection) || (sections[0] ? sections[0].title : ''),
      getIndex: () => fy.api.index(),
    };

    fy.api.setMeta({ quizTotal: total, counts });
    fy.api.setSections(sections);
    fy.api.setProgress(state.progress);
    fy.api.setNotes(cleanNotes(state.notes));
    if (fy.api.setTheme) fy.api.setTheme(document.documentElement.dataset.theme || 'light');
    applyHomeProgress();

    fy.host = {
      onSelection(info) { showBubble(info); },
      onSelectionClear() { hideBubble(); },
      onSectionChange(sid) {
        lastSection = sid;
        App.markSideActive(sid);
        if (state.reader) state.reader.sectionTitle = titleOfSection(manifest, sid);
        state.progress.read = { ...(state.progress.read || {}), anchor: sid };
        saveProgressSoon();
      },
      onScroll({ pct, y }) {
        const bar = $('#read-bar');
        if (bar) bar.style.width = (pct * 100).toFixed(1) + '%';
        state.progress.read = { ...(state.progress.read || {}), scrollY: y, anchor: lastSection };
        hideBubble();
        saveProgressSoon();
      },
      onAnnotationClick(noteId) {
        hideBubble();
        openNoteView(noteId);
      },
      updateProgress(patch) {
        Object.assign(state.progress, patch);
        flushProgress();
      },
    };

    // 记忆阅读位置：先瞬间跳到上次的位置，确认到位了再显示（避免闪一下封面）
    const wantSection = query.get('s');
    const wantNote = query.get('note');
    const read = state.progress.read || {};
    const target = Math.max(0, read.scrollY || 0);
    let tries = 0;
    let shown = false;
    const show = () => {
      if (shown || !iframe) return;
      shown = true;
      const veil = $('#reader-veil');
      if (veil) veil.remove();
      iframe.style.visibility = 'visible';
      iframe.style.opacity = '1';
    };
    const restore = () => {
      if (!iframe) return;
      if (wantSection) {
        fy.api.goto(wantSection);
        requestAnimationFrame(show);
        return;
      }
      fy.api.scrollToY(target);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const y = fy.api.scrollTop ? fy.api.scrollTop() : target;
          if (target > 40 && Math.abs(y - target) > 6 && tries++ < 8) {
            setTimeout(restore, 45);
            return;
          }
          show();
        })
      );
    };
    setTimeout(restore, 40);
    setTimeout(show, 1200); // 兜底：内容异常时也要看得见
    if (wantNote) {
      setTimeout(() => {
        const ok = fy.api.focusNote(wantNote);
        if (ok) openNoteView(wantNote);
        else toast('这条批注的原文位置已失效', 'bad');
      }, 200);
    }
    // 恢复滚动后再校准当前小节（AI 提问要靠它带上上下文）
    setTimeout(() => {
      if (!state.reader) return;
      const cur = fy.api.currentSection ? fy.api.currentSection() : '';
      const t = titleOfSection(manifest, cur);
      if (t) state.reader.sectionTitle = t;
    }, 400);
  };

  iframe.addEventListener('load', () => {
    const w = iframe.contentWindow;
    if (w.__fuyan && w.__fuyan.ready) setup();
    else iframe.contentDocument.addEventListener('fuyan:ready', setup, { once: true });
  });

  // Ctrl+K 之外的站内查找（顶栏搜索）由 search.js 使用 state.reader
}

function titleOfSection(manifest, sid) {
  const n = (manifest.nav || []).find((x) => x.sectionId === sid);
  return n ? n.title : '';
}

function applyHomeProgress() {
  if (!state.reader || !state.reader.fy) return;
  const p = state.progress || {};
  const recs = (p.quiz && p.quiz.records) || {};
  const done = Object.keys(recs).length;
  const ok = Object.values(recs).filter((r) => r.ok).length;
  const total = (state.questions || []).length;
  const txt = done ? `已做 ${done} / ${total} · 正确 ${ok} · 错误 ${done - ok}` : `题库 ${total} 题，点右侧「刷题」开始`;
  state.reader.fy.api.setHomeProgress(txt);
}

/* ---------------------------------------------------------------- 选区气泡 */
function showBubble(info) {
  hideBubble();
  pendingSel = info;
  const rect = iframe.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'selbubble';
  b.innerHTML = `<button data-b="note">✎ 批注</button>
    <button class="ai" data-b="ai">✦ 问 DeepSeek</button>
    <button data-b="find">🔎 站内查</button>`;
  b.style.left = rect.left + info.rect.left + info.rect.width / 2 + 'px';
  b.style.top = rect.top + info.rect.top - 8 + 'px';
  document.body.appendChild(b);
  bubble = b;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.querySelectorAll('[data-b]').forEach((btn) => {
    btn.onclick = async () => {
      const act = btn.dataset.b;
      const sel = pendingSel;
      hideBubble();
      if (!sel) return;
      if (act === 'note') openNoteEditor(sel);
      else if (act === 'ai') {
        const sec = state.reader ? state.reader.sectionTitle : '';
        askWithSelection({ text: sel.text, anchor: sel.anchor }, sec, () => {
          refreshHighlights();
        });
      } else if (act === 'find') {
        const { openSearch } = await import('./search.js');
        openSearch(sel.text);
      }
    };
  });
}

function hideBubble() {
  if (bubble) {
    bubble.remove();
    bubble = null;
  }
}

/* ---------------------------------------------------------------- 批注编辑 / 查看 */
export function cleanNotes(items) {
  return (items || []).map((n) => {
    const { _orphan, _relocated, ...rest } = n;
    return rest;
  });
}

export async function persistNotes() {
  await api.putNotes(currentId || state.archiveId, cleanNotes(state.notes));
  App.updateNoteCount();
  refreshHighlights();
}

export function refreshHighlights() {
  if (state.reader && state.reader.fy) {
    state.reader.fy.api.setNotes(cleanNotes(state.notes));
  }
}

function openNoteEditor(sel) {
  const sectionTitle = state.reader ? state.reader.sectionTitle : '';
  // 同一段文字只留一条批注：已有就改成编辑，不再叠一条
  const existing = (state.notes || []).find(
    (n) => n.kind !== 'ai' && n.anchor && n.anchor.start === sel.anchor.start && n.anchor.end === sel.anchor.end
  );
  openModal(
    `<h3>${existing ? '编辑批注' : '新建批注'}</h3><p class="sub">${esc(sectionTitle || '正文')} · 会一直贴在这段文字上</p>
     <div class="quote">${esc(sel.text)}</div>
     <label class="field"><span>你的批注（可留空，只做标记）</span>
       <textarea id="note-text" rows="5" placeholder="写点什么：考点、易混、老师原话…">${existing ? esc(existing.note || '') : ''}</textarea></label>
     <div class="foot"><button class="btn" data-x="cancel">取消</button>
       <button class="btn primary" data-x="save">保存批注</button></div>`,
    {
      onMount(box) {
        box.querySelector('[data-x=cancel]').onclick = closeModal;
        box.querySelector('[data-x=save]').onclick = async () => {
          const text = box.querySelector('#note-text').value.trim();
          const now = new Date().toISOString();
          if (existing) {
            existing.note = text;
            existing.updatedAt = now;
          } else {
            state.notes.push({
              id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              kind: 'note',
              anchor: { ...sel.anchor },
              quote: sel.text,
              note: text,
              section: sectionTitle,
              createdAt: now,
              updatedAt: now,
            });
          }
          closeModal();
          try {
            await persistNotes();
            toast(existing ? '批注已更新' : '已保存批注', 'ok');
          } catch (e) {
            toast('保存失败：' + e.message, 'bad');
          }
        };
      },
    }
  );
}

export function openNoteView(noteId) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  const isAi = note.kind === 'ai';
  const msgs = (note.ai && note.ai.messages) || [];
  const aiHtml = isAi
    ? msgs.map((m) => m.role === 'user'
        ? `<div class="ai-msg user"><div class="who">你问</div><div class="bubble" style="white-space:pre-wrap">${esc(m.content)}</div></div>`
        : `<div class="ai-msg assistant"><div class="who">DeepSeek</div><div class="bubble" style="white-space:pre-wrap">${esc(m.content)}</div></div>`).join('')
    : '';
  openModal(
    `<h3>${isAi ? 'AI 问答批注' : '我的批注'}</h3>
     <p class="sub">${esc(note.section || '')} · ${fmtDate(note.createdAt)}</p>
     <div class="quote">${esc(note.quote || '')}</div>
     ${isAi ? `<div style="max-height:300px;overflow:auto;padding-right:4px">${aiHtml}</div>` : ''}
     <label class="field" style="margin-top:12px"><span>${isAi ? '补充我的批注' : '批注内容'}</span>
       <textarea id="nv-text" rows="4">${esc(note.note || '')}</textarea></label>
     <div class="foot">
       <button class="btn" data-n="close">关闭</button>
       <button class="btn" data-n="goto">定位</button>
       ${isAi ? '<button class="btn" data-n="reask">继续追问</button>' : ''}
       <button class="btn danger" data-n="del">删除</button>
       <button class="btn primary" data-n="save">保存修改</button>
     </div>`,
    {
      wide: isAi,
      onMount(box) {
        box.querySelector('[data-n=close]').onclick = closeModal;
        box.querySelector('[data-n=goto]').onclick = () => {
          closeModal();
          if (state.reader) state.reader.focusNote(note.id);
        };
        box.querySelector('[data-n=del]').onclick = async () => {
          closeModal();
          await deleteNote(note.id);
        };
        box.querySelector('[data-n=save]').onclick = async () => {
          note.note = box.querySelector('#nv-text').value.trim();
          note.updatedAt = new Date().toISOString();
          closeModal();
          try {
            await persistNotes();
            toast('已更新', 'ok');
          } catch (e) {
            toast(e.message, 'bad');
          }
        };
        const re = box.querySelector('[data-n=reask]');
        if (re) re.onclick = () => {
          closeModal();
          openDrawer({ quote: note.quote, anchor: note.anchor, sectionTitle: note.section || '', title: '继续追问' });
          // 复用已有会话
          import('./ai.js').then((m) => m.ask('（继续上面的问题）'));
        };
      },
    }
  );
}

export async function deleteNote(noteId) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  const ok = await confirmDialog('删除这条批注？', note.quote ? `「${note.quote.slice(0, 60)}」\n删除后无法恢复。` : '删除后无法恢复。', {
    okText: '删除',
    danger: true,
  });
  if (!ok) return;
  state.notes = state.notes.filter((n) => n.id !== noteId);
  try {
    await persistNotes();
    toast('已删除', 'ok');
  } catch (e) {
    toast(e.message, 'bad');
  }
}

/* ---------------------------------------------------------------- 进度 */
async function flushProgress() {
  if (!currentId) return;
  const read = state.progress.read || {};
  try {
    await api.putProgress(currentId, { read });
  } catch (_) {}
}

export function destroy() {
  hideBubble();
  closeDrawer();
  if (currentId) {
    const secs = Math.round((Date.now() - enteredAt) / 1000);
    flushProgress();
    if (secs > 3) {
      api.putProgress(currentId, { stats: { seconds: ((state.progress.stats && state.progress.stats.seconds) || 0) + secs } }).catch(() => {});
    }
  }
  state.reader = null;
  iframe = null;
  currentId = '';
  document.documentElement.style.removeProperty('--accent');
  document.documentElement.style.removeProperty('--accent-weak');
}

export function findInPage(query) {
  if (!state.reader) return false;
  return state.reader.fy.api.selectText(query);
}
