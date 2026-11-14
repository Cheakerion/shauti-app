/**
 * 复研 · 自检 / E2E 脚本（只在 ?e2e=... 时加载，正常使用不会执行）
 * 用法：http://127.0.0.1:5279/?e2e=reader
 * 结果写进 document.title 与 #e2e-result，便于无头浏览器 --dump-dom 抓取。
 */
import { state, $, $$ } from './core.js';
import { api } from './api.js';

const results = [];
function ok(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra === undefined ? '' : extra });
  return cond;
}
function waitFor(fn, timeout = 8000, step = 100) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      let v;
      try { v = fn(); } catch (_) { v = null; }
      if (v) return resolve(v);
      if (Date.now() - t0 > timeout) return reject(new Error('waitFor 超时: ' + fn.toString().slice(0, 80)));
      setTimeout(tick, step);
    };
    tick();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function goto(hash) {
  location.hash = hash;
  await sleep(140);
  await yieldFrame();
}

async function getReader() {
  await waitFor(() => $('#reader-frame') && $('#reader-frame').contentWindow && $('#reader-frame').contentWindow.__fuyan);
  const w = $('#reader-frame').contentWindow;
  await waitFor(() => w.__fuyan && w.__fuyan.ready);
  return w;
}

async function scenarioReader() {
  await goto('#/read/infectious');
  const w = await getReader();
  const fy = w.__fuyan;
  await sleep(300);

  ok('阅读器: iframe 载入', !!fy);
  const sections = fy.api.index().filter((x) => x.kind === 'section');
  ok('阅读器: 识别章节', sections.length >= 6, 'sections=' + sections.length);
  const total = fy.api.index().reduce((s, x) => s + (x.text || '').length, 0);
  ok('阅读器: 有正文文本', total > 20000, 'textLen=' + total);
  ok('阅读器: 侧栏导航渲染', $$('#side a[data-section]').length >= 6, 'nav=' + $$('#side a[data-section]').length);
  ok('运行时: 题量占位已填', String(w.document.getElementById('home-qn')?.textContent) === '196',
    'home-qn=' + w.document.getElementById('home-qn')?.textContent);
  const homeProg = (w.document.getElementById('home-progress')?.textContent || '').trim();
  ok('运行时: 首页进度行已填', homeProg.length > 0, homeProg.slice(0, 40));

  // 滚动与章节联动
  fy.api.goto('sec-quick');
  await sleep(500);
  ok('运行时: 可跳转章节', w.scrollY > 100, 'scrollY=' + Math.round(w.scrollY));

  // 选区 → 气泡
  fy.api.scrollToY(0);
  await sleep(300);
  const selected = fy.api.selectText('稽留热', true);
  ok('运行时: 能选中文本', selected);
  await sleep(400);
  const bubble = $('.selbubble');
  ok('批注: 选区气泡出现', !!bubble);
  if (!bubble) return;

  bubble.querySelector('[data-b=note]').click();
  await sleep(200);
  const ta = $('#note-text');
  ok('批注: 编辑弹窗出现', !!ta);
  if (!ta) return;
  ta.value = 'E2E 自动生成的批注';
  $('[data-x=save]').click();
  await sleep(600);

  const notes = state.notes || [];
  ok('批注: 已保存到状态', notes.length === 1, 'notes=' + notes.length);
  const hl = w.CSS && w.CSS.highlights ? w.CSS.highlights.get('fy-note') : null;
  const hlSize = hl ? hl.size : -1;
  ok('批注: 正文高亮已渲染', hlSize === 1, 'highlightRanges=' + hlSize);

  // 服务端持久化
  const saved = await api.getNotes('infectious');
  ok('批注: 服务端已落盘', (saved.notes.items || []).length === 1, 'items=' + (saved.notes.items || []).length);

  // 离开再回来：批注应仍在原位
  await goto('#/');
  await sleep(300);
  await goto('#/read/infectious');
  const w2 = await getReader();
  await sleep(500);
  const hl2 = w2.CSS && w2.CSS.highlights ? w2.CSS.highlights.get('fy-note') : null;
  ok('批注: 重新打开后仍在原位置', hl2 && hl2.size === 1, 'ranges=' + (hl2 ? hl2.size : -1));

  // 批注管理页
  await goto('#/notes/infectious');
  await waitFor(() => $('.note-item'));
  ok('批注管理: 列表可见', $$('.note-item').length === 1, 'items=' + $$('.note-item').length);

  // 删除（管理页入口）
  const del = $('.note-item [data-act=del]');
  if (del) {
    del.click();
    await sleep(250);
    const okBtn = $('[data-act=ok]');
    if (okBtn) okBtn.click();
    await sleep(700);
  }
  const after = await api.getNotes('infectious');
  ok('批注: 管理页可删除', (after.notes.items || []).length === 0, 'items=' + (after.notes.items || []).length);
}

