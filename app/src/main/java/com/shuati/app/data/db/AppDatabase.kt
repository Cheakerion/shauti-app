package com.shuati.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.shuati.app.data.db.dao.AnswerRecordDao
import com.shuati.app.data.db.dao.BankDao
import com.shuati.app.data.db.dao.MarkedQuestionDao
import com.shuati.app.data.db.dao.QuestionDao
import com.shuati.app.data.db.entity.AnswerRecordEntity
import com.shuati.app.data.db.entity.BankEntity
import com.shuati.app.data.db.entity.MarkedQuestionEntity
import com.shuati.app.data.db.entity.QuestionEntity

@Database(
    entities = [
        BankEntity::class,
        QuestionEntity::class,
        AnswerRecordEntity::class,
        MarkedQuestionEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun bankDao(): BankDao
    abstract fun questionDao(): QuestionDao
    abstract fun answerRecordDao(): AnswerRecordDao
    abstract fun markedQuestionDao(): MarkedQuestionDao

    companion object {
        fun build(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "shuati.db").build()
    }
}
