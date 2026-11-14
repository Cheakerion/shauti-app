/**
 * 复研 · 存档内容运行时
 * 在存档文档里跑：翻转/折叠/筛选/标记/锚点跳转/批注高亮/选区
 * 与外壳通信：window.__fuyan.host（由父页面注入回调）
 */
(function () {
  'use strict';
  if (window.__fuyan) return;

  const doc = document;
  const state = {
    host: null,
    sections: [],
    notes: [],
    progress: null,
    proj: null,
    activeNote: '',
    selTimer: 0,
    lastSel: '',
    suppressUntil: 0,
  };

  /* -------------------------------------------------------------- 文本投影 */
  function buildProjection() {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue;
        if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('script,style,noscript,template,textarea')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    const map = new Map();
    let text = '';
    let n;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, start: text.length });
      map.set(n, text.length);
      text += n.nodeValue;
    }
    return { nodes, map, text };
  }

  function proj() {
    if (!state.proj) state.proj = buildProjection();
    return state.proj;
  }
  function invalidate() {
    state.proj = null;
  }

  function pointAt(off) {
    const p = proj();
    if (!p.nodes.length) return null;
    if (off <= 0) return { node: p.nodes[0].node, offset: 0 };
    for (let i = p.nodes.length - 1; i >= 0; i--) {
      const it = p.nodes[i];
      if (off >= it.start) {
        return { node: it.node, offset: Math.min(off - it.start, it.node.nodeValue.length) };
      }
    }
    return { node: p.nodes[0].node, offset: 0 };
  }

  function offsetOf(node, offset) {
    const p = proj();
    if (!node) return 0;
    if (node.nodeType === 3) {
      const st = p.map.get(node);
      return st == null ? 0 : st + offset;
    }
    if (node.nodeType === 1) {
      const child = node.childNodes[offset] || null;
      let cur = child;
      while (cur && cur.nodeType !== 3) cur = cur.firstChild || cur.nextSibling;
      if (cur) {
        const st = p.map.get(cur);
        if (st != null) return st;
      }
      // 没有子文本，退回节点末
      const st2 = p.map.get(node.lastChild);
      return st2 == null ? 0 : st2 + node.lastChild.nodeValue.length;
    }
    return 0;
  }

  function rangeOf(a, b) {
    if (b < a) [a, b] = [b, a];
    const s = pointAt(a);
    const e = pointAt(b);
    if (!s || !e) return null;
    try {
      const r = doc.createRange();
      r.setStart(s.node, s.offset);
      r.setEnd(e.node, e.offset);
      return r;
    } catch (_) {
      return null;
    }
  }

  /* -------------------------------------------------------------- 批注高亮 */
  const HL = { note: null, ai: null, active: null };

  function ensureHighlights() {
    if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') return false;
    if (!HL.note) HL.note = new Highlight();
    if (!HL.ai) HL.ai = new Highlight();
    if (!HL.active) HL.active = new Highlight();
    CSS.highlights.set('fy-note', HL.note);
    CSS.highlights.set('fy-ai', HL.ai);
    CSS.highlights.set('fy-active', HL.active);
    return true;
  }

  function renderNotes() {
    if (!ensureHighlights()) return;
    HL.note.clear();
    HL.ai.clear();
    HL.active.clear();
    const p = proj();
    for (const it of state.notes) {
      const a = it.anchor || {};
      let start = a.start;
      let end = a.end;
      // 内容变了：用 quote 重新定位
      if (a.quote && p.text.slice(start, end) !== a.quote) {
        const near = p.text.indexOf(a.quote, Math.max(0, (start || 0) - 400));
        const exact = near >= 0 ? near : p.text.indexOf(a.quote);
        if (exact >= 0) {
          start = exact;
          end = exact + a.quote.length;
          it._relocated = true;
        } else {
          it._orphan = true;
          continue;
        }
      }
      it._orphan = false;
      const r = rangeOf(start, end);
      if (!r) { it._orphan = true; continue; }
      if (it.kind === 'ai') HL.ai.add(r);
      else HL.note.add(r);
    }
    if (state.activeNote) {
      const it = state.notes.find((x) => x.id === state.activeNote);
      if (it && !it._orphan) {
        const r = rangeOf(it.anchor.start, it.anchor.end);
        if (r) HL.active.add(r);
      }
    }
  }

  function focusNote(id) {
    const it = state.notes.find((x) => x.id === id);
    if (!it) return false;
    state.activeNote = id;
    renderNotes();
    const r = rangeOf(it.anchor.start, it.anchor.end);
    if (!r) return false;
    const rect = r.getBoundingClientRect();
    const y = rect.top + window.scrollY - window.innerHeight * 0.35;
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
    return true;
  }

  /* -------------------------------------------------------------- 交互：原站控件 */
  function qaToggle(el) {
    el.classList.toggle('open');
    const body = el.querySelector('.body');
    if (body) {
      if (el.classList.contains('open')) {
        body.classList.remove('hide');
        body.style.maxHeight = '';
      } else {
        body.classList.add('hide');
      }
    }
    const tog = el.querySelector('.toggle');
    if (tog) tog.textContent = el.classList.contains('open') ? '收起 ▴' : '显示答案 ▸';
  }

  function bindQa(root) {
    root.querySelectorAll('.qa').forEach((qa) => {
      const head = qa.querySelector('header');
      if (!head) return;
      head.style.cursor = 'pointer';
      head.addEventListener('click', (e) => {
        if (e.target.closest('a,button,.no')) return;
        qaToggle(qa);
      });
    });
  }

  function bindFlips(root) {
    root.querySelectorAll('.card[data-id], .flashcard').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.mark,button:not(.flashcard),a')) return;
        if (card.classList.contains('flashcard')) {
          const on = card.classList.toggle('is-flipped');
          card.setAttribute('aria-pressed', String(on));
        } else {
          card.classList.toggle('flipped');
        }
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
      if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
    });
  }

  function applyMastered() {
    const m = (state.progress && state.progress.naming && state.progress.naming.mastered) || {};
    doc.querySelectorAll('[data-act="mastered"]').forEach((el) => {
      const on = !!m[el.dataset.key];
      el.classList.toggle('mastered', on);
      const card = el.closest('.card');
      if (card) card.classList.toggle('mastered', on);
      if (!el.dataset.savedText && el.dataset.orig) el.textContent = el.dataset.orig;
    });
    const mods = (state.progress && state.progress.modules && state.progress.modules.mastered) || {};
    doc.querySelectorAll('.master-btn[data-act="module-mastered"]').forEach((b) => {
      const on = !!mods[b.dataset.key];
      b.classList.toggle('is-done', on);
      if (!b.dataset.orig) b.dataset.orig = b.textContent;
      b.textContent = on ? '已掌握 ✓' : '标记已掌握';
    });
  }

  function onAction(ev) {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'expand-all' || act === 'collapse-all') {
      ev.preventDefault();
      const scope = btn.dataset.scope || '.qa';
      doc.querySelectorAll(scope).forEach((qa) => {
        const open = act === 'expand-all';
        qa.classList.toggle('open', open);
        const body = qa.querySelector('.body');
        if (body) body.classList.toggle('hide', !open);
      });
      doc.querySelectorAll('details.reveal').forEach((d) => { d.open = act === 'expand-all'; });
    } else if (act === 'flip-mode') {
      ev.preventDefault();
      const grid = doc.querySelector('#naming-cards, #flashGrid, .cards');
      if (grid) grid.classList.toggle('quiz-mode');
      btn.classList.toggle('on');
    } else if (act === 'shuffle') {
      ev.preventDefault();
      const grid = doc.querySelector('#naming-cards, .cards');
      if (!grid) return;
      const items = [...grid.children];
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      items.forEach((x) => grid.appendChild(x));
      toastLocal('已打乱');
    } else if (act === 'tab') {
      ev.preventDefault();
      const qt = btn.dataset.qt;
      doc.querySelectorAll('.quick-tabs .chip, .quick-tabs button').forEach((x) => x.classList.toggle('on', x === btn));
      const mix = doc.getElementById('quick-mix');
      const nums = doc.getElementById('quick-nums');
      if (mix) mix.style.display = qt === 'mix' ? '' : 'none';
      if (nums) nums.style.display = qt === 'nums' ? '' : 'none';
    } else if (act === 'filter-flash') {
      ev.preventDefault();
      const f = btn.dataset.filter;
      doc.querySelectorAll('.filter-btn').forEach((x) => x.classList.toggle('active', x === btn));
      doc.querySelectorAll('.flashcard').forEach((c) => {
        const tags = (c.dataset.tag || '').split(/\s+/);
        const show = f === 'all' || tags.includes(f);
        c.style.display = show ? '' : 'none';
      });
      const vis = doc.querySelector('#flashVisible');
      if (vis) vis.textContent = String([...doc.querySelectorAll('.flashcard')].filter((c) => c.style.display !== 'none').length);
    } else if (act === 'mastered') {
      ev.preventDefault();
      ev.stopPropagation();
      const key = btn.dataset.key;
      const cur = !!(state.progress && state.progress.naming && state.progress.naming.mastered && state.progress.naming.mastered[key]);
      if (!state.progress) state.progress = {};
      state.progress.naming = state.progress.naming || { mastered: {} };
      state.progress.naming.mastered = state.progress.naming.mastered || {};
      if (cur) delete state.progress.naming.mastered[key];
      else state.progress.naming.mastered[key] = true;
      applyMastered();
      hostCall('updateProgress', { naming: state.progress.naming });
    } else if (act === 'module-mastered') {
      ev.preventDefault();
      const key = btn.dataset.key;
      const cur = !!(state.progress && state.progress.modules && state.progress.modules.mastered && state.progress.modules.mastered[key]);
      if (!state.progress) state.progress = {};
      state.progress.modules = state.progress.modules || { mastered: {} };
      state.progress.modules.mastered = state.progress.modules.mastered || {};
      if (cur) delete state.progress.modules.mastered[key];
      else state.progress.modules.mastered[key] = true;
      applyMastered();
      hostCall('updateProgress', { modules: state.progress.modules });
    } else if (act === 'seg') {
      ev.preventDefault();
      const mode = btn.dataset.mode;
      const wrap = btn.closest('.compare') || doc.querySelector('.compare');
      if (!wrap) return;
      wrap.classList.remove('hide-a', 'hide-b');
      if (mode === 'hide-a') wrap.classList.add('hide-a');
      if (mode === 'hide-b') wrap.classList.add('hide-b');
      btn.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === btn));
    }
  }

  function toastLocal(msg) {
    let el = doc.getElementById('fy-toast');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'fy-toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:9999;background:#1c2430;color:#fff;padding:8px 16px;border-radius:9px;font-size:13px;font-family:system-ui,sans-serif;opacity:0;transition:.2s';
      doc.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1400);
  }

  /* -------------------------------------------------------------- 选区 */
  function selectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!doc.body.contains(range.commonAncestorContainer)) return null;
    const text = range.toString().replace(/\s+\n/g, '\n').trim();
    if (!text || text.length > 1200) return null;
    const a = offsetOf(range.startContainer, range.startOffset);
    const b = offsetOf(range.endContainer, range.endOffset);
    const p = proj();
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const rect = range.getBoundingClientRect();
    return {
      text,
      anchor: {
        start,
        end,
        quote: p.text.slice(start, end),
        prefix: p.text.slice(Math.max(0, start - 24), start),
        suffix: p.text.slice(end, end + 24),
      },
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, bottom: rect.bottom },
    };
  }

  function emitSelection() {
    const info = selectionInfo();
    if (!info) return;
    state.lastSel = info.text;
    hostCall('onSelection', info);
  }

  function clearSelectionUi() {
    hostCall('onSelectionClear');
  }

  function onSelChange() {
    clearTimeout(state.selTimer);
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      if (Date.now() > state.suppressUntil) clearSelectionUi();
      return;
    }
    state.selTimer = setTimeout(emitSelection, 140);
  }

  /* 长按：选中光标下的句子（中文到标点，英文到词边界） */
  function longPressSelect(x, y) {
    let range = null;
    if (doc.caretRangeFromPoint) range = doc.caretRangeFromPoint(x, y);
    else if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range || !range.startContainer || range.startContainer.nodeType !== 3) return false;
    const node = range.startContainer;
    const text = node.nodeValue;
    const off = range.startOffset;
    const isCJK = /[\u4e00-\u9fa5]/.test(text);
    let a = off;
    let b = off;
    if (isCJK) {
      const stop = /[。！？；：\n]/;
      while (a > 0 && !stop.test(text[a - 1]) && off - a < 80) a--;
      while (b < text.length && !stop.test(text[b]) && b - off < 80) b++;
      if (b < text.length) b++;
    } else {
      const word = /[A-Za-z0-9'-]/;
      while (a > 0 && word.test(text[a - 1])) a--;
      while (b < text.length && word.test(text[b])) b++;
    }
    if (b <= a) return false;
    const r = doc.createRange();
    r.setStart(node, a);
    r.setEnd(node, b);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    state.suppressUntil = Date.now() + 400;
    setTimeout(emitSelection, 30);
    return true;
  }

  /* 点击已有批注 */
  function noteAtPoint(x, y) {
    let off = null;
    if (doc.caretRangeFromPoint) {
      const r = doc.caretRangeFromPoint(x, y);
      if (r) off = offsetOf(r.startContainer, r.startOffset);
    }
    if (off == null) return '';
    for (const it of state.notes) {
      if (it._orphan) continue;
      const a = it.anchor || {};
      if (off >= a.start && off <= a.end) return it.id;
    }
    return '';
  }

  /* -------------------------------------------------------------- 滚动与分区 */
  function sectionEl(id) {
    if (!id) return null;
    return doc.getElementById(id) || doc.querySelector(`[data-section="${id}"]`);
  }

  function currentSection() {
    if (!state.sections.length) return '';
    const top = window.scrollY + 110;
    let cur = state.sections[0].id;
    for (const s of state.sections) {
      const el = sectionEl(s.id);
      if (!el) continue;
      const y = el.getBoundingClientRect().top + window.scrollY;
      if (y <= top) cur = s.id;
    }
    return cur;
  }

  let lastSection = '';
  let scrollTimer = 0;
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const cur = currentSection();
      if (cur && cur !== lastSection) {
        lastSection = cur;
        hostCall('onSectionChange', cur);
      }
      const h = doc.documentElement.scrollHeight - window.innerHeight;
      const pct = h > 0 ? Math.min(1, window.scrollY / h) : 0;
      hostCall('onScroll', { pct, y: window.scrollY, section: cur });
    }, 90);
  }

  /* -------------------------------------------------------------- 宿主回调 */
  function hostCall(name, payload) {
    try {
      if (state.host && typeof state.host[name] === 'function') state.host[name](payload);
    } catch (e) {
      console.warn('[fuyan] host callback failed:', name, e);
    }
  }

  /* -------------------------------------------------------------- 对外 API */
  const api = {
    goto(id) {
      const el = sectionEl(id);
      if (!el) return false;
      const y = el.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
      return true;
    },
    gotoElement(id) {
      const el = doc.getElementById(id);
      if (!el) return false;
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
      el.classList.add('fy-flash');
      setTimeout(() => el.classList.remove('fy-flash'), 1600);
      return true;
    },
    setSections(list) {
      state.sections = list || [];
      lastSection = currentSection();
    },
    setNotes(items) {
      state.notes = (items || []).map((x) => ({ ...x }));
      invalidate();
      renderNotes();
      return state.notes.filter((x) => x._orphan).map((x) => x.id);
    },
    setProgress(p) {
      state.progress = p || null;
      applyMastered();
    },
    focusNote(id) {
      return focusNote(id);
    },
    clearActiveNote() {
      state.activeNote = '';
      renderNotes();
    },
    setHomeProgress(text) {
      const el = doc.getElementById('home-progress');
      if (el) el.textContent = text || '';
    },
    setMeta(meta) {
      meta = meta || {};
      if (meta.quizTotal != null) {
        const q = doc.getElementById('home-qn');
        if (q) q.textContent = String(meta.quizTotal);
        const f = doc.getElementById('foot-n');
        if (f) f.textContent = String(meta.quizTotal);
      }
      if (meta.counts) {
        for (const [anchor, n] of Object.entries(meta.counts)) {
          const el = doc.getElementById('n-' + anchor);
          if (el && n != null) el.textContent = String(n);
        }
      }
    },
    index() {
      const out = [];
      const seen = new Set();
      // 章节
      const secEls = state.sections.length
        ? state.sections.map((s) => ({ id: s.id, title: s.title }))
        : [...doc.querySelectorAll('section[id],article[id]')].map((el) => ({ id: el.id, title: (el.querySelector('h1,h2,h3') || el).textContent.trim().slice(0, 60) }));
      for (const s of secEls) {
        const el = sectionEl(s.id);
        if (!el || seen.has(s.id)) continue;
        seen.add(s.id);
        out.push({ kind: 'section', id: s.id, sectionId: s.id, title: s.title, text: (el.textContent || '').replace(/\s+/g, ' ').trim() });
      }
      // 小节标题
      doc.querySelectorAll('h2[id],h3[id],h4[id]').forEach((h) => {
        if (seen.has(h.id)) return;
        seen.add(h.id);
        let text = '';
        let cur = h.nextElementSibling;
        let guard = 0;
        while (cur && guard < 4) {
          text += ' ' + (cur.textContent || '');
          if (text.length > 400) break;
          cur = cur.nextElementSibling;
          guard++;
        }
        out.push({ kind: 'heading', id: h.id, sectionId: h.closest('section[id],article[id]') ? h.closest('section[id],article[id]').id : '', title: h.textContent.trim(), text: text.replace(/\s+/g, ' ').trim() });
      });
      return out;
    },
    scrollTop() { return window.scrollY; },
    scrollToY(y) { window.scrollTo({ top: y || 0 }); },
    currentSection() { return currentSection(); },
    selectText(query, noScroll) {
      // 简单实现：在正文里找第一处并选中
      const p = proj();
      const i = p.text.indexOf(query);
      if (i < 0) return false;
      const r = rangeOf(i, i + query.length);
      if (!r) return false;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      if (!noScroll) {
        const rect = r.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - window.innerHeight * 0.35), behavior: 'auto' });
      }
      return true;
    },
    textLength() { return proj().text.length; },
  };

  /* -------------------------------------------------------------- 初始化 */
  function init() {
    ensureHighlights();
    bindQa(doc.body);
    bindFlips(doc.body);
    applyMastered();

    doc.addEventListener('click', onAction, true);

    doc.addEventListener('mouseup', (e) => {
      if (e.target.closest('[data-act],button,a,.mark')) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) emitSelection();
        else {
          const id = noteAtPoint(e.clientX, e.clientY);
          if (id) hostCall('onAnnotationClick', id);
        }
      }, 10);
    });

    doc.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('[data-act],button,a,.mark')) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      const onMove = (ev) => {
        if (Math.abs(ev.clientX - sx) > 6 || Math.abs(ev.clientY - sy) > 6) moved = true;
      };
      const timer = setTimeout(() => {
        doc.removeEventListener('mousemove', onMove);
        if (moved) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        longPressSelect(sx, sy);
      }, 620);
      const cancel = () => {
        clearTimeout(timer);
        doc.removeEventListener('mousemove', onMove);
        doc.removeEventListener('mouseup', cancel);
      };
      doc.addEventListener('mousemove', onMove);
      doc.addEventListener('mouseup', cancel, { once: true });
    });

    doc.addEventListener('selectionchange', onSelChange);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { state.proj = null; });
    // 翻转/展开会改变可见文字，投影缓存失效
    doc.addEventListener('click', () => setTimeout(invalidate, 30));
    doc.addEventListener('toggle', () => setTimeout(invalidate, 30), true);

    state.proj = null;
    window.__fuyan.ready = true;
    doc.dispatchEvent(new Event('fuyan:ready'));
  }

  window.__fuyan = {
    ready: false,
    api,
    state,
    _internals: { buildProjection, offsetOf, rangeOf, renderNotes, emitSelection },
  };
  // host 由外层页面注入：必须落到 state.host 上，hostCall 才找得到
  Object.defineProperty(window.__fuyan, 'host', {
    get() { return state.host; },
    set(v) { state.host = v; },
    configurable: true,
  });

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