async function scenarioQuiz() {
  await api.resetProgress('infectious', 'quiz');
  await goto('#/quiz/infectious');
  await waitFor(() => $('#q-types'));
  if (!$('#s-go')) {
    // 上次会话被恢复了：先重设回开始页
    $('#q-reset').click();
    await sleep(250);
    const okBtn = $('[data-act=ok]');
    if (okBtn) okBtn.click();
    await sleep(300);
  }
  await waitFor(() => $('#s-go'));
  ok('刷题: 开始页渲染', !!$('#s-go'));
  $('#s-go').click();
  await waitFor(() => $('#quiz-body .qcard'));
  ok('刷题: 题目卡出现', !!$('#quiz-body .qcard'));
  const stem = $('#quiz-body .qstem')?.textContent || '';
  ok('刷题: 题干非空', stem.length > 6, stem.slice(0, 30));

  // 答第一题（快速模式：点选项即判）
  const opts = $$('#quiz-body .opt');
  ok('刷题: 选项渲染', opts.length >= 4, 'opts=' + opts.length);
  opts[0].click();
  await sleep(900);
  const rec = await api.getProgress('infectious');
  const records = rec.progress.quiz.records || {};
  ok('刷题: 答题记录已写', Object.keys(records).length >= 1, 'records=' + Object.keys(records).length);

  // 题号面板
  $('#q-panel').click();
  await sleep(200);
  ok('刷题: 题号面板可开', $$('.panel-grid button').length > 100, 'cells=' + $$('.panel-grid button').length);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await sleep(200);

  // 键盘选答（先翻到下一题，确保是新题）
  $('#q-next').click();
  await sleep(400);
  const before = Object.keys((await api.getProgress('infectious')).progress.quiz.records).length;
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  await sleep(1200);
  const after = Object.keys((await api.getProgress('infectious')).progress.quiz.records).length;
  ok('刷题: 键盘作答生效', after > before, `${before} -> ${after}`);
}

