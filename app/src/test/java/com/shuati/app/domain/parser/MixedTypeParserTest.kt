package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 四、混合题型（一个文件含两种题型）。移植自 parser.test.ts describe('混合题型') */
class MixedTypeParserTest {

    private val md = """
        ---
        title: 混合题库
        ---

        ## 选择题

        1. 环境卫生学的研究对象是？
        A. 传染病分布
        B. 人类及其周围环境
        C. 食物营养
        D. 职业人群
        正确答案: B

        ---

        ## 简答题

        2. 简述中暑的现场救治措施
        正确答案: 立即脱离热环境，通风阴凉处休息，积极有效降温。
        解析: 不用退烧药。
    """.trimIndent()

    private val result = MarkdownParser.parse(md)

    @Test
    fun `两种题型都被解析`() {
        assertEquals(2, result.questions.size)
    }

    @Test
    fun `第一题是选择题有选项`() {
        assertEquals(4, result.questions[0].options.size)
        assertEquals("B", result.questions[0].answer)
    }

    @Test
    fun `第二题是简答题无选项`() {
        assertTrue(result.questions[1].options.isEmpty())
        assertTrue(result.questions[1].answer.contains("脱离热环境"))
    }
}
