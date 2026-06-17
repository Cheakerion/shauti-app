// ============================================================
// Markdown 题库解析器
// 支持两种格式：行内答案格式 和 末尾答案表格式
// ============================================================
import type { ParseResult, Option } from './types';

export function parseMarkdownBank(markdown: string): ParseResult {
  // 1. 提取标题
  let title = '未命名题库';
  const frontmatterMatch = markdown.match(/^---\s*\ntitle:\s*(.+)/);
  if (frontmatterMatch) {
    title = frontmatterMatch[1].trim();
  } else {
    const h1Match = markdown.match(/^#\s+(.+)/m);
    if (h1Match) title = h1Match[1].trim();
  }

  // 2. 判断格式：有没有末尾答案表？
  if (/^##\s*答案\s*$/m.test(markdown)) {
    return parseSplitFormat(markdown, title);
  }
  return parseInlineFormat(markdown, title);
}

// ============================================================
// 格式 B：题目和答案分开（卫生学题库格式）
// 按模块拆分，每个模块有独立的编号和答案表
// ============================================================
function parseSplitFormat(markdown: string, title: string): ParseResult {
  const allQuestions: ParseResult['questions'] = [];

  // 按 `## 答案` 分割。每个 ## 答案 后面紧跟一个答案表，
  // 答案表之后（下一个 ## 答案之前）是该模块后的题目区。
  // rawBlocks[0] = 第一个模块的题目（无前置答案表）
  // rawBlocks[1..n-1] = ## 答案 + 答案表 + 可选：下一个模块的题目
  const rawBlocks = markdown.split(/(?=^##\s*答案\s*$)/m);

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i];

    if (i === 0) {
      // 第一段：纯题目（第一个模块），答案表在 rawBlocks[1] 里
      const answerTable = extractAnswerTable(rawBlocks[1] || '');
      if (answerTable.size > 0) {
        const qs = parseSplitQuestions(block);
        for (const q of qs) {
          const ans = answerTable.get(q.localNum);
          if (ans) { q.answer = ans; allQuestions.push(q); }
        }
      }
    } else {
      // 后面的段：## 答案 + 答案表 + 可能的下个模块题目
      const content = block.replace(/^##\s*答案\s*/, '').trim();
      // 找出答案表结束的位置（表格后面的空行之后）
      const tableEndIdx = findTableEnd(content);
      const answerTableText = content.slice(0, tableEndIdx);
      const questionText = content.slice(tableEndIdx);

      // 提取当前段的答案表
      const answerTable = parseAnswerTable(answerTableText);

      // 提取当前段后面的题目（下一个模块）
      if (questionText.trim() && answerTable.size > 0) {
        const qs = parseSplitQuestions(questionText);
        for (const q of qs) {
          const ans = answerTable.get(q.localNum);
          if (ans) { q.answer = ans; allQuestions.push(q); }
        }
      }
    }
  }

  return { title, questions: allQuestions };
}

/** 找到答案表结束的位置（表格后面的空行或下一个标题之前） */
function findTableEnd(text: string): number {
  const lines = text.split('\n');
  let lastTableLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|/.test(lines[i])) lastTableLine = i;
  }
  // 表格结束后的下一行
  if (lastTableLine >= 0 && lastTableLine < lines.length - 1) {
    // 找到表格后第一个非空行
    for (let i = lastTableLine + 1; i < lines.length; i++) {
      if (lines[i].trim() !== '') {
        return lines.slice(0, i).join('\n').length;
      }
    }
    return text.length;
  }
  // 如果没找到表格行，返回 0
  return 0;
}

/** 从文本中提取答案表 */
function parseAnswerTable(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*([A-Ea-e]+)\s*\|/);
    if (m) map.set(parseInt(m[1]), m[2].toUpperCase());
  }
  return map;
}

