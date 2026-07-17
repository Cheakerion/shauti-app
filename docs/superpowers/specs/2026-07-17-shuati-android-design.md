# 原生 Android 刷题 App（shuati-android）实现计划

## Context（背景与目标）

现有项目 `D:\Projects\自定义刷题程序` 是 React PWA + 手写 WebView 壳打包的 APK，滚动/手势/点按手感差。目标：用 **Kotlin + Jetpack Compose** 原生重写，功能 1:1 复刻，并加 4 项用户确认的改进。新项目目录 **`D:\Projects\shuati-android`**（ASCII 路径避免工具链中文坑），应用名「刷题」，新包名 `com.shuati.app`（与旧 `com.quiz.app` 并存，便于对比）。

### 用户已确认的决策
1. **完整复刻**旧版全部功能（详见「功能规格」）
2. **新增填空题**题型（`## 填空题`）：作答方式 = 看答案后自评（查看答案 → 点「我对了/我错了」→ 计入正确率与错题）
3. **深色模式跟随系统**（Material 3 双色板）
4. **保留检查更新**（GitHub version.json，raw + jsDelivr 双源）
5. **修复混合题库缺陷**：题库含多种题型时「开始刷题」弹题型选择弹窗（单题型直接进入）；保留「不定项页兼收单选题」行为
6. 技术路线：Kotlin + Compose + Material 3，单 Activity；Room 存题库/答题记录/标记，DataStore 存会话进度

### 非目标（与旧版一致或明确排除）
- 不迁移旧 app 数据（WebView IndexedDB 无法导出，题库重新导入即可）
- 无考试计时、无搜索、无统计仪表盘、无云同步、无独立错题本页（错题以答题页内「做错」筛选呈现）

## 构建环境（已核实）

- Windows 11，**无 Android Studio，纯命令行 Gradle**
- JDK 17：`C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot`（gradle.properties 用 `org.gradle.java.home` 指向）
- SDK：`D:\android-sdk`（platforms android-34/36、build-tools 34.0.0/36.0.0、platform-tools、cmdline-tools、licenses 已接受）→ `local.properties` 写 `sdk.dir=D\:\\android-sdk`
- 大陆网络：Gradle 分发包走腾讯镜像，Maven 走阿里云镜像（官方源兜底，见下）

## 版本矩阵（全部钉死在 libs.versions.toml，禁止动态版本）

| 组件 | 版本 | 备注 |
|---|---|---|
| Gradle | 8.11.1 | wrapper distributionUrl 用 `https://mirrors.cloud.tencent.com/gradle/gradle-8.11.1-bin.zip` |
| AGP | 8.10.1 | 支持 compileSdk 36，要求 JDK 17 |
| Kotlin / Compose 插件 / KSP | 2.1.21 / 2.1.21 / 2.1.21-2.0.1 | 三者必须同步升级 |
| Compose BOM | 2025.06.01 | Compose 1.8.x = minSdk 21 最后主线 |
| activity-compose / navigation-compose | 1.10.1 / 2.9.0 | navigation 报 minSdk 23 则退 2.8.9 |
| lifecycle-* | 2.9.1 | |
| Room | 2.7.1 | KSP，`room.schemaLocation` 导出 schema |
| datastore-preferences | 1.1.7 | |
| kotlinx-serialization-json / coroutines | 1.8.1 / 1.10.2 | |
| core-ktx | 1.16.0 | **1.17+ 升 minSdk 23，勿升** |
| JUnit | 4.13.2 | 解析器纯 JVM 测试 |

app 配置：`compileSdk 36`、`targetSdk 36`、`minSdk 21`、显式 `buildToolsVersion = "36.0.0"`（AGP 默认 35.0.0 本机没有，避免联网拉取）；`versionCode = 15`（≙ version.json 的 update 序号，旧版目前 14）、`versionName = "3.0"`；debug variant 加 `applicationIdSuffix ".debug"`；release 签名复用旧 keystore（复制到 `keystore/quiz.keystore`，pass `quiz123456`、alias `quiz`，从 gradle.properties 读）；首版 `minifyEnabled = false`。

