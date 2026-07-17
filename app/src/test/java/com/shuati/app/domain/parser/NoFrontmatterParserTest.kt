package com.shuati.app.domain.parser

import org.junit.Assert.assertEquals
import org.junit.Test

/** 五、没有 frontmatter 时用第一个标题/默认名。移植自 parser.test.ts describe('无 frontmatter') */
class NoFrontmatterParserTest {

    @Test
    fun `用第一个井号标题作为题库名`() {
        val md = """
            # 内科学习题

            1. 某题目？
            A. 选项1
            B. 选项2
            C. 选项3
            D. 选项4
            正确答案: B
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals("内科学习题", result.title)
    }

    @Test
    fun `没有任何标题时返回默认名`() {
        val md = """
            1. 某题目？
            A. 选项1
            B. 选项2
            正确答案: A
        """.trimIndent()

        val result = MarkdownParser.parse(md)
        assertEquals("未命名题库", result.title)
    }
}
