// ============================================================
// Markdown 题库解析器 — 兼容微信篡改
// ============================================================
import type { ParseResult, Option, QuestionType } from './types';

export function parseMarkdownBank(markdown: string): ParseResult {
  let title = '未命名题库';
  const fm = markdown.match(/^---\s*\ntitle:\s*(.+)/);
  if (fm) title = fm[1].trim();
  else { const h = markdown.match(/^#\s+(.+)/m); if (h) title = h[1].trim(); }

  // WeChat-tolerant answer section detection
  // Accept: ## 答案, ##答案, ## 答案:, ## Answers, etc.
  const hasAnswerTable = /^##\s*答案/m.test(markdown);
  if (hasAnswerTable) return parseSplitFormat(markdown, title);
  return parseInlineFormat(markdown, title);
}

// ============================================================
// 分离式格式（题目和答案分开）
// 核心策略：用 ## 答案 作为锚点分割，忽略微信添加的垃圾标题
// ============================================================
function parseSplitFormat(markdown: string, title: string): ParseResult {
  const allQuestions: ParseResult['questions'] = [];

  // 按 ## 答案 分割（用更宽容的正则，兼容微信可能修改的格式）
  const rawBlocks = markdown.split(/^(?=##\s*答案)/m);

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i];

    if (i === 0) {
      // 第一个模块的题目
      const table = extractAnswerTable(rawBlocks[1] || '');
      if (table.size > 0) {
        const qs = parseSplitQuestions(block);
        for (const q of qs) {
          const ans = q.localNum != null ? table.get(q.localNum) : undefined;
          if (ans) { q.answer = ans; allQuestions.push(q); }
        }
      }
    } else {
      const content = block.replace(/^##\s*答案\s*/, '').trim();
      const tableEnd = findTableEnd(content);
      const questionText = content.slice(tableEnd);

      // Answer table for THIS module is in the NEXT rawBlock (i+1)
      const table = extractAnswerTable(rawBlocks[i + 1] || '');

      if (questionText.trim() && table.size > 0) {
        const qs = parseSplitQuestions(questionText);
        for (const q of qs) {
          const ans = q.localNum != null ? table.get(q.localNum) : undefined;
          if (ans) { q.answer = ans; allQuestions.push(q); }
        }
      }
    }
  }

  return { title, questions: allQuestions };
}

/** 在文本中找到答案表格结束的位置 */
function findTableEnd(text: string): number {
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

/** 解析答案表格 */
function parseAnswerTable(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|/);
    if (m) map.set(parseInt(m[1]), m[2].trim());
  }
  return map;
}

/** 从 rawBlocks[1] 提取答案表 */
function extractAnswerTable(block: string): Map<number, string> {
  if (!block) return new Map();
  const content = block.replace(/^##\s*答案\s*/, '').trim();
  const idx = findTableEnd(content);
  return parseAnswerTable(content.slice(0, idx));
}

/** 解析所有题目（跳过微信添加的标题/附录等） */
function parseSplitQuestions(text: string): ParseResult['questions'] {
  const results: ParseResult['questions'] = [];
  const lines = text.split('\n');
  const qRegex = /\*\*(\d+)[\.\s]/;
  let i = 0;
  let currentType: QuestionType = 'choice';

  while (i < lines.length) {
    // 检测区块标题切换题型
    const sectionType = detectSectionType(lines[i]);
    if (sectionType !== null) { currentType = sectionType; i++; continue; }

    if (!lines[i].match(qRegex)) { i++; continue; }

    const match = lines[i].match(qRegex)!;
    const localNum = parseInt(match[1]);
    const stemPart = lines[i].replace(/^\*\*\d+\.?\*?\*\s*/, '').replace(/\*\*\s*$/, '').trim();
    const stemLines: string[] = [];
    if (stemPart) stemLines.push(stemPart);

    const options: Option[] = [];
    let currentAnswer = '';
    let currentExplanation = '';
    let currentEngStem = '';
    let inExplanation = false;
    i++;

    while (i < lines.length) {
      const line = lines[i];
      if (line.match(qRegex)) break; // next question
      // 区块标题也中止当前题
      if (detectSectionType(line)) break;

      const t = line.trim();
      if (/^#{1,3}\s/.test(t) || /^---+$/.test(t) || /^>/.test(t) || /^\|/.test(t)) {
        i++; continue;
      }

      // 英文术语（可选）
      const engMatch = t.match(/^英文\s*[:：]\s*(.+)/);
      if (engMatch) {
        currentEngStem = engMatch[1].trim();
        i++; continue;
      }

      // WeChat inline answer（兼容任意文本答案，不限于 A-E）
      const inlineAns = t.match(/^\*\*(?:(?:正确)?答案|Answer)\s*[:：]\s*(.+)\s*\*\*$/i);
      if (inlineAns) {
        currentAnswer = inlineAns[1].trim();
        i++; continue;
      }

      // 解析（支持多行，支持 WeChat 粗体格式）
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
        inExplanation = false; // 解析通常在选项后，若后又出现选项则停止解析收集
        i++; continue;
      }

      if (t) stemLines.push(t);
      i++;
    }

    const stem = stemLines.join('\n').trim();
    // 选择题必须有选项；文本题有 stem+answer 即可
    const isChoice = currentType === 'choice';
    const valid = stem && (isChoice ? options.length > 0 : !!currentAnswer);
    if (valid) {
      results.push({
        index: 0, localNum, stem, options, answer: currentAnswer,
        explanation: currentExplanation || undefined, type: currentType,
        engStem: currentEngStem || undefined,
      } as any);
    }
  }

  return results;
}

// ============================================================
// 行内答案格式
// ============================================================
function parseInlineFormat(markdown: string, title: string): ParseResult {
  const lines = markdown.split('\n');
  const questions: ParseResult['questions'] = [];
  let i = 0;
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++;
  }
  const blocks: string[][] = [];
  const blockTypes: QuestionType[] = [];
  let cur: string[] = [];
  let currentType: QuestionType = 'choice';

  for (; i < lines.length; i++) {
    // 检测题型区块标题
    const sectionType = detectSectionType(lines[i]);
    if (sectionType !== null) {
      // 保存当前累积的 block
      if (cur.length > 0) { blocks.push(cur); blockTypes.push(currentType); cur = []; }
      currentType = sectionType;
      continue;
    }
    if (/^---+$/.test(lines[i].trim())) {
      if (cur.length > 0) { blocks.push(cur); blockTypes.push(currentType); cur = []; }
    } else { cur.push(lines[i]); }
  }
  if (cur.length > 0) { blocks.push(cur); blockTypes.push(currentType); }

  for (let j = 0; j < blocks.length; j++) {
    const q = parseInlineBlock(blocks[j], blockTypes[j]);
    if (q) questions.push(q);
  }
  return { title, questions };
}

function parseInlineBlock(lines: string[], qType: QuestionType = 'choice'): ParseResult['questions'][number] | null {
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return null;
  const stemLines: string[] = [];
  const options: Option[] = [];
  let answer = '', explanation = '', engStem = '', inOpts = false, inExp = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    // 英文术语（可选）
    const engMatch = line.match(/^英文\s*[:：]\s*(.+)/);
    if (engMatch) { engStem = engMatch[1].trim(); continue; }
    // 兼容微信粗体：**解析：** 或 **解析:** 都能匹配
    const expMatch = line.match(/^(?:\*\*)?解析\s*[:：](?:\*\*)?\s*(.*)/);
    if (expMatch) { inExp = true; inOpts = false; explanation = expMatch[1].trim(); continue; }
    if (inExp) { explanation += '\n' + line; continue; }
    // 兼容微信粗体：**正确答案: X** 或 **答案：X**
    const ansMatch = line.match(/^(?:\*\*)?(?:正确)?答案\s*[:：]\s*(.+?)(?:\*\*)?$/i);
    if (ansMatch) { answer = ansMatch[1].trim(); inOpts = false; continue; }
    const om = line.match(/^([A-E])\s*[.、)]\s*(.+)/);
    if (om) { inOpts = true; options.push({ label: om[1], text: om[2].trim() }); continue; }
    if (!inOpts) stemLines.push(line.replace(/^\d+\s*[.、)）]\s*/, '').replace(/^\*\*\d+\.?\*\s*/, ''));
  }
  const stem = stemLines.join('\n').trim();
  if (!stem || !answer) return null;
  return { index: 0, stem, options, answer, explanation: explanation || undefined, type: qType, engStem: engStem || undefined } as any;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ============================================================
// 题型区块标题检测（兼容微信格式）
// ============================================================

const SECTION_PATTERNS: [RegExp, QuestionType][] = [
  [/^##\s*(选择|单选题|多选题)/, 'choice'],
  [/^##\s*名词解释/, 'explain'],
  [/^##\s*(简答|问答)/, 'short_answer'],
];

function detectSectionType(line: string): QuestionType | null {
  const t = line.trim();
  for (const [re, qType] of SECTION_PATTERNS) {
    if (re.test(t)) return qType;
  }
  return null;
}