**Gradle 自举**（本机无 gradle 命令）：手动下载腾讯镜像 zip 解压到 `D:\tools\gradle-8.11.1` → 项目根执行 `gradle.bat wrapper --gradle-version 8.11.1` 生成 gradlew.bat → 改 distributionUrl 为镜像。

**镜像配置**（settings.gradle.kts，镜像在前官方兜底）：
- pluginManagement：aliyun `gradle-plugin` / `google` / `public` → google() → gradlePluginPortal() → mavenCentral()
- dependencyResolutionManagement（FAIL_ON_PROJECT_REPOS）：aliyun `google` / `public` → google() → mavenCentral()
- 阿里云整体故障备选：`https://mirrors.cloud.tencent.com/repository/maven/`

## 代码结构（data / domain / ui 分层）

```
app/src/main/java/com/shuati/app/
├─ MainActivity.kt          # 单 Activity：enableEdgeToEdge、ACTION_VIEW/SEND 提取 Uri 转交导入（singleTask + onNewIntent）
├─ ShuatiApplication.kt / AppContainer.kt   # 手写 DI（不用 Hilt）：db/repos/SessionStore/UpdateChecker + VM 工厂
├─ data/
│  ├─ db/                   # AppDatabase(v1) + Converters(List<Option>↔JSON) + 4 实体 + 4 DAO
│  ├─ session/              # SessionModels(@Serializable) + SessionStore(DataStore 封装)
│  ├─ repository/           # BankRepository(导入/列表/级联删除) + QuizRepository(取题/记录/错题/标记)
│  └─ update/UpdateChecker.kt  # HttpURLConnection，raw→jsDelivr 依次尝试，5s 超时
├─ domain/
│  ├─ model/Models.kt       # Question/Option/QuestionType(6 值)/ParseResult —— 纯 Kotlin
│  └─ parser/MarkdownParser.kt # parser.ts 逐函数直译 + 填空题
└─ ui/
   ├─ theme/                # M3 深浅 colorScheme(seed #2563EB) + QuizColors CompositionLocal(对/错/标记语义色)
   ├─ navigation/AppNavHost.kt
   ├─ common/               # QuizScaffold/ModeToggleRow/ActionChipsRow/QuizProgressBar/StatsRow/
   │                        # QuestionGridDialog/OptionButton/ExplanationBox/CompleteContent/ConfirmDialog/EmptyState
   ├─ home/                 # HomeScreen/VM、BankCard、TypePickerDialog、UpdateDialog
   └─ quiz/
      ├─ core/              # QuizSessionViewModel(抽象基类：加载/会话恢复防抖保存/洗牌/筛选快照/跳题/redoWrong/fullRestart) + PageType
      ├─ choice/ truefalse/ # 选择题页（判断题复用 VM，kind=TRUE_FALSE 时点即提交）
      ├─ multi/             # 不定项：勾选+提交，加载 multi_choice ∪ choice
      ├─ text/              # explain/short_answer 同构（标记/已看/英文术语正反面）
      └─ fill/              # 填空题：查看答案→我对了/我错了自评
```

## 数据层设计

Room 表（无外键，删除走显式 @Transaction 级联；`type` 存字符串枚举）：
- `question_banks`: id(TEXT PK), title, fileName, totalCount, createdAt
- `questions`: id(TEXT PK=UUID), bankId, idx(1-based), type, localNum?, stem, engStem?, optionsJson, answer, explanation?（索引 bankId、[bankId,idx]）
- `answer_records`: 自增 id, questionId, bankId, userAnswer, isCorrect, timestamp —— **只增不改**；错题定义 = 曾有 isCorrect=false 记录（做对不移除）
- `marked_questions`: 自增 id, questionId, bankId, timestamp

