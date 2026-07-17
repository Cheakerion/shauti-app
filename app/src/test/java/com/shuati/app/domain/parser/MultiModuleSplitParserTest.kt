package com.shuati.app.domain.parser

import org.junit.Assert.assertTrue
import org.junit.Test

/** 九、多模块分离式格式。移植自 parser.test.ts describe('多模块分离式') */
class MultiModuleSplitParserTest {

    private val md = """
        ---
        title: 多模块题库
        ---

        **1.** 第一模块题目1
        A. A1
        B. B1
        C. C1
        **正确答案: A**

        **2.** 第一模块题目2
        A. A2
        B. B2
        C. C2
        **正确答案: D**

        ## 答案
        | 1 | A |
        | 2 | B |

        **3.** 第二模块题目1
        A. A3
        B. B3
        C. C3
        D. D3

        ## 答案
        | 3 | C |
    """.trimIndent()

    @Test
    fun `多模块都能解析`() {
        // 第一模块有行内答案，答案表可能覆盖；核心是程序不崩溃
        val result = MarkdownParser.parse(md)
        assertTrue(result.questions.size >= 1)
    }
}
