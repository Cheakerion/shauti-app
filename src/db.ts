// ============================================================
// IndexedDB 数据库操作（Dexie）
// ============================================================
import Dexie, { type Table } from 'dexie';
import type { QuestionBank, Question, AnswerRecord } from './types';

class QuizDB extends Dexie {
  questionBanks!: Table<QuestionBank, string>;
  questions!: Table<Question, string>;
  answerRecords!: Table<AnswerRecord, number>;

  constructor() {
    super('QuizAppDB');
    this.version(1).stores({
      questionBanks: 'id, createdAt',
      questions: 'id, bankId, [bankId+index]',
      answerRecords: '++id, questionId, bankId, timestamp',
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

// ============================================================
// 答题记录操作
// ============================================================

/** 保存一条答题记录 */
export async function saveAnswerRecord(
  record: AnswerRecord
): Promise<void> {
  await db.answerRecords.put(record);
}

/** 获取某个题库的所有答错题目 ID */
export async function getWrongQuestionIds(
  bankId: string
): Promise<string[]> {
  // 获取每道题的最新答题记录，筛选出答错的
  const records = await db.answerRecords
    .where('bankId')
    .equals(bankId)
    .toArray();

  // 按题目 ID 分组，取每组最新的一条
  const latestByQuestion = new Map<string, AnswerRecord>();
  for (const r of records) {
    const existing = latestByQuestion.get(r.questionId);
    if (!existing || r.timestamp > existing.timestamp) {
      latestByQuestion.set(r.questionId, r);
    }
  }

  // 筛选答错的
  const wrongIds: string[] = [];
  for (const [qid, record] of latestByQuestion) {
    if (!record.isCorrect) {
      wrongIds.push(qid);
    }
  }
  return wrongIds;
}

/** 获取某个题库的错题 */
export async function getWrongQuestions(
  bankId: string
): Promise<Question[]> {
  const wrongIds = await getWrongQuestionIds(bankId);
  if (wrongIds.length === 0) return [];
  return db.questions.where('id').anyOf(wrongIds).toArray();
}