关键 DAO：`getByBankAndTypes(bankId, types)`（不定项页传两类型）、`getDistinctTypes(bankId)`（首页标签+题型弹窗）、`getWrongIds(bankId)`（DISTINCT questionId WHERE isCorrect=0）。删题库级联清四表（旧版漏删标记，顺手补上）。

DataStore（单文件 `quiz_session`）：key = `session_${bankId}_${pageType}`，value = JSON：
- ChoiceSessionState（choice/true_false/multi_choice/fill_blank 共用）：`{currentIndex, mode(顺序/随机), playMode(快速/正常/背题), shuffledIndices, startTime, filterMode(全部/未做/做错/已做), historyAnswers{qid:答案}}`（fill_blank 的答案为"对"/"错"，playMode 无快速）
- TextSessionState（explain/short_answer）：`{currentIndex, playMode, filterMode(全部/已标记/未标记), shuffledIndices, startTime, revealedIds}`

状态变更 debounce 200ms 写入；「全部清除/重新开始」= remove key。已安装 update 号直接用 `BuildConfig.VERSION_CODE`，`lag = max(0, 远端update − VERSION_CODE)`；另存 `latest_update_cache` 供离线显示。

## 解析器移植（核心资产，M1）

蓝本：`D:\Projects\自定义刷题程序\src\parser.ts`（322 行）+ `src\__tests__\parser.test.ts`（56 用例）。object 单例、保持旧函数拓扑（parse → parseSplitFormat/parseInlineFormat → parseInlineBlock/normalizeAnswer/detectMultiAnswer/detectSectionType…）、正则全部预编译 `private val`。

题型识别：`## 选择/单选/多选` → choice（答案含 ≥2 个 A-E 字母自动升级 multi_choice）；`## 不定项选择` → multi_choice；`## 判断` → true_false（对/错/√/✓/×/✗/X 归一化为 正确/错误）；`## 名词解释` → explain（可选 `英文:` 行存 engStem）；`## 简答/问答` → short_answer；**新增 `## 填空` → fill_blank**（题干 `______` 原样保留，答案 = 顿号分隔文本 trim 后原样，有效性 = 题干+答案非空；分离式格式同样支持）。

JS→Kotlin 语义差异（必须逐条处理）：
1. **入口预归一化**（新增）：剥 BOM、`\r\n`→`\n`、全角空格/NBSP→空格 —— 补偿 Java `\s` 不含 Unicode 空白
2. JS 无 `/g` 的 `replace` = 只替换第一处 → Kotlin 一律 `replaceFirst`
3. `str.match(re)` → `re.find(str)?.groupValues[n]`；存在性判断用 `containsMatchIn`
4. 零宽分割 `split(/^(?=##\s*答案)/m)` → `Regex("(?=^##\\s*答案)", MULTILINE).split()`（Kotlin split 不丢尾部空串，与 JS 对齐）
5. `parseInt` 容错 → `toIntOrNull() ?: continue`
6. MULTILINE 仅给三处（标题/答案锚点/分割），其余逐行 trim 匹配

测试：14 个 JUnit 类（12 个 describe 一对一 + FillBlankParserTest 约 10 用例），方法名用反引号中文；fixtures 用 raw string + trimIndent；7 个真实题库文件复制到 `app/src/test/resources/banks/`（UTF-8），缺失时 `Assume.assumeTrue` 跳过。合计约 64 用例。

## UI 与交互规格（复刻语义）

导航路由：`home`、`choice/{bankId}`、`truefalse/{bankId}`、`multi/{bankId}`、`text/{bankId}/{qType}`、`fill/{bankId}`。

