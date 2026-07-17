package com.shuati.app.data.session

import kotlinx.serialization.Serializable

/** 顺序 / 随机 */
@Serializable
enum class QuizMode { SEQUENTIAL, RANDOM }

/** 快速 / 正常 / 背题（文本题、填空题无快速） */
@Serializable
enum class PlayMode { QUICK, NORMAL, MEMORIZE }

/** 选择/判断/不定项/填空页筛选：全部 / 未做 / 做错 / 已做 */
@Serializable
enum class ChoiceFilter { ALL, UNDONE, WRONG, DONE }

/** 文本页筛选：全部 / 已标记 / 未标记 */
@Serializable
enum class TextFilter { ALL, MARKED, UNMARKED }

/**
 * 选择/判断/不定项/填空页会话（对应旧版 localStorage quiz_session_*）。
 * historyAnswers: questionId -> 用户答案（填空题为 "对"/"错" 自评结果）
 */
@Serializable
data class ChoiceSessionState(
    val currentIndex: Int = 0,
    val mode: QuizMode = QuizMode.SEQUENTIAL,
    val playMode: PlayMode = PlayMode.NORMAL,
    val shuffledIndices: List<Int> = emptyList(),
    val startTime: Long = 0L,
    val filterMode: ChoiceFilter = ChoiceFilter.ALL,
    val historyAnswers: Map<String, String> = emptyMap(),
)

/** 名词解释/简答页会话（顺序固定为洗牌随机序，与旧版一致） */
@Serializable
data class TextSessionState(
    val currentIndex: Int = 0,
    val playMode: PlayMode = PlayMode.NORMAL,
    val filterMode: TextFilter = TextFilter.ALL,
    val shuffledIndices: List<Int> = emptyList(),
    val startTime: Long = 0L,
    val revealedIds: List<String> = emptyList(),
)
