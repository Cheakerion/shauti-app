# 刷题 App（原生 Android 版）

> **铁律：改代码后跑 `.\gradlew.bat testDebugUnitTest`，71 个测试全过才算完。**

对 `D:\Projects\自定义刷题程序`（React + WebView 壳）的原生重写：Kotlin + Jetpack Compose + Material 3，功能 1:1 复刻并新增 4 项改进（填空题、混合题库题型选择、深色模式跟随系统、原生检查更新）。设计文档：`docs/superpowers/specs/2026-07-17-shuati-android-design.md`。

## 技术栈

Kotlin 2.1.21 · Compose BOM 2025.06.01 (Material 3) · Room 2.7.1 · DataStore · Navigation-Compose · AGP 8.10.1 · Gradle 8.11.1（腾讯镜像）· minSdk 21 / targetSdk 36 · JDK 17

## 构建（无需 Android Studio）

```powershell
.\gradlew.bat assembleDebug          # debug 包（applicationId 带 .debug 后缀，与正式版共存）
.\gradlew.bat testDebugUnitTest      # 71 个 JVM 单测（解析器为主）
.\gradlew.bat assembleRelease        # 签名 release 包（keystore/quiz.keystore）
adb install -r app\build\outputs\apk\release\app-release.apk
```

- SDK 路径在 `local.properties`（`D:\android-sdk`），JDK 由 `gradle.properties` 的 `org.gradle.java.home` 指定
- Maven 走阿里云镜像、Gradle 分发包走腾讯镜像（`settings.gradle.kts` / `gradle-wrapper.properties`），官方源兜底

## 项目结构

```
app/src/main/java/com/shuati/app/
  MainActivity.kt            # 单 Activity；ACTION_VIEW/SEND 接收微信「用其他应用打开」
  AppContainer.kt            # 手写 DI（无 Hilt）
  domain/parser/MarkdownParser.kt  # 核心资产：题库解析器（移植自旧版 parser.ts + 填空题）
  data/db/                   # Room v1 四表（banks/questions/answer_records/marked_questions）
  data/session/              # DataStore 会话进度（断点续刷）
  data/update/UpdateChecker.kt     # GitHub raw → jsDelivr 双源检查更新
  ui/quiz/core/              # QuizSessionViewModel 基类 + ChoiceLikeQuizPage 共用骨架
  ui/quiz/{choice,truefalse,multi,text,fill}/  # 五个刷题页
  ui/home/                   # 首页：导入/题库列表/题型选择弹窗/检查更新
app/src/test/                # 16 个测试类 71 用例 + resources/banks/ 真实题库 fixtures
```

## 题型（6 种）

| 类型 | Section Header | 答案格式 | 刷题页 |
|------|----------------|---------|--------|
| choice | `## 选择题` | `A` 单字母 | choice/ |
| multi_choice | `## 不定项选择题` 或自动检测（答案含 ≥2 个 A-E 字母自动升级） | `ABD` | multi/（兼收单选题） |
| true_false | `## 判断题` | 正确/错误（兼容 对/错/√/✓/×/✗/X） | truefalse/ |
| explain | `## 名词解释`（可选 `英文:` 行） | 全文 | text/ |
| short_answer | `## 简答题` | 全文 | text/ |
| fill_blank | `## 填空题`（**原生版新增**） | 顿号分隔文本，看答案后自评 | fill/ |

## 关键语义（复刻自旧版，勿改）

- 错题 = 曾有 isCorrect=false 记录，做对不移除；「重做做错」保留记录只重置状态
- 混合题库点「开始刷题」弹题型选择（旧版缺陷已修复）；不定项页同时加载 multi_choice+choice
- 会话进度按「题库 × 页面类型」独立存 DataStore（`session_${bankId}_${pageType}`）
- 快速模式答对 700ms 自动下一题；正常模式选择题首点预选、再点提交（判断题两键直提）
- 文本页顺序固定为洗牌随机序；「消除标记」= 清标记 + 重置进度

## 发布流程

1. `app/build.gradle.kts`：`versionCode` +1（≙ version.json 的 `update`）、`versionName` 更新
2. `.\gradlew.bat testDebugUnitTest` 全绿 → `.\gradlew.bat assembleRelease`
3. 真机回归（导入 → 五种页面走查 → 杀进程重进恢复）
4. APK 复制到发布仓 `releases/shuati.apk`，`version.json` 的 `version`/`update` 同步，git push
5. 签名沿用旧版 `quiz.keystore`（pass/alias 在 `gradle.properties`）

## 踩坑记录

| # | 现象 | 处理 |
|---|---|---|
| 1 | gradle `wrapper` 任务校验官方 distributionUrl 超时 | 用 `--gradle-distribution-url` 指定腾讯镜像 |
| 2 | 源码里 BOM/NBSP/全角空格肉眼不可见 | 解析器入口统一 normalize；改 normalize 函数时用字符码点核对 |
| 3 | apksigner.bat 退出码在本机恒为 -1/255 | 以文本输出 `Verifies` 为准 |
| 4 | androidx 新版陆续要求 minSdk 23 | 版本全部钉死在 `gradle/libs.versions.toml`，勿升 core-ktx 1.17+ |
