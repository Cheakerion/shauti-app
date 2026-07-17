package com.shuati.app.domain.parser

import com.shuati.app.domain.model.Option
import com.shuati.app.domain.model.ParseResult
import com.shuati.app.domain.model.ParsedQuestion
import com.shuati.app.domain.model.QuestionType

/**
 * Markdown 题库解析器 — 兼容微信篡改。
 * 逐函数移植自旧版 src/parser.ts（322 行），并新增填空题（`## 填空题`）支持。
 *
 * JS→Kotlin 语义差异处理：
 * - 入口预归一化：剥 BOM、CRLF→LF、全角空格/NBSP→空格（Java \s 不含 Unicode 空白，JS 含）
 * - JS 无 /g 的 replace 只换第一处 → 一律 replaceFirst
 * - str.match(re) → re.find(str)；re.test(str) → re.containsMatchIn(str)
 * - parseInt 容错 → toIntOrNull
 * - Kotlin Regex.split 保留零宽匹配产生的首尾空串，与 JS split 对齐
 */
object MarkdownParser {

    // ---- 预编译正则（全部对照 parser.ts 原文） ----
    private val FRONTMATTER_TITLE = Regex("^---\\s*\\ntitle:\\s*(.+)")
    private val FIRST_HEADING = Regex("^#\\s+(.+)", RegexOption.MULTILINE)
    private val ANSWER_SECTION = Regex("^##\\s*答案", RegexOption.MULTILINE)
    private val ANSWER_SECTION_SPLIT = Regex("(?=^##\\s*答案)", RegexOption.MULTILINE)
    private val ANSWER_SECTION_PREFIX = Regex("^##\\s*答案\\s*")
    private val TABLE_ANSWER_LINE = Regex("^\\|\\s*\\d+\\s*\\|\\s*[A-Ea-e]\\s*\\|")
    private val TABLE_ROW = Regex("^\\|\\s*(\\d+)\\s*\\|\\s*(.+?)\\s*\\|")
    private val SPLIT_Q_NUM = Regex("\\*\\*(\\d+)[.\\s]")
    private val SPLIT_STEM_PREFIX = Regex("^\\*\\*\\d+\\.?\\*?\\*\\s*")
    private val SPLIT_STEM_SUFFIX = Regex("\\*\\*\\s*$")
    private val SKIP_HEADING = Regex("^#{1,3}\\s")
    private val DASH_LINE = Regex("^---+$")
    private val ENG_LINE = Regex("^英文\\s*[:：]\\s*(.+)")
    private val WECHAT_INLINE_ANSWER =
        Regex("^\\*\\*(?:(?:正确)?答案|Answer)\\s*[:：]\\s*(.+)\\s*\\*\\*$", RegexOption.IGNORE_CASE)
    private val EXPLANATION_LINE = Regex("^(?:\\*\\*)?解析\\s*[:：](?:\\*\\*)?\\s*(.*)")
    private val OPTION_LINE = Regex("^([A-E])\\s*[.、)]\\s*(.+)")
    private val INLINE_ANSWER = Regex("^(?:\\*\\*)?(?:正确)?答案\\s*[:：]\\s*(.+?)(?:\\*\\*)?$", RegexOption.IGNORE_CASE)
    private val STEM_NUM_PREFIX = Regex("^\\d+\\s*[.、)）]\\s*")
    private val STEM_BOLD_NUM_PREFIX = Regex("^\\*\\*\\d+\\.?\\*\\s*")
    private val NON_A_TO_E = Regex("[^A-E]")
    private val TRUE_ANSWER = Regex("^(正确|对|[√✓])$")
    private val FALSE_ANSWER = Regex("^(错误|错|[×✗]|X)$", RegexOption.IGNORE_CASE)

    /** 题型区块标题检测（兼容微信格式）。填空为原生版新增 */
    private val SECTION_PATTERNS: List<Pair<Regex, QuestionType>> = listOf(
        Regex("^##\\s*(选择|单选题|多选题)") to QuestionType.CHOICE,
        Regex("^##\\s*名词解释") to QuestionType.EXPLAIN,
        Regex("^##\\s*(简答|问答)") to QuestionType.SHORT_ANSWER,
        Regex("^##\\s*(不定项选择|不定项选择题)") to QuestionType.MULTI_CHOICE,
        Regex("^##\\s*判断题") to QuestionType.TRUE_FALSE,
        Regex("^##\\s*填空") to QuestionType.FILL_BLANK,
    )

