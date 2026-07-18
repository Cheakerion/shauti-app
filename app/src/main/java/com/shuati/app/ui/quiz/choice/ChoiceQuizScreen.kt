package com.shuati.app.ui.quiz.choice

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
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
import com.shuati.app.ui.quiz.core.PageType
import com.shuati.app.ui.quiz.core.quizViewModel
import com.shuati.app.ui.theme.QuizTheme

/** 单选题刷题页（旧版 Quiz.tsx 的原生复刻） */
@Composable
fun ChoiceQuizScreen(navController: NavController, bankId: String) {
    val vm = quizViewModel("choice_$bankId") { app ->
        ChoiceQuizViewModel(app, bankId, PageType.CHOICE)
    }
    ChoiceLikeQuizPage(
        vm = vm,
        navController = navController,
        titlePrefix = "刷题",
        showQuickMode = true,
    ) { q -> ChoiceQuestionCard(vm, q) }
}

/** 选择题题卡：题干 + 选项 + 预选提示 + 判分反馈 + 解析（背题恒显答案） */
@Composable
fun ChoiceQuestionCard(vm: ChoiceQuizViewModel, q: Question) {
    val answered = vm.isAnswered(q)
    val selected = vm.historyAnswers[q.id]
    val isCurrent = vm.currentQuestion?.id == q.id
    val pending = if (isCurrent) vm.pendingAnswer else null
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
                val isCorrectOpt = opt.label == q.answer
                val state = when {
                    memorize -> if (isCorrectOpt) OptionUiState.CORRECT else OptionUiState.DEFAULT
                    answered -> when {
                        isCorrectOpt -> OptionUiState.CORRECT
                        opt.label == selected -> OptionUiState.WRONG
                        else -> OptionUiState.DEFAULT
                    }
                    pending == opt.label -> OptionUiState.SELECTED
                    else -> OptionUiState.DEFAULT
                }
                OptionButton(
                    label = opt.label,
                    text = opt.text,
                    state = state,
                    enabled = !answered && !memorize,
                    onClick = { vm.select(opt.label) },
                )
            }

            // 正常模式：预选提示
            if (pending != null && !answered) {
                Text(
                    "已选 $pending，再次点击提交",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // 判分反馈
            if (answered && !memorize) {
                val correct = selected == q.answer
                Text(
                    if (correct) "✅ 正确！" else "❌ 错误！正确答案是 ${q.answer}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = if (correct) quiz.correct else quiz.wrong,
                )
                if (vm.autoAdvancing && isCurrent) {
                    Text(
                        "✓ 自动跳转下一题...",
                        style = MaterialTheme.typography.bodySmall,
                        color = quiz.correct,
                    )
                }
                q.explanation?.let { ExplanationBox("解析：", it) }
            }

            // 背题模式：恒显答案 + 解析
            if (memorize) {
                ExplanationBox("答案：", q.answer)
                q.explanation?.let { ExplanationBox("解析：", it) }
            }
        }
    }
}
