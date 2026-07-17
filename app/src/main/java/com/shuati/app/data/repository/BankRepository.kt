package com.shuati.app.data.repository

import androidx.room.withTransaction
import com.shuati.app.data.db.AppDatabase
import com.shuati.app.data.db.entity.BankEntity
import com.shuati.app.data.db.entity.QuestionEntity
import com.shuati.app.domain.model.Option
import com.shuati.app.domain.model.QuestionBank
import com.shuati.app.domain.parser.MarkdownParser
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** 导入结果 */
sealed interface ImportResult {
    /** 导入成功！「title」共 count 题 */
    data class Success(val title: String, val count: Int) : ImportResult
    data class Failure(val message: String) : ImportResult
}

/** 题库导入、列表、删除（级联） */
class BankRepository(private val db: AppDatabase) {

    private val json = Json

    /** 解析并落库。重复导入同一文件生成新题库（与旧版一致，不去重） */
    suspend fun importBank(fileName: String, content: String): ImportResult {
        val result = runCatching { MarkdownParser.parse(content) }.getOrElse {
            return ImportResult.Failure("解析失败：文件格式不正确")
        }
        if (result.questions.isEmpty()) {
            return ImportResult.Failure("未解析到任何题目，请检查文件格式")
        }
        val bankId = UUID.randomUUID().toString()
        val bank = BankEntity(
            id = bankId,
            title = result.title,
            fileName = fileName,
            totalCount = result.questions.size,
            createdAt = System.currentTimeMillis(),
        )
        val questions = result.questions.mapIndexed { i, q ->
            QuestionEntity(
                id = UUID.randomUUID().toString(),
                bankId = bankId,
                idx = i + 1,
                type = q.type.value,
                localNum = q.localNum,
                stem = q.stem,
                engStem = q.engStem,
                optionsJson = json.encodeToString(ListSerializer(Option.serializer()), q.options),
                answer = q.answer,
                explanation = q.explanation,
            )
        }
        db.withTransaction {
            db.bankDao().insert(bank)
            db.questionDao().insertAll(questions)
        }
        return ImportResult.Success(result.title, result.questions.size)
    }

    fun getAllBanks(): Flow<List<QuestionBank>> =
        db.bankDao().getAll().map { list ->
            list.map { QuestionBank(it.id, it.title, it.fileName, it.totalCount, it.createdAt) }
        }

    /** 题库包含的题型（首页标签 + 题型选择弹窗用） */
    suspend fun getDistinctTypes(bankId: String): List<String> =
        db.questionDao().getDistinctTypes(bankId)

    /** 删除题库：级联清四表（旧版漏删标记，此处补上） */
    suspend fun deleteBank(bankId: String) {
        db.withTransaction {
            db.bankDao().deleteById(bankId)
            db.questionDao().deleteByBank(bankId)
            db.answerRecordDao().deleteByBank(bankId)
            db.markedQuestionDao().deleteByBank(bankId)
        }
    }
}
