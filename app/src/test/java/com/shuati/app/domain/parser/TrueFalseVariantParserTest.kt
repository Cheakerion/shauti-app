package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Test

/** 判断题答案变体。移植自 parser.test.ts describe('判断题答案变体') */
class TrueFalseVariantParserTest {

    @Test
    fun `对错被标准化`() {
        val md = """
            ---
            title: 测试
            ---

            ## 判断题

            1. 题目一
            正确答案: 对

            ---

            2. 题目二
            正确答案: 错
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals("正确", result.questions[0].answer)
        assertEquals("错误", result.questions[1].answer)
    }

    @Test
    fun `勾叉符号被标准化`() {
        val md = """
            ---
            title: 测试
            ---

            ## 判断题

            1. 题目一
            正确答案: √

            ---

            2. 题目二
            正确答案: ×
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals("正确", result.questions[0].answer)
        assertEquals("错误", result.questions[1].answer)
    }

    @Test
    fun `对号错号变体被标准化`() {
        val md = """
            ---
            title: 测试
            ---

            ## 判断题

            1. 题目一
            正确答案: ✓

            ---

            2. 题目二
            正确答案: ✗
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals("正确", result.questions[0].answer)
        assertEquals("错误", result.questions[1].answer)
    }
}