    fun parse(markdown: String): ParseResult {
        val text = normalize(markdown)
        var title = "未命名题库"
        val fm = FRONTMATTER_TITLE.find(text)
        if (fm != null) {
            title = fm.groupValues[1].trim()
        } else {
            FIRST_HEADING.find(text)?.let { title = it.groupValues[1].trim() }
        }

        // 微信容错的答案区检测：## 答案 / ##答案 / ## 答案: 等
        return if (ANSWER_SECTION.containsMatchIn(text)) {
            parseSplitFormat(text, title)
        } else {
            parseInlineFormat(text, title)
        }
    }

    /** 入口预归一化：剥 BOM、统一换行、NBSP/全角空格→半角空格 */
    private fun normalize(s: String): String =
        s.removePrefix("﻿")
            .replace("\r\n", "\n")
            .replace('\r', '\n')
            .replace(' ', ' ')
            .replace('　', ' ')

    // ============================================================
    // 分离式格式（题目和答案分开）：用 ## 答案 作锚点分割
    // ============================================================
    private fun parseSplitFormat(markdown: String, title: String): ParseResult {
        val allQuestions = mutableListOf<ParsedQuestion>()
        val rawBlocks = ANSWER_SECTION_SPLIT.split(markdown)

        for (i in rawBlocks.indices) {
            val block = rawBlocks[i]
            if (i == 0) {
                // 第一个模块的题目，答案表在 rawBlocks[1]
                val table = extractAnswerTable(rawBlocks.getOrNull(1) ?: "")
                if (table.isNotEmpty()) {
                    for (q in parseSplitQuestions(block)) {
                        val ans = q.localNum?.let { table[it] }
                        if (!ans.isNullOrEmpty()) allQuestions.add(applyTableAnswer(q, ans))
                    }
                }
            } else {
                val content = block.replaceFirst(ANSWER_SECTION_PREFIX, "").trim()
                val tableEnd = findTableEnd(content)
                val questionText = content.substring(tableEnd)
                // 本模块的答案表在下一个 rawBlock (i+1)
                val table = extractAnswerTable(rawBlocks.getOrNull(i + 1) ?: "")
                if (questionText.isNotBlank() && table.isNotEmpty()) {
                    for (q in parseSplitQuestions(questionText)) {
                        val ans = q.localNum?.let { table[it] }
                        if (!ans.isNullOrEmpty()) allQuestions.add(applyTableAnswer(q, ans))
                    }
                }
            }
        }
        return ParseResult(title, allQuestions)
    }

    /** 表格答案回填：choice 检测多选升级，其余按题型标准化 */
    private fun applyTableAnswer(q: ParsedQuestion, ans: String): ParsedQuestion =
        if (q.type == QuestionType.CHOICE) {
            val multi = detectMultiAnswer(ans)
            if (multi != null) q.copy(type = QuestionType.MULTI_CHOICE, answer = multi)
            else q.copy(answer = ans)
        } else {
            q.copy(answer = normalizeAnswer(ans, q.type))
        }

    /** 在文本中找到答案表格结束的位置（字符偏移） */
    private fun findTableEnd(text: String): Int {
        val lines = text.split("\n")
        var lastTableLine = -1
        for (i in lines.indices) {
            if (TABLE_ANSWER_LINE.containsMatchIn(lines[i])) lastTableLine = i
        }
        if (lastTableLine >= 0) {
            for (i in lastTableLine + 1 until lines.size) {
                if (lines[i].trim() != "") {
                    return lines.subList(0, i).joinToString("\n").length
                }
            }
            return text.length
        }
        return 0
    }

    /** 解析答案表格 */
    private fun parseAnswerTable(text: String): Map<Int, String> {
        val map = mutableMapOf<Int, String>()
        for (line in text.split("\n")) {
            val m = TABLE_ROW.find(line) ?: continue
            val num = m.groupValues[1].toIntOrNull() ?: continue
            map[num] = m.groupValues[2].trim()
        }
        return map
    }

    /** 从答案区块提取答案表 */
    private fun extractAnswerTable(block: String): Map<Int, String> {
        if (block.isEmpty()) return emptyMap()
        val content = block.replaceFirst(ANSWER_SECTION_PREFIX, "").trim()
        val idx = findTableEnd(content)
        return parseAnswerTable(content.substring(0, idx))
    }

