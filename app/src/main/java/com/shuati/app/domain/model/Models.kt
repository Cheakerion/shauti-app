package com.shuati.app.domain.model

import kotlinx.serialization.Serializable

/**
 * 六种题型。value 与旧版 TS `QuestionType` 字符串一致（fill_blank 为原生版新增），
 * Room 中以 value 字符串存储。
 */
enum class QuestionType(val value: String) {
    CHOICE("choice"),
    MULTI_CHOICE("multi_choice"),
    TRUE_FALSE("true_false"),
    EXPLAIN("explain"),
    SHORT_ANSWER("short_answer"),
    FILL_BLANK("fill_blank");

    companion object {
        fun from(value: String): QuestionType =
            entries.firstOrNull { it.value == value } ?: CHOICE
    }
}

/** 选择题选项 */
@Serializable
data class Option(val label: String, val text: String)

/** 解析器产出的单道题（未落库，index 由仓库层导入时分配） */
data class ParsedQuestion(
    val stem: String,
    val options: List<Option>,
    val answer: String,
    val explanation: String? = null,
    val type: QuestionType,
    val engStem: String? = null,
    /** 分离式格式中模块内独立题号 */
    val localNum: Int? = null,
)

/** 解析结果 */
data class ParseResult(
    val title: String,
    val questions: List<ParsedQuestion>,
)
