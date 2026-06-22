# 刷题 App

> **铁律：改 `src/` 下任何代码后，先跑 `powershell -ExecutionPolicy Bypass -File test.ps1`，54 个测试全过才能说搞定。**

## 技术栈

React 19 + TypeScript + Vite 8 · react-router-dom · Dexie (IndexedDB) · PWA · Android WebView 壳

## 项目结构

```
├── src/
│   ├── main.tsx, App.tsx, types.ts, parser.ts, db.ts, index.css
│   ├── components/ProgressBar.tsx
│   ├── pages/Home.tsx, Quiz.tsx, TextQuiz.tsx, WrongBook.tsx
│   └── __tests__/
├── public/              # PWA 图标
├── 题库/                # Markdown 题库文件
├── apk-build/           # APK 构建中间产物 (gitignored)
│   ├── src/.../MainActivity.java
│   ├── AndroidManifest.xml, quiz.keystore
│   └── res/
├── releases/            # 发布 APK
├── scripts/             # 辅助脚本
├── build-apk.ps1        # 构建脚本
├── test.ps1             # 测试入口
├── server.cjs           # 本地服务器
└── version.json         # CDN 版本号
```

## 更新机制

版本检测和下载全部走 Java 层，不依赖 WebView 的 fetch（CORS 问题）或 addJavascriptInterface（不工作）：

1. **自动检测**：`onPageFinished` → Java 后台拉 version.json → `evaluateJavascript` 注入 localStorage → React 读取 → 蓝框
2. **手动检测**：`location.href = 'quiz://check-update'` → `shouldOverrideUrlLoading` 拦截 → Java 拉版本 → 原生 AlertDialog
3. **下载**：`Intent.ACTION_VIEW` → 系统浏览器下载 → 自动安装

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

## 测试

```powershell
powershell -ExecutionPolicy Bypass -File test.ps1
```

## ADB

```powershell
& "D:\android-sdk\platform-tools\adb.exe" install -r shuati.apk
```

## Bug 记录

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | WebView 白屏 | `Copy-Item -Recurse *` 拍平 `dist/assets/` 子目录 | `xcopy /E` |
| 2 | WebView 白屏 | `window.addEventListener('error')` 干扰 React 挂载 | 删除 |
| 3 | fetch CORS 拦截 | `file://` origin 跨域限制 (targetSdkVersion 36) | Java 层网络请求 |
| 4 | `addJavascriptInterface` 不工作 | 手机 WebView 限制 | 改用 `shouldOverrideUrlLoading` + `evaluateJavascript` |
| 5 | DownloadManager 无法安装 | 私有目录权限 | `Intent.ACTION_VIEW` 系统浏览器 |
| 6 | 安装包签名无效 | zipalign 在签名之后 | 先对齐再签名 |
| 7 | `confirm()` 不弹 | WebView 不稳定 | 原生 AlertDialog |
| 8 | 构建脚本 PATH 问题 | `npm.cmd` 子进程找不到 node | `$env:PATH` + 全路径 |

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
