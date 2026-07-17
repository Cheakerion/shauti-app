package com.shuati.app.domain.parser

import com.shuati.app.domain.model.QuestionType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** 填空题（原生版新增题型）：`## 填空题` 区块，题干含 ______，答案为顿号分隔文本，看答案后自评 */
class FillBlankParserTest {

    @Test
    fun `填空题区块被识别为fill_blank类型`() {
        val md = """
            ---
            title: 填空题题库
            ---

            ## 填空题

            1. 皮下出血分为四型：______、______、______、______
            正确答案: 瘀点、紫癜、瘀斑、血肿
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertEquals(QuestionType.FILL_BLANK, result.questions[0].type)
    }

    @Test
    fun `题干中下划线占位符原样保留`() {
        val md = """
            ---
            title: 测试
            ---

            ## 填空题

            1. 正常人血压：收缩压______，舒张压______
            正确答案: ＜120mmHg、＜80mmHg
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertTrue(result.questions[0].stem.contains("______"))
    }

    @Test
    fun `顿号分隔多答案原样保留不被拆分`() {
        val md = """
            ---
            title: 测试
            ---

            ## 填空题

            1. 皮下出血分为四型：______、______、______、______
            正确答案: 瘀点、紫癜、瘀斑、血肿
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals("瘀点、紫癜、瘀斑、血肿", result.questions[0].answer)
    }

    @Test
    fun `答案含括号别名原样保留`() {
        val md = """
            ---
            title: 测试
            ---

            ## 填空题

            1. 心脏听诊内容包括：______、______
            正确答案: 心率、心律（节律）
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals("心率、心律（节律）", result.questions[0].answer)
    }

    @Test
    fun `多行题干被正确拼接`() {
        val md = """
            ---
            title: 测试
            ---

            ## 填空题

            1. 患者查体时
            深部触诊法的手法包括：______、______
            正确答案: 深部滑行触诊法、双手触诊法
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertTrue(result.questions[0].stem.contains("深部触诊法"))
    }

    @Test
    fun `解析被正确提取`() {
        val md = """
            ---
            title: 测试
            ---

            ## 填空题

            1. 题干：______
            正确答案: 某答案
            解析: 这是解析内容
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertTrue(result.questions[0].explanation!!.contains("这是解析内容"))
    }

    @Test
    fun `空解析行时explanation为null`() {
        val md = """
            ---
            title: 测试
            ---

            ## 填空题

            1. 题干：______
            正确答案: 某答案
            解析:
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertNull(result.questions[0].explanation)
    }

    @Test
    fun `填空简写区块标题也能识别`() {
        val md = """
            ---
            title: 测试
            ---

            ## 填空

            1. 题干：______
            正确答案: 某答案
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(1, result.questions.size)
        assertEquals(QuestionType.FILL_BLANK, result.questions[0].type)
    }

    @Test
    fun `混合题库中选择题与填空题互不污染`() {
        val md = """
            ---
            title: 混合
            ---

            ## 选择题

            1. 选择题题干
            A. 甲
            B. 乙
            C. 丙
            D. 丁
            正确答案: B

            ---

            ## 填空题

            2. 填空题干：______、______
            正确答案: 甲、乙
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(2, result.questions.size)
        assertEquals(QuestionType.CHOICE, result.questions[0].type)
        assertEquals("B", result.questions[0].answer)
        assertEquals(QuestionType.FILL_BLANK, result.questions[1].type)
        assertEquals("甲、乙", result.questions[1].answer)
    }

    @Test
    fun `没有答案的填空题不会被解析`() {
        val md = """
            ---
            title: 测试
            ---

            ## 填空题

            1. 只有题干：______
        """.trimIndent()
        val result = MarkdownParser.parse(md)
        assertEquals(0, result.questions.size)
    }

    @Test
    fun `真实填空题文件解析正常`() {
        val md = javaClass.classLoader
            ?.getResourceAsStream("banks/物理诊断学__期末考试__填空题.md")
            ?.readBytes()
            ?.toString(Charsets.UTF_8)
        assumeTrue("文件不存在，跳过测试", md != null)
        val result = MarkdownParser.parse(md!!)
        assertEquals("填空题题库", result.title)
        assertTrue(result.questions.isNotEmpty())
        for (q in result.questions) {
            assertEquals(QuestionType.FILL_BLANK, q.type)
            assertTrue(q.stem.isNotEmpty())
            assertTrue(q.answer.isNotEmpty())
        }
        assertTrue(result.questions[0].stem.contains("皮下出血"))
        assertTrue(result.questions[0].answer.contains("瘀点"))
    }
}