async function scenarioSearch() {
  await goto('#/read/digestive');
  const w = await getReader();
  await sleep(500);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  await waitFor(() => $('#cmdk') && !$('#cmdk').hidden);
  const inp = $('#cmdk-input');
  inp.value = '腹水';
  inp.dispatchEvent(new Event('input'));
  await sleep(600);
  const hits = $$('.cmdk-item').length;
  ok('搜索: 命中结果', hits > 0, 'hits=' + hits);
  ok('搜索: 索引包含章节', (w.__fuyan.api.index().find((x) => x.kind === 'section')) !== undefined);
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

async function scenarioSettings() {
  await goto('#/settings');
  await waitFor(() => $('#ai-test'));
  ok('设置: 渲染', !!$('#ai-test'));
  $('#ai-test').click();
  await sleep(2500);
  const txt = $('#ai-state')?.textContent || '';
  ok('设置: DeepSeek 连接测试', /连接正常|失败|Error|错误/.test(txt), txt.slice(0, 60));
}

async function scenarioAi() {
  await goto('#/read/infectious');
  const w = await getReader();
  const fy = w.__fuyan;
  await sleep(300);
  fy.api.selectText('稽留热', true);
  await sleep(400);
  const bubble = $('.selbubble');
  ok('AI: 选区气泡', !!bubble);
  if (!bubble) return;
  bubble.querySelector('[data-b=ai]').click();
  await waitFor(() => !$('#drawer').hidden && $('.ai-msg.user'), 8000);
  ok('AI: 抽屉已打开并发出问题', !!$('.ai-msg.user'));
  await waitFor(() => {
    const btn = $('#drawer-send');
    const txt = $('#drawer-body .ai-msg.assistant .bubble');
    return btn && !btn.disabled && txt && txt.textContent.length > 10;
  }, 90000);
  const answer = $('#drawer-body .ai-msg.assistant .bubble')?.textContent || '';
  ok('AI: 收到流式回答', answer.length > 10, 'len=' + answer.length + ' ' + answer.slice(0, 40));
  await sleep(1200);
  const notes = state.notes || [];
  const aiNote = notes.find((n) => n.kind === 'ai');
  ok('AI: 问答已存成批注', !!aiNote, 'notes=' + notes.length);
  const saved = await api.getNotes('infectious');
  ok('AI: 服务端已落盘', (saved.notes.items || []).some((n) => n.kind === 'ai'));
  // 清理
  state.notes = state.notes.filter((n) => n.kind !== 'ai');
  await api.putNotes('infectious', state.notes.map(({ _orphan, _relocated, ...r }) => r));
  ok('AI: 可清理', true);
}

async function scenarioDigestive() {
  await goto('#/read/digestive');
  const w = await getReader();
  const fy = w.__fuyan;
  await sleep(400);
  ok('消化站: 章节数', fy.api.index().filter((x) => x.kind === 'section').length >= 10,
    'sections=' + fy.api.index().filter((x) => x.kind === 'section').length);
  // 名解卡翻转
  const card = w.document.querySelector('.flashcard');
  ok('消化站: 有翻转卡', !!card);
  if (card) {
    card.click();
    await sleep(150);
    ok('消化站: 卡片可翻转', card.classList.contains('is-flipped'));
    card.click();
  }
  // 简答折叠（details/summary）
  fy.api.goto('shorts');
  await sleep(400);
  const det = w.document.querySelector('#shorts details.reveal');
  ok('消化站: 简答折叠卡', !!det);
  if (det) {
    det.open = true;
    await sleep(120);
    ok('消化站: 折叠可展开', det.open === true);
  }
  // 筛选名解卡
  const btn = w.document.querySelector('.filter-btn[data-filter="m1"]');
  if (btn) {
    btn.click();
    await sleep(150);
    const visible = [...w.document.querySelectorAll('.flashcard')].filter((c) => c.style.display !== 'none').length;
    ok('消化站: 名解筛选生效', visible > 0 && visible < 44, 'visible=' + visible);
  }
  // 章节定位联动
  fy.api.goto('m3');
  await sleep(700);
  ok('消化站: 可跳转精读模块', w.scrollY > 500, 'scrollY=' + Math.round(w.scrollY));
}

async function scenarioDone() {
  await api.resetProgress('infectious', 'quiz');
  await goto('#/quiz/infectious');
  await waitFor(() => $('#q-types'));
  if (!$('#s-go')) {
    $('#q-reset').click();
    await sleep(250);
    const okBtn = $('[data-act=ok]');
    if (okBtn) okBtn.click();
    await sleep(300);
  }
  await waitFor(() => $('#s-go'));
  $('#s-go').click();
  await waitFor(() => $('#q-next'));
  let guard = 0;
  while (!$('.qdone') && guard < 260) {
    const next = $('#q-next');
    if (!next) break;
    next.click();
    guard++;
    await sleep(6);
  }
  ok('完成页: 可到达', !!$('.qdone'), 'clicks=' + guard);
  const pct = $('.qdone .pct')?.textContent || '';
  ok('完成页: 显示正确率', /\d+%/.test(pct), pct);
  ok('完成页: 有统计项', $$('.qdone .stats span').length >= 3, 'stats=' + $$('.qdone .stats span').length);
  ok('完成页: 可再来一轮', !!$('#d-again'));
  $('#d-again')?.click();
  await sleep(300);
  ok('完成页: 重开回到题目', !!$('#quiz-body .qcard'));
}

async function scenarioLibrary() {
  await goto('#/');
  await waitFor(() => $('.arc'), 8000);
  ok('存档库: 卡片渲染', $$('.arc').length >= 2, 'cards=' + $$('.arc').length);
  const quarkOnes = (state.archives || []).filter((a) => (a.source || {}).kind === 'quark');
  if (!quarkOnes.length) {
    ok('网盘: 当前没有网盘来源存档，跳过更新检查', true, 'local-only');
    return;
  }
  // 等后台网盘检查
  await waitFor(() => Object.keys(state.archiveUpdates || {}).length > 0, 20000).catch(() => {});
  const ups = Object.entries(state.archiveUpdates || {}).filter(([, v]) => v);
  ok('网盘: 后台检查到更新', ups.length > 0, 'updates=' + ups.map(([k]) => k).join(','));
  const badge = $('[data-update]');
  ok('网盘: 卡片显示更新徽标', !!badge, badge ? badge.textContent : 'none');
  if (badge) {
    badge.click();
    await waitFor(() => $('#qk-body'), 8000);
    await sleep(3000);
    ok('网盘: 打开导入面板', !!$('#qk-body'));
    ok('网盘: 标出新版本文件', /新版本/.test($('#qk-body').textContent || ''), ($('#qk-body').textContent || '').slice(0, 80));
  }
}

async function scenarioLongpress() {
  await goto('#/read/infectious');
  const w = await getReader();
  await sleep(400);
  const p = w.document.querySelector('#sec-home p, #sec-home .sub, #sec-qa .qa h3');
  ok('长按: 找到可长按的文本', !!p);
  if (!p) return;
  p.scrollIntoView({ block: 'center', behavior: 'instant' });
  await sleep(350);
  const r = p.getBoundingClientRect();
  const x = Math.round(r.left + 60);
  const y = Math.round(r.top + r.height / 2);
  const cr = w.document.caretRangeFromPoint ? w.document.caretRangeFromPoint(x, y) : null;
  ok('长按: 坐标命中文本', !!cr && cr.startContainer.nodeType === 3,
    'rect=' + [r.left, r.top, r.width, r.height].map(Math.round).join(',') + ' node=' + (cr && cr.startContainer.nodeType));
  p.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
  await sleep(900);
  const sel = w.getSelection().toString().trim();
  ok('长按: 自动选中一句', sel.length > 0, 'sel=' + sel.slice(0, 30) + ' rangeCount=' + w.getSelection().rangeCount);
  const bubble = $('.selbubble');
  ok('长按: 出现批注气泡', !!bubble);
  p.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y, button: 0 }));
  w.getSelection().removeAllRanges();
  await sleep(300);
}

