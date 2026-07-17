package com.shuati.app.ui.quiz.core

import com.shuati.app.domain.model.QuestionType

/**
 * 刷题页面类型：决定路由、会话 key、加载的题型集合。
 * 一个「题库 × PageType」对应一份独立会话进度（对齐旧版 localStorage key 设计）。
 */
enum class PageType(val key: String, val label: String) {
    CHOICE("choice", "选择题"),
    MULTI_CHOICE("multi_choice", "不定项选择"),
    TRUE_FALSE("true_false", "判断题"),
    EXPLAIN("explain", "名词解释"),
    SHORT_ANSWER("short_answer", "简答题"),
    FILL_BLANK("fill_blank", "填空题");

    fun routeFor(bankId: String): String = when (this) {
        CHOICE -> "choice/$bankId"
        MULTI_CHOICE -> "multi/$bankId"
        TRUE_FALSE -> "truefalse/$bankId"
        EXPLAIN -> "text/$bankId/explain"
        SHORT_ANSWER -> "text/$bankId/short_answer"
        FILL_BLANK -> "fill/$bankId"
    }

    /** 该页面加载的题型集合（不定项页兼收单选题，与旧版有意行为一致） */
    val loadTypes: List<QuestionType>
        get() = when (this) {
            CHOICE -> listOf(QuestionType.CHOICE)
            MULTI_CHOICE -> listOf(QuestionType.MULTI_CHOICE, QuestionType.CHOICE)
            TRUE_FALSE -> listOf(QuestionType.TRUE_FALSE)
            EXPLAIN -> listOf(QuestionType.EXPLAIN)
            SHORT_ANSWER -> listOf(QuestionType.SHORT_ANSWER)
            FILL_BLANK -> listOf(QuestionType.FILL_BLANK)
        }

    companion object {
        /**
         * 题库包含的题型 → 可进入的页面列表（按旧版路由优先级排序，填空题殿后）。
         * 含 multi_choice 时提供「不定项选择」页；同时含 choice 时两页都给（修复旧版只进一页的缺陷）。
         */
        fun pagesFor(types: Set<QuestionType>): List<PageType> = buildList {
            if (QuestionType.EXPLAIN in types) add(EXPLAIN)
            if (QuestionType.SHORT_ANSWER in types) add(SHORT_ANSWER)
            if (QuestionType.MULTI_CHOICE in types) add(MULTI_CHOICE)
            if (QuestionType.CHOICE in types) add(CHOICE)
            if (QuestionType.TRUE_FALSE in types) add(TRUE_FALSE)
            if (QuestionType.FILL_BLANK in types) add(FILL_BLANK)
        }
    }
}

/** 题型标签（首页卡片「题型: 选择题+判断题」用） */
fun QuestionType.label(): String = when (this) {
    QuestionType.CHOICE -> "选择题"
    QuestionType.MULTI_CHOICE -> "不定项选择"
    QuestionType.TRUE_FALSE -> "判断题"
    QuestionType.EXPLAIN -> "名词解释"
    QuestionType.SHORT_ANSWER -> "简答题"
    QuestionType.FILL_BLANK -> "填空题"
}
