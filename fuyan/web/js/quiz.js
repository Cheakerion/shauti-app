/* 复研 · 刷题引擎
   语义对齐好友的 shauti-app（Kotlin 版）：
   顺序/随机 · 快速/正常/背题 · 全部/未做/做错/已做/收藏 · 题号面板 · 会话断点续刷
   错题 = 曾经错过就一直在（做对不移除） · 重做做错保留记录只重置进度 · 完成页 */
import { state, $, $$, esc, toast, openModal, closeModal, confirmDialog, debounce, fmtTime } from './core.js';
import { api } from './api.js';
import { App } from './app.js';

const TYPES = {
  choice: { label: '选择题', match: (q) => q.type === 'single' || q.type === 'multi' },
  truefalse: { label: '判断题', match: (q) => q.type === 'truefalse' },
  fill: { label: '填空题', match: (q) => q.type === 'fill' },
  text: { label: '名解 / 简答', match: (q) => q.type === 'explain' || q.type === 'short' },
};
const QTYPE_LABEL = { single: '单选', multi: '多选', truefalse: '判断', fill: '填空', explain: '名词解释', short: '简答' };
const MODE_LABEL = { seq: '顺序', random: '随机' };
const PLAY_LABEL = { quick: '快速', normal: '正常', study: '背题' };
const FILTER_LABEL = { all: '全部', undone: '未做', wrong: '做错', done: '已做', fav: '收藏' };

let S = null;          // 当前会话
let archiveId = '';
let manifest = null;
let questions = [];
let progress = null;
let destroyed = false;
let startTs = 0;
let tickTimer = null;

const saveSoon = debounce(() => saveSession(), 500);

/* ---------------------------------------------------------------- 数据 */
function poolFor(type) {
  return questions.filter(TYPES[type].match);
}

function applyFilter(list, filter) {
  const recs = (progress.quiz && progress.quiz.records) || {};
  const wrong = (progress.quiz && progress.quiz.wrong) || {};
  const fav = (progress.quiz && progress.quiz.fav) || {};
  switch (filter) {
    case 'undone': return list.filter((q) => !recs[q.id]);
    case 'wrong': return list.filter((q) => wrong[q.id]);
    case 'done': return list.filter((q) => recs[q.id]);
    case 'fav': return list.filter((q) => fav[q.id]);
    default: return list;
  }
}

