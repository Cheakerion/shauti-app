package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** 十、真实题库文件集成测试。移植自 parser.test.ts describe('真实题库文件')；文件缺失时跳过（Assume） */
class RealBankFilesParserTest {

    private fun loadBank(name: String): String? =
        javaClass.classLoader
            ?.getResourceAsStream("banks/$name")
            ?.readBytes()
            ?.toString(Charsets.UTF_8)

    @Test
    fun `卫生学选择题题库解析正常且题数大于0`() {
        val md = loadBank("卫生学-选择题题库.md")
        assumeTrue("文件不存在，跳过测试", md != null)
        val result = MarkdownParser.parse(md!!)
        assertTrue(result.title.isNotEmpty())
        assertTrue(result.questions.isNotEmpty())
        for (q in result.questions) {
            assertTrue(q.stem.isNotEmpty())
            assertTrue(q.answer.isNotEmpty())
        }
    }

    @Test
    fun `卫生学简答题题库解析正常且题数大于0`() {
        val md = loadBank("卫生学-简答题题库.md")
        assumeTrue("文件不存在，跳过测试", md != null)
        val result = MarkdownParser.parse(md!!)
        assertTrue(result.title.isNotEmpty())
        assertTrue(result.questions.isNotEmpty())
        for (q in result.questions) {
            assertTrue(q.stem.isNotEmpty())
            assertTrue(q.answer.isNotEmpty())
        }
    }

    @Test
    fun `内科学测试题库解析正常`() {
        val md = loadBank("测试题库-内科学.md")
        assumeTrue("文件不存在，跳过测试", md != null)
        val result = MarkdownParser.parse(md!!)
        assertTrue(result.questions.isNotEmpty())
    }

    @Test
    fun `模板选择题解析正常`() {
        val md = loadBank("模板-选择题.md")
        assumeTrue("文件不存在，跳过测试", md != null)
        val result = MarkdownParser.parse(md!!)
        assertEquals("选择题题库", result.title)
        assertEquals(2, result.questions.size)
    }

    @Test
    fun `模板名词解释解析正常且engStem正确`() {
        val md = loadBank("模板-名词解释.md")
        assumeTrue("文件不存在，跳过测试", md != null)
        val result = MarkdownParser.parse(md!!)
        assertEquals(3, result.questions.size)
        // 所有题都应有英文术语
        assertEquals("Hypertension", result.questions[0].engStem)
        assertEquals("Heart failure", result.questions[1].engStem)
        assertEquals("Biotransformation", result.questions[2].engStem)
    }

    @Test
    fun `物理诊断学名词解释解析正常且engStem正确`() {
        val md = loadBank("物理诊断学__第1次课__名词解释.md")
        assumeTrue("文件不存在，跳过测试", md != null)
        val result = MarkdownParser.parse(md!!)
        assertEquals(13, result.questions.size)
        // 验证英文术语
        assertEquals("Diagnostics", result.questions[0].engStem)
        assertTrue(result.questions[0].stem.contains("诊断学"))
        // 验证最后一道
        assertEquals("Family history", result.questions[12].engStem)
        assertTrue(result.questions[12].stem.contains("家族史"))
        // 所有题都应该有 engStem
        for (q in result.questions) {
            assertFalse(q.engStem.isNullOrEmpty())
        }
    }

    @Test
    fun `模板简答题解析正常`() {
        val md = loadBank("模板-简答题.md")
        assumeTrue("文件不存在，跳过测试", md != null)
        val result = MarkdownParser.parse(md!!)
        assertEquals(3, result.questions.size)
    }
}
