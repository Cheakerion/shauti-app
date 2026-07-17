package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 六、微信篡改容错。移植自 parser.test.ts describe('微信篡改容错') */
class WeChatToleranceParserTest {

    @Test
    fun `答案前有粗体标记仍能匹配`() {
        val md = """
            ---
            title: 测试
            ---

            1. 题目内容
            A. 选项1
            B. 选项2
            C. 选项3
            D. 选项4
            **正确答案: C**
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertEquals("C", result.questions[0].answer)
    }

    @Test
    fun `答案前缀不带正确二字也能用`() {
        val md = """
            ---
            title: 测试
            ---

            1. 题目
            A. 选A
            B. 选B
            C. 选C
            D. 选D
            答案: B
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertEquals("B", result.questions[0].answer)
    }

    @Test
    fun `解析前有粗体标记也能匹配`() {
        val md = """
            ---
            title: 测试
            ---

            1. 题目
            A. A
            B. B
            C. C
            D. D
            正确答案: D
            **解析:** 这是解析内容
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertTrue(result.questions[0].explanation!!.contains("这是解析内容"))
    }

    @Test
    fun `选项用中文顿号分隔也能识别`() {
        val md = """
            ---
            title: 测试
            ---

            1. 题目
            A、选项A
            B、选项B
            C、选项C
            D、选项D
            正确答案: C
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertEquals("选项A", result.questions[0].options[0].text)
    }

    @Test
    fun `选项用右括号也能识别`() {
        val md = """
            ---
            title: 测试
            ---

            1. 题目
            A) 选项A
            B) 选项B
            C) 选项C
            D) 选项D
            正确答案: D
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertEquals(4, result.questions[0].options.size)
    }
}
