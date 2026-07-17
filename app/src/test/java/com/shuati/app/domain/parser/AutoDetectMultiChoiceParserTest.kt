package com.shuati.app.domain.parser

import com.shuati.app.domain.model.QuestionType
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 自动检测多选：`## 选择题` 区块（或无区块默认 choice）下答案含 ≥2 个 A-E 字母时，
 * 自动升级为 multi_choice（对应旧版 detectMultiAnswer 行为，CLAUDE.md 有明确说明）
 */
class AutoDetectMultiChoiceParserTest {

    @Test
    fun `选择题区块下逗号分隔多答案自动升级为multi_choice`() {
        val md = """
            ---
            title: 测试
            ---

            ## 选择题

            1. 题目
            A. 甲
            B. 乙
            C. 丙
            D. 丁
            正确答案: A, B, C
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(QuestionType.MULTI_CHOICE, result.questions[0].type)
        assertEquals("ABC", result.questions[0].answer)
    }

    @Test
    fun `选择题区块下连写多字母答案自动升级`() {
        val md = """
            ---
            title: 测试
            ---

            ## 选择题

            1. 题目
            A. 甲
            B. 乙
            C. 丙
            D. 丁
            正确答案: ABD
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(QuestionType.MULTI_CHOICE, result.questions[0].type)
        assertEquals("ABD", result.questions[0].answer)
    }

    @Test
    fun `单字母答案保持choice类型`() {
        val md = """
            ---
            title: 测试
            ---

            ## 选择题

            1. 题目
            A. 甲
            B. 乙
            C. 丙
            D. 丁
            正确答案: C
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(QuestionType.CHOICE, result.questions[0].type)
        assertEquals("C", result.questions[0].answer)
    }

    @Test
    fun `无区块标题时多字母答案也自动升级`() {
        val md = """
            ---
            title: 测试
            ---

            1. 题目
            A. 甲
            B. 乙
            C. 丙
            正确答案: BC
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(QuestionType.MULTI_CHOICE, result.questions[0].type)
        assertEquals("BC", result.questions[0].answer)
    }
}
