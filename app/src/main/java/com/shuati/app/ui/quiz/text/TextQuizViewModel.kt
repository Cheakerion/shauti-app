package com.shuati.app.ui.quiz.text

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shuati.app.ShuatiApplication
import com.shuati.app.data.session.PlayMode
import com.shuati.app.data.session.TextFilter
import com.shuati.app.data.session.TextSessionState
import com.shuati.app.domain.model.Question
import com.shuati.app.ui.quiz.core.PageType
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 名词解释/简答页 ViewModel（同构，qType 区分）。
 * 顺序固定为洗牌随机序（与旧版一致）；查看答案计「已看」；标记持久化；
 * 消除标记 = 清标记 + 重置进度。
 */
class TextQuizViewModel(
    application: Application,
    private val bankId: String,
    val pageType: PageType,
) : AndroidViewModel(application) {

    private val container = (application as ShuatiApplication).container
    private val quizRepo = container.quizRepository
    private val sessionStore = container.sessionStore

    var questions by mutableStateOf<List<Question>>(emptyList())
        private set
    var snapshot by mutableStateOf<List<Question>>(emptyList())
        private set
    var currentIndex by mutableStateOf(0)
        private set
    var playMode by mutableStateOf(PlayMode.NORMAL)
        private set
    var filterMode by mutableStateOf(TextFilter.ALL)
        private set
    var shuffledIndices by mutableStateOf<List<Int>>(emptyList())
        private set

    /** 已看（点过查看答案），持久化 */
    var revealedIds by mutableStateOf<Set<String>>(emptySet())
        private set

    /** 当前展开答案的题（仅 UI 态，收起答案只影响此集合） */
    var expandedIds by mutableStateOf<Set<String>>(emptySet())
        private set

    /** 已标记（DB 持久化） */
    var markedIds by mutableStateOf<Set<String>>(emptySet())
        private set

    var startTime by mutableStateOf(System.currentTimeMillis())
        private set
    var showComplete by mutableStateOf(false)
        private set
    var everCompleted by mutableStateOf(false)
        private set
    var loaded by mutableStateOf(false)
        private set

    private var saveJob: Job? = null

    init {
        viewModelScope.launch {
            questions = quizRepo.getQuestions(bankId, pageType.loadTypes)
            markedIds = quizRepo.getMarkedIds(bankId)
            val saved = sessionStore.loadTextSession(bankId, pageType.key)
            if (saved != null) {
                playMode = if (saved.playMode == PlayMode.QUICK) PlayMode.NORMAL else saved.playMode
                filterMode = saved.filterMode
                revealedIds = saved.revealedIds.toSet()
                startTime = if (saved.startTime > 0) saved.startTime else System.currentTimeMillis()
                snapshot = computeFiltered()
                shuffledIndices = if (saved.shuffledIndices.size == snapshot.size) {
                    saved.shuffledIndices
                } else {
                    (0 until snapshot.size).shuffled()
                }
                currentIndex = saved.currentIndex.coerceIn(0, maxOf(0, snapshot.size - 1))
            } else {
                snapshot = computeFiltered()
                shuffledIndices = (0 until snapshot.size).shuffled()
            }
            loaded = true
        }
    }

    // ---- 派生 ----

    /** 展示序 → 快照下标（顺序恒为洗牌随机序） */
    fun snapshotPosOf(presentationPos: Int): Int =
        shuffledIndices.getOrElse(presentationPos) { presentationPos }

    fun questionAt(presentationPos: Int): Question? = snapshot.getOrNull(snapshotPosOf(presentationPos))

    val currentQuestion: Question?
        get() = questionAt(currentIndex)

    fun isCurrentSnapshotPos(p: Int): Boolean = snapshotPosOf(currentIndex) == p

    fun isExpanded(q: Question): Boolean =
        playMode == PlayMode.MEMORIZE || q.id in expandedIds

    // ---- 查看/收起/标记 ----

    fun reveal(q: Question) {
        expandedIds = expandedIds + q.id
        if (q.id !in revealedIds) {
            revealedIds = revealedIds + q.id
            scheduleSave()
        }
    }

    fun collapse(q: Question) {
        expandedIds = expandedIds - q.id
    }

    fun toggleMark(q: Question) {
        viewModelScope.launch {
            if (q.id in markedIds) {
                quizRepo.removeMark(q.id)
                markedIds = markedIds - q.id
            } else {
                quizRepo.addMark(q.id, bankId)
                markedIds = markedIds + q.id
            }
            // 标记筛选下不实时移除（快照语义），重进/切筛选时刷新
        }
    }

    /** 消除标记：清该题库全部标记 + 重置进度 */
    fun clearMarksAndReset() {
        viewModelScope.launch {
            quizRepo.clearMarks(bankId)
            sessionStore.clearSession(bankId, pageType.key)
            markedIds = emptySet()
            revealedIds = emptySet()
            expandedIds = emptySet()
            filterMode = TextFilter.ALL
            startTime = System.currentTimeMillis()
            showComplete = false
            rebuildSnapshot()
            scheduleSave()
        }
    }

    // ---- 导航 ----

    fun prev() {
        if (currentIndex > 0) {
            currentIndex--
            scheduleSave()
        }
    }

    fun next() {
        if (currentIndex >= snapshot.size - 1) {
            everCompleted = true
            showComplete = true
            return
        }
        currentIndex++
        scheduleSave()
    }

    fun jumpToSnapshotPos(p: Int) {
        currentIndex = shuffledIndices.indexOf(p).takeIf { it >= 0 } ?: p
        scheduleSave()
    }

    fun onPageSettled(page: Int) {
        if (page == currentIndex || page !in snapshot.indices) return
        currentIndex = page
        scheduleSave()
    }

    fun dismissComplete() {
        showComplete = false
    }

    // ---- 模式/筛选 ----

    fun setPlayModeTo(p: PlayMode) {
        if (p == PlayMode.QUICK) return
        playMode = p
        scheduleSave()
    }

    fun setFilterTo(f: TextFilter) {
        if (filterMode == f) return
        filterMode = f
        rebuildSnapshot()
        scheduleSave()
    }

    private fun computeFiltered(): List<Question> = when (filterMode) {
        TextFilter.ALL -> questions
        TextFilter.MARKED -> questions.filter { it.id in markedIds }
        TextFilter.UNMARKED -> questions.filter { it.id !in markedIds }
    }

    private fun rebuildSnapshot() {
        snapshot = computeFiltered()
        shuffledIndices = (0 until snapshot.size).shuffled()
        currentIndex = 0
    }

    // ---- 持久化（200ms 防抖） ----

    private fun scheduleSave() {
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(200)
            if (!loaded) return@launch
            sessionStore.saveTextSession(
                bankId, pageType.key,
                TextSessionState(
                    currentIndex = currentIndex,
                    playMode = playMode,
                    filterMode = filterMode,
                    shuffledIndices = shuffledIndices,
                    startTime = startTime,
                    revealedIds = revealedIds.toList(),
                ),
            )
        }
    }
}
