package com.shuati.app.ui.home

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shuati.app.ShuatiApplication
import com.shuati.app.BuildConfig
import com.shuati.app.data.repository.ImportResult
import com.shuati.app.data.update.UpdateChecker
import com.shuati.app.data.update.VersionInfo
import com.shuati.app.domain.model.QuestionBank
import com.shuati.app.domain.model.QuestionType
import com.shuati.app.ui.quiz.core.PageType
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 首页：题库列表项（含题型集合） */
data class BankItem(val bank: QuestionBank, val types: List<QuestionType>)

/** 题型选择弹窗状态（混合题库） */
data class TypePickerState(val bank: QuestionBank, val entries: List<TypePickerEntry>)
data class TypePickerEntry(val page: PageType, val count: Int, val route: String)

class HomeViewModel(application: Application) : AndroidViewModel(application) {

    private val container = (application as ShuatiApplication).container
    private val bankRepo = container.bankRepository
    private val db = container.database

    val banks: StateFlow<List<BankItem>> = bankRepo.getAllBanks()
        .map { list ->
            list.map { bank ->
                val types = bankRepo.getDistinctTypes(bank.id)
                    .map { QuestionType.from(it) }
                    .sortedBy { it.ordinal }
                BankItem(bank, types)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    var importing by mutableStateOf(false)
        private set

    /** 导入结果弹窗文案（null=不显示） */
    var importMessage by mutableStateOf<String?>(null)
        private set

    /** 删除确认弹窗目标（null=不显示） */
    var deleteTarget by mutableStateOf<QuestionBank?>(null)
        private set

    /** 混合题库题型选择弹窗（null=不显示） */
    var typePicker by mutableStateOf<TypePickerState?>(null)
        private set

    /** 一次性导航事件（路由字符串） */
    private val navChannel = Channel<String>(Channel.BUFFERED)
    val navEvents = navChannel.receiveAsFlow()

    init {
        // 消费微信/文件管理器「用其他应用打开」传入的文件
        viewModelScope.launch {
            container.pendingImport.collect { uri ->
                if (uri != null) {
                    container.pendingImport.value = null
                    importFromUri(uri)
                }
            }
        }
        // 更新检查：先展示离线缓存的滞后值，再静默拉取最新
        viewModelScope.launch {
            cachedLatestUpdate = container.sessionStore.loadLatestUpdateCache()
            val info = container.updateChecker.fetch()
            if (info != null) {
                latestInfo = info
                container.sessionStore.saveLatestUpdateCache(info.update, info.version)
            }
        }
    }

    // ---- 检查更新 ----

    /** 静默拉取到的最新版本信息 */
    var latestInfo by mutableStateOf<VersionInfo?>(null)
        private set

    /** 离线缓存的远端 update 序号 */
    var cachedLatestUpdate by mutableStateOf<Int?>(null)
        private set

    var checkingUpdate by mutableStateOf(false)
        private set

    /** 更新弹窗（远端版本 + notes；null=不显示） */
    var updateDialog by mutableStateOf<VersionInfo?>(null)
        private set

    /** 落后的更新数：null=未知（无网且无缓存） */
    val lag: Int?
        get() = (latestInfo?.update ?: cachedLatestUpdate)?.let { max(0, it - BuildConfig.VERSION_CODE) }

    val apkDownloadUrl: String get() = UpdateChecker.APK_DOWNLOAD_URL

    /** 手动检查更新 */
    fun checkUpdate() {
        if (checkingUpdate) return
        checkingUpdate = true
        viewModelScope.launch {
            val info = container.updateChecker.fetch()
            checkingUpdate = false
            if (info == null) {
                importMessage = "检查更新失败，请检查网络连接"
                return@launch
            }
            latestInfo = info
            container.sessionStore.saveLatestUpdateCache(info.update, info.version)
            if (info.update > BuildConfig.VERSION_CODE) {
                updateDialog = info
            } else {
                importMessage = "已是最新版本（v${info.version}）"
            }
        }
    }

    fun dismissUpdateDialog() {
        updateDialog = null
    }

    fun importFromUri(uri: Uri) {
        if (importing) return
        importing = true
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val resolver = getApplication<Application>().contentResolver
                    val content = resolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
                        ?: return@runCatching ImportResult.Failure("无法读取文件")
                    bankRepo.importBank(queryFileName(uri), content)
                }.getOrElse { ImportResult.Failure("导入失败：${it.message ?: "未知错误"}") }
            }
            importMessage = when (result) {
                // 文案与旧版逐字一致
                is ImportResult.Success -> "导入成功！「${result.title}」共 ${result.count} 题"
                is ImportResult.Failure -> result.message
            }
            importing = false
        }
    }

    private fun queryFileName(uri: Uri): String {
        val resolver = getApplication<Application>().contentResolver
        runCatching {
            resolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && cursor.moveToFirst()) {
                    val name = cursor.getString(idx)
                    if (!name.isNullOrBlank()) return name
                }
            }
        }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "导入文件.md"
    }

    fun dismissImportMessage() {
        importMessage = null
    }

    // ---- 删除 ----

    fun requestDelete(bank: QuestionBank) {
        deleteTarget = bank
    }

    fun dismissDelete() {
        deleteTarget = null
    }

    fun confirmDelete() {
        val target = deleteTarget ?: return
        deleteTarget = null
        viewModelScope.launch { bankRepo.deleteBank(target.id) }
    }

    // ---- 开始刷题（混合题库弹题型选择，修复旧版只进一页的缺陷） ----

    fun startQuiz(bank: QuestionBank) {
        viewModelScope.launch {
            val types = bankRepo.getDistinctTypes(bank.id).map { QuestionType.from(it) }.toSet()
            val pages = PageType.pagesFor(types)
            when {
                pages.isEmpty() -> Unit
                pages.size == 1 -> navChannel.send(pages[0].routeFor(bank.id))
                else -> {
                    val entries = pages.map { page ->
                        val count = db.questionDao()
                            .countByBankAndTypes(bank.id, page.loadTypes.map { it.value })
                        TypePickerEntry(page, count, page.routeFor(bank.id))
                    }
                    typePicker = TypePickerState(bank, entries)
                }
            }
        }
    }

    fun dismissTypePicker() {
        typePicker = null
    }

    fun pickType(entry: TypePickerEntry) {
        typePicker = null
        viewModelScope.launch { navChannel.send(entry.route) }
    }
}
