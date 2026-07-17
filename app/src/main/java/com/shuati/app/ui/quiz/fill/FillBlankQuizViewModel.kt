package com.shuati.app.ui.quiz.fill

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.shuati.app.domain.model.Question
import com.shuati.app.ui.quiz.core.PageType
import com.shuati.app.ui.quiz.core.QuizSessionViewModel

/**
 * 填空题页 ViewModel（原生版新增题型）：
 * 看答案 → 自评「我对了/我错了」→ 计入 answer_records（userAnswer="对"/"错"）。
 * 复用选择页会话语义（筛选/重做做错/全部清除/题号面板）。
 */
class FillBlankQuizViewModel(
    application: Application,
    bankId: String,
) : QuizSessionViewModel(application, bankId, PageType.FILL_BLANK) {

    override val allowQuick = false

    /** 本次会话内已展开答案的题（不持久化：已作答即隐含已看过答案） */
    var revealed by mutableStateOf<Set<String>>(emptySet())
        private set

    fun reveal(q: Question) {
        revealed = revealed + q.id
    }

    /** 自评：对 → 计正确；错 → 计错误并进错题 */
    fun selfAssess(correct: Boolean) {
        submitAnswer(if (correct) "对" else "错")
    }

    /** 自评语义判分：userAnswer=="对" 即正确 */
    override fun judge(q: Question, userAnswer: String): Boolean = userAnswer == "对"
}
