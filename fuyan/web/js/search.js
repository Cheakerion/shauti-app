/* 复研 · 全站搜索（Ctrl+K） */
import { state, $, $$, esc, markHits, openModal, closeModal } from './core.js';
import { App } from './app.js';
import { openNoteView } from './reader.js';

let items = [];
let results = [];
let cur = 0;
let builtFor = '';
let timer = 0;

function buildIndex() {
  const id = state.archiveId;
  if (builtFor === id && items.length) return items;
  builtFor = id;
  items = [];
  const idx = state.reader && state.reader.getIndex ? state.reader.getIndex() : [];
  for (const it of idx) items.push(it);
  for (const n of state.notes || []) {
    items.push({
      kind: 'note',
      id: n.id,
      title: (n.note || (n.ai && n.ai.messages && n.ai.messages[0] && n.ai.messages[0].content) || n.quote || '').slice(0, 60),
      text: [n.quote, n.note, n.ai ? JSON.stringify(n.ai.messages || []) : ''].join(' '),
    });
  }
  for (const q of state.questions || []) {
    items.push({
      kind: 'question',
      id: q.id,
      qid: q.id,
      title: (q.stem || '').slice(0, 70),
      text: [q.stem, q.stemEn, (q.options || []).map((o) => o.zh + ' ' + (o.en || '')).join(' '), q.explain, q.topic, (q.tags || []).join(' ')].join(' '),
      q,
    });
  }
  return items;
}

function terms(q) {
  return q.split(/\s+/).filter(Boolean);
}

function score(it, ts) {
  const title = (it.title || '').toLowerCase();
  const text = (it.text || '').toLowerCase();
  let s = 0;
  let allHit = true;
  for (const t0 of ts) {
    const t = t0.toLowerCase();
    let hit = 0;
    if (title.includes(t)) { s += 14; hit++; }
    let i = -1;
    let n = 0;
    while ((i = text.indexOf(t, i + 1)) >= 0) {
      n++;
      hit++;
      if (n >= 8) break;
    }
    s += n;
    if (!hit) allHit = false;
  }
  if (ts.length > 1 && allHit) s += 8;
  return s;
}

function search(q) {
  const ts = terms(q.trim());
  if (!ts.length) {
    results = items.filter((x) => x.kind === 'section').slice(0, 12);
    return;
  }
  results = items
    .map((it) => ({ it, s: score(it, ts) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 40)
    .map((x) => x.it);
}

const ICON = { section: '📖', heading: '§', note: '✎', question: '▤' };
const KIND = { section: '章节', heading: '小节', note: '批注', question: '题目' };

function draw(q) {
  const list = $('#cmdk-list');
  const ts = terms(q.trim());
  cur = Math.min(cur, Math.max(0, results.length - 1));
  if (!results.length) {
    list.innerHTML = `<div class="empty" style="padding:30px">没有找到「${esc(q)}」</div>`;
  } else {
    list.innerHTML = results.map((it, i) => `<div class="cmdk-item ${i === cur ? 'cur' : ''}" data-i="${i}">
      <span class="ic">${ICON[it.kind] || '·'}</span>
      <span class="t"><b>${esc(it.title || '')}</b>
        <span>${KIND[it.kind] || ''} · ${markHits(it.text || '', ts, 90)}</span></span>
    </div>`).join('');
  }
  $('#cmdk-stat').textContent = q.trim() ? `${results.length} 条结果` : `共 ${items.length} 条索引`;
  list.querySelectorAll('.cmdk-item').forEach((el) => {
    el.onclick = () => pick(Number(el.dataset.i));
  });
}

function pick(i) {
  const it = results[i];
  if (!it) return;
  closeSearch();
  if (it.kind === 'question') return showQuestion(it.q);
  if (it.kind === 'note') return openNoteView(it.id);
  if (state.reader) {
    if (it.kind === 'heading' && it.id) state.reader.fy.api.gotoElement(it.id);
    else state.reader.goto(it.sectionId || it.id);
  } else {
    App.go(`#/read/${state.archiveId}?s=${encodeURIComponent(it.sectionId || it.id)}`);
  }
}

function showQuestion(q) {
  if (!q) return;
  const letters = (q.answer || []).map((i) => String.fromCharCode(65 + i)).join('');
  openModal(
    `<h3>题目预览</h3><p class="sub">${esc(q.topic || '')} · ${(q.tags || []).join(' / ')}</p>
     <div class="quote" style="border-left-color:var(--accent)">${esc(q.stem)}</div>
     ${(q.options || []).map((o, i) => `<div style="padding:4px 0;font-family:var(--serif)">${String.fromCharCode(65 + i)}. ${esc(o.zh)}${(q.answer || []).includes(i) ? ' <span class="tag ok">答案</span>' : ''}</div>`).join('')}
     <p class="small" style="margin-top:10px"><b>答案：</b>${esc(letters)}</p>
     ${q.explain ? `<div class="explain"><div class="h">解析</div>${esc(q.explain)}</div>` : ''}
     <div class="foot"><button class="btn" data-q="close">关闭</button></div>`,
    {
      wide: true,
      onMount(box) {
        box.querySelector('[data-q=close]').onclick = closeModal;
      },
    }
  );
}

export function openSearch(initial = '') {
  const cmdk = $('#cmdk');
  cmdk.hidden = false;
  buildIndex();
  const input = $('#cmdk-input');
  input.value = initial;
  cur = 0;
  search(initial);
  draw(initial);
  input.focus();
  input.select();
  input.oninput = () => {
    clearTimeout(timer);
    const v = input.value;
    timer = setTimeout(() => {
      cur = 0;
      search(v);
      draw(v);
    }, 90);
  };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(results.length - 1, cur + 1); draw(input.value); scrollCur(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); draw(input.value); scrollCur(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(cur); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  };
  cmdk.onclick = (e) => {
    if (e.target === cmdk) closeSearch();
  };
}

function scrollCur() {
  const el = $('.cmdk-item.cur');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

export function closeSearch() {
  $('#cmdk').hidden = true;
}

export function destroy() {}
