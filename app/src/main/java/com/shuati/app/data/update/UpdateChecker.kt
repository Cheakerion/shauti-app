package com.shuati.app.data.update

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** version.json 结构（沿用旧仓库约定：update 为发布序号，与 versionCode 同步递增） */
@Serializable
data class VersionInfo(
    val version: String = "",
    val update: Int = 0,
    val notes: String = "",
)

/**
 * 检查更新：依次尝试 GitHub raw → jsDelivr（大陆备用源），各 5s 超时，失败返回 null。
 * 下载走系统浏览器（与旧版行为一致）。
 */
class UpdateChecker {

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun fetch(): VersionInfo? = withContext(Dispatchers.IO) {
        for (url in VERSION_URLS) {
            val info = tryFetch(url)
            if (info != null) return@withContext info
        }
        null
    }

    private fun tryFetch(url: String): VersionInfo? = try {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 5_000
        conn.readTimeout = 5_000
        conn.requestMethod = "GET"
        conn.inputStream.use { stream ->
            json.decodeFromString<VersionInfo>(stream.readBytes().toString(Charsets.UTF_8))
        }
    } catch (_: Exception) {
        null
    }

    companion object {
        private val VERSION_URLS = listOf(
            "https://raw.githubusercontent.com/Cheakerion/shauti-app/master/version.json",
            "https://cdn.jsdelivr.net/gh/Cheakerion/shauti-app@master/version.json",
        )
        const val APK_DOWNLOAD_URL =
            "https://raw.githubusercontent.com/Cheakerion/shauti-app/master/releases/shuati.apk"
    }
}
