package com.shuati.app.ui.quiz.core

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavController
import com.shuati.app.data.session.ChoiceFilter
import com.shuati.app.data.session.PlayMode
import com.shuati.app.data.session.QuizMode
import com.shuati.app.domain.model.Question
import com.shuati.app.ui.common.CompactStatusRow
import com.shuati.app.ui.common.CompleteContent
import com.shuati.app.ui.common.ConfirmDialog
import com.shuati.app.ui.common.EmptyState
import com.shuati.app.ui.common.ModeToggleRow
import com.shuati.app.ui.common.ActionChipsRow
import com.shuati.app.ui.common.QuestionGridDialog
import com.shuati.app.ui.theme.QuizTheme
import kotlin.math.abs

/** 无 Hilt 的 ViewModel 便捷创建（key 隔离不同题库/页面实例） */
@Composable
inline fun <reified VM : ViewModel> quizViewModel(key: String, crossinline create: (Application) -> VM): VM {
    val app = LocalContext.current.applicationContext as Application
    return viewModel(key = key, factory = viewModelFactory { initializer { create(app) } })
}

/**
 * 选择/判断/不定项/填空页共用骨架：
 * 顶栏(返回|标题|📋) → 模式条×3 → 操作行 → 进度条 → 统计行 → HorizontalPager(题卡) → 底部按钮行；
 * 完成页、题号面板、重做做错/全部清除确认弹窗内建。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChoiceLikeQuizPage(
    vm: QuizSessionViewModel,
    navController: NavController,
    titlePrefix: String,
    showQuickMode: Boolean,
    questionCard: @Composable (Question) -> Unit,
) {
    var showGrid by remember { mutableStateOf(false) }
    var showRedoConfirm by remember { mutableStateOf(false) }
    var showClearConfirm by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }

    if (!vm.loaded) {
        androidx.compose.foundation.layout.Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    // ---- 完成页 ----
    if (vm.showComplete) {
        val total = vm.sessionCorrect + vm.sessionWrong
        val pct = if (total > 0) (vm.sessionCorrect * 100.0 / total).toInt() else 0
        val elapsed = ((System.currentTimeMillis() - vm.startTime) / 1000).toInt()
        Scaffold(
            topBar = { CenterAlignedTopAppBar(title = { Text("刷题完成", fontWeight = FontWeight.Bold) }) },
        ) { padding ->
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CompleteContent(
                    percent = pct,
                    detailLines = listOf(
                        "正确 ${vm.sessionCorrect} / 共 $total 题",
                        "用时 ${elapsed / 60} 分 ${elapsed % 60} 秒",
                        "错题 ${vm.sessionWrong} 道",
                    ),
                    primaryText = "🔄 重新开始",
                    onPrimary = { showClearConfirm = true },
                    secondaryText = "🏠 返回首页",
                    onSecondary = { navController.popBackStack() },
                )
                TextButton(onClick = vm::dismissComplete) { Text("← 继续看题") }
            }
        }
        if (showClearConfirm) {
            ConfirmDialog(
                title = "重新开始",
                message = "确定清除所有答题记录？所有已做/做错记录将被清空。",
                destructive = true,
                onConfirm = { showClearConfirm = false; vm.fullRestart() },
                onDismiss = { showClearConfirm = false },
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
                        "$titlePrefix (${q?.idx ?: vm.currentIndex + 1}/${vm.questions.size})",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                navigationIcon = {
                    TextButton(onClick = { navController.popBackStack() }) { Text("← 返回") }
                },
                actions = {
                    TextButton(onClick = { showGrid = true }) { Text("📋") }
                },
            )
        },
        bottomBar = {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = vm::prev,
                    enabled = vm.currentIndex > 0,
                ) { Text("← 上一题") }
                Button(
                    onClick = vm::next,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        when {
                            vm.everCompleted -> "查看成绩"
                            vm.currentIndex >= vm.snapshot.size - 1 -> "完成"
                            else -> "下一题 →"
                        }
                    )
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // 紧凑状态行：进度 + 对错计数 + 筛选chip + ⚙（控制项收进底部弹层）
            CompactStatusRow(
                progressCurrent = vm.currentIndex + if (vm.currentAnswered) 1 else 0,
                progressTotal = vm.snapshot.size,
                filterChip = when (vm.filterMode) {
                    ChoiceFilter.ALL -> null
                    ChoiceFilter.UNDONE -> "未做"
                    ChoiceFilter.WRONG -> "做错"
                    ChoiceFilter.DONE -> "已做"
                },
                onChipClick = { showSettings = true },
                onSettingsClick = { showSettings = true },
            ) {
                Text("对", style = MaterialTheme.typography.bodySmall)
                Text(
                    "${vm.sessionCorrect}",
                    style = MaterialTheme.typography.bodySmall,
                    color = QuizTheme.colors.correct,
                    fontWeight = FontWeight.Bold,
                )
                Text("错", style = MaterialTheme.typography.bodySmall)
                Text(
                    "${vm.sessionWrong}",
                    style = MaterialTheme.typography.bodySmall,
                    color = QuizTheme.colors.wrong,
                    fontWeight = FontWeight.Bold,
                )
            }

            // 筛选空态
            if (vm.snapshot.isEmpty()) {
                when (vm.filterMode) {
                    ChoiceFilter.WRONG -> EmptyState("🎉", "没有做错的题目")
                    ChoiceFilter.DONE -> EmptyState("📋", "还没有做过的题目")
                    ChoiceFilter.UNDONE -> EmptyState("📝", "全部已完成")
                    ChoiceFilter.ALL -> EmptyState("📭", "该题库没有此类型的题目")
                }
            } else {
                // 滑动切题（Pager 与 VM 单一数据源同步）
                val pagerState = rememberPagerState(
                    initialPage = vm.currentIndex.coerceIn(0, vm.snapshot.size - 1),
                    pageCount = { vm.snapshot.size },
                )
                LaunchedEffect(vm.currentIndex, vm.snapshot.size) {
                    val target = vm.currentIndex.coerceIn(0, vm.snapshot.size - 1)
                    if (pagerState.currentPage != target) {
                        if (abs(pagerState.currentPage - target) == 1) {
                            pagerState.animateScrollToPage(target)
                        } else {
                            pagerState.scrollToPage(target)
                        }
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
                            Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                                .padding(vertical = 4.dp),
                        ) {
                            SelectionContainer {
                                questionCard(pageQ)
                            }
                        }
                    }
                }
            }
        }
    }

    // ---- 设置弹层：模式/筛选/操作全部收纳于此 ----
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
                Text("刷题设置", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                // 顺序/随机
                ModeToggleRow(
                    options = listOf("顺序刷题", "随机刷题"),
                    selectedIndex = if (vm.mode == QuizMode.SEQUENTIAL) 0 else 1,
                    onSelect = { vm.setModeTo(if (it == 0) QuizMode.SEQUENTIAL else QuizMode.RANDOM) },
                )
                // 快速/正常/背题
                if (showQuickMode) {
                    ModeToggleRow(
                        options = listOf("⚡快速", "📝正常", "📖背题"),
                        selectedIndex = when (vm.playMode) {
                            PlayMode.QUICK -> 0
                            PlayMode.NORMAL -> 1
                            PlayMode.MEMORIZE -> 2
                        },
                        onSelect = {
                            vm.setPlayModeTo(
                                when (it) {
                                    0 -> PlayMode.QUICK
                                    1 -> PlayMode.NORMAL
                                    else -> PlayMode.MEMORIZE
                                }
                            )
                        },
                    )
                } else {
                    ModeToggleRow(
                        options = listOf("📝正常", "📖背题"),
                        selectedIndex = if (vm.playMode == PlayMode.MEMORIZE) 1 else 0,
                        onSelect = { vm.setPlayModeTo(if (it == 1) PlayMode.MEMORIZE else PlayMode.NORMAL) },
                    )
                }
                // 筛选
                ModeToggleRow(
                    options = listOf("全部", "未做", "做错", "已做"),
                    selectedIndex = when (vm.filterMode) {
                        ChoiceFilter.ALL -> 0
                        ChoiceFilter.UNDONE -> 1
                        ChoiceFilter.WRONG -> 2
                        ChoiceFilter.DONE -> 3
                    },
                    onSelect = {
                        vm.setFilterTo(
                            when (it) {
                                0 -> ChoiceFilter.ALL
                                1 -> ChoiceFilter.UNDONE
                                2 -> ChoiceFilter.WRONG
                                else -> ChoiceFilter.DONE
                            }
                        )
                    },
                )
                // 重做做错 / 全部清除
                ActionChipsRow(
                    actions = listOf(
                        Triple("🔄 重做做错", false) { showRedoConfirm = true },
                        Triple("全部清除", true) { showClearConfirm = true },
                    ),
                )
            }
        }
    }

    // ---- 弹窗 ----
    if (showGrid) {
        QuestionGridDialog(
            questions = vm.snapshot,
            statusOf = vm::statusOf,
            isCurrent = vm::isCurrentSnapshotPos,
            numberOf = { it.idx },
            onJump = { showGrid = false; vm.jumpToSnapshotPos(it) },
            onDismiss = { showGrid = false },
        )
    }
    if (showRedoConfirm) {
        ConfirmDialog(
            title = "重做做错",
            message = "重做所有做错的题目？错误记录保留，只重置答题状态。",
            onConfirm = { showRedoConfirm = false; vm.redoWrong() },
            onDismiss = { showRedoConfirm = false },
        )
    }
    if (showClearConfirm) {
        ConfirmDialog(
            title = "全部清除",
            message = "确定清除所有答题记录？所有已做/做错记录将被清空。",
            destructive = true,
            onConfirm = { showClearConfirm = false; vm.fullRestart() },
            onDismiss = { showClearConfirm = false },
        )
    }
}
