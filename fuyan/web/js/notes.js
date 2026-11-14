/* 复研 · 批注管理（另一处删除入口） */
import { state, $, esc, toast, openModal, closeModal, confirmDialog, fmtDate, timeAgo } from './core.js';
import { api } from './api.js';
import { App } from './app.js';
import { refreshHighlights, openNoteView } from './reader.js';

let filter = 'all';
let keyword = '';

export async function render(params) {
  const id = params.id || state.archiveId;
  if (!id) return App.go('#/');
  const { manifest } = await App.loadArchive(id);
  await App.loadUserData(id);
  App.setCrumbs(`<a href="#/">存档库</a><span class="sep">/</span><a href="#/read/${esc(id)}">${esc(manifest.title)}</a><span class="sep">/</span><b>批注</b>`);
  App.renderSide(manifest, '');
  document.title = `批注 · ${manifest.title} · 复研`;

  const main = $('#main');
  main.className = 'main scroll';
  main.innerHTML = `<div class="wrap">
    <div class="lib-hero" style="padding-bottom:6px">
      <h1>批注 · ${esc(manifest.title)}</h1>
      <p>正文里选中文字就能加批注或问 DeepSeek；批注始终贴在原文位置。这里可以统一查看、定位、删除。</p>
    </div>
    <div class="notes-head">
      <div class="chips" id="n-filter">
        <button class="chip on" data-f="all">全部 <span class="muted" id="c-all"></span></button>
        <button class="chip" data-f="note">我的批注 <span class="muted" id="c-note"></span></button>
        <button class="chip" data-f="ai">AI 问答 <span class="muted" id="c-ai"></span></button>
        <button class="chip" data-f="orphan">失效 <span class="muted" id="c-orphan"></span></button>
      </div>
      <span class="spacer"></span>
      <input id="n-search" type="text" placeholder="搜批注内容 / 原文…" style="width:260px">
      <button class="btn primary" data-go="read">✎ 去正文里加批注</button>
    </div>
    <div id="n-list"></div>
  </div>`;

  main.querySelector('[data-go=read]').onclick = () => App.go(`#/read/${id}`);
  main.querySelectorAll('#n-filter .chip').forEach((b) => {
    b.onclick = () => {
      filter = b.dataset.f;
      main.querySelectorAll('#n-filter .chip').forEach((x) => x.classList.toggle('on', x === b));
      drawList(id);
    };
  });
  const inp = main.querySelector('#n-search');
  inp.value = keyword;
  inp.oninput = () => { keyword = inp.value; drawList(id); };
  drawList(id);
}

function counts() {
  const all = state.notes || [];
  return {
    all: all.length,
    note: all.filter((n) => n.kind !== 'ai').length,
    ai: all.filter((n) => n.kind === 'ai').length,
    orphan: all.filter((n) => n._orphan).length,
  };
}

function drawList(id) {
  const box = $('#n-list');
  if (!box) return;
  const c = counts();
  $('#c-all').textContent = `(${c.all})`;
  $('#c-note').textContent = `(${c.note})`;
  $('#c-ai').textContent = `(${c.ai})`;
  $('#c-orphan').textContent = `(${c.orphan})`;

  const kw = keyword.trim().toLowerCase();
  let list = [...(state.notes || [])].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (filter === 'note') list = list.filter((n) => n.kind !== 'ai');
  if (filter === 'ai') list = list.filter((n) => n.kind === 'ai');
  if (filter === 'orphan') list = list.filter((n) => n._orphan);
  if (kw) {
    list = list.filter((n) =>
      (n.quote || '').toLowerCase().includes(kw) ||
      (n.note || '').toLowerCase().includes(kw) ||
      JSON.stringify(n.ai || {}).toLowerCase().includes(kw)
    );
  }
  if (!list.length) {
    box.innerHTML = `<div class="lib-empty"><div class="big">${kw ? '没有匹配的批注' : '还没有批注'}</div>
      <p>在阅读正文时用鼠标选中一段文字，会出现「批注 / 问 DeepSeek」。</p></div>`;
    return;
  }
  box.innerHTML = list.map((n) => {
    const ai = n.ai && n.ai.messages ? n.ai.messages : [];
    const aiPreview = ai.length
      ? ai.map((m) => `<div style="margin-top:6px"><b class="muted small">${m.role === 'user' ? '问' : '答'}</b> ${esc(String(m.content).slice(0, 300))}${String(m.content).length > 300 ? '…' : ''}</div>`).join('')
      : '';
    return `<div class="note-item ${n.kind === 'ai' ? 'ai' : ''} ${n._orphan ? 'orphan' : ''}" data-id="${esc(n.id)}">
      <div class="bar"></div>
      <div class="body">
        <div class="quote">${esc((n.quote || '').slice(0, 220))}${(n.quote || '').length > 220 ? '…' : ''}</div>
        ${n.note ? `<div class="content">${esc(n.note)}</div>` : ''}
        ${aiPreview ? `<div class="content">${aiPreview}</div>` : ''}
        <div class="foot">
          <span class="tag ${n.kind === 'ai' ? 'warn' : ''}">${n.kind === 'ai' ? 'AI 问答' : '我的批注'}</span>
          ${n._orphan ? '<span class="tag bad">原文已变，位置失效</span>' : ''}
          <span>${timeAgo(n.updatedAt || n.createdAt)}</span>
          <div class="acts">
            <button class="btn sm" data-act="goto">定位</button>
            <button class="btn sm" data-act="edit">编辑</button>
            <button class="btn sm danger" data-act="del">删除</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('.note-item').forEach((el) => {
    const nid = el.dataset.id;
    el.querySelector('[data-act=goto]').onclick = () => App.go(`#/read/${id}?note=${encodeURIComponent(nid)}`);
    el.querySelector('[data-act=edit]').onclick = () => openNoteView(nid);
    el.querySelector('[data-act=del]').onclick = async () => {
      const ok = await confirmDialog('删除这条批注？', '删除后无法恢复。正文里的高亮也会一起消失。', { okText: '删除', danger: true });
      if (!ok) return;
      state.notes = state.notes.filter((n) => n.id !== nid);
      try {
        await api.putNotes(id, state.notes.map(stripInternal));
        App.updateNoteCount();
        refreshHighlights();
        toast('已删除', 'ok');
        drawList(id);
      } catch (e) {
        toast(e.message, 'bad');
      }
    };
  });
}

function stripInternal(n) {
  const { _orphan, _relocated, ...rest } = n;
  return rest;
}

export function destroy() {}
