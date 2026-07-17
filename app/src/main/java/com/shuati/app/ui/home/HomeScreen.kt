package com.shuati.app.ui.home

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import com.shuati.app.ui.common.ConfirmDialog
import com.shuati.app.ui.common.EmptyState
import com.shuati.app.ui.common.MessageDialog
import com.shuati.app.ui.quiz.core.label

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    navController: NavController,
    vm: HomeViewModel = viewModel(),
) {
    val banks by vm.banks.collectAsState()

    // 一次性导航事件
    LaunchedEffect(Unit) {
        vm.navEvents.collect { route -> navController.navigate(route) }
    }

    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri -> if (uri != null) vm.importFromUri(uri) }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("刷题", fontWeight = FontWeight.Bold)
                        val lag = vm.lag
                        when {
                            lag == null -> {}
                            lag > 0 -> Text(
                                "落后 $lag 个更新",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                            else -> Text(
                                "已是最新",
                                style = MaterialTheme.typography.labelSmall,
                                color = com.shuati.app.ui.theme.QuizTheme.colors.correct,
                            )
                        }
                    }
                },
                actions = {
                    TextButton(onClick = vm::checkUpdate, enabled = !vm.checkingUpdate) {
                        Text(if (vm.checkingUpdate) "检查中..." else "检查更新")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                ImportCard(
                    importing = vm.importing,
                    onClick = { filePicker.launch(arrayOf("*/*")) },
                )
            }
            if (banks.isEmpty()) {
                item { EmptyState(emoji = "📭", message = "还没有题库\n点击上方按钮导入 .md / .txt 题库文件") }
            } else {
                items(banks, key = { it.bank.id }) { item ->
                    BankCard(
                        item = item,
                        onStart = { vm.startQuiz(item.bank) },
                        onDelete = { vm.requestDelete(item.bank) },
                    )
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }

    // ---- 弹窗 ----
    vm.importMessage?.let { msg ->
        MessageDialog(message = msg, onDismiss = vm::dismissImportMessage)
    }
    vm.deleteTarget?.let { bank ->
        ConfirmDialog(
            title = "删除题库",
            message = "确认删除「${bank.title}」？\n将同时删除该题库的答题记录与标记。",
            confirmText = "删除",
            destructive = true,
            onConfirm = vm::confirmDelete,
            onDismiss = vm::dismissDelete,
        )
    }
    vm.typePicker?.let { picker ->
        TypePickerDialog(
            state = picker,
            onPick = vm::pickType,
            onDismiss = vm::dismissTypePicker,
        )
    }
    vm.updateDialog?.let { info ->
        val context = LocalContext.current
        AlertDialog(
            onDismissRequest = vm::dismissUpdateDialog,
            title = { Text("发现新版本 v${info.version}") },
            text = {
                Column {
                    Text("更新序号 ${info.update}（当前 ${com.shuati.app.BuildConfig.VERSION_CODE}）")
                    if (info.notes.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(info.notes)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.dismissUpdateDialog()
                    runCatching {
                        context.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse(vm.apkDownloadUrl))
                        )
                    }
                }) { Text("去下载") }
            },
            dismissButton = {
                TextButton(onClick = vm::dismissUpdateDialog) { Text("取消") }
            },
        )
    }
}

@Composable
private fun ImportCard(importing: Boolean, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Button(onClick = onClick, enabled = !importing, modifier = Modifier.fillMaxWidth()) {
                Text(if (importing) "导入中..." else "📂 导入题库（.md / .txt）")
            }
            Text(
                "支持微信「用其他应用打开」直接导入",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun BankCard(
    item: BankItem,
    onStart: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Text(item.bank.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "${item.bank.fileName} · ${item.bank.totalCount} 题",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            Text(
                "题型: ${item.types.joinToString("+") { it.label() }}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
            Row(modifier = Modifier.padding(top = 12.dp)) {
                Button(onClick = onStart) { Text("开始刷题") }
                Spacer(Modifier.width(8.dp))
                OutlinedButton(
                    onClick = onDelete,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("删除") }
            }
        }
    }
}

@Composable
private fun TypePickerDialog(
    state: TypePickerState,
    onPick: (TypePickerEntry) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("选择要刷的题型") },
        text = {
            Column {
                Text(
                    state.bank.title,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                state.entries.forEach { entry ->
                    TextButton(
                        onClick = { onPick(entry) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        val suffix = if (entry.page == com.shuati.app.ui.quiz.core.PageType.MULTI_CHOICE &&
                            entry.count > 0
                        ) "（含单选）" else ""
                        Text("${entry.page.label}$suffix · ${entry.count} 题")
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        },
    )
}