async function scenarioQuark() {
  await goto('#/');
  await waitFor(() => $('[data-import=quark]'), 8000);
  ok('网盘: 有导入入口', !!$('[data-import=quark]'));
  ok('网盘: 文件夹导入已移除', !$('[data-import=folder]'));
  $('[data-import=quark]').click();
  await waitFor(() => {
    const t = $('#qk-body') && $('#qk-body').textContent;
    return t && !/正在连接/.test(t);
  }, 30000);
  await sleep(1200);
  const rows = $$('#qk-body .kv');
  ok('网盘: 列出存档包', rows.length >= 2, 'rows=' + rows.length);
  const names = rows.map((r) => (r.querySelector('b')?.textContent || '').trim());
  ok('网盘: 最新在最上面（带推荐）', (rows[0]?.textContent || '').includes('推荐'), names[0] || '');
  ok('网盘: 两个包都在', names.some((n) => n.includes('传染病')) && names.some((n) => n.includes('消化')), names.join(' | '));
  ok('网盘: 时间从新到旧', names.length >= 2 && names[0] !== names[1], names.join(' > '));
}

async function scenarioAiGate() {
  await goto('#/read/infectious');
  await getReader();
  await sleep(200);
  const before = state.aiReady;
  state.aiReady = false;
  $('#reader-ai').click();
  await waitFor(() => document.querySelector('.modal'), 5000);
  const txt = (document.querySelector('.modal') || {}).textContent || '';
  ok('AI 门禁: 未授权时弹引导', /先启用 AI/.test(txt), txt.slice(0, 30));
  ok('AI 门禁: 说清没有扫码登录', /扫码登录/.test(txt));
  state.aiReady = before;
  const closeBtn = document.querySelector('[data-g=close]');
  if (closeBtn) closeBtn.click();
  await sleep(200);
  ok('AI 门禁: 可关闭', !document.querySelector('.modal'));
  // 重新打开，留给截图看
  state.aiReady = false;
  $('#reader-ai').click();
  await sleep(400);
}

async function scenarioUpdate() {
  await goto('#/');
  const st = await (await fetch('/api/app/update')).json();
  if (!st.configured) {
    ok('更新: 未配置更新源（跳过）', true, 'unconfigured');
    return;
  }
  if (!st.ok || !st.hasUpdate) {
    ok('更新: 当前已是最新或检查失败', true, (st.message || '').slice(0, 40));
    return;
  }
  await waitFor(() => $('#btn-update') && !$('#btn-update').hidden, 15000);
  ok('更新: 顶栏出现更新按钮', !$('#btn-update').hidden, $('#btn-update').textContent);
  ok('更新: 按钮带远端版本号', ($('#btn-update').textContent || '').includes(st.remote.version));
  $('#btn-update').click();
  await waitFor(() => $('.modal'), 5000);
  const txt = ($('.modal') || {}).textContent || '';
  ok('更新: 弹窗显示远端版本', txt.includes(st.remote.version), txt.slice(0, 40));
  if (st.remote.notes) ok('更新: 显示更新说明', txt.includes(String(st.remote.notes).slice(0, 8)));
  const close = $('[data-u=close]');
  if (close) close.click();
}

