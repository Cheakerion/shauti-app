package com.shuati.app.data.session

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json

private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "quiz_session")

/**
 * 会话进度存储（对应旧版 localStorage）。
 * key = session_${bankId}_${pageType}，value = JSON。
 */
class SessionStore(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }

    private fun sessionKey(bankId: String, pageType: String) =
        stringPreferencesKey("session_${bankId}_$pageType")

    // ---- 选择/判断/不定项/填空页会话 ----

    suspend fun loadChoiceSession(bankId: String, pageType: String): ChoiceSessionState? =
        load(bankId, pageType)?.let { runCatching { json.decodeFromString<ChoiceSessionState>(it) }.getOrNull() }

    suspend fun saveChoiceSession(bankId: String, pageType: String, state: ChoiceSessionState) {
        save(bankId, pageType, json.encodeToString(ChoiceSessionState.serializer(), state))
    }

    // ---- 文本页会话 ----

    suspend fun loadTextSession(bankId: String, pageType: String): TextSessionState? =
        load(bankId, pageType)?.let { runCatching { json.decodeFromString<TextSessionState>(it) }.getOrNull() }

    suspend fun saveTextSession(bankId: String, pageType: String, state: TextSessionState) {
        save(bankId, pageType, json.encodeToString(TextSessionState.serializer(), state))
    }

    suspend fun clearSession(bankId: String, pageType: String) {
        context.sessionDataStore.edit { it.remove(sessionKey(bankId, pageType)) }
    }

    private suspend fun load(bankId: String, pageType: String): String? =
        context.sessionDataStore.data.first()[sessionKey(bankId, pageType)]

    private suspend fun save(bankId: String, pageType: String, value: String) {
        context.sessionDataStore.edit { it[sessionKey(bankId, pageType)] = value }
    }

    // ---- 检查更新缓存（离线时首页显示上次拉到的滞后值） ----

    suspend fun loadLatestUpdateCache(): Int? =
        context.sessionDataStore.data.first()[KEY_LATEST_UPDATE]

    suspend fun saveLatestUpdateCache(update: Int, version: String) {
        context.sessionDataStore.edit {
            it[KEY_LATEST_UPDATE] = update
            it[KEY_LATEST_VERSION] = version
        }
    }

    suspend fun loadLatestVersionCache(): String? =
        context.sessionDataStore.data.first()[KEY_LATEST_VERSION]

    private companion object {
        val KEY_LATEST_UPDATE = intPreferencesKey("latest_update_cache")
        val KEY_LATEST_VERSION = stringPreferencesKey("latest_version_cache")
    }
}
