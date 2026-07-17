package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 七、边界情况。移植自 parser.test.ts describe('边界情况') */
class EdgeCaseParserTest {

    @Test
    fun `空文件返回0题`() {
        val result = MarkdownParser.parse("")
        assertEquals(0, result.questions.size)
        assertEquals("未命名题库", result.title)
    }

    @Test
    fun `只有frontmatter没有题目`() {
        val md = """
            ---
            title: 空题库
            ---
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(0, result.questions.size)
    }

    @Test
    fun `题目没有答案不会被解析`() {
        val md = """
            ---
            title: 测试
            ---

            1. 只有题目没有答案
            A. A
            B. B
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(0, result.questions.size)
    }

    @Test
    fun `多行题干被正确拼接`() {
        val md = """
            ---
            title: 测试
            ---

            1. 患者男性，65岁
            既往有高血压病史10年
            现因胸痛就诊
            A. 选项A
            B. 选项B
            C. 选项C
            D. 选项D
            正确答案: A
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertTrue(result.questions[0].stem.contains("高血压病史"))
        assertTrue(result.questions[0].stem.contains("胸痛"))
    }

    @Test
    fun `多行解析被正确拼接`() {
        val md = """
            ---
            title: 测试
            ---

            1. 题目
            A. A
            B. B
            C. C
            D. D
            正确答案: B
            解析: 第一行说明
            第二行补充
            第三行总结
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        val exp = result.questions[0].explanation!!
        assertTrue(exp.contains("第一行说明"))
        assertTrue(exp.contains("第二行补充"))
        assertTrue(exp.contains("第三行总结"))
    }
}