    /** 解析分离式题目（跳过微信添加的标题/附录等） */
    private fun parseSplitQuestions(text: String): List<ParsedQuestion> {
        val results = mutableListOf<ParsedQuestion>()
        val lines = text.split("\n")
        var i = 0
        // 注意：与旧版一致，微信行内答案检测到多选时会把区块级 currentType 一并升级
        var currentType = QuestionType.CHOICE

        while (i < lines.size) {
            // 检测区块标题切换题型
            val sectionType = detectSectionType(lines[i])
            if (sectionType != null) {
                currentType = sectionType
                i++
                continue
            }

            val qMatch = SPLIT_Q_NUM.find(lines[i])
            if (qMatch == null) {
                i++
                continue
            }

            val localNum = qMatch.groupValues[1].toIntOrNull()
            val stemPart = lines[i]
                .replaceFirst(SPLIT_STEM_PREFIX, "")
                .replaceFirst(SPLIT_STEM_SUFFIX, "")
                .trim()
            val stemLines = mutableListOf<String>()
            if (stemPart.isNotEmpty()) stemLines.add(stemPart)

            val options = mutableListOf<Option>()
            var currentAnswer = ""
            var currentExplanation = ""
            var currentEngStem = ""
            var inExplanation = false
            i++

            while (i < lines.size) {
                val line = lines[i]
                if (SPLIT_Q_NUM.containsMatchIn(line)) break // 下一题
                if (detectSectionType(line) != null) break   // 区块标题也中止当前题

                val t = line.trim()
                if (SKIP_HEADING.containsMatchIn(t) || DASH_LINE.containsMatchIn(t) ||
                    t.startsWith(">") || t.startsWith("|")
                ) {
                    i++
                    continue
                }

                // 英文术语（可选）
                val engMatch = ENG_LINE.find(t)
                if (engMatch != null) {
                    currentEngStem = engMatch.groupValues[1].trim()
                    i++
                    continue
                }

                // 微信行内答案（兼容任意文本答案，不限于 A-E）
                val inlineAns = WECHAT_INLINE_ANSWER.find(t)
                if (inlineAns != null) {
                    val rawAns = inlineAns.groupValues[1].trim()
                    if (currentType == QuestionType.CHOICE) {
                        val multi = detectMultiAnswer(rawAns)
                        if (multi != null) {
                            currentType = QuestionType.MULTI_CHOICE
                            currentAnswer = multi
                        } else {
                            currentAnswer = rawAns
                        }
                    } else {
                        currentAnswer = normalizeAnswer(rawAns, currentType)
                    }
                    i++
                    continue
                }

                // 解析（支持多行，支持微信粗体格式）
                val expMatch = EXPLANATION_LINE.find(t)
                if (expMatch != null) {
                    inExplanation = true
                    currentExplanation = expMatch.groupValues[1].trim()
                    i++
                    continue
                }
                if (inExplanation && t.isNotEmpty()) {
                    currentExplanation += "\n" + t
                    i++
                    continue
                }

                val optMatch = OPTION_LINE.find(t)
                if (optMatch != null) {
                    options.add(Option(optMatch.groupValues[1], optMatch.groupValues[2].trim()))
                    inExplanation = false // 解析通常在选项后，若后又出现选项则停止解析收集
                    i++
                    continue
                }

                if (t.isNotEmpty()) stemLines.add(t)
                i++
            }

            val stem = stemLines.joinToString("\n").trim()
            // 选择题必须有选项；文本题有 stem+answer 即可
            val isChoice = currentType == QuestionType.CHOICE
            val valid = stem.isNotEmpty() && (if (isChoice) options.isNotEmpty() else currentAnswer.isNotEmpty())
            if (valid) {
                results.add(
                    ParsedQuestion(
                        stem = stem,
                        options = options,
                        answer = currentAnswer,
                        explanation = currentExplanation.ifEmpty { null },
                        type = currentType,
                        engStem = currentEngStem.ifEmpty { null },
                        localNum = localNum,
                    )
                )
            }
        }
        return results
    }

