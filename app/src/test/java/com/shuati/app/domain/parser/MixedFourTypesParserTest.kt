package com.shuati.app.domain.parser

import com.shuati.app.domain.model.QuestionType
import org.junit.Assert.assertEquals
import org.junit.Test

/** 混合题型 — 包含多选和判断。移植自 parser.test.ts describe('混合题型 — 包含多选和判断') */
class MixedFourTypesParserTest {

    private val md = """
        ---
        title: 混合题库
        ---

        ## 选择题

        1. 单选题
        A. A选项
        B. B选项
        C. C选项
        D. D选项
        正确答案: A

        ---

        ## 不定项选择题

        2. 多选题
        A. 选项A
        B. 选项B
        C. 选项C
        D. 选项D
        正确答案: BCD

        ---

        ## 判断题

        3. 判断题
        正确答案: 正确

        ---

        ## 简答题

        4. 简答题
        正确答案: 这是一段答案文本
    """.trimIndent()

    private val result = MarkdownParser.parse(md)

    @Test
    fun `四种题型都被解析`() {
        assertEquals(4, result.questions.size)
    }

    @Test
    fun `第一题是choice`() {
        assertEquals(QuestionType.CHOICE, result.questions[0].type)
        assertEquals("A", result.questions[0].answer)
    }

    @Test
    fun `第二题是multi_choice`() {
        assertEquals(QuestionType.MULTI_CHOICE, result.questions[1].type)
        assertEquals("BCD", result.questions[1].answer)
    }

    @Test
    fun `第三题是true_false`() {
        assertEquals(QuestionType.TRUE_FALSE, result.questions[2].type)
        assertEquals("正确", result.questions[2].answer)
    }

    @Test
    fun `第四题是short_answer`() {
        assertEquals(QuestionType.SHORT_ANSWER, result.questions[3].type)
        assertEquals("这是一段答案文本", result.questions[3].answer)
    }
}
