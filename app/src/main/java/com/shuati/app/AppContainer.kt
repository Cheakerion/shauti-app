package com.shuati.app

import android.content.Context
import android.net.Uri
import com.shuati.app.data.db.AppDatabase
import com.shuati.app.data.repository.BankRepository
import com.shuati.app.data.repository.QuizRepository
import com.shuati.app.data.session.SessionStore
import com.shuati.app.data.update.UpdateChecker
import kotlinx.coroutines.flow.MutableStateFlow

/** 手写 DI 容器（不用 Hilt，减依赖） */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val database: AppDatabase by lazy { AppDatabase.build(appContext) }
    val bankRepository: BankRepository by lazy { BankRepository(database) }
    val quizRepository: QuizRepository by lazy { QuizRepository(database) }
    val sessionStore: SessionStore by lazy { SessionStore(appContext) }
    val updateChecker: UpdateChecker by lazy { UpdateChecker() }

    /** 微信「用其他应用打开」/分享进来的待导入文件（MainActivity 写入，HomeViewModel 消费） */
    val pendingImport = MutableStateFlow<Uri?>(null)
}
