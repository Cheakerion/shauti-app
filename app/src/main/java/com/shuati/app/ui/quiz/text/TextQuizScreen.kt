package com.shuati.app.ui.quiz.text

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shuati.app.data.session.PlayMode
import com.shuati.app.data.session.TextFilter
import com.shuati.app.domain.model.Question
import com.shuati.app.domain.model.QuestionType
import com.shuati.app.ui.common.ActionChipsRow
import com.shuati.app.ui.common.CompactStatusRow
import com.shuati.app.ui.common.CompleteContent
import com.shuati.app.ui.common.ConfirmDialog
import com.shuati.app.ui.common.EmptyState
import com.shuati.app.ui.common.ExplanationBox
import com.shuati.app.ui.common.ModeToggleRow
import com.shuati.app.ui.quiz.core.PageType
import com.shuati.app.ui.quiz.core.quizViewModel
import com.shuati.app.ui.theme.QuizTheme
import kotlin.math.abs

/** 名词解释/简答页（同构，qType 参数区分） */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TextQuizScreen(navController: NavController, bankId: String, qTypeKey: String) {
    val pageType = if (qTypeKey == "explain") PageType.EXPLAIN else PageType.SHORT_ANSWER
    val vm = quizViewModel("text_${bankId}_$qTypeKey") { app ->
        TextQuizViewModel(app, bankId, pageType)
    }

    var showGrid by remember { mutableStateOf(false) }
    var showClearMarks by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }

    if (!vm.loaded) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    // ---- 完成页 ----
    if (vm.showComplete) {
        val elapsed = ((System.currentTimeMillis() - vm.startTime) / 1000).toInt()
        Scaffold(
            topBar = { CenterAlignedTopAppBar(title = { Text("${vm.pageType.label}完成", fontWeight = FontWeight.Bold) }) },
        ) { padding ->
            Column(
                Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CompleteContent(
                    percent = null,
                    detailLines = listOf(
                        "共浏览 ${vm.revealedIds.size} / ${vm.questions.size} 题",
                        "标记 ${vm.markedIds.size} 道",
                        "用时 ${elapsed / 60} 分 ${elapsed % 60} 秒",
                    ),
                    primaryText = "🧹 消除标记",
                    onPrimary = { showClearMarks = true },
                    secondaryText = "🏠 返回首页",
                    onSecondary = { navController.popBackStack() },
                )
                TextButton(onClick = vm::dismissComplete) { Text("← 继续看题") }
            }
        }
        if (showClearMarks) {
            ConfirmDialog(
                title = "消除标记",
                message = "清除该题库所有标记并重置浏览进度？",
                destructive = true,
                onConfirm = { showClearMarks = false; vm.clearMarksAndReset() },
                onDismiss = { showClearMarks = false },
            )
        }
        return
    }

    val q = vm.currentQuestion

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        "${vm.pageType.label} (${vm.currentIndex + 1}/${vm.snapshot.size.coerceAtLeast(1)})",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                navigationIcon = { TextButton(onClick = { navController.popBackStack() }) { Text("← 返回") } },
                actions = { TextButton(onClick = { showGrid = true }) { Text("📋") } },
            )
        },
        bottomBar = {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(onClick = vm::prev, enabled = vm.currentIndex > 0) { Text("← 上一题") }
                Button(onClick = vm::next, modifier = Modifier.weight(1f)) {
                    Text(
                        when {
                            vm.everCompleted -> "查看统计"
                            vm.currentIndex >= vm.snapshot.size - 1 -> "完成"
                            else -> "下一题 →"
                        }
                    )
                }
            }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // 紧凑状态行：进度 + 已看/标记计数 + 筛选chip + ⚙（控制项收进底部弹层）
            CompactStatusRow(
                progressCurrent = vm.currentIndex + 1,
                progressTotal = vm.snapshot.size,
                filterChip = when (vm.filterMode) {
                    TextFilter.ALL -> null
                    TextFilter.MARKED -> "已标记"
                    TextFilter.UNMARKED -> "未标记"
                },
                onChipClick = { showSettings = true },
                onSettingsClick = { showSettings = true },
            ) {
                Text("看", style = MaterialTheme.typography.bodySmall)
                Text(
                    "${vm.revealedIds.size}",
                    style = MaterialTheme.typography.bodySmall,
                    color = QuizTheme.colors.correct,
                    fontWeight = FontWeight.Bold,
                )
                Text("标", style = MaterialTheme.typography.bodySmall)
                Text(
                    "${vm.markedIds.size}",
                    style = MaterialTheme.typography.bodySmall,
                    color = QuizTheme.colors.marked,
                    fontWeight = FontWeight.Bold,
                )
            }

            if (vm.snapshot.isEmpty()) {
                when (vm.filterMode) {
                    TextFilter.MARKED -> EmptyState("⭐", "还没有标记的题目")
                    TextFilter.UNMARKED -> EmptyState("🎉", "全部题目都已标记")
                    TextFilter.ALL -> EmptyState("📭", "该题库没有此类型的题目")
                }
            } else {
                val pagerState = rememberPagerState(
                    initialPage = vm.currentIndex.coerceIn(0, vm.snapshot.size - 1),
                    pageCount = { vm.snapshot.size },
                )
                LaunchedEffect(vm.currentIndex, vm.snapshot.size) {
                    val target = vm.currentIndex.coerceIn(0, vm.snapshot.size - 1)
                    if (pagerState.currentPage != target) {
                        if (abs(pagerState.currentPage - target) == 1) pagerState.animateScrollToPage(target)
                        else pagerState.scrollToPage(target)
                    }
                }
                LaunchedEffect(pagerState) {
                    snapshotFlow { pagerState.settledPage }.collect { vm.onPageSettled(it) }
                }
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.Top,
                ) { page ->
                    val pageQ = vm.questionAt(page)
                    if (pageQ != null) {
                        Column(
                            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 4.dp),
                        ) {
                            TextQuestionCard(vm, pageQ)
                        }
                    }
                }
            }
        }
    }

    if (showSettings) {
        ModalBottomSheet(
            onDismissRequest = { showSettings = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("文本题设置", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                ModeToggleRow(
                    options = listOf("📝正常", "📖背题"),
                    selectedIndex = if (vm.playMode == PlayMode.MEMORIZE) 1 else 0,
                    onSelect = { vm.setPlayModeTo(if (it == 1) PlayMode.MEMORIZE else PlayMode.NORMAL) },
                )
                ModeToggleRow(
                    options = listOf("全部", "已标记(${vm.markedIds.size})", "未标记"),
                    selectedIndex = when (vm.filterMode) {
                        TextFilter.ALL -> 0
                        TextFilter.MARKED -> 1
                        TextFilter.UNMARKED -> 2
                    },
                    onSelect = {
                        vm.setFilterTo(
                            when (it) {
                                0 -> TextFilter.ALL
                                1 -> TextFilter.MARKED
                                else -> TextFilter.UNMARKED
                            }
                        )
                    },
                )
                ActionChipsRow(
                    actions = listOf(Triple("🧹 消除标记", true) { showClearMarks = true }),
                )
            }
        }
    }

    if (showGrid) {
        TextQuestionGridDialog(
            vm = vm,
            onJump = { showGrid = false; vm.jumpToSnapshotPos(it) },
            onDismiss = { showGrid = false },
        )
    }
    if (showClearMarks) {
        ConfirmDialog(
            title = "消除标记",
            message = "清除该题库所有标记并重置浏览进度？",
            destructive = true,
            onConfirm = { showClearMarks = false; vm.clearMarksAndReset() },
            onDismiss = { showClearMarks = false },
        )
    }
}

