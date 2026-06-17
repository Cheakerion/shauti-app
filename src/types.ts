// ============================================================
// 类型定义
// ============================================================

/** 单个选项 */
export interface Option {
  label: string; // A, B, C, D, E
  text: string;  // 选项内容
}

/** 一道题目 */
export interface Question {
  id: string;            // 唯一 ID（导入时自动生成）
  bankId: string;        // 所属题库 ID
  index: number;         // 题库内序号（1-based）
  localNum?: number;     // 解析时使用的题号（split-format 中各模块独立编号）
  stem: string;          // 题干（支持多行）
  options: Option[];     // 选项列表
  answer: string;        // 正确答案，如 "D" 或填空题答案文本
  explanation?: string;  // 解析（可选）
}

/** 题库元数据 */
export interface QuestionBank {
  id: string;          // 唯一 ID
  title: string;       // 题库名称（从 markdown frontmatter 读取或文件名）
  fileName: string;    // 原始文件名
  totalCount: number;  // 总题数
  createdAt: number;   // 导入时间戳
  lastScore?: {        // 最近一次成绩
    correct: number;
    total: number;
    date: number;
  };
}

/** 答题记录 */
export interface AnswerRecord {
  id?: number;          // 自增主键
  questionId: string;   // 题目 ID
  bankId: string;       // 题库 ID
  userAnswer: string;   // 用户选择的答案
  isCorrect: boolean;   // 是否正确
  timestamp: number;    // 答题时间
}

/** 题库导入的 markdown 解析结果 */
export interface ParseResult {
  title: string;
  questions: Omit<Question, 'id' | 'bankId'>[];
}

/** 刷题模式 */
export type QuizMode = 'sequential' | 'random';
