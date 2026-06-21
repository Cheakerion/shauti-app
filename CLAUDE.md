# 刷题 App

> **⚠️ 铁律：改完 `src/` 下任何代码后，必须先跑 `powershell -ExecutionPolicy Bypass -File test.ps1`，50 个测试全部通过才能说搞定。挂了当场修。**

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 8 |
| 路由 | react-router-dom (HashRouter) |
| 存储 | Dexie (IndexedDB) |
| PWA | vite-plugin-pwa (离线 + Service Worker) |
| 后端 | server.cjs (Node.js, 端口 8888, 题库/APK 分发) |
| APP | Android WebView 壳 → APK |
| 测试 | Vitest + fake-indexeddb |

## 项目结构

```
├── src/                    # 前端源码
│   ├── main.tsx            # 入口
│   ├── App.tsx             # 路由定义
│   ├── types.ts            # 类型定义
│   ├── parser.ts           # Markdown 题库解析器（兼容微信篡改格式）
│   ├── db.ts               # IndexedDB 操作（Dexie）
│   ├── index.css           # 全局样式（移动端优先）
│   ├── components/
│   │   └── ProgressBar.tsx # 进度条组件
│   ├── pages/
│   │   ├── Home.tsx        # 首页（导入题库、更新检测）
│   │   ├── Quiz.tsx        # 选择题刷题
│   │   ├── TextQuiz.tsx    # 名词解释/简答题刷题
│   │   └── WrongBook.tsx   # 错题本
│   └── __tests__/          # 自动化测试
│       ├── parser.test.ts  # 解析器测试（42个用例）
│       └── db.test.ts      # 数据库测试
├── public/                 # 静态资源（PWA图标等）
├── 题库/                   # 题库 Markdown 文件
├── scripts/                # 开发/构建辅助脚本
│   ├── build-apk.ps1       # APK 构建脚本
│   ├── make_icons.py       # 生成 PWA 图标
│   └── debug_parser.cjs    # 题库解析器调试工具
├── server.cjs              # 本地题库/更新服务器
├── releases/               # 发布版 APK
├── apk-build/              # APK 构建中间产物（gitignored）
│   ├── assets/             # 构建时从 dist/ 复制
│   ├── src/                # Android Java 源码
│   ├── res/                # Android 资源
│   └── quiz.keystore       # 签名密钥
├── dist/                   # Vite 构建输出（gitignored）
├── package.json
├── vite.config.ts
└── index.html
```

## 功能

- 三种题型: 选择题 / 名词解释 / 简答题
- Markdown 题库解析 (兼容微信篡改格式，分离式/行内式)
- 首页智能检测题型: 只显示开始刷题(自动路由) + 错题本 + 删除
- 三种刷题模式: ⚡快速(点即出结果,对自动跳转) / 📝正常(确认提交) / 📖背题(直接显示解析)
- 错题本 (支持选择+文本类)
- 顺序/随机刷题，答题进度保存
- 软件内检查更新 + 自动检测

## APK 构建

### 依赖
- Android SDK: `D:\android-sdk` (platform 36 + build-tools 36.0.0)
- aapt v1: `D:\android-sdk\build-tools\34.0.0\aapt.exe` (aapt2 不适用)
- npm/node: `D:\hermes\node\npm.cmd`
- javac: 系统自带

### 构建顺序 (错一步就废)
1. `npm run build` → dist/
2. 复制 dist → apk-build/assets
3. `javac -d classes MainActivity.java` → `d8 *.class --output obj` (必须用 *.class 包含内部类)
4. `aapt package -M AndroidManifest.xml -I android-36.jar -S res -F base.apk` (需要 res/values/strings.xml)
5. Python zipfile 添加 classes.dex + assets
6. **`zipalign -f 4` 对齐 (必须在签名之前!!)**
7. **`apksigner sign` 签名 (必须在最后!!)**

### Keystore
- 文件: `apk-build/quiz.keystore`
- 密码: `<见 build-apk.ps1>`, alias: `quiz`
- 2026-06-18 换的新密钥，旧版需卸载重装

## 踩坑记录

1. **白屏 — ES modules 在 WebView file:// 被 CORS 拦截**: `setAllowFileAccessFromFileURLs(true)`
2. **文件上传没反应**: WebView 需要 WebChromeClient + `onShowFileChooser`，前端 input 不能用 `display:none`
3. **安装包签名无效**: zipalign 在签名之后会破坏 v2/v3 签名块，必须先对齐再签名
4. **专为旧版Android打造**: `targetSdkVersion="34"` → `"36"`
5. **D8 编译失败**: 匿名内部类需要 `d8 *.class` 而非 `d8 MainActivity.class`
6. **版本检查误报**: localStorage 空值导致 `newer(v1.12, '0')` 永远 true，修复: 保存后 `cur = latestVer`
7. **删除按钮无效**: WebView 中 `confirm()` 不稳定，改用自定义 Modal 确认弹窗

## CDN 部署
```bash
git add releases/刷题.apk version.json [源码改动]
git commit && git push origin master
```
- `version.json` → 版本检测 (https://cdn.jsdelivr.net/gh/Cheakerion/shauti-app@master/version.json)
- `releases/刷题.apk` → APK 下载

## 测试

### 运行
```powershell
# 一次性运行（推荐）
powershell -ExecutionPolicy Bypass -File test.ps1

# 监听模式（改代码自动重跑）
powershell -ExecutionPolicy Bypass -File test.ps1 -Watch
```

### 覆盖范围
- **解析器测试** (`src/__tests__/parser.test.ts`) — 34 个用例
  - 行内格式：选择题 / 简答题 / 名词解释
  - 分离式格式（`## 答案`）
  - 混合题型（同一文件多种题型）
  - 微信篡改容错（粗体标记、中文标点）
  - 边界情况（空文件、无答案、多行题干/解析）
  - 真实题库文件集成测试（所有 `题库/*.md` 逐个解析）
- **数据库测试** (`src/__tests__/db.test.ts`) — 8 个用例
  - 题库 CRUD、级联删除
  - 答题记录、错题追踪
- **UI 交互测试** (`src/__tests__/Home.test.tsx`) — 8 个用例
  - 自动检测更新（启动时）
  - 手动检测更新（confirm/alert）
  - 下载成功（Blob → anchor click）
  - 下载失败（回退 window.open）
  - localStorage 版本持久化

### 原则
- 每次改完 `parser.ts` 或 `db.ts` 后跑一遍，30 秒出结果
- 改了什么功能就加什么测试
- 真实题库文件是最宝贵的测试资产，不要删

## server.cjs
- 端口 8888，监听 0.0.0.0
- `/api/banks` — 题库列表 (JSON)
- `/api/banks/:name` — 下载题库 .md
- `/api/version` — 版本信息
- `/api/apk` — 下载 APK (从 releases/ 读取)
