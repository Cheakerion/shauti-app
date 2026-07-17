package com.shuati.app.data.db.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "question_banks", indices = [Index("createdAt")])
data class BankEntity(
    @PrimaryKey val id: String,
    val title: String,
    val fileName: String,
    val totalCount: Int,
    val createdAt: Long,
)

@Entity(
    tableName = "questions",
    indices = [Index("bankId"), Index("bankId", "idx")],
)
data class QuestionEntity(
    @PrimaryKey val id: String,
    val bankId: String,
    /** 1-based 库内序号（避开 SQL 关键字 index） */
    val idx: Int,
    /** QuestionType.value 字符串 */
    val type: String,
    val localNum: Int?,
    val stem: String,
    val engStem: String?,
    /** List<Option> 的 JSON 字符串 */
    val optionsJson: String,
    val answer: String,
    val explanation: String?,
)

/** 答题记录：只增不改，一题多次作答多条记录；错题=曾有 isCorrect=false 的记录 */
@Entity(
    tableName = "answer_records",
    indices = [Index("questionId"), Index("bankId")],
)
data class AnswerRecordEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val questionId: String,
    val bankId: String,
    val userAnswer: String,
    val isCorrect: Boolean,
    val timestamp: Long,
)

/** 文本题标记（书签） */
@Entity(
    tableName = "marked_questions",
    indices = [Index("questionId"), Index("bankId")],
)
data class MarkedQuestionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val questionId: String,
    val bankId: String,
    val timestamp: Long,
)
