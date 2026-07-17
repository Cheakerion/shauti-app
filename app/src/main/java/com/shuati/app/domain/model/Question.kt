package com.shuati.app.domain.model

/** 落库后的题目（含 id 与库内序号），刷题页使用 */
data class Question(
    val id: String,
    val bankId: String,
    /** 1-based 库内序号 */
    val idx: Int,
    val type: QuestionType,
    val localNum: Int? = null,
    val stem: String,
    val engStem: String? = null,
    val options: List<Option> = emptyList(),
    val answer: String,
    val explanation: String? = null,
)

/** 题库 */
data class QuestionBank(
    val id: String,
    val title: String,
    val fileName: String,
    val totalCount: Int,
    val createdAt: Long,
)
