package com.shuati.app.ui.quiz.choice

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.shuati.app.data.session.PlayMode
import com.shuati.app.ui.quiz.core.PageType
import com.shuati.app.ui.quiz.core.QuizSessionViewModel

/**
 * 选择题页 / 判断题页共用 ViewModel。
 * kind=CHOICE：正常模式首点=预选、再点同项=提交；
 * kind=TRUE_FALSE：两键直接提交（无预选），快速答对同样 700ms 自动跳。
 */
class ChoiceQuizViewModel(
    application: Application,
    bankId: String,
    private val kind: PageType,
) : QuizSessionViewModel(application, bankId, kind) {

    /** 正常模式的预选（蓝色高亮） */
    var pendingAnswer by mutableStateOf<String?>(null)
        private set

    fun select(answer: String) {
        val q = currentQuestion ?: return
        if (playMode == PlayMode.MEMORIZE || isAnswered(q)) return
        when {
            playMode == PlayMode.QUICK || kind == PageType.TRUE_FALSE -> submitAnswer(answer)
            pendingAnswer == answer -> submitAnswer(answer)
            else -> pendingAnswer = answer
        }
    }

    override fun onAnswered(correct: Boolean) {
        pendingAnswer = null
        super.onAnswered(correct)
    }

    override fun onQuestionChanged() {
        pendingAnswer = null
    }
}