    // ============================================================
    // 行内答案格式
    // ============================================================
    private fun parseInlineFormat(markdown: String, title: String): ParseResult {
        val lines = markdown.split("\n")
        val questions = mutableListOf<ParsedQuestion>()
        var i = 0
        // 跳过 frontmatter
        if (lines.getOrNull(0)?.trim() == "---") {
            i = 1
            while (i < lines.size && lines[i].trim() != "---") i++
            i++
        }

        val blocks = mutableListOf<List<String>>()
        val blockTypes = mutableListOf<QuestionType>()
        var cur = mutableListOf<String>()
        var currentType = QuestionType.CHOICE

        while (i < lines.size) {
            // 检测题型区块标题
            val sectionType = detectSectionType(lines[i])
            if (sectionType != null) {
                if (cur.isNotEmpty()) {
                    blocks.add(cur)
                    blockTypes.add(currentType)
                    cur = mutableListOf()
                }
                currentType = sectionType
                i++
                continue
            }
            if (DASH_LINE.containsMatchIn(lines[i].trim())) {
                if (cur.isNotEmpty()) {
                    blocks.add(cur)
                    blockTypes.add(currentType)
                    cur = mutableListOf()
                }
            } else {
                cur.add(lines[i])
            }
            i++
        }
        if (cur.isNotEmpty()) {
            blocks.add(cur)
            blockTypes.add(currentType)
        }

        for (j in blocks.indices) {
            parseInlineBlock(blocks[j], blockTypes[j])?.let { questions.add(it) }
        }
        return ParseResult(title, questions)
    }

    private fun parseInlineBlock(rawLines: List<String>, blockType: QuestionType): ParsedQuestion? {
        val lines = rawLines
            .dropWhile { it.trim().isEmpty() }
            .dropLastWhile { it.trim().isEmpty() }
        if (lines.isEmpty()) return null

        var qType = blockType
        val stemLines = mutableListOf<String>()
        val options = mutableListOf<Option>()
        var answer = ""
        var explanation = ""
        var engStem = ""
        var inOpts = false
        var inExp = false

        for (raw in lines) {
            val line = raw.trim()
            if (line.isEmpty()) continue
            // 英文术语（可选）
            val engMatch = ENG_LINE.find(line)
            if (engMatch != null) {
                engStem = engMatch.groupValues[1].trim()
                continue
            }
            // 兼容微信粗体：**解析：** 或 **解析:** 都能匹配
            val expMatch = EXPLANATION_LINE.find(line)
            if (expMatch != null) {
                inExp = true
                inOpts = false
                explanation = expMatch.groupValues[1].trim()
                continue
            }
            if (inExp) {
                explanation += "\n" + line
                continue
            }
            // 兼容微信粗体：**正确答案: X** 或 **答案：X**
            val ansMatch = INLINE_ANSWER.find(line)
            if (ansMatch != null) {
                val rawAns = ansMatch.groupValues[1].trim()
                if (qType == QuestionType.CHOICE) {
                    val multi = detectMultiAnswer(rawAns)
                    if (multi != null) {
                        qType = QuestionType.MULTI_CHOICE
                        answer = multi
                    } else {
                        answer = rawAns
                    }
                } else {
                    answer = normalizeAnswer(rawAns, qType)
                }
                inOpts = false
                continue
            }
            val om = OPTION_LINE.find(line)
            if (om != null) {
                inOpts = true
                options.add(Option(om.groupValues[1], om.groupValues[2].trim()))
                continue
            }
            if (!inOpts) {
                stemLines.add(
                    line.replaceFirst(STEM_NUM_PREFIX, "").replaceFirst(STEM_BOLD_NUM_PREFIX, "")
                )
            }
        }

        val stem = stemLines.joinToString("\n").trim()
        if (stem.isEmpty() || answer.isEmpty()) return null
        return ParsedQuestion(
            stem = stem,
            options = options,
            answer = answer,
            explanation = explanation.ifEmpty { null },
            type = qType,
            engStem = engStem.ifEmpty { null },
        )
    }

    /** 按题型标准化答案：多选去重排序；判断统一为 正确/错误；其余 trim（填空题顿号文本原样保留） */
    private fun normalizeAnswer(raw: String, qType: QuestionType): String = when (qType) {
        QuestionType.MULTI_CHOICE -> {
            raw.uppercase().replace(NON_A_TO_E, "").toCharArray().distinct().sorted().joinToString("")
        }
        QuestionType.TRUE_FALSE -> {
            val t = raw.trim()
            when {
                TRUE_ANSWER.containsMatchIn(t) -> "正确"
                FALSE_ANSWER.containsMatchIn(t) -> "错误"
                else -> raw
            }
        }
        else -> raw.trim()
    }

    /** 检测答案是否含多个 A-E 字母 → 应升级为 multi_choice */
    private fun detectMultiAnswer(raw: String): String? {
        val unique = raw.uppercase().replace(NON_A_TO_E, "").toCharArray().distinct().sorted().joinToString("")
        return if (unique.length > 1) unique else null
    }

    private fun detectSectionType(line: String): QuestionType? {
        val t = line.trim()
        for ((re, qType) in SECTION_PATTERNS) {
            if (re.containsMatchIn(t)) return qType
        }
        return null
    }
}
