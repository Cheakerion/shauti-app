// ============================================================
// IndexedDB 数据库操作（Dexie）
// ============================================================
import Dexie, { type Table } from 'dexie';
import type { QuestionBank, Question, AnswerRecord, MarkedQuestion } from './types';

class QuizDB extends Dexie {
  questionBanks!: Table<QuestionBank, string>;
  questions!: Table<Question, string>;
  answerRecords!: Table<AnswerRecord, number>;
  markedQuestions!: Table<MarkedQuestion, number>;

  constructor() {
    super('QuizAppDB');
    this.version(1).stores({
      questionBanks: 'id, createdAt',
      questions: 'id, bankId, [bankId+index]',
      answerRecords: '++id, questionId, bankId, timestamp',
    });
    this.version(2).stores({
      questionBanks: 'id, createdAt',
      questions: 'id, bankId, [bankId+index]',
      answerRecords: '++id, questionId, bankId, timestamp',
      markedQuestions: '++id, questionId, bankId, timestamp',
    });
  }
}

export const db = new QuizDB();

// ============================================================
// 题库操作
// ============================================================

/** 保存题库：写入元数据 + 批量写入题目 */
export async function saveBank(
  bank: QuestionBank,
  questions: Question[]
): Promise<void> {
  await db.transaction('rw', db.questionBanks, db.questions, async () => {
    await db.questionBanks.put(bank);
    await db.questions.bulkPut(questions);
  });
}

/** 删除题库及其所有题目和答题记录 */
export async function deleteBank(bankId: string): Promise<void> {
  await db.transaction('rw', db.questionBanks, db.questions, db.answerRecords, async () => {
    await db.questionBanks.delete(bankId);
    await db.questions.where('bankId').equals(bankId).delete();
    await db.answerRecords.where('bankId').equals(bankId).delete();
  });
}

/** 获取所有题库 */
export function getAllBanks(): Promise<QuestionBank[]> {
  return db.questionBanks.orderBy('createdAt').reverse().toArray();
}

/** 获取某个题库的所有题目 */
export function getQuestionsByBank(bankId: string): Promise<Question[]> {
  return db.questions
    .where('bankId')
    .equals(bankId)
    .sortBy('index');
}

/** 获取某个题库的题目数量 */
export async function getQuestionCount(bankId: string): Promise<number> {
  return db.questions.where('bankId').equals(bankId).count();
}

/** 获取题库包含的题型 */
export async function getBankTypes(bankId: string): Promise<string[]> {
  const questions = await db.questions.where('bankId').equals(bankId).toArray();
  const types = new Set<string>();
  for (const q of questions) {
    types.add((q as any).type || 'choice');
  }
  return [...types];
}

// ============================================================
// 答题记录操作
// ============================================================

/** 保存一条答题记录 */
export async function saveAnswerRecord(
  record: AnswerRecord
): Promise<void> {
  await db.answerRecords.put(record);
}

/** 获取某个题库的所有答错题目 ID（保留所有答错过的题，不管后来是否做对） */
export async function getWrongQuestionIds(
  bankId: string
): Promise<string[]> {
  const records = await db.answerRecords
    .where('bankId')
    .equals(bankId)
    .toArray();

  // 找出所有至少答错过一次的题目
  const wrongIds = new Set<string>();
  for (const r of records) {
    if (!r.isCorrect) wrongIds.add(r.questionId);
  }
  return [...wrongIds];
}

/** 获取某个题库的错题 */
export async function getWrongQuestions(
  bankId: string
): Promise<Question[]> {
  const wrongIds = await getWrongQuestionIds(bankId);
  if (wrongIds.length === 0) return [];
  return db.questions.where('id').anyOf(wrongIds).toArray();
}

// ============================================================
// 标记题目操作
// ============================================================

/** 标记一道题目 */
export async function markQuestion(questionId: string, bankId: string): Promise<void> {
  await db.markedQuestions.put({ questionId, bankId, timestamp: Date.now() });
}

/** 取消标记一道题目 */
export async function unmarkQuestion(questionId: string): Promise<void> {
  await db.markedQuestions.where('questionId').equals(questionId).delete();
}

/** 获取某个题库的所有标记题目 ID */
export async function getMarkedQuestionIds(bankId: string): Promise<string[]> {
  const records = await db.markedQuestions
    .where('bankId')
    .equals(bankId)
    .toArray();
  return records.map(r => r.questionId);
}

/** 清除某个题库的所有标记 */
export async function clearMarkedQuestions(bankId: string): Promise<void> {
  await db.markedQuestions.where('bankId').equals(bankId).delete();
}