function buildOrder() {
  let list = poolFor(S.type);
  if (S.topic) list = list.filter((q) => q.topic === S.topic);
  if (S.tag) list = list.filter((q) => (q.tags || []).includes(S.tag));
  list = applyFilter(list, S.filter);
  const ids = list.map((q) => q.id);
  if (S.mode === 'random') {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  return ids;
}

function qById(id) {
  return questions.find((q) => q.id === id);
}

function records() {
  progress.quiz = progress.quiz || { records: {}, wrong: {}, fav: {} };
  progress.quiz.records = progress.quiz.records || {};
  progress.quiz.wrong = progress.quiz.wrong || {};
  progress.quiz.fav = progress.quiz.fav || {};
  return progress.quiz;
}

async function saveSession() {
  if (!S || destroyed) return;
  progress.sessions = progress.sessions || {};
  progress.sessions[S.type] = S;
  try {
    await api.putProgress(archiveId, { sessions: progress.sessions, quiz: progress.quiz });
  } catch (_) {}
}

async function persistSessions() {
  try {
    await api.putProgress(archiveId, { sessions: progress.sessions || {}, quiz: progress.quiz });
  } catch (_) {}
}

/* ---------------------------------------------------------------- 渲染 */
export async function render(params) {
  archiveId = params.id || state.archiveId;
  const a = await App.loadArchive(archiveId);
  manifest = a.manifest;
  questions = a.questions || [];
  const p = await api.getProgress(archiveId);
  progress = p.progress;
  state.progress = progress;
  destroyed = false;

  App.setCrumbs(`<a href="#/">存档库</a><span class="sep">/</span><a href="#/read/${esc(archiveId)}">${esc(manifest.title)}</a><span class="sep">/</span><b>刷题</b>`);
  document.title = `刷题 · ${manifest.title} · 复研`;
  App.renderSide(manifest, '');
  $('#side').hidden = true;

  const types = Object.keys(TYPES).filter((t) => poolFor(t).length);
  if (!types.length) {
    $('#main').innerHTML = `<div class="wrap"><div class="empty"><div class="big">这个存档没有题库</div></div></div>`;
    return;
  }
  // 优先沿用上次的题型
  const savedTypes = Object.keys(progress.sessions || {});
  let type = savedTypes.find((t) => types.includes(t)) || types[0];
  S = (progress.sessions && progress.sessions[type]) || null;
  if (S) S.type = type;

  const main = $('#main');
  main.className = 'main';
  main.innerHTML = shellHtml(types);
  bindShell();
  if (S && S.order && S.order.length) {
    if (S.done) renderDone();
    else renderQuestion();
  } else {
    renderStart(types, type);
  }
  window.addEventListener('keydown', onKey);
  tickTimer = setInterval(() => {
    const t = $('#quiz-clock');
    if (t && startTs && S && !S.done) t.textContent = fmtTime((Date.now() - startTs) / 1000);
  }, 1000);
}

function shellHtml(types) {
  const t = S ? S.type : types[0];
  const counts = Object.fromEntries(types.map((x) => [x, poolFor(x).length]));
  return `<div class="quiz">
    <div class="quiz-top">
      <span class="title">刷题</span>
      <div class="chips" id="q-types">${types.map((x) => `<button class="chip ${S && S.type === x ? 'on' : ''}" data-type="${x}">${TYPES[x].label} <span class="muted">${counts[x]}</span></button>`).join('')}</div>
      <span class="spacer"></span>
      <div class="progress"><i id="q-bar"></i></div>
      <button class="btn sm" id="q-panel">题号</button>
      <button class="btn sm" id="q-reset">重设</button>
      <button class="btn sm" id="q-wrong">重做做错</button>
      <button class="btn sm danger" id="q-clear">清除</button>
    </div>
    <div class="quiz-body" id="quiz-body"></div>
    <div class="qnav" id="quiz-nav" hidden>
      <button class="btn" id="q-prev">← 上一题</button>
      <span class="muted small" id="q-clock">0 秒</span>
      <button class="btn primary" id="q-next">下一题 →</button>
    </div>
  </div>`;
}

function bindShell() {
  $$('#q-types .chip').forEach((b) => {
    b.onclick = () => {
      const type = b.dataset.type;
      $$('#q-types .chip').forEach((x) => x.classList.toggle('on', x === b));
      S = (progress.sessions && progress.sessions[type]) || null;
      if (S) S.type = type;
      const types = Object.keys(TYPES).filter((t) => poolFor(t).length);
      if (S && S.order && S.order.length) {
        startTs = Date.now();
        if (S.done) renderDone();
        else renderQuestion();
      } else {
        renderStart(types, type);
      }
    };
  });
  $('#q-panel').onclick = () => {
    if (!S || !S.order.length) return toast('还没开始刷题', 'bad');
    openPanel();
  };
  $('#q-reset').onclick = async () => {
    if (!S) return renderStart(Object.keys(TYPES).filter((t) => poolFor(t).length), Object.keys(TYPES).filter((t) => poolFor(t).length)[0]);
    const ok = await confirmDialog('重设这一轮？', '会清掉当前进度（答题记录保留），回到开始页重新选范围和模式。', { okText: '重设' });
    if (!ok) return;
    delete progress.sessions[S.type];
    S = null;
    await persistSessions();
    const types = Object.keys(TYPES).filter((t) => poolFor(t).length);
    renderStart(types, types[0]);
  };
  $('#q-wrong').onclick = async () => {
    if (!S) return;
    const wrongCount = applyFilter(poolFor(S.type), 'wrong').length;
    if (!wrongCount) return toast('没有做错的题', 'ok');
    const ok = await confirmDialog('重做做错？', `会把 ${wrongCount} 道错题重新排一遍。原来的答题记录保留，错题标记不会消失。`, { okText: '重做' });
    if (!ok) return;
    S.filter = 'wrong';
    S.mode = 'seq';
    S.idx = 0;
    S.answers = {};
    S.startedAt = Date.now();
    S.done = false;
    S.order = buildOrder();
    startTs = Date.now();
    saveSession();
    renderQuestion();
  };
  $('#q-clear').onclick = async () => {
    if (!S) return;
    const ok = await confirmDialog('清除这个题型的记录？', '会清空本存档该题型的答题进度与错题标记（批注不受影响）。', { okText: '清除', danger: true });
    if (!ok) return;
    const ids = new Set(poolFor(S.type).map((q) => q.id));
    const r = records();
    for (const id of ids) {
      delete r.records[id];
      delete r.wrong[id];
    }
    delete progress.sessions[S.type];
    S = null;
    saveSession();
    const types = Object.keys(TYPES).filter((t) => poolFor(t).length);
    renderStart(types, types[0]);
    toast('已清除', 'ok');
  };
  $('#q-prev').onclick = () => go(-1);
  $('#q-next').onclick = () => go(1);
}

/* ---------------------------------------------------------------- 开始页 */
function renderStart(types, type) {
  const list = poolFor(type);
  const undone = applyFilter(list, 'undone').length;
  const wrong = applyFilter(list, 'wrong').length;
  const topics = [...new Set(list.map((q) => q.topic).filter(Boolean))];
  const tags = [...new Set(list.flatMap((q) => q.tags || []))];
  const body = $('#quiz-body');
  $('#quiz-nav').hidden = true;
  body.innerHTML = `<div class="qcard" style="max-width:760px">
    <div class="qmeta"><span class="tag">${TYPES[type].label}</span><span>${list.length} 题</span><span>未做 ${undone}</span><span>做错 ${wrong}</span></div>
    <h2 style="font-family:var(--serif);margin:6px 0 16px">开始一轮刷题</h2>
    <div style="display:grid;gap:14px">
      <div><div class="muted small" style="margin-bottom:6px">范围</div><div class="chips" id="s-filter">
        ${Object.entries(FILTER_LABEL).map(([k, v]) => `<button class="chip ${k === 'all' ? 'on' : ''}" data-k="${k}">${v}</button>`).join('')}
      </div></div>
      <div><div class="muted small" style="margin-bottom:6px">顺序</div><div class="chips" id="s-mode">
        <button class="chip on" data-k="seq">顺序</button><button class="chip" data-k="random">随机</button>
      </div></div>
      <div><div class="muted small" style="margin-bottom:6px">作答</div><div class="chips" id="s-play">
        <button class="chip on" data-k="quick">快速（点即判）</button><button class="chip" data-k="normal">正常（先选再提交）</button><button class="chip" data-k="study">背题（直接看答案）</button>
      </div></div>
      ${topics.length > 1 ? `<div><div class="muted small" style="margin-bottom:6px">专题</div>
        <select id="s-topic"><option value="">全部专题</option>${topics.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>` : ''}
      ${tags.length ? `<div><div class="muted small" style="margin-bottom:6px">标签</div>
        <select id="s-tag"><option value="">全部标签</option>${tags.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="foot" style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px">
      <button class="btn" id="s-mock">模拟卷 30 题</button>
      <button class="btn primary" id="s-go">开始刷题 →</button>
    </div>
  </div>`;
  const pick = (sel, key) => {
    $$(sel + ' .chip').forEach((b) => {
      b.onclick = () => { $$(sel + ' .chip').forEach((x) => x.classList.toggle('on', x === b)); startOpts[key] = b.dataset.k; };
    });
  };
  const startOpts = { filter: 'all', mode: 'seq', play: 'quick', topic: '', tag: '' };
  pick('#s-filter', 'filter');
  pick('#s-mode', 'mode');
  pick('#s-play', 'play');
  const topicSel = $('#s-topic');
  const tagSel = $('#s-tag');
  if (topicSel) topicSel.onchange = () => (startOpts.topic = topicSel.value);
  if (tagSel) tagSel.onchange = () => (startOpts.tag = tagSel.value);
  $('#s-go').onclick = () => begin(type, startOpts);
  $('#s-mock').onclick = () => {
    const shuffled = [...list].sort(() => Math.random() - 0.5).slice(0, 30);
    begin(type, startOpts, shuffled.map((q) => q.id));
  };
}

function begin(type, opts, forcedOrder) {
  S = {
    type,
    filter: opts.filter,
    mode: opts.mode,
    play: opts.play,
    topic: opts.topic || '',
    tag: opts.tag || '',
    order: forcedOrder || null,
    idx: 0,
    answers: {},
    startedAt: Date.now(),
    done: false,
  };
  if (!S.order) S.order = buildOrder();
  if (!S.order.length) {
    toast('这个范围里没有题目，换个筛选试试', 'bad');
    S = null;
    return;
  }
  startTs = Date.now();
  progress.sessions = progress.sessions || {};
  progress.sessions[type] = S;
  saveSession();
  renderQuestion();
}

/* ---------------------------------------------------------------- 题目 */
function currentQ() {
  const id = S.order[S.idx];
  return qById(id);
}

function renderQuestion() {
  if (!S) return;
  const q = currentQ();
  if (!q) return renderDone();
  $('#quiz-nav').hidden = false;
  const body = $('#quiz-body');
  const ans = S.answers[q.id];
  const answered = ans !== undefined;
  const rec = records().records[q.id];
  const r = records();
  const fav = !!r.fav[q.id];
  const isStudy = S.play === 'study';
  const showAnswer = isStudy || answered;

  const bar = $('#q-bar');
  if (bar) bar.style.width = ((S.idx + (answered ? 1 : 0)) / S.order.length * 100).toFixed(1) + '%';
  const clock = $('#q-clock');
  if (clock) clock.textContent = fmtTime((Date.now() - startTs) / 1000);

  let optsHtml = '';
  if (q.type === 'single' || q.type === 'multi') {
    const multi = q.type === 'multi';
    const picked = multi ? (Array.isArray(ans) ? ans : []) : (typeof ans === 'number' ? [ans] : []);
    optsHtml = `<div class="opts" data-multi="${multi ? 1 : 0}">${(q.options || []).map((o, i) => {
      const letter = String.fromCharCode(65 + i);
      const isAns = (q.answer || []).includes(i);
      const isSel = picked.includes(i);
      let cls = 'opt';
      if (showAnswer) {
        if (isAns) cls += ' ok';
        else if (isSel) cls += ' bad';
        else cls += ' dim';
      } else if (isSel) cls += ' sel';
      return `<button class="${cls}" data-opt="${i}" ${showAnswer && !isStudy ? 'disabled' : ''}>
        <span class="k">${letter}</span><span class="zh">${esc(o.zh)}${o.en ? `<span class="en">${esc(o.en)}</span>` : ''}</span></button>`;
    }).join('')}</div>`;
  } else if (q.type === 'truefalse') {
    optsHtml = `<div class="opts">${['正确', '错误'].map((label, i) => {
      const val = i === 0;
      const isAns = (q.answerText || [])[0] === (val ? 'true' : 'false');
      const isSel = ans === val;
      let cls = 'opt';
      if (showAnswer) {
        if (isAns) cls += ' ok';
        else if (isSel) cls += ' bad';
        else cls += ' dim';
      } else if (isSel) cls += ' sel';
      return `<button class="${cls}" data-tf="${val}" ${showAnswer ? 'disabled' : ''}><span class="k">${i === 0 ? '√' : '×'}</span><span class="zh">${label}</span></button>`;
    }).join('')}</div>`;
  } else {
    // 文本题 / 填空题
    const answerText = (q.answerText && q.answerText.length ? q.answerText.join('；') : '') || q.explain || '';
    const seenOnly = ans === 'seen';
    optsHtml = `<div style="margin-top:18px">
      ${showAnswer || seenOnly ? `<div class="explain"><div class="h">参考答案</div>${esc(answerText || '（无参考答案）')}</div>` : `<button class="btn primary" id="reveal">查看答案</button>`}
      ${seenOnly ? `<div style="margin-top:14px;display:flex;gap:10px"><button class="btn primary" id="self-ok">✅ 我会了</button><button class="btn" id="self-bad">❌ 不会</button></div>` : ''}
      ${ans === 'ok' ? '<div class="verdict ok"><b>已自评：会</b></div>' : ''}
      ${ans === 'bad' ? '<div class="verdict bad"><b>已自评：不会</b></div>' : ''}
      ${ans === 'ok' || ans === 'bad' ? `<div class="explain"><div class="h">解析</div>${esc(q.explain || answerText || '')}</div>` : ''}
    </div>`;
  }

  let verdict = '';
  const judged = answered && rec && (q.type === 'single' || q.type === 'multi' || q.type === 'truefalse');
  if (judged) {
    verdict = `<div class="verdict ${rec.ok ? 'ok' : 'bad'}"><b>${rec.ok ? '✅ 正确' : '❌ 错误'}</b><span>${rec.ok ? '' : '正确答案：' + correctLetters(q)}</span></div>`;
  }

  body.innerHTML = `<div class="qcard">
    <div class="qmeta">
      <span class="tag">${QTYPE_LABEL[q.type] || q.type}</span>
      ${q.topic ? `<span class="tag plain">${esc(q.topic)}</span>` : ''}
      ${(q.tags || []).slice(0, 3).map((t) => `<span class="tag plain">${esc(t)}</span>`).join('')}
      <span class="spacer"></span>
      <span class="mono">${S.idx + 1} / ${S.order.length}</span>
      <button class="btn sm" id="q-fav" title="收藏">${fav ? '★' : '☆'}</button>
    </div>
    ${q.stemEn ? `<div class="qstem-en">${esc(q.stemEn)}</div>` : ''}
    <div class="qstem">${esc(q.stem)}</div>
    ${optsHtml}
    ${q.type === 'multi' && !showAnswer ? `<div style="margin-top:16px"><button class="btn primary" id="submit-multi" ${Array.isArray(ans) && ans.length ? '' : 'disabled'}>提交答案</button></div>` : ''}
    ${verdict}
    ${showAnswer && (q.explain || (q.answerText && q.answerText.length)) && (q.type === 'single' || q.type === 'multi' || q.type === 'truefalse')
      ? `<div class="explain"><div class="h">解析</div>${esc(q.explain || '')}</div>` : ''}
    ${answered && (q.type === 'fill' || q.type === 'explain' || q.type === 'short') ? '' : ''}
  </div>`;

  bindQuestion(q, ans, showAnswer);
}

function isMultiCorrect(q, sel) {
  const a = [...(q.answer || [])].sort().join(',');
  const b = [...sel].sort().join(',');
  return a === b;
}

function correctLetters(q) {
  if (q.type === 'truefalse') return (q.answerText || [])[0] === 'true' ? '正确' : '错误';
  return (q.answer || []).map((i) => String.fromCharCode(65 + i)).join('');
}

function bindQuestion(q, ans, showAnswer) {
  const body = $('#quiz-body');
  const favBtn = body.querySelector('#q-fav');
  if (favBtn) {
    favBtn.onclick = () => {
      const r = records();
      if (r.fav[q.id]) delete r.fav[q.id];
      else r.fav[q.id] = true;
      saveSession();
      renderQuestion();
    };
  }
  body.querySelectorAll('[data-opt]').forEach((btn) => {
    btn.onclick = () => onPick(q, Number(btn.dataset.opt));
  });
  body.querySelectorAll('[data-tf]').forEach((btn) => {
    btn.onclick = () => onPickTF(q, btn.dataset.tf === 'true');
  });
  const sub = body.querySelector('#submit-multi');
  if (sub) sub.onclick = () => submit(q, S.answers[q.id] || []);
  const reveal = body.querySelector('#reveal');
  if (reveal) {
    reveal.onclick = () => {
      S.answers[q.id] = 'seen';
      renderQuestion();
    };
  }
  const selfOk = body.querySelector('#self-ok');
  if (selfOk) selfOk.onclick = () => selfGrade(q, true);
  const selfBad = body.querySelector('#self-bad');
  if (selfBad) selfBad.onclick = () => selfGrade(q, false);
}

function onPick(q, i) {
  if (q.type === 'multi') {
    const cur = Array.isArray(S.answers[q.id]) ? [...S.answers[q.id]] : [];
    const at = cur.indexOf(i);
    if (at >= 0) cur.splice(at, 1);
    else cur.push(i);
    S.answers[q.id] = cur;
    saveSoon();
    renderQuestion();
    return;
  }
  // 单选
  if (S.play === 'normal') {
    if (S.answers[q.id] === i) return submit(q, i);
    S.answers[q.id] = i;
    renderQuestion();
    return;
  }
  submit(q, i);
}

function onPickTF(q, val) {
  submit(q, val);
}

function submit(q, ans) {
  const recs = records();
  const ok = q.type === 'multi' ? isMultiCorrect(q, ans) : (q.type === 'truefalse' ? ((q.answerText || [])[0] === (ans ? 'true' : 'false')) : q.answer.includes(ans));
  recs.records[q.id] = { ok, ans, at: new Date().toISOString() };
  if (!ok) recs.wrong[q.id] = true;
  S.answers[q.id] = ans;
  saveSession();
  renderQuestion();
  if (ok && S.play === 'quick' && q.type !== 'multi') {
    setTimeout(() => {
      if (!S || S.done) return;
      if (S.idx < S.order.length - 1) go(1);
      else finish();
    }, 700);
  }
}

function selfGrade(q, ok) {
  const recs = records();
  recs.records[q.id] = { ok, ans: ok ? 'ok' : 'bad', at: new Date().toISOString() };
  if (!ok) recs.wrong[q.id] = true;
  S.answers[q.id] = ok ? 'ok' : 'bad';
  saveSession();
  renderQuestion();
}

/* ---------------------------------------------------------------- 导航 */
function go(delta) {
  if (!S) return;
  const next = S.idx + delta;
  if (next < 0) return;
  if (next >= S.order.length) return finish();
  S.idx = next;
  saveSoon();
  renderQuestion();
}

function finish() {
  S.done = true;
  S.finishedAt = Date.now();
  saveSession();
  renderDone();
}

function renderDone() {
  if (!S) return;
  $('#quiz-nav').hidden = true;
  const recs = records();
  let ok = 0;
  let bad = 0;
  let seen = 0;
  for (const id of S.order) {
    const a = S.answers[id];
    if (a === undefined) continue;
    const rec = recs.records[id];
    if (!rec) continue;
    seen++;
    if (rec.ok) ok++;
    else bad++;
  }
  const total = S.order.length;
  const pct = seen ? Math.round((ok / Math.max(1, seen)) * 100) : 0;
  const used = ((S.finishedAt || Date.now()) - (S.startedAt || startTs)) / 1000;
  $('#quiz-body').innerHTML = `<div class="qdone">
    <div class="pct ${pct >= 60 ? 'ok' : 'bad'}">${pct}%</div>
    <p class="muted">${TYPES[S.type].label} · 正确率</p>
    <div class="stats">
      <span><b style="color:var(--ok)">${ok}</b>正确</span>
      <span><b style="color:var(--bad)">${bad}</b>错误</span>
      <span><b>${total}</b>总题数</span>
      <span><b>${fmtTime(used)}</b>用时</span>
    </div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button class="btn" id="d-back">返回存档</button>
      <button class="btn" id="d-wrong">重做错题</button>
      <button class="btn primary" id="d-again">再来一轮</button>
    </div>
  </div>`;
  $('#d-back').onclick = () => App.go(`#/read/${archiveId}`);
  $('#d-again').onclick = () => {
    S.idx = 0;
    S.answers = {};
    S.done = false;
    S.startedAt = Date.now();
    startTs = Date.now();
    S.order = buildOrder();
    saveSession();
    renderQuestion();
  };
  $('#d-wrong').onclick = () => {
    const ids = S.order.filter((id) => records().wrong[id]);
    if (!ids.length) return toast('这一轮没有错题', 'ok');
    S.filter = 'wrong';
    S.idx = 0;
    S.answers = {};
    S.done = false;
    S.startedAt = Date.now();
    startTs = Date.now();
    S.order = ids;
    saveSession();
    renderQuestion();
  };
}

/* ---------------------------------------------------------------- 题号面板 */
function openPanel() {
  const recs = records();
  const html = `<h3>题号</h3><p class="sub">绿=对，红=错，蓝框=当前；★ 是收藏</p>
    <div class="panel-grid">${S.order.map((id, i) => {
      const a = S.answers[id];
      const rec = recs.records[id];
      let cls = '';
      if (rec) cls = rec.ok ? 'ok' : 'bad';
      else if (a !== undefined) cls = 'ok';
      if (recs.fav[id]) cls += ' fav';
      if (i === S.idx) cls += ' cur';
      return `<button class="${cls}" data-jump="${i}">${i + 1}</button>`;
    }).join('')}</div>`;
  openModal(html, {
    wide: true,
    onMount(box) {
      box.querySelectorAll('[data-jump]').forEach((b) => {
        b.onclick = () => {
          S.idx = Number(b.dataset.jump);
          saveSoon();
          closeModal();
          renderQuestion();
        };
      });
    },
  });
}

/* ---------------------------------------------------------------- 键盘 */
function onKey(e) {
  if (!S || S.done) return;
  if (e.target && e.target.closest && e.target.closest('input,textarea,select')) return;
  const q = currentQ();
  if (!q) return;
  const k = e.key.toLowerCase();
  if (/^[1-5]$/.test(k)) {
    const idx = Number(k) - 1;
    if ((q.type === 'single' && q.options[idx]) || (q.type === 'multi' && q.options[idx])) onPick(q, idx);
  } else if (/^[a-e]$/.test(k)) {
    const idx = k.charCodeAt(0) - 97;
    if ((q.type === 'single' || q.type === 'multi') && q.options[idx]) onPick(q, idx);
  } else if (k === 'arrowright' || k === 'enter') {
    if (q.type === 'multi' && S.answers[q.id] && !records().records[q.id]) {
      submit(q, S.answers[q.id]);
    } else go(1);
  } else if (k === 'arrowleft') go(-1);
}

export function destroy() {
  destroyed = true;
  window.removeEventListener('keydown', onKey);
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  if (S) saveSession();
  S = null;
}