**首页**：标题 + 更新徽标（「落后 X 个更新」红 /「已是最新」绿）+ 检查更新按钮；导入卡（SAF OpenDocument，.md/.txt）；题库卡片列表（标题 / 文件名 · N 题 / 题型: A+B / 开始刷题、删除+确认弹窗）；导入成功弹窗文案与旧版逐字一致（「导入成功！「title」共 N 题」）；重复导入生成新题库（不去重，与旧版一致）；manifest 注册 ACTION_VIEW/ACTION_SEND intent-filter（微信「用其他应用打开」直接导入）。**开始刷题**：`getDistinctTypes` 映射页面集合，1 种直接进，≥2 种弹 TypePickerDialog（各题型+题数；choice+multi_choice 并存时给「选择题」「不定项选择（含单选）」两项）。

**选择题页**（母版，HorizontalPager 滑动切题）：
- 三行模式条：顺序/随机（Fisher-Yates）· 快速/正常/背题 · 筛选 全部/未做/做错/已做
- 快速 = 点即判分，答对 700ms 自动下一题（协程 delay，换题即取消）；正常 = 首点预选蓝框、再点同项提交；背题 = 禁作答，恒显正确项+解析
- 判分反馈：对绿错红、「✅ 正确！/ ❌ 错误！正确答案是 X」+ 解析浅蓝框；已答题重进恢复所选
- 重做做错（保留记录，historyAnswers 移除错题+切「做错」筛选+回第 1 题）、全部清除（确认后清 session + 删该库 answer_records）
- 进度条、统计行（正确 n 绿 / 错误 m 红 ｜ 当前/总数，会话内口径）、题号面板（网格：绿对/红错/蓝圈当前，点击跳题）、上一题/下一题（末题变「完成」）
- 完成页：百分比大字（≥60% 绿否则红）、对/错/用时（分秒）、重新开始/返回首页

**判断题页**：复用选择题 VM/树，两枚大按钮，快速与正常均点即提交（无预选）。
**不定项页**：无快速模式；勾选高亮 + 底部提交（未选禁用）；判分 = 所选字母排序拼接 == answer；同时加载 choice+multi_choice。
**文本页**（explain/short_answer 同构）：查看/收起答案；explain 有 engStem 时题干只显英文术语，展开显中文+定义；标记/取消标记持久化；筛选 全部/已标记(n)/未标记；消除标记（清标记+重置进度，确认）；正常/背题（背题自动展开）；顺序固定为洗牌随机序（无顺序/随机切换，与旧版一致）；统计 已看/标记；完成页显示浏览/标记/用时。
**填空题页**（新）：模式仅 正常/背题；题干（______ 原样）→「查看答案」→ 参考答案+解析 →「✅ 我对了 / ❌ 我错了」→ 写 answer_record(userAnswer="对"/"错") 并锁定；筛选/重做做错/全部清除/题号面板/完成页与选择题页共用；背题自动展开不计分。

**主题**：M3 深浅两套（primary #2563EB，暗色 #93C5FD 系）；QuizColors 语义色 correct #16A34A/correctBg #DCFCE7、wrong #DC2626/wrongBg #FEF2F2（深色各配暗组）、标记橙 #E67E22；圆角 12dp；emoji 图标沿用（📝📋🔄📖⚡✅❌🎉）；`enableEdgeToEdge()` + insets padding（targetSdk 36 强制）。

**两处刻意偏差（修旧版 bug，实现时注明）**：① 会话恢复不再被筛选副作用重置 currentIndex；② 「未做」筛选在会话内快照列表，答完不实时消失（重进/换筛选时刷新）。

**检查更新**：依次拉 `https://raw.githubusercontent.com/Cheakerion/shauti-app/master/version.json` → `https://cdn.jsdelivr.net/gh/Cheakerion/shauti-app@master/version.json`（各 5s 超时，IO 线程，失败静默显示缓存）；弹窗显示远端 version/notes；下载 = 系统浏览器打开 `.../releases/shuati.apk`。

## 里程碑（每个可独立验证；M1、M2 可并行）

