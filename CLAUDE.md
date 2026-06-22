# 刷题 App

> **铁律：改 `src/` 下任何代码后，先跑 `powershell -ExecutionPolicy Bypass -File test.ps1`，54 个测试全过才能说搞定。改 parser.ts 或 db.ts 必须跑。**

## 技术栈

React 19 + TypeScript + Vite 8 · react-router-dom · Dexie (IndexedDB) · PWA (vite-plugin-pwa) · Android WebView 壳

## 项目结构

```
├── src/
│   ├── main.tsx              # 入口
│   ├── App.tsx               # 路由 (HashRouter)
│   ├── types.ts              # 类型定义
│   ├── parser.ts             # Markdown 题库解析器
│   ├── db.ts                 # IndexedDB (Dexie)
│   ├── index.css             # 全局样式
│   ├── components/
│   │   └── ProgressBar.tsx
│   ├── pages/
│   │   ├── Home.tsx          # 首页：导入/管理题库、检查更新
│   │   ├── Quiz.tsx          # 选择题刷题
│   │   ├── TextQuiz.tsx      # 名词解释/简答题
│   │   └── WrongBook.tsx     # 错题本
│   └── __tests__/            # 54 个自动化测试
├── public/                   # PWA 图标等静态资源
├── 题库/                     # 题库 Markdown 文件
├── apk-build/                # APK 构建中间产物（gitignored）
│   ├── src/.../MainActivity.java
│   ├── res/values/strings.xml
│   ├── AndroidManifest.xml
│   └── quiz.keystore         # 签名密钥（gitignored）
├── releases/                 # 发布 APK（gitignored except releases/*.apk）
├── scripts/                  # 辅助脚本
│   ├── make_icons.py         # PWA 图标生成
│   └── debug_parser.cjs      # 解析器调试工具
├── build-apk.ps1             # APK 构建脚本
├── test.ps1                  # 测试入口
├── server.cjs                # 本地局域网服务器（题库/APK 分发）
├── vite.config.ts
└── version.json              # CDN 版本检测
```

## 功能

- 三种题型：选择题 / 名词解释 / 简答题
- Markdown 题库导入，兼容微信篡改格式（分离式/行内式）
- 三种刷题模式：⚡快速(点即出结果,对自动跳) / 📝正常(确认提交) / 📖背题(直接看答案)
- 错题本（选择题+文本类）
- 顺序/随机刷题，进度自动保存
- 软件内检查更新（GitHub API → Raw → CDN 三保险）

## 构建 APK

```powershell
$env:PATH = "D:\hermes\node;" + $env:PATH
./build-apk.ps1
```

### 依赖
- Android SDK: `D:\android-sdk` (platform 36, build-tools 36.0.0)
- aapt v1: `D:\android-sdk\build-tools\34.0.0\aapt.exe`（必须 v1，aapt2 不适用）
- npm: `D:\hermes\node\npm.cmd`
- Python: 系统自带

### 构建步骤
1. `npm run build` → dist/
2. `xcopy /E` dist → apk-build/assets（**用 xcopy 不是 Copy-Item，后者会拍平子目录**）
3. javac → d8 → aapt → Python zipfile 打包 dex + assets
4. zipalign（**必须在签名前**）
5. apksigner sign（**必须最后**）

### Keystore
- `apk-build/quiz.keystore`，密码见 build-apk.ps1

## 测试

```powershell
# 一次性跑
powershell -ExecutionPolicy Bypass -File test.ps1

# 监听模式（改代码自动重跑）
powershell -ExecutionPolicy Bypass -File test.ps1 -Watch
```

54 个用例覆盖：
- 解析器：行内/分离式/混合题型/微信容错/真实题库文件
- 数据库：CRUD/级联删除/错题追踪
- UI：自动检测更新/手动检测/下载成功/下载失败
- E2E：Chromium 浏览器启动检查

## ADB 安装

```powershell
adb install -r "D:\自定义刷题程序\鍒烽.apk"
```

## 版本更新

手机检测更新流程：GitHub API → raw.githubusercontent.com → jsDelivr CDN（三保险）
```bash
git add releases/刷题.apk version.json
git commit && git push origin master
```

## Bug 记录

### 构建链
| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | APK 白屏 | `Copy-Item -Recurse "dist\*"` 拍平 `dist/assets/` 子目录，HTML 的 `./assets/` 引用找不到 JS 文件 | `cmd /c xcopy /E /I /Y` 保留目录结构 |
| 2 | APK 白屏 | `main.tsx` 的 `window.addEventListener('error')` 在 WebView 中 React 挂载前触发，替换了 `#root` | 删掉全局错误监听 |
| 3 | APK 12KB（无素材） | Python `os.walk` 中文路径在命令行中被 GBK 编码损坏 | 写脚本到 `C:\Users\...\Temp\` ASCII 目录 |
| 4 | APK 膨胀/累积旧文件 | `xcopy` 不清旧文件，多次构建的 JS 共存 | xcopy 前 `cmd /c rmdir` 清空 |
| 5 | `javac` 编译失败 | `MainActivity$1.class` 内部类未传给 `d8` | `Get-ChildItem *.class` 全部传入 |
| 6 | Python `SyntaxError` | f-string 表达式不能含反斜杠 | 路径先赋值给变量再引用 |
| 7 | 构建输出文件名乱码 | PowerShell 处理中文路径编码问题 | APK 输出名改为 ASCII `shuati.apk` |

### 运行时
| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 8 | WebView `confirm()` 不弹 | WebView 中 `confirm()` 不稳定 | 自定义 Modal 弹窗 |
| 9 | 版本检查永远提示更新 | localStorage 空值导致版本比较误报 | 初始化时 `cur = latestVer` |
| 10 | 签名后安装失败 | zipalign 在签名后执行破坏签名块 | 先 zipalign 再 apksigner |
| 11 | CDN 版本检测慢 | jsDelivr `@master` 缓存刷新慢 | GitHub API（零缓存）→ raw → CDN 三保险 |
| 12 | 下载更新交互黑屏 | `window.open`/`location.href`/`Intent` 都会跳出 App | DownloadManager 后台下载（待验证） |

### WebView 兼容
| # | 问题 | 原因 |
|---|---|---|
| - | `alert()` / `confirm()` | 不可靠，用自定义 Modal |
| - | `window.addEventListener('error')` | 干扰 React 挂载 |
| - | `file:///android_asset/` | ES module 需要 `setAllowFileAccessFromFileURLs(true)` |
| - | `targetSdkVersion 36` | 部分 API 被弃用但保留向后兼容 |

## 手机连接（本地服务器）

```bash
node server.cjs  # 端口 8888
```
- `/api/banks` — 题库列表
- `/api/banks/:name` — 下载题库
- `/api/version` — 版本信息
- `/api/apk` — 下载 APK
