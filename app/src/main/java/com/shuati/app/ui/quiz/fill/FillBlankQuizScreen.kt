package com.shuati.app.ui.quiz.fill

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shuati.app.data.session.PlayMode
import com.shuati.app.domain.model.Question
import com.shuati.app.ui.common.ExplanationBox
import com.shuati.app.ui.quiz.core.ChoiceLikeQuizPage
import com.shuati.app.ui.quiz.core.quizViewModel
import com.shuati.app.ui.theme.QuizTheme

/** 填空题页：看答案后自评（✅ 我对了 / ❌ 我错了） */
@Composable
fun FillBlankQuizScreen(navController: NavController, bankId: String) {
    val vm = quizViewModel("fill_$bankId") { app ->
        FillBlankQuizViewModel(app, bankId)
    }
    ChoiceLikeQuizPage(
        vm = vm,
        navController = navController,
        titlePrefix = "填空题",
        showQuickMode = false,
    ) { q -> FillBlankQuestionCard(vm, q) }
}

@Composable
private fun FillBlankQuestionCard(vm: FillBlankQuizViewModel, q: Question) {
    val answered = vm.isAnswered(q)
    val memorize = vm.playMode == PlayMode.MEMORIZE
    val revealed = memorize || answered || q.id in vm.revealed
    val isCurrent = vm.currentQuestion?.id == q.id
    val quiz = QuizTheme.colors

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(q.stem, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)

            if (!revealed) {
                OutlinedButton(
                    onClick = { vm.reveal(q) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("👁 查看答案") }
            } else {
                ExplanationBox("参考答案：", q.answer)
                q.explanation?.let { ExplanationBox("解析：", it) }

                if (!answered && !memorize) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            onClick = { vm.selfAssess(true) },
                            enabled = isCurrent,
                            colors = ButtonDefaults.buttonColors(containerColor = quiz.correct),
                            modifier = Modifier.weight(1f),
                        ) { Text("✅ 我对了") }
                        Button(
                            onClick = { vm.selfAssess(false) },
                            enabled = isCurrent,
                            colors = ButtonDefaults.buttonColors(containerColor = quiz.wrong),
                            modifier = Modifier.weight(1f),
                        ) { Text("❌ 我错了") }
                    }
                }

                if (answered && !memorize) {
                    val correct = vm.historyAnswers[q.id] == "对"
                    Text(
                        if (correct) "✅ 已记为答对" else "❌ 已记为答错，已加入错题",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = if (correct) quiz.correct else quiz.wrong,
                    )
                }
            }
        }
    }
}
