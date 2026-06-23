# 刷题 App

> **铁律：改 `src/` 下代码后跑 `test.ps1`，50 测试全过才算完。**

## 技术栈

React 19 + TypeScript + Vite 8 · Dexie (IndexedDB) · PWA · Android WebView 壳

## 项目结构

```
src/                  # 前端
  main.tsx, App.tsx   # 入口 + 路由
  types.ts            # 数据模型
  parser.ts           # Markdown 题库解析器
  db.ts               # IndexedDB 操作
  pages/Home.tsx      # 首页：导入题库、检查更新、差值显示
  pages/Quiz.tsx      # 选择题刷题 + 分类筛选
  pages/TextQuiz.tsx   # 名词解释/简答题
  pages/WrongBook.tsx  # 错题本
apk-build/            # APK 构建 + Java 壳
scripts/              # 辅助脚本
题库/                 # Markdown 题库
```

## 更新机制

全 Java 层处理，绕开 WebView CORS/addJavascriptInterface 限制：

1. `onPageFinished` → Java 后台拉 `version.json` → `evaluateJavascript` 注入 `quiz_latest_update`
2. 前端计算 `lag = latestUpdate - installedUpdate`，标题栏显示"落后 X 个更新"或"已是最新"
3. 点"检查更新" → `quiz://check-update` → `shouldOverrideUrlLoading` 拦截 → 原生 AlertDialog
4. 下载 → `Intent.ACTION_VIEW` → 系统浏览器接管安装

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

## 测试

```powershell
powershell -ExecutionPolicy Bypass -File test.ps1
```

## 发布

每次改完：`test.ps1` → `build-apk.ps1` → `version.json` 升 `version` + `update` 字段 +1 → `git push`

## 踩坑记录

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | APK 白屏 | `Copy-Item -Recurse *` 拍平目录 | `xcopy /E` |
| 2 | fetch CORS | `file://` 跨域限制 | Java 层网络请求 |
| 3 | `addJavascriptInterface` 不工作 | 手机限制 | `shouldOverrideUrlLoading` + `evaluateJavascript` |
| 4 | JSON 注入中文破坏 JS 语法 | 中文在 evaluateJavascript 中乱码 | 分字段提取注入 |
| 5 | 版本显示不更新 | `localStorage` 直读不触发渲染 | `__onVersionReady` 回调 + state |
| 6 | `confirm()` 不弹 | WebView 限制 | 原生 AlertDialog |
| 7 | zipalign 签名顺序 | 签名后对齐破坏签名 | 先对齐再签名 |