| # | 内容 | 验收 |
|---|---|---|
| M0 | Gradle 自举 + 工程骨架 + 空 MainActivity + 主题；git init + 首 commit（含本设计文档存入 `docs/`） | `gradlew assembleDebug` 成功；装机显示「刷题」；切系统深色跟随 |
| M1 | domain 模型 + MarkdownParser + 14 测试类 + fixtures | `gradlew testDebugUnitTest` 约 64 用例全绿（TDD：先移植测试再移植实现） |
| M2 | Room 实体/DAO/DB + Repository + SessionStore | 编译过，schemas/ 导出 1.json |
| M3 | 首页 + SAF 导入 + intent-filter + 删除 + 题型标签 + TypePicker | 真机导入模板文件成功、题数/题型正确、微信打开可导入、删除级联 |
| M4 | 共享组件全套 + 选择题页 + 会话持久化 | 真机清单：三模式/四筛选/预选提交/自动跳/重做做错/全部清除/滑动/题号面板/杀进程恢复/完成页 |
| M5 | 判断题页 + 不定项页 | 两键直提；勾选+排序判分；不定项页含单选题 |
| M6 | 文本题页 + 标记 | 英文正反面、标记筛选、消除标记、完成页 |
| M7 | 填空题页 | 自评计分、错题联动、混合弹窗含填空 |
| M8 | 更新检查 + lag 徽标 + 应用图标 + 深色/insets 全页走查 | 断网显缓存；弹窗+跳浏览器 |
| M9 | 复制 keystore、signingConfig、assembleRelease、全量回归 | `apksigner verify` 过；真机回归 M4-M7 清单 |

## 构建与验证命令（PowerShell）

```powershell
.\gradlew.bat assembleDebug
.\gradlew.bat testDebugUnitTest                    # 解析器等 JVM 单测
adb install -r app\build\outputs\apk\debug\app-debug.apk    # debug 与 release 可共存
adb logcat -s AndroidRuntime                       # 崩溃排查
.\gradlew.bat assembleRelease                      # AGP 自动对齐+V1/V2 签名（旧版坑 #7 消失）
D:\android-sdk\build-tools\36.0.0\apksigner.bat verify --print-certs app\build\outputs\apk\release\app-release.apk
```

端到端验证数据：直接用 `D:\Projects\自定义刷题程序\题库\` 下约 20 个真实题库（含填空题文件）。发布流程沿用旧仓库：versionCode/versionName +1 → assembleRelease → 回归 → apk 入 releases/ → version.json 的 version/update 同步 → push（notes 注明新包名需全新安装）。

## 风险与规避

1. androidx 新版 minSdk 23 潮 → toml 钉死全部版本；manifest merger 报错即回退该库
2. 镜像滞后/失效 → 镜像在前官方兜底自动落穿；备选腾讯聚合源
3. Robolectric 需联网拉 android-all jar → DAO 测试标为可选，数据层靠真机回归兜底
4. Kotlin/KSP/Compose 插件错配 → 三版本单点定义、三连动
5. 正则语义差异回归 → 64 单测安全网，M1 全绿才动 UI
6. Pager 与 VM 索引回环 → 单一数据源（LaunchedEffect + snapshotFlow{settledPage}），跳题用 scrollToPage
7. raw.githubusercontent 大陆不可达 → jsDelivr 备用已内建

## 关键参考文件（实现时对照）

- `D:\Projects\自定义刷题程序\src\parser.ts` — 解析器逐行蓝本
- `D:\Projects\自定义刷题程序\src\__tests__\parser.test.ts` — 56 用例移植源
- `D:\Projects\自定义刷题程序\src\pages\Quiz.tsx` — 选择题页交互语义母版（其余页面参照 MultiChoiceQuiz/TextQuiz/TrueFalseQuiz.tsx）
- `D:\Projects\自定义刷题程序\src\db.ts` — 数据层行为规范（错题定义/级联删除/标记）
- `D:\Projects\自定义刷题程序\apk-build\src\com\quiz\app\MainActivity.java` — 更新检查参考（URL/解析/跳转）
- `D:\Projects\自定义刷题程序\题库\` — 测试题库与 6 个模板文件
