package com.shuati.app.ui.quiz.multi

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.shuati.app.ui.quiz.core.PageType
import com.shuati.app.ui.quiz.core.QuizSessionViewModel

/**
 * 不定项选择页 ViewModel：勾选 + 提交（未选禁用），无快速模式；
 * 判分 = 所选字母排序拼接 == answer；同时加载 multi_choice + choice（兼收单选题）。
 */
class MultiChoiceQuizViewModel(
    application: Application,
    bankId: String,
) : QuizSessionViewModel(application, bankId, PageType.MULTI_CHOICE) {

    override val allowQuick = false

    /** 当前题已勾选的选项字母 */
    var selectedSet by mutableStateOf<Set<String>>(emptySet())
        private set

    fun toggle(label: String) {
        val q = currentQuestion ?: return
        if (isAnswered(q)) return
        selectedSet = if (label in selectedSet) selectedSet - label else selectedSet + label
    }

    /** 提交：所选字母排序拼接与答案比对 */
    fun submitSelection() {
        if (selectedSet.isEmpty()) return
        submitAnswer(selectedSet.sorted().joinToString(""))
    }

    override fun onAnswered(correct: Boolean) {
        selectedSet = emptySet()
        super.onAnswered(correct)
    }

    override fun onQuestionChanged() {
        selectedSet = emptySet()
    }
}
