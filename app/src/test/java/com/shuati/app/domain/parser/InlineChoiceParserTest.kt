package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 一、行内格式 — 选择题（最常用格式）。移植自 parser.test.ts describe('行内格式 — 选择题') */
class InlineChoiceParserTest {

    private val md = """
        ---
        title: 测试选择题
        ---

        1. 以下关于高血压的诊断标准，正确的是？
        A. 收缩压≥120mmHg
        B. 收缩压≥130mmHg
        C. 收缩压≥140mmHg和（或）舒张压≥90mmHg
        D. 收缩压≥150mmHg
        正确答案: C
        解析: 非同日3次测量诊室血压，收缩压≥140mmHg和（或）舒张压≥90mmHg即可诊断。

        ---

        2. 心房颤动最常见的并发症是？
        A. 心力衰竭
        B. 心肌梗死
        C. 脑栓塞
        D. 肺栓塞
        E. 感染性心内膜炎
        正确答案: C
        解析: 房颤时血液在左心房淤滞形成血栓，脱落导致脑栓塞最多见。
    """.trimIndent()

    private val result = MarkdownParser.parse(md)

    @Test
    fun `正确提取标题`() {
        assertEquals("测试选择题", result.title)
    }

    @Test
    fun `正确解析题数`() {
        assertEquals(2, result.questions.size)
    }

    @Test
    fun `每道题有题干选项答案解析`() {
        for (q in result.questions) {
            assertTrue(q.stem.isNotEmpty())
            assertTrue(q.options.size >= 4)
            assertTrue(q.answer.isNotEmpty())
            assertFalse(q.explanation.isNullOrEmpty())
        }
    }

    @Test
    fun `第一题答案和解析正确`() {
        val q = result.questions[0]
        assertTrue(q.stem.contains("高血压"))
        assertTrue(q.options[2].text.contains("140mmHg"))
        assertEquals("C", q.answer)
        assertTrue(q.explanation!!.contains("非同日3次"))
    }

    @Test
    fun `第二题支持5个选项`() {
        val q = result.questions[1]
        assertEquals(5, q.options.size)
        assertEquals("E", q.options[4].label)
        assertEquals("C", q.answer)
    }
}
