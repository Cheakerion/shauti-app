// ============================================================
// 题库解析器调试脚本 — 与 parser.ts 逻辑保持一致
// 用法：node debug_parser.js <markdown文件路径>
// ============================================================
const fs = require('fs');

const filePath = process.argv[2];
if (!filePath) {
  console.error('用法: node debug_parser.js <markdown文件路径>');
  process.exit(1);
}

const markdown = fs.readFileSync(filePath, 'utf-8');

// ---------- 1. 提取标题 ----------
let title = '未命名题库';
const fm = markdown.match(/^---\s*\ntitle:\s*(.+)/);
if (fm) title = fm[1].trim();
else { const h = markdown.match(/^#\s+(.+)/m); if (h) title = h[1].trim(); }

// ---------- 2. 检测格式 ----------
const hasAnswerTable = /^##\s*答案/m.test(markdown);

console.log('标题:', title);
console.log('格式:', hasAnswerTable ? '分离式（## 答案）' : '行内答案式');
console.log('');

if (hasAnswerTable) {
  debugSplitFormat(markdown, title);
} else {
  debugInlineFormat(markdown, title);
}

// ============================================================
// 分离式格式调试（与 parser.ts parseSplitFormat 一致）
// ============================================================
function debugSplitFormat(markdown, title) {
  // 按 ## 答案 分割（与 parser.ts 完全一致的正则）
  const rawBlocks = markdown.split(/^(?=##\s*答案)/m);

  console.log('=== 分割结果 ===');
  console.log('rawBlocks 数量:', rawBlocks.length);
  for (let i = 0; i < rawBlocks.length; i++) {
    const preview = rawBlocks[i].slice(0, 120).replace(/\n/g, '\\n');
    console.log(`  rawBlocks[${i}]: ${preview}...`);
  }
  console.log('');

  let totalQuestions = 0;

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i];

    if (i === 0) {
      // 第一个模块：题目在 rawBlocks[0]，答案表在 rawBlocks[1]
      const table = extractAnswerTable(rawBlocks[1] || '');
      if (table.size > 0) {
        const qs = parseSplitQuestions(block);
        let matched = 0;
        for (const q of qs) {
          const ans = q.localNum != null ? table.get(q.localNum) : undefined;
          if (ans) { q.answer = ans; matched++; }
        }
        console.log(`模块 ${i}（首模块）: ${qs.length} 题, 答案匹配 ${matched}, 表大小 ${table.size}`);
        totalQuestions += matched;
      }
    } else {
      const content = block.replace(/^##\s*答案\s*/, '').trim();
      const tableEnd = findTableEnd(content);
      const questionText = content.slice(tableEnd);

      // 答案表在下一个 rawBlock
      const table = extractAnswerTable(rawBlocks[i + 1] || '');

      if (questionText.trim() && table.size > 0) {
        const qs = parseSplitQuestions(questionText);
        let matched = 0;
        for (const q of qs) {
          const ans = q.localNum != null ? table.get(q.localNum) : undefined;
          if (ans) { q.answer = ans; matched++; }
        }
        console.log(`模块 ${i}: ${qs.length} 题, 答案匹配 ${matched}, 表大小 ${table.size}`);
        totalQuestions += matched;
      }
    }
  }

  console.log(`\n总计: ${totalQuestions} 题`);
}

function findTableEnd(text) {
  const lines = text.split('\n');
  let lastTableLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*\d+\s*\|\s*[A-Ea-e]\s*\|/.test(lines[i])) lastTableLine = i;
  }
  if (lastTableLine >= 0) {
    for (let i = lastTableLine + 1; i < lines.length; i++) {
      if (lines[i].trim() !== '') {
        return lines.slice(0, i).join('\n').length;
      }
    }
    return text.length;
  }
  return 0;
}

function extractAnswerTable(block) {
  if (!block) return new Map();
  const content = block.replace(/^##\s*答案\s*/, '').trim();
  const idx = findTableEnd(content);
  return parseAnswerTable(content.slice(0, idx));
}

function parseAnswerTable(text) {
  const map = new Map();
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([A-Ea-e]+)\s*\|/);
    if (m) map.set(parseInt(m[1]), m[2].toUpperCase());
  }
  return map;
}

