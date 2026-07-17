package com.shuati.app.domain.parser

import com.shuati.app.domain.model.QuestionType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 行内格式 — 判断题。移植自 parser.test.ts describe('行内格式 — 判断题') */
class TrueFalseParserTest {

    private val md = """
        ---
        title: 测试判断题
        ---

        ## 判断题

        1. 高血压的诊断标准是收缩压≥140mmHg和（或）舒张压≥90mmHg。
        正确答案: 正确

        ---

        2. 所有高血压患者都需要药物治疗。
        正确答案: 错误
        解析: 轻度高血压可通过生活方式干预控制。
    """.trimIndent()

    private val result = MarkdownParser.parse(md)

    @Test
    fun `判断题被正确识别`() {
        assertEquals(2, result.questions.size)
        assertEquals(QuestionType.TRUE_FALSE, result.questions[0].type)
        assertEquals(QuestionType.TRUE_FALSE, result.questions[1].type)
    }

    @Test
    fun `答案被标准化为正确或错误`() {
        assertEquals("正确", result.questions[0].answer)
        assertEquals("错误", result.questions[1].answer)
    }

    @Test
    fun `判断题没有选项`() {
        assertTrue(result.questions[0].options.isEmpty())
        assertTrue(result.questions[1].options.isEmpty())
    }

    @Test
    fun `解析正确提取`() {
        assertTrue(result.questions[1].explanation!!.contains("生活方式干预"))
    }
}
