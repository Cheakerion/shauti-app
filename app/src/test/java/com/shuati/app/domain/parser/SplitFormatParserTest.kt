package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 八、分离式格式（## 答案）。移植自 parser.test.ts describe('分离式格式') */
class SplitFormatParserTest {

    private val md = """
        ---
        title: 分离式题库
        ---

        **1.** 环境卫生学的研究对象是？
        A. 传染病分布规律
        B. 人类及其周围环境
        C. 食物营养成分
        D. 自然环境因素
        E. 职业人群

        **2.** 以下哪种污染物属于二次污染物？
        A. 火山灰
        B. NOx经紫外线照射生成的O₃
        C. 含镉废水
        D. 燃煤排放SO₂
        E. 苯并(a)芘

        **3.** 预防医学与公共卫生最主要的区别在于？
        A. 个体行为干预为主
        B. 属于临床医学
        C. 关注传染病
        D. 研究个体
        E. 侧重微观调控与监测

        ## 答案

        | 题号 | 答案 |
        |------|------|
        | 1 | B |
        | 2 | B |
        | 3 | E |
    """.trimIndent()

    private val result = MarkdownParser.parse(md)

    @Test
    fun `正确解析分离式格式`() {
        assertEquals(3, result.questions.size)
    }

    @Test
    fun `答案被正确匹配到对应题目`() {
        // 题号 1 → B（人类及其周围环境）
        assertEquals("B", result.questions[0].answer)
        assertTrue(result.questions[0].stem.contains("环境卫生学"))

        // 题号 2 → B（O₃）
        assertEquals("B", result.questions[1].answer)
        assertTrue(result.questions[1].stem.contains("二次污染物"))

        // 题号 3 → E
        assertEquals("E", result.questions[2].answer)
        assertTrue(result.questions[2].stem.contains("预防医学"))
    }
}
