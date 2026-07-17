package com.shuati.app.ui.quiz.core

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shuati.app.ShuatiApplication
import com.shuati.app.data.session.ChoiceFilter
import com.shuati.app.data.session.ChoiceSessionState
import com.shuati.app.data.session.PlayMode
import com.shuati.app.data.session.QuizMode
import com.shuati.app.domain.model.Question
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 选择/判断/不定项/填空页共用的会话 ViewModel 基类。
 * 对齐旧版 Quiz.tsx 语义：顺序/随机、快速/正常/背题、四筛选、重做做错、全部清除、
 * 断点续刷（DataStore 持久化，200ms 防抖）、会话内正确/错误计数、完成页。
 *
 * 与旧版的两处刻意偏差（修 bug）：
 * 1. 会话恢复不再被筛选副作用重置 currentIndex（旧版 useEffect([filterMode]) 竞态）；
 * 2. 筛选列表在会话内快照：「未做」筛选下答完一题不实时消失（切筛选/重开时刷新）。
 */
abstract class QuizSessionViewModel(
    application: Application,
    protected val bankId: String,
    val pageType: PageType,
) : AndroidViewModel(application) {

    protected val container = (application as ShuatiApplication).container
    protected val quizRepo = container.quizRepository
    private val sessionStore = container.sessionStore

    /** 本页加载的全部题目 */
    var questions by mutableStateOf<List<Question>>(emptyList())
        protected set

    /** 当前筛选快照（刻意偏差 #2） */
    var snapshot by mutableStateOf<List<Question>>(emptyList())
        protected set

    /** 展示序位置（顺序模式=快照下标；随机模式经 shuffledIndices 映射） */
    var currentIndex by mutableStateOf(0)
        protected set

    var mode by mutableStateOf(QuizMode.SEQUENTIAL)
        private set
    var playMode by mutableStateOf(PlayMode.NORMAL)
        private set
    var filterMode by mutableStateOf(ChoiceFilter.ALL)
        private set
    var shuffledIndices by mutableStateOf<List<Int>>(emptyList())
        protected set
    var historyAnswers by mutableStateOf<Map<String, String>>(emptyMap())
        protected set
    var wrongIds by mutableStateOf<Set<String>>(emptySet())
        protected set
    var startTime by mutableStateOf(System.currentTimeMillis())
        protected set
    var showComplete by mutableStateOf(false)
        protected set
    var loaded by mutableStateOf(false)
        protected set

    /** 本次会话（VM 存续期）作答计数，对齐旧版 records 口径 */
    var sessionCorrect by mutableStateOf(0)
        protected set
    var sessionWrong by mutableStateOf(0)
        protected set

    /** 快速模式答对后自动跳题中 */
    var autoAdvancing by mutableStateOf(false)
        private set

    private var autoAdvanceJob: Job? = null
    private var saveJob: Job? = null

    /** 子类可关闭快速模式（填空/不定项无快速） */
    protected open val allowQuick: Boolean = true

    init {
        viewModelScope.launch {
            questions = quizRepo.getQuestions(bankId, pageType.loadTypes)
            wrongIds = quizRepo.getWrongIds(bankId)
            val saved = sessionStore.loadChoiceSession(bankId, pageType.key)
            if (saved != null) {
                mode = saved.mode
                playMode = if (!allowQuick && saved.playMode == PlayMode.QUICK) PlayMode.NORMAL else saved.playMode
                filterMode = saved.filterMode
                historyAnswers = saved.historyAnswers
                startTime = if (saved.startTime > 0) saved.startTime else System.currentTimeMillis()
                snapshot = computeFiltered()
                // 精确恢复（刻意偏差 #1）；快照长度变了才重洗牌
                shuffledIndices = if (saved.shuffledIndices.size == snapshot.size) {
                    saved.shuffledIndices
                } else {
                    shuffle(snapshot.size)
                }
                currentIndex = saved.currentIndex.coerceIn(0, maxOf(0, snapshot.size - 1))
            } else {
                snapshot = computeFiltered()
                shuffledIndices = shuffle(snapshot.size)
            }
            loaded = true
        }
    }

    // ---- 派生 ----

    /** 展示序 → 快照下标（顺序模式恒等；随机模式经 shuffledIndices 映射） */
    fun snapshotPosOf(presentationPos: Int): Int =
        if (mode == QuizMode.SEQUENTIAL) presentationPos
        else shuffledIndices.getOrElse(presentationPos) { presentationPos }

    /** 按展示序取题（HorizontalPager 页渲染用） */
    fun questionAt(presentationPos: Int): Question? = snapshot.getOrNull(snapshotPosOf(presentationPos))

    val currentQuestion: Question?
        get() = questionAt(currentIndex)

    /** 到过末题（完成页看过后底部按钮显示「查看成绩」） */
    var everCompleted by mutableStateOf(false)
        protected set

    fun isAnswered(q: Question): Boolean = historyAnswers.containsKey(q.id)

    val currentAnswered: Boolean
        get() = currentQuestion?.let { isAnswered(it) } ?: false

    /** 当前题已提交的答案（重进恢复所选） */
    val currentSelectedAnswer: String?
        get() = currentQuestion?.let { historyAnswers[it.id] }

    /** 题号面板状态：true=对 false=错 null=未做 */
    fun statusOf(q: Question): Boolean? =
        historyAnswers[q.id]?.let { judge(q, it) }

    /** 题号面板：快照下标 p 是否为当前题 */
    fun isCurrentSnapshotPos(p: Int): Boolean = snapshotPosOf(currentIndex) == p

    // ---- 判分（填空页覆写为自评语义） ----

    protected open fun judge(q: Question, userAnswer: String): Boolean = userAnswer == q.answer

    // ---- 作答 ----

    fun submitAnswer(answer: String) {
        val q = currentQuestion ?: return
        if (isAnswered(q)) return
        val correct = judge(q, answer)
        historyAnswers = historyAnswers + (q.id to answer)
        if (correct) {
            sessionCorrect++
        } else {
            sessionWrong++
            wrongIds = wrongIds + q.id
        }
        viewModelScope.launch { quizRepo.recordAnswer(q.id, bankId, answer, correct) }
        scheduleSave()
        onAnswered(correct)
    }

    /** 作答后钩子（快速模式自动跳题在子类/此处触发） */
    protected open fun onAnswered(correct: Boolean) {
        if (playMode == PlayMode.QUICK && correct) {
            autoAdvancing = true
            autoAdvanceJob = viewModelScope.launch {
                delay(700)
                next()
            }
        }
    }

    protected fun cancelAutoAdvance() {
        autoAdvanceJob?.cancel()
        autoAdvanceJob = null
        autoAdvancing = false
    }

    // ---- 导航 ----

    fun prev() {
        cancelAutoAdvance()
        if (currentIndex > 0) {
            currentIndex--
            onQuestionChanged()
            scheduleSave()
        }
    }

    fun next() {
        cancelAutoAdvance()
        if (currentIndex >= snapshot.size - 1) {
            everCompleted = true
            showComplete = true
            return
        }
        currentIndex++
        onQuestionChanged()
        scheduleSave()
    }

    /** 题号面板点击：跳到快照下标 p 对应的题（随机模式映射回展示序） */
    fun jumpToSnapshotPos(p: Int) {
        cancelAutoAdvance()
        currentIndex = if (mode == QuizMode.SEQUENTIAL) p else shuffledIndices.indexOf(p).takeIf { it >= 0 } ?: p
        onQuestionChanged()
        scheduleSave()
    }

    /** 滑动切题（Pager settled） */
    fun onPageSettled(page: Int) {
        if (page == currentIndex || page !in snapshot.indices) return
        cancelAutoAdvance()
        currentIndex = page
        onQuestionChanged()
        scheduleSave()
    }

    /** 题目切换钩子（子类清预选等） */
    protected open fun onQuestionChanged() {}

    // ---- 模式/筛选 ----

    fun setModeTo(m: QuizMode) {
        if (mode == m) return
        cancelAutoAdvance()
        mode = m
        currentIndex = 0
        onQuestionChanged()
        scheduleSave()
    }

    fun setPlayModeTo(p: PlayMode) {
        if (!allowQuick && p == PlayMode.QUICK) return
        cancelAutoAdvance()
        playMode = p
        onQuestionChanged()
        scheduleSave()
    }

    fun setFilterTo(f: ChoiceFilter) {
        if (filterMode == f) return
        cancelAutoAdvance()
        filterMode = f
        rebuildSnapshot()
        scheduleSave()
    }

    protected fun computeFiltered(): List<Question> = when (filterMode) {
        ChoiceFilter.ALL -> questions
        ChoiceFilter.DONE -> questions.filter { historyAnswers.containsKey(it.id) }
        ChoiceFilter.UNDONE -> questions.filter { !historyAnswers.containsKey(it.id) }
        ChoiceFilter.WRONG -> questions.filter { wrongIds.contains(it.id) }
    }

    /** 重建筛选快照 + 重洗牌 + 回第一题（对齐旧版筛选切换行为） */
    protected fun rebuildSnapshot() {
        snapshot = computeFiltered()
        shuffledIndices = shuffle(snapshot.size)
        currentIndex = 0
        showComplete = false
        onQuestionChanged()
    }

    private fun shuffle(n: Int): List<Int> = (0 until n).shuffled()

    // ---- 重做做错 / 全部清除 ----

    /** 重做做错：错误记录保留，只重置作答状态并切「做错」筛选 */
    fun redoWrong() {
        cancelAutoAdvance()
        historyAnswers = historyAnswers - wrongIds
        filterMode = ChoiceFilter.WRONG
        rebuildSnapshot()
        scheduleSave()
    }

    /** 全部清除：清会话 + 删该题库全部答题记录 */
    fun fullRestart() {
        cancelAutoAdvance()
        viewModelScope.launch {
            quizRepo.deleteRecordsByBank(bankId)
            sessionStore.clearSession(bankId, pageType.key)
            historyAnswers = emptyMap()
            wrongIds = emptySet()
            sessionCorrect = 0
            sessionWrong = 0
            startTime = System.currentTimeMillis()
            showComplete = false
            rebuildSnapshot()
            scheduleSave()
        }
    }

    /** 完成页「重新开始」 */
    fun restartFromComplete() = fullRestart()

    fun dismissComplete() {
        showComplete = false
    }

    // ---- 持久化（200ms 防抖） ----

    protected fun scheduleSave() {
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(200)
            persist()
        }
    }

    private suspend fun persist() {
        if (!loaded) return
        sessionStore.saveChoiceSession(
            bankId, pageType.key,
            ChoiceSessionState(
                currentIndex = currentIndex,
                mode = mode,
                playMode = playMode,
                shuffledIndices = shuffledIndices,
                startTime = startTime,
                filterMode = filterMode,
                historyAnswers = historyAnswers,
            ),
        )
    }
}
