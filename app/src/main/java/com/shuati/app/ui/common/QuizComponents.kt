package com.shuati.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.shuati.app.domain.model.Question
import com.shuati.app.ui.theme.QuizTheme

/** 分段式模式切换条（顺序/随机、快速/正常/背题、筛选行共用） */
@Composable
fun ModeToggleRow(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(Modifier.padding(4.dp)) {
            options.forEachIndexed { i, label ->
                val selected = i == selectedIndex
                Surface(
                    onClick = { onSelect(i) },
                    shape = MaterialTheme.shapes.small,
                    color = if (selected) MaterialTheme.colorScheme.surface else Color.Transparent,
                    shadowElevation = if (selected) 1.dp else 0.dp,
                    modifier = Modifier.weight(1f).padding(horizontal = 2.dp),
                ) {
                    Text(
                        label,
                        modifier = Modifier.padding(vertical = 8.dp),
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (selected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** 右对齐小操作按钮行（🔄 重做做错 / 全部清除） */
@Composable
fun ActionChipsRow(
    actions: List<Triple<String, Boolean, () -> Unit>>, // (文本, 是否红色, onClick)
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End),
    ) {
        actions.forEach { (text, destructive, onClick) ->
            OutlinedButton(
                onClick = onClick,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                border = BorderStroke(
                    1.dp,
                    if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline,
                ),
            ) {
                Text(
                    text,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

/** 6dp 圆角进度条（对齐旧版 ProgressBar） */
@Composable
fun QuizProgressBar(current: Int, total: Int, modifier: Modifier = Modifier) {
    val progress = if (total > 0) current.toFloat() / total else 0f
    LinearProgressIndicator(
        progress = { progress.coerceIn(0f, 1f) },
        modifier = modifier
            .fillMaxWidth()
            .height(6.dp),
        strokeCap = androidx.compose.ui.graphics.StrokeCap.Round,
    )
}

/** 统计行：正确 n(绿) 错误 m(红) ｜ 当前/总数 */
@Composable
fun StatsRow(
    leftContent: @Composable () -> Unit,
    rightText: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leftContent()
        Text(
            rightText,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * 紧凑状态行（v3.1 弹层收纳布局）：
 * [进度条 weight1] [统计槽] [筛选chip(可选)] [⚙ 设置]，单行 ~36dp，
 * 模式切换/筛选/操作全部收进 ⚙ 唤出的底部弹层，题目区域最大化。
 */
@Composable
fun CompactStatusRow(
    progressCurrent: Int,
    progressTotal: Int,
    filterChip: String?,
    onChipClick: () -> Unit,
    onSettingsClick: () -> Unit,
    modifier: Modifier = Modifier,
    statsContent: @Composable () -> Unit,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        QuizProgressBar(
            current = progressCurrent,
            total = progressTotal,
            modifier = Modifier.weight(1f),
        )
        statsContent()
        if (filterChip != null) {
            Surface(
                onClick = onChipClick,
                shape = MaterialTheme.shapes.small,
                color = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Text(
                    filterChip,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
        }
        Surface(
            onClick = onSettingsClick,
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Text(
                "⚙",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

/** 选择题选项按钮状态 */
enum class OptionUiState { DEFAULT, SELECTED, CORRECT, WRONG }

/** 全宽左对齐选项按钮：默认 / 预选蓝 / 对绿 / 错红 */
@Composable
fun OptionButton(
    label: String,
    text: String,
    state: OptionUiState,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val quiz = QuizTheme.colors
    val (bg, border, fg) = when (state) {
        OptionUiState.DEFAULT -> Triple(
            MaterialTheme.colorScheme.surface,
            MaterialTheme.colorScheme.outline,
            MaterialTheme.colorScheme.onSurface,
        )
        OptionUiState.SELECTED -> Triple(
            MaterialTheme.colorScheme.primaryContainer,
            MaterialTheme.colorScheme.primary,
            MaterialTheme.colorScheme.onSurface,
        )
        OptionUiState.CORRECT -> Triple(quiz.correctContainer, quiz.correct, quiz.correct)
        OptionUiState.WRONG -> Triple(quiz.wrongContainer, quiz.wrong, quiz.wrong)
    }
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = MaterialTheme.shapes.medium,
        color = bg,
        border = BorderStroke(1.5.dp, border),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                Text(
                    "$label.",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = fg,
                )
                Text(
                    text,
                    style = MaterialTheme.typography.bodyLarge,
                    color = fg,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
}

/** 解析/答案浅蓝框 */
@Composable
fun ExplanationBox(label: String, content: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = QuizTheme.colors.explainContainer,
    ) {
        Row(Modifier.padding(12.dp)) {
                Text(
                    buildString { append(label); append(content) },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
}

/** 题号跳转面板：网格（绿=对、红=错、蓝圈=当前），点击跳题 */
@Composable
fun QuestionGridDialog(
    questions: List<Question>,
    statusOf: (Question) -> Boolean?, // true=对 false=错 null=未做
    isCurrent: (Int) -> Boolean,
    numberOf: (Question) -> Int,
    onJump: (Int) -> Unit,
    onDismiss: () -> Unit,
    title: String = "选择题目",
) {
    val quiz = QuizTheme.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            LazyVerticalGrid(
                columns = GridCells.Fixed(6),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.height(320.dp),
            ) {
                itemsIndexed(questions) { i, q ->
                    val status = statusOf(q)
                    val bg = when (status) {
                        true -> quiz.correctContainer
                        false -> quiz.wrongContainer
                        null -> MaterialTheme.colorScheme.surfaceVariant
                    }
                    val fg = when (status) {
                        true -> quiz.correct
                        false -> quiz.wrong
                        null -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                    Surface(
                        onClick = { onJump(i) },
                        shape = CircleShape,
                        color = bg,
                        border = if (isCurrent(i)) {
                            BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
                        } else null,
                        modifier = Modifier.size(40.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(numberOf(q).toString(), style = MaterialTheme.typography.labelMedium, color = fg)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("关闭") }
        },
    )
}

/** 完成页内容：🎉 + 大号百分比 + 明细 + 操作按钮 */
@Composable
fun CompleteContent(
    percent: Int?,
    detailLines: List<String>,
    primaryText: String,
    onPrimary: () -> Unit,
    secondaryText: String,
    onSecondary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val quiz = QuizTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("🎉 全部完成！", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (percent != null) {
            Text(
                "$percent%",
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold,
                color = if (percent >= 60) quiz.correct else quiz.wrong,
                modifier = Modifier.padding(vertical = 12.dp),
            )
        }
        detailLines.forEach {
            Text(
                it,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 2.dp),
            )
        }
        Row(
            modifier = Modifier.padding(top = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            androidx.compose.material3.Button(onClick = onPrimary) { Text(primaryText) }
            OutlinedButton(onClick = onSecondary) { Text(secondaryText) }
        }
    }
}