/** 提取纯答案表（用于 i===0 的情况，从 rawBlocks[1] 获取） */
function extractAnswerTable(block: string): Map<number, string> {
  if (!block) return new Map();
  const content = block.replace(/^##\s*答案\s*/, '').trim();
  const tableEndIdx = findTableEnd(content);
  const tableText = content.slice(0, tableEndIdx);
  return parseAnswerTable(tableText);
}

interface RawQuestion {
  localNum: number;
  index: number;
  stem: string;
  options: Option[];
  answer: string;
}

/** 从一段题目文本中解析所有题目 */
function parseSplitQuestions(text: string): RawQuestion[] {
  const results: RawQuestion[] = [];

  // 支持两种题号格式：
  // **1.** text  （环境/劳动模块）
  // **1. text**  （营养模块，整行加粗）
  // 也支持 **1** 不带点
  const qStartRegex = /\*\*(\d+)[\.\s]/;
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(qStartRegex);
    if (!match) { i++; continue; }

    const num = parseInt(match[1]);
    const textAfterNum = lines[i].replace(/^\*\*\d+\.?\*\?\*\s*/, '').replace(/\*\*\s*$/, '').trim();

    const stemLines: string[] = [];
    if (textAfterNum) stemLines.push(textAfterNum);

    const options: Option[] = [];
    i++;

    // 收集题干和选项
    while (i < lines.length) {
      const line = lines[i];
      // 下一题或分隔符 → 停止
      if (line.match(qStartRegex)) break;
      if (/^#{1,3}\s/.test(line)) { i++; continue; }
      if (/^---+$/.test(line.trim())) { i++; continue; }

      const optMatch = line.trim().match(/^([A-E])\s*[.、)]\s*(.+)/);
      if (optMatch) {
        options.push({ label: optMatch[1], text: optMatch[2].trim() });
        i++;
        continue;
      }

      // 不是选项 → 属于题干
      const t = line.trim();
      if (t && !/^>/.test(t)) {
        stemLines.push(t);
      }
      i++;
    }

    const stem = stemLines.join('\n').trim();
    if (stem && options.length > 0) {
      results.push({ localNum: num, index: 0, stem, options, answer: '' });
    }
  }

  return results;
}

// ============================================================
// 格式 A：题目内包含"正确答案:"（原有格式）
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
  let current: string[] = [];
  for (; i < lines.length; i++) {
    if (/^---+$/.test(lines[i].trim())) {
      if (current.length > 0) { blocks.push(current); current = []; }
    } else {
      current.push(lines[i]);
    }
  }
  if (current.length > 0) blocks.push(current);

  for (const block of blocks) {
    const q = parseInlineBlock(block);
    if (q) questions.push(q);
  }

  return { title, questions };
}

function parseInlineBlock(lines: string[]): ParseResult['questions'][number] | null {
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return null;

  const stemLines: string[] = [];
  const options: Option[] = [];
  let answer = '';
  let explanation = '';
  let inOptions = false;
  let inExplanation = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') continue;

    if (/^解析\s*[:：]/.test(line)) {
      inExplanation = true; inOptions = false;
      explanation = line.replace(/^解析\s*[:：]\s*/, '');
      continue;
    }
    if (inExplanation) { explanation += '\n' + line; continue; }

    if (/^(正确)?答案\s*[:：]/.test(line)) {
      answer = line.replace(/^(正确)?答案\s*[:：]\s*/, '').trim();
      inOptions = false;
      continue;
    }

    const optMatch = line.match(/^([A-E])\s*[.、)]\s*(.+)/);
    if (optMatch) {
      inOptions = true;
      options.push({ label: optMatch[1], text: optMatch[2].trim() });
      continue;
    }

    if (!inOptions) {
      const stemLine = line.replace(/^\d+\s*[.、)）]\s*/, '').replace(/^\*\*\d+\.?\*\s*/, '');
      stemLines.push(stemLine);
    }
  }

  const stem = stemLines.join('\n').trim();
  if (!stem || !answer) return null;

  return { index: 0, stem, options, answer, explanation: explanation || undefined };
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
