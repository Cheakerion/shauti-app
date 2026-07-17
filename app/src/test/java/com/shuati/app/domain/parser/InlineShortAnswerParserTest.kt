package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 二、行内格式 — 简答题。移植自 parser.test.ts describe('行内格式 — 简答题') */
class InlineShortAnswerParserTest {

    private val md = """
        ---
        title: 测试简答题
        ---

        ## 简答题

        1. 简述给水卫生的水源选择原则
        正确答案: 一、水源选择三原则：水量充足、水质良好、便于卫生防护。
        解析: 来源：环境卫生学课件知识点。

        ---

        2. 简述介水传染病的定义及流行特点
        正确答案: 以水为介质，病原体污染水源引起的传染病。暴发流行、控制水源即控制流行。
        解析: 包含定义和四个流行特点。
    """.trimIndent()

    private val result = MarkdownParser.parse(md)

    @Test
    fun `简答题也被正确解析`() {
        assertEquals(2, result.questions.size)
    }

    @Test
    fun `简答题没有选项只有答案`() {
        for (q in result.questions) {
            assertTrue(q.stem.isNotEmpty())
            assertTrue(q.answer.isNotEmpty())
            assertTrue(q.options.isEmpty())
        }
    }

    @Test
    fun `第一题答案内容正确`() {
        assertTrue(result.questions[0].stem.contains("给水卫生"))
        assertTrue(result.questions[0].answer.contains("水源选择三原则"))
        assertTrue(result.questions[0].explanation!!.contains("环境卫生学"))
    }
}