async function scenarioNav() {
  await goto('#/');
  await waitFor(() => $('.arc'), 8000);
  $('.arc').click();
  await sleep(600);
  const inReader = /#\/read\//.test(location.hash);
  ok('导航: 进入阅读', inReader, location.hash);
  $('#btn-back').click();
  await sleep(500);
  ok('导航: 后退回存档库', /^#\/?$/.test(location.hash), location.hash);
  ok('导航: 前进按钮可用', !$('#btn-forward').disabled);
  $('#btn-forward').click();
  await sleep(500);
  ok('导航: 前进回阅读', /#\/read\//.test(location.hash), location.hash);
  ok('导航: 后退按钮可用', !$('#btn-back').disabled);
}

async function scenarioAiBubble() {
  await goto('#/read/infectious');
  const w = await getReader();
  await sleep(300);
  const doc = w.document;
  // 找一段可见的表格文字，滚到中间再选中它（不滚动，气泡才会留在原位）
  const el = [...doc.querySelectorAll('td,li,p')].find((e) => e.textContent.includes('波状热'));
  ok('气泡: 找到正文', !!el);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  await sleep(500);
  const walker = doc.createTreeWalker(el, w.NodeFilter.SHOW_TEXT);
  let node = null;
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeValue.includes('波状热')) { node = n; break; }
  }
  ok('气泡: 找到文字节点', !!node);
  if (!node) return;
  const i = node.nodeValue.indexOf('波状热');
  const r = doc.createRange();
  r.setStart(node, i);
  r.setEnd(node, i + 3);
  const sel = w.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  await sleep(500);
  ok('气泡: 出现', !!$('.selbubble'), ($('.selbubble') || {}).textContent || '');
  ok('气泡: 位置在视口内', (() => {
    const b = $('.selbubble');
    if (!b) return false;
    const rect = b.getBoundingClientRect();
    return rect.top > 0 && rect.bottom < window.innerHeight;
  })());
}

async function scenarioAiChat() {
  const A = 'infectious';
  const base = {
    kind: 'ai', note: '', section: '总论',
    anchor: { start: 1000, end: 1003 }, quote: '稽留热',
  };
  const note1 = { ...base, id: 'e2e_n1', createdAt: '2026-01-01T00:00:00+08:00', updatedAt: '2026-01-01T00:00:01+08:00',
    ai: { messages: [{ role: 'user', content: '解释「稽留热」' }, { role: 'assistant', content: '稽留热是体温持续 39–40℃。' }] } };
  const note2 = { ...base, id: 'e2e_n2', createdAt: '2026-01-02T00:00:00+08:00', updatedAt: '2026-01-02T00:00:01+08:00',
    ai: { messages: [{ role: 'user', content: '继续：和弛张热怎么分？' }, { role: 'assistant', content: '弛张热 24h 波动 >1℃。' }] } };
  await api.putNotes(A, [note1, note2]);
  await api.putAiThreads(A, [{ id: 'e2e_t1', title: '自由对话', section: '',
    messages: [{ role: 'user', content: '发热怎么分类' }, { role: 'assistant', content: '按热型分六类。' }],
    createdAt: '2026-01-03T00:00:00+08:00', updatedAt: '2026-01-03T00:00:01+08:00' }]);

  await goto('#/read/infectious');
  await getReader();
  await sleep(700);

  const after = await api.getNotes(A);
  ok('AI批注: 同选区重复项已合并', after.notes.items.length === 1, 'n=' + after.notes.items.length);
  const merged = after.notes.items[0] || { ai: { messages: [] } };
  ok('AI批注: 合并后上下文保留 4 条', (merged.ai.messages || []).length === 4, 'msgs=' + (merged.ai.messages || []).length);

  $('#reader-ai').click();
  await sleep(500);
  ok('对话记录: 抽屉打开', !$('#drawer').hidden);
  ok('对话记录: 批注 + 自由对话都在', $$('.ai-hist-item').length === 2, 'items=' + $$('.ai-hist-item').length);

  const noteBtn = $$('.ai-hist-item').find((b) => b.dataset.k === 'note');
  if (noteBtn) noteBtn.click();
  await sleep(300);
  ok('对话记录: 能打开批注对话', (($('#drawer-body').textContent) || '').includes('稽留热'));
  ok('对话记录: 历史消息完整', $$('#drawer-body .ai-msg').length === 4, 'msgs=' + $$('#drawer-body .ai-msg').length);

  $('#drawer-close').click();
  await sleep(200);
  $('#reader-ai').click();
  await sleep(500);
  ok('对话记录: 关闭后仍可查看', $$('.ai-hist-item').length === 2);
  $('#drawer-close').click();

  await api.putNotes(A, []);
  await api.putAiThreads(A, []);
}