/** 文本题卡：英文术语正反面（explain 有 engStem 时题干只显英文，展开后显中文+定义） */
@Composable
private fun TextQuestionCard(vm: TextQuizViewModel, q: Question) {
    val expanded = vm.isExpanded(q)
    val marked = q.id in vm.markedIds
    val isExplainWithEng = q.type == QuestionType.EXPLAIN && !q.engStem.isNullOrEmpty()
    val quiz = QuizTheme.colors

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // 题干：有英文术语时正面只显示英文
            SelectionContainer {
                Text(
                    if (isExplainWithEng) q.engStem!! else q.stem,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            if (!expanded) {
                OutlinedButton(
                    onClick = { vm.reveal(q) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("👁 查看答案") }
            } else {
                if (isExplainWithEng) {
                    SelectionContainer {
                        Text(q.stem, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
                    }
                }
                ExplanationBox("参考答案：", q.answer)
                q.explanation?.let { ExplanationBox("解析：", it) }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { vm.toggleMark(q) },
                        border = BorderStroke(1.dp, quiz.marked),
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            if (marked) "⭐ 已标记" else "☆ 标记此题",
                            color = quiz.marked,
                        )
                    }
                    if (vm.playMode != PlayMode.MEMORIZE) {
                        OutlinedButton(
                            onClick = { vm.collapse(q) },
                            modifier = Modifier.weight(1f),
                        ) { Text("收起答案") }
                    }
                }
            }
        }
    }
}

/** 文本页题号面板：绿=已看、橙=已标记（优先）、蓝圈=当前 */
@Composable
private fun TextQuestionGridDialog(
    vm: TextQuizViewModel,
    onJump: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val quiz = QuizTheme.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("选择题目") },
        text = {
            LazyVerticalGrid(
                columns = GridCells.Fixed(6),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.height(320.dp),
            ) {
                itemsIndexed(vm.snapshot) { i, q ->
                    val marked = q.id in vm.markedIds
                    val revealed = q.id in vm.revealedIds
                    val bg = when {
                        marked -> quiz.marked.copy(alpha = 0.2f)
                        revealed -> quiz.correctContainer
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    }
                    val fg = when {
                        marked -> quiz.marked
                        revealed -> quiz.correct
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                    Surface(
                        onClick = { onJump(i) },
                        shape = CircleShape,
                        color = bg,
                        border = if (vm.isCurrentSnapshotPos(i)) {
                            BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
                        } else null,
                        modifier = Modifier.size(40.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(q.idx.toString(), style = MaterialTheme.typography.labelMedium, color = fg)
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("关闭") } },
    )
}
