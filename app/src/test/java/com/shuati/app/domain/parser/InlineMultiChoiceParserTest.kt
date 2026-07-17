package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 行内格式 — 不定项选择题。移植自 parser.test.ts describe('行内格式 — 不定项选择题') */
class InlineMultiChoiceParserTest {

    private val md = """
        ---
        title: 测试不定项选择
        ---

        ## 不定项选择题

        1. 以下哪些是心血管疾病的危险因素？
        A. 高血压
        B. 高脂血症
        C. 规律运动
        D. 吸烟
        E. 适量饮酒
        正确答案: ABD
        解析: 高血压、高脂血症、吸烟是心血管疾病的明确危险因素。

        ---

        2. 慢性心力衰竭的治疗药物包括？
        A. ACEI
        B. β受体阻滞剂
        C. 利尿剂
        D. 钙剂
        正确答案: ABC
    """.trimIndent()

    private val result = MarkdownParser.parse(md)

    @Test
    fun `不定项选择题被正确识别`() {
        assertEquals(2, result.questions.size)
        assertEquals(com.shuati.app.domain.model.QuestionType.MULTI_CHOICE, result.questions[0].type)
        assertEquals(com.shuati.app.domain.model.QuestionType.MULTI_CHOICE, result.questions[1].type)
    }

    @Test
    fun `答案被标准化排序`() {
        assertEquals("ABD", result.questions[0].answer)
        assertEquals("ABC", result.questions[1].answer)
    }

    @Test
    fun `每题有选项`() {
        assertEquals(5, result.questions[0].options.size)
        assertEquals(4, result.questions[1].options.size)
    }

    @Test
    fun `解析正确提取`() {
        assertTrue(result.questions[0].explanation!!.contains("高血压、高脂血症、吸烟"))
    }

    @Test
    fun `答案乱序输入也被标准化`() {
        val md2 = """
            ---
            title: 测试
            ---

            ## 不定项选择题

            1. 测试题
            A. A
            B. B
            C. C
            D. D
            正确答案: C A B
        """.trimIndent()
        val r = MarkdownParser.parse(md2)
        assertEquals("ABC", r.questions[0].answer)
    }

    @Test
    fun `答案去重`() {
        val md2 = """
            ---
            title: 测试
            ---

            ## 不定项选择题

            1. 测试题
            A. A
            B. B
            C. C
            正确答案: A A B
        """.trimIndent()
        val r = MarkdownParser.parse(md2)
        assertEquals("AB", r.questions[0].answer)
    }
}
