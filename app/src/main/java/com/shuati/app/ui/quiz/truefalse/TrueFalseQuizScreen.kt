package com.shuati.app.ui.quiz.truefalse

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shuati.app.data.session.PlayMode
import com.shuati.app.domain.model.Question
import com.shuati.app.ui.common.ExplanationBox
import com.shuati.app.ui.common.OptionUiState
import com.shuati.app.ui.quiz.choice.ChoiceQuizViewModel
import com.shuati.app.ui.quiz.core.ChoiceLikeQuizPage
import com.shuati.app.ui.quiz.core.PageType
import com.shuati.app.ui.quiz.core.quizViewModel
import com.shuati.app.ui.theme.QuizTheme

/** 判断题页：复用选择题 VM（kind=TRUE_FALSE：正常/快速均点即提交，无预选） */
@Composable
fun TrueFalseQuizScreen(navController: NavController, bankId: String) {
    val vm = quizViewModel("truefalse_$bankId") { app ->
        ChoiceQuizViewModel(app, bankId, PageType.TRUE_FALSE)
    }
    ChoiceLikeQuizPage(
        vm = vm,
        navController = navController,
        titlePrefix = "判断题",
        showQuickMode = true,
    ) { q -> TrueFalseQuestionCard(vm, q) }
}

@Composable
private fun TrueFalseQuestionCard(vm: ChoiceQuizViewModel, q: Question) {
    val answered = vm.isAnswered(q)
    val selected = vm.historyAnswers[q.id]
    val memorize = vm.playMode == PlayMode.MEMORIZE
    val quiz = QuizTheme.colors

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SelectionContainer {
                Text(q.stem, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("正确", "错误").forEach { label ->
                    val isCorrectOpt = label == q.answer
                    val state = when {
                        memorize -> if (isCorrectOpt) OptionUiState.CORRECT else OptionUiState.DEFAULT
                        answered -> when {
                            isCorrectOpt -> OptionUiState.CORRECT
                            label == selected -> OptionUiState.WRONG
                            else -> OptionUiState.DEFAULT
                        }
                        else -> OptionUiState.DEFAULT
                    }
                    val (bg, border, fg) = when (state) {
                        OptionUiState.CORRECT -> Triple(quiz.correctContainer, quiz.correct, quiz.correct)
                        OptionUiState.WRONG -> Triple(quiz.wrongContainer, quiz.wrong, quiz.wrong)
                        else -> Triple(
                            MaterialTheme.colorScheme.surface,
                            MaterialTheme.colorScheme.outline,
                            MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    Surface(
                        onClick = { vm.select(label) },
                        enabled = !answered && !memorize,
                        shape = MaterialTheme.shapes.medium,
                        color = bg,
                        border = BorderStroke(1.5.dp, border),
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            if (label == "正确") "✓ 正确" else "✗ 错误",
                            modifier = Modifier.padding(vertical = 16.dp),
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = fg,
                        )
                    }
                }
            }

            if (answered && !memorize) {
                val correct = selected == q.answer
                SelectionContainer {
                    Text(
                        if (correct) "✅ 正确！" else "❌ 错误！正确答案是 ${q.answer}",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = if (correct) quiz.correct else quiz.wrong,
                    )
                }
                if (vm.autoAdvancing && vm.currentQuestion?.id == q.id) {
                    Text("✓ 自动跳转下一题...", style = MaterialTheme.typography.bodySmall, color = quiz.correct)
                }
                q.explanation?.let { ExplanationBox("解析：", it) }
            }

            if (memorize) {
                ExplanationBox("答案：", q.answer)
                q.explanation?.let { ExplanationBox("解析：", it) }
            }
        }
    }
}
