package com.shuati.app.data.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.shuati.app.data.db.entity.AnswerRecordEntity
import com.shuati.app.data.db.entity.BankEntity
import com.shuati.app.data.db.entity.MarkedQuestionEntity
import com.shuati.app.data.db.entity.QuestionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface BankDao {
    @Insert
    suspend fun insert(bank: BankEntity)

    @Query("SELECT * FROM question_banks ORDER BY createdAt DESC")
    fun getAll(): Flow<List<BankEntity>>

    @Query("DELETE FROM question_banks WHERE id = :bankId")
    suspend fun deleteById(bankId: String)
}

@Dao
interface QuestionDao {
    @Insert
    suspend fun insertAll(questions: List<QuestionEntity>)

    @Query("SELECT * FROM questions WHERE bankId = :bankId ORDER BY idx")
    suspend fun getByBank(bankId: String): List<QuestionEntity>

    @Query("SELECT * FROM questions WHERE bankId = :bankId AND type IN (:types) ORDER BY idx")
    suspend fun getByBankAndTypes(bankId: String, types: List<String>): List<QuestionEntity>

    @Query("SELECT DISTINCT type FROM questions WHERE bankId = :bankId")
    suspend fun getDistinctTypes(bankId: String): List<String>

    @Query("SELECT COUNT(*) FROM questions WHERE bankId = :bankId AND type IN (:types)")
    suspend fun countByBankAndTypes(bankId: String, types: List<String>): Int

    @Query("DELETE FROM questions WHERE bankId = :bankId")
    suspend fun deleteByBank(bankId: String)
}

@Dao
interface AnswerRecordDao {
    @Insert
    suspend fun insert(record: AnswerRecordEntity)

    /** 错题定义：曾有 isCorrect=false 记录（后来做对也不移除） */
    @Query("SELECT DISTINCT questionId FROM answer_records WHERE bankId = :bankId AND isCorrect = 0")
    suspend fun getWrongIds(bankId: String): List<String>

    @Query("DELETE FROM answer_records WHERE bankId = :bankId")
    suspend fun deleteByBank(bankId: String)
}

@Dao
interface MarkedQuestionDao {
    @Insert
    suspend fun insert(mark: MarkedQuestionEntity)

    @Query("DELETE FROM marked_questions WHERE questionId = :questionId")
    suspend fun deleteByQuestionId(questionId: String)

    @Query("SELECT questionId FROM marked_questions WHERE bankId = :bankId")
    suspend fun getIdsByBank(bankId: String): List<String>

    @Query("DELETE FROM marked_questions WHERE bankId = :bankId")
    suspend fun deleteByBank(bankId: String)
}