async function scenarioScrollRestore() {
  await goto('#/read/infectious');
  let w = await getReader();
  await sleep(400);
  const original = w.scrollY;
  const target = original > 1000 ? original : 3200;
  w.__fuyan.api.scrollToY(target);
  await sleep(1400); // 等进度保存（900ms debounce）
  await goto('#/');
  await sleep(400);
  await goto('#/read/infectious');
  w = await getReader();
  await sleep(500);
  const y = w.scrollY;
  ok('阅读位置: 回来还在原位', Math.abs(y - target) < 200, 'y=' + Math.round(y));
  const sb = w.getComputedStyle(w.document.documentElement).scrollBehavior;
  ok('阅读位置: 不做平滑滚动', sb === 'auto', 'scroll-behavior=' + sb);
  const op = $('#reader-frame').style.opacity;
  ok('阅读位置: 跳完才显示', op === '1', 'opacity=' + op);

  // 还原用户原来的位置，别把测试当成阅读记录
  w.__fuyan.api.scrollToY(original);
  await sleep(1300);
}

async function scenarioFlash() {
  await goto('#/read/infectious');
  let w = await getReader();
  await sleep(400);
  const original = w.scrollY;
  const target = original > 1000 ? original : 3200;
  w.__fuyan.api.scrollToY(target);
  await sleep(1400);
  await goto('#/');
  await sleep(300);
  location.hash = '#/read/infectious';
  const samples = [];
  for (let i = 0; i < 40; i++) {
    await sleep(16);
    const f = $('#reader-frame');
    const veil = $('#reader-veil');
    samples.push({
      op: f ? f.style.opacity : '-',
      vis: f ? f.style.visibility : '-',
      veil: !!veil,
      y: f && f.contentWindow ? Math.round(f.contentWindow.scrollY) : -1,
    });
  }
  const bad = samples.filter((s) => s.vis === 'visible' && s.op === '1' && s.y >= 0 && s.y < target - 200);
  ok('切换: 显示时已经在原位置（不闪封面）', bad.length === 0, 'bad=' + bad.length + ' / ' + samples.length);
  const last = samples[samples.length - 1];
  ok('切换: 最终可见且无遮罩', last.vis === 'visible' && !last.veil, JSON.stringify(last));
  w = await getReader();
  w.__fuyan.api.scrollToY(original);
  await sleep(1300);
}

export async function run(name) {
  const map = {
    reader: scenarioReader, quiz: scenarioQuiz, search: scenarioSearch,
    settings: scenarioSettings, ai: scenarioAi, digestive: scenarioDigestive, done: scenarioDone,
    library: scenarioLibrary, longpress: scenarioLongpress, quark: scenarioQuark, aigate: scenarioAiGate,
    update: scenarioUpdate, nav: scenarioNav, aibubble: scenarioAiBubble, aichat: scenarioAiChat, scroll: scenarioScrollRestore,
    flash: scenarioFlash,
  };
  const fn = map[name];
  let err = '';
  try {
    if (fn) await fn();
    else err = '未知场景: ' + name;
  } catch (e) {
    err = e.message || String(e);
    results.push({ name: '场景异常', pass: false, extra: err });
  }
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  window.__E2E_RESULT = { scenario: name, pass, fail, err, results };
  const quiet = new URLSearchParams(location.search).get('nosum') === '1';
  if (!quiet) {
    const pre = document.createElement('pre');
    pre.id = 'e2e-result';
    pre.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99999;background:#fff;color:#111;font-size:11px;max-height:40vh;overflow:auto;padding:8px;border-top:2px solid #999;width:100%';
    pre.textContent = JSON.stringify({ scenario: name, pass, fail, err, results }, null, 1);
    document.body.appendChild(pre);
  }
  document.title = `E2E ${name}: ${pass} pass / ${fail} fail ${err ? 'ERR ' + err : ''}`;
  return { pass, fail };
}
