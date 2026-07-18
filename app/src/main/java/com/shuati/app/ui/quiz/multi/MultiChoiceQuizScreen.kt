package com.shuati.app.ui.quiz.multi

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shuati.app.data.session.PlayMode
import com.shuati.app.domain.model.Question
import com.shuati.app.ui.common.ExplanationBox
import com.shuati.app.ui.common.OptionButton
import com.shuati.app.ui.common.OptionUiState
import com.shuati.app.ui.quiz.core.ChoiceLikeQuizPage
import com.shuati.app.ui.quiz.core.quizViewModel
import com.shuati.app.ui.theme.QuizTheme

/** 不定项选择页（兼收单选题，与旧版有意行为一致） */
@Composable
fun MultiChoiceQuizScreen(navController: NavController, bankId: String) {
    val vm = quizViewModel("multi_$bankId") { app ->
        MultiChoiceQuizViewModel(app, bankId)
    }
    ChoiceLikeQuizPage(
        vm = vm,
        navController = navController,
        titlePrefix = "不定项",
        showQuickMode = false,
    ) { q -> MultiQuestionCard(vm, q) }
}

@Composable
private fun MultiQuestionCard(vm: MultiChoiceQuizViewModel, q: Question) {
    val answered = vm.isAnswered(q)
    val userAnswer = vm.historyAnswers[q.id].orEmpty()
    val isCurrent = vm.currentQuestion?.id == q.id
    val memorize = vm.playMode == PlayMode.MEMORIZE
    val quiz = QuizTheme.colors

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(q.stem, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)

            q.options.forEach { opt ->
                val inAnswer = q.answer.contains(opt.label)
                val inUser = userAnswer.contains(opt.label)
                val checked = isCurrent && opt.label in vm.selectedSet
                val state = when {
                    memorize -> if (inAnswer) OptionUiState.CORRECT else OptionUiState.DEFAULT
                    answered -> when {
                        inAnswer -> OptionUiState.CORRECT
                        inUser -> OptionUiState.WRONG
                        else -> OptionUiState.DEFAULT
                    }
                    checked -> OptionUiState.SELECTED
                    else -> OptionUiState.DEFAULT
                }
                OptionButton(
                    label = opt.label,
                    text = opt.text,
                    state = state,
                    enabled = !answered && !memorize,
                    onClick = { vm.toggle(opt.label) },
                )
            }

            // 提交按钮（未选禁用；已答/背题隐藏）
            if (!answered && !memorize) {
                Button(
                    onClick = vm::submitSelection,
                    enabled = isCurrent && vm.selectedSet.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                ) {
                    Text(
                        if (isCurrent && vm.selectedSet.isNotEmpty())
                            "提交（已选 ${vm.selectedSet.sorted().joinToString("")}）"
                        else "提交"
                    )
                }
            }

            if (answered && !memorize) {
                val correct = userAnswer == q.answer
                Text(
                    if (correct) "✅ 正确！" else "❌ 错误！正确答案是 ${q.answer}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = if (correct) quiz.correct else quiz.wrong,
                )
                q.explanation?.let { ExplanationBox("解析：", it) }
            }

            if (memorize) {
                ExplanationBox("答案：", q.answer)
                q.explanation?.let { ExplanationBox("解析：", it) }
            }
        }
    }
}