function parseSplitQuestions(text) {
  const results = [];
  const lines = text.split('\n');
  const qRegex = /\*\*(\d+)[\.\s]/;
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].match(qRegex)) { i++; continue; }

    const match = lines[i].match(qRegex);
    const localNum = parseInt(match[1]);
    const stemPart = lines[i].replace(/^\*\*\d+\.?\*?\*\s*/, '').replace(/\*\*\s*$/, '').trim();
    const stemLines = [];
    if (stemPart) stemLines.push(stemPart);

    const options = [];
    let currentAnswer = '';
    let currentExplanation = '';
    let inExplanation = false;
    i++;

    while (i < lines.length) {
      const line = lines[i];
      if (line.match(qRegex)) break;

      const t = line.trim();
      if (/^#{1,3}\s/.test(t) || /^---+$/.test(t) || /^>/.test(t) || /^\|/.test(t)) {
        i++; continue;
      }

      const inlineAns = t.match(/^\*\*(?:(?:正确)?答案|Answer)\s*[:：]\s*([A-Ea-e]+)\s*\*\*$/i);
      if (inlineAns) {
        currentAnswer = inlineAns[1].toUpperCase();
        i++; continue;
      }

      // 解析（支持多行）
      const expMatch = t.match(/^(?:\*\*)?解析\s*[:：](?:\*\*)?\s*(.*)/);
      if (expMatch) {
        inExplanation = true;
        currentExplanation = expMatch[1].trim();
        i++; continue;
      }
      if (inExplanation && t) {
        currentExplanation += '\n' + t;
        i++; continue;
      }

      const optMatch = t.match(/^([A-E])\s*[.、)]\s*(.+)/);
      if (optMatch) {
        options.push({ label: optMatch[1], text: optMatch[2].trim() });
        inExplanation = false;
        i++; continue;
      }

      if (t) stemLines.push(t);
      i++;
    }

    const stem = stemLines.join('\n').trim();
    if (stem && options.length > 0) {
      results.push({ index: 0, localNum, stem, options, answer: currentAnswer, explanation: currentExplanation || undefined });
    }
  }

  return results;
}

// ============================================================
// 行内答案格式调试
// ============================================================
function debugInlineFormat(markdown, title) {
  const lines = markdown.split('\n');
  const blocks = [];
  let cur = [];
  let i = 0;

  // 跳过 frontmatter
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++;
  }

  for (; i < lines.length; i++) {
    if (/^---+$/.test(lines[i].trim())) {
      if (cur.length > 0) { blocks.push(cur); cur = []; }
    } else { cur.push(lines[i]); }
  }
  if (cur.length > 0) blocks.push(cur);

  console.log('题目块数:', blocks.length);
  let count = 0;
  for (const b of blocks) {
    const q = parseInlineBlock(b);
    if (q) {
      count++;
      if (count <= 3) {
        console.log(`  题 ${count}:`, q.stem.slice(0, 60) + '...', '答案:', q.answer, '解析:', q.explanation ? '有' : '无');
      }
    }
  }
  console.log(`总计: ${count} 题`);
}

function parseInlineBlock(lines) {
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return null;
  const stemLines = [];
  const options = [];
  let answer = '', explanation = '', inOpts = false, inExp = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (/^解析\s*[:：]/.test(line)) { inExp = true; inOpts = false; explanation = line.replace(/^解析\s*[:：]\s*/, ''); continue; }
    if (inExp) { explanation += '\n' + line; continue; }
    if (/^(正确)?答案\s*[:：]/.test(line)) { answer = line.replace(/^(正确)?答案\s*[:：]\s*/, '').trim(); inOpts = false; continue; }
    const om = line.match(/^([A-E])\s*[.、)]\s*(.+)/);
    if (om) { inOpts = true; options.push({ label: om[1], text: om[2].trim() }); continue; }
    if (!inOpts) stemLines.push(line.replace(/^\d+\s*[.、)）]\s*/, '').replace(/^\*\*\d+\.?\*\s*/, ''));
  }
  const stem = stemLines.join('\n').trim();
  if (!stem || !answer) return null;
  return { index: 0, stem, options, answer, explanation: explanation || undefined };
}
