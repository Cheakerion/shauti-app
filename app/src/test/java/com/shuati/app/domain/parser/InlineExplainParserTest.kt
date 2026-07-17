package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 三、行内格式 — 名词解释。移植自 parser.test.ts describe('行内格式 — 名词解释') */
class InlineExplainParserTest {

    private val md = """
        ---
        title: 测试名词解释
        ---

        ## 名词解释

        1. 生物转化
        英文: Biotransformation
        正确答案: 外来化合物在体内代谢酶的作用下，经氧化、还原、水解和结合反应，使其化学结构发生改变，极性和水溶性增加，有利于排出体外的过程。
        解析: 分为I相反应和II相反应，主要场所是肝脏。

        ---

        2. 高血压
        正确答案: 在未使用降压药物的情况下，非同日3次测量诊室血压，收缩压≥140mmHg和（或）舒张压≥90mmHg。
        解析: 白大衣高血压需注意鉴别。
    """.trimIndent()

    private val result = MarkdownParser.parse(md)

    @Test
    fun `名词解释被正确解析`() {
        assertEquals(2, result.questions.size)
    }

    @Test
    fun `答案内容正确无选项题型`() {
        assertTrue(result.questions[0].stem.contains("生物转化"))
        assertTrue(result.questions[0].answer.contains("外来化合物"))
    }

    @Test
    fun `有英文字段时engStem被正确提取`() {
        assertEquals("Biotransformation", result.questions[0].engStem)
        assertTrue(result.questions[0].stem.contains("生物转化"))
    }

    @Test
    fun `无英文字段时engStem为null`() {
        assertNull(result.questions[1].engStem)
    }

    @Test
    fun `英文字段不污染stem和explanation`() {
        assertFalse(result.questions[0].stem.contains("英文"))
        assertFalse(result.questions[0].explanation!!.contains("Biotransformation"))
    }
}
