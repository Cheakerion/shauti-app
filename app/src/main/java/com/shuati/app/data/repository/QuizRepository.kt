package com.shuati.app.data.repository

import com.shuati.app.data.db.AppDatabase
import com.shuati.app.data.db.entity.AnswerRecordEntity
import com.shuati.app.data.db.entity.MarkedQuestionEntity
import com.shuati.app.data.db.entity.QuestionEntity
import com.shuati.app.domain.model.Option
import com.shuati.app.domain.model.Question
import com.shuati.app.domain.model.QuestionType
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** 取题、答题记录、错题、标记 */
class QuizRepository(private val db: AppDatabase) {

    private val json = Json { ignoreUnknownKeys = true }

    /** 按题型取题（不定项页传 [MULTI_CHOICE, CHOICE] 以兼收单选题） */
    suspend fun getQuestions(bankId: String, types: List<QuestionType>): List<Question> =
        db.questionDao().getByBankAndTypes(bankId, types.map { it.value }).map { it.toDomain() }

    /** 记录一次作答（只增不改） */
    suspend fun recordAnswer(questionId: String, bankId: String, userAnswer: String, isCorrect: Boolean) {
        db.answerRecordDao().insert(
            AnswerRecordEntity(
                questionId = questionId,
                bankId = bankId,
                userAnswer = userAnswer,
                isCorrect = isCorrect,
                timestamp = System.currentTimeMillis(),
            )
        )
    }

    /** 错题 id 集合：曾答错过（即使后来做对） */
    suspend fun getWrongIds(bankId: String): Set<String> =
        db.answerRecordDao().getWrongIds(bankId).toSet()

    /** 全部清除：删该题库所有答题记录 */
    suspend fun deleteRecordsByBank(bankId: String) {
        db.answerRecordDao().deleteByBank(bankId)
    }

    // ---- 标记（文本题书签） ----

    suspend fun getMarkedIds(bankId: String): Set<String> =
        db.markedQuestionDao().getIdsByBank(bankId).toSet()

    suspend fun addMark(questionId: String, bankId: String) {
        db.markedQuestionDao().insert(
            MarkedQuestionEntity(questionId = questionId, bankId = bankId, timestamp = System.currentTimeMillis())
        )
    }

    suspend fun removeMark(questionId: String) {
        db.markedQuestionDao().deleteByQuestionId(questionId)
    }

    /** 消除标记：清该题库全部标记 */
    suspend fun clearMarks(bankId: String) {
        db.markedQuestionDao().deleteByBank(bankId)
    }

    private fun QuestionEntity.toDomain() = Question(
        id = id,
        bankId = bankId,
        idx = idx,
        type = QuestionType.from(type),
        localNum = localNum,
        stem = stem,
        engStem = engStem,
        options = runCatching {
            json.decodeFromString(ListSerializer(Option.serializer()), optionsJson)
        }.getOrDefault(emptyList()),
        answer = answer,
        explanation = explanation,
    )
}
