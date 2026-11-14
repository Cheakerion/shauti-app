# 复研 MedReview · 架构设计（v0.1 实现版）

> 外壳 + 存档：软件提供阅读、检索、刷题、批注、AI；**存档**（Content + Bank）代表一门课。
> 换课 = 换存档，不改代码。

- 日期：2026-11-14
- 代码：`D:\学习资料\_复习站App\fuyan`
- 参照：`D:\学习资料\_复习站App\upstream`（好友 Cheakerion/shauti-app，Kotlin/Compose 刷题 App）

---

## 一、来源与分工

| 来源 | 继承什么 | 不继承什么 |
|---|---|---|
| 好友 `shauti-app` | 题库语义、6 种题型、刷题交互（顺序/随机 · 快速/正常/背题 · 全部/未做/做错/已做 · 题号面板 · 会话断点续刷 · 错题永久保留 · 重做做错 · 完成页） | Android/Compose 实现（PC 端无法直接运行） |
| 两份复习站 | 站点视觉（CSS 原样保留）、内容分区、名解卡/折叠问答/速查表/往届/讲义、题库 JSON | 单文件 HTML 外壳（导航、存档弹窗、查词抽屉改为软件级功能） |

**技术选型**：本地 Node 服务（零 npm 依赖）+ 原生 ES modules 前端 + 同源 iframe 渲染存档。
理由：存档要保留原站视觉 → iframe + 存档自带 CSS 是唯一无损的路；DeepSeek 与网盘必须有服务端 → Node 必须存在；不引构建链 → 改一行刷新就生效，PC 调试成本最低。

后续 Electron/Tauri 套壳时，服务端 API 不变，只是把「Edge 应用窗口」换成内置窗口。

---

## 二、目录

```
fuyan/
├─ server.js                 # 入口：路由 + 静态 + SSE
├─ lib/
│  ├─ store.js               # 配置 / 存档注册表 / 批注 / 进度（原子写）
│  ├─ archive.js             # 导入(zip/文件夹) / 导出 / 内容文档拼装
│  ├─ ai.js                  # DeepSeek 代理（SSE）+ key 解析
│  ├─ quark.js               # 夸克网盘（WSL + quark-drive CLI）
│  ├─ update.js              # 软件更新检查
│  └─ winps.js               # 系统对话框 / zip
├─ web/
│  ├─ index.html  css/app.css
│  ├─ js/{app,core,api,library,reader,quiz,notes,search,settings,ai,e2e}.js
│  └─ content/{runtime.js,overlay.css}   # 注入存档文档
├─ tools/{build_archive.py, e2e.mjs, ps/*.ps1}
└─ docs/
```

用户数据**不在程序目录**，默认 `%APPDATA%\fuyan`（可用 `FUYAN_DATA` 覆盖）：
`config.json`、`archives/<id>/`、`user/<id>/{annotations,ai-threads,progress}.json`。
旧版本的 `<程序目录>/data/` 会在首次启动时自动迁移过去，程序目录之后可以整个替换。


---

## 三、存档格式

见 [`存档格式与制作.md`](存档格式与制作.md)。要点：

```
archives/<id>/manifest.json + content.html + questions.json
```

- `content.html` 是**完整 HTML 文档**（自带 `<style>`），软件用同源 iframe 加载。
- 服务端拼装时注入 `overlay.css` 与 `runtime.js`，存档文件保持干净、可独立打开。
- 交互按钮由构建脚本改写成 `data-act`，由 `runtime.js` 统一实现。

---

## 四、前后端契约

### 4.1 iframe 运行时（`web/content/runtime.js`）

父页面直接访问 `iframe.contentWindow.__fuyan`（同源，不用 postMessage）：

```js
__fuyan.api.setSections([{id,title}])   // 导航章节
__fuyan.api.setMeta({quizTotal, counts})// 首页统计占位
__fuyan.api.setNotes(items)             // 批注高亮（返回失效 id）
__fuyan.api.setProgress(progress)       // 已背 / 已掌握
__fuyan.api.goto(sectionId)             // 滚动到章节
__fuyan.api.gotoElement(id)             // 滚动到小节 + 闪一下
__fuyan.api.focusNote(id)               // 定位批注
__fuyan.api.index()                     // 检索索引（章节 + 小节）
__fuyan.api.selectText(q, noScroll)     // 选中正文中的文字
__fuyan.host = { onSelection, onSelectionClear, onSectionChange, onScroll,
                 onAnnotationClick, updateProgress }   // 父页面注入的回调
```

**批注锚点**：全文文字投影（TreeWalker 收集文本节点）里的 `[start,end)` + `quote` + 前后 24 字。
渲染用 **CSS Custom Highlight API**（不动 DOM，天然支持重叠）：
`::highlight(fy-note)` 黄、`::highlight(fy-ai)` 蓝、`::highlight(fy-active)` 加深。
点击高亮：`caretRangeFromPoint` → 偏移 → 落在哪条批注的区间里。

**选中**：`selectionchange` 防抖 140ms → 取 Range → 转偏移 → 回调父页面画气泡（父页面用坐标定位，避免被 iframe 裁剪）。
**长按**：mousedown 620ms 未移动 → 取光标下文本节点 → 向两侧扩到标点/词边界 → 选中并弹气泡。

### 4.2 HTTP API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/health` | 版本、数据目录、pid |
| GET/PUT | `/api/config` | 配置（AI key 返回时打码） |
| GET | `/api/archives` | 存档列表 |
| GET/DELETE | `/api/archives/:id` | 单个存档 manifest / 删除 |
| GET | `/api/archives/:id/questions` | 题库 |
| POST | `/api/archives/import` | `{path}` 导入（zip/文件夹） |
| POST | `/api/archives/pick` | `{kind:zip\|folder}` 弹系统对话框并导入 |
| POST | `/api/archives/:id/export` | 导出 zip |
| GET/PUT | `/api/archives/:id/notes` | 批注（同一段文字只存一条） |
| GET/PUT | `/api/archives/:id/ai-threads` | 无选区的自由对话记录 |
| GET/PUT | `/api/archives/:id/progress` | 进度 / 会话 |
| POST | `/api/archives/:id/reset` | `{what:quiz\|all}` 重置 |
| POST | `/api/archives/:id/check-update` | 比对网盘同名文件 |
| GET | `/api/quark/status` \| `/list` | 网盘状态 / 列 `dsh传输` |
| POST | `/api/quark/pull` | 下载网盘文件并导入 |
| POST | `/api/ai/chat` | SSE 流式问答 |
| POST | `/api/ai/test` | 列可用模型（连通性） |
| GET | `/api/app/update` | 软件更新检查 |
| POST | `/api/reveal` \| `/open-external` | 在资源管理器定位 / 打开链接 |
| GET | `/archive/:id/content.html` | 拼装后的内容文档（iframe 用） |
| GET | `/archive/:id/<path>` | 存档内资源 |

### 4.3 数据文件

```jsonc
// %APPDATA%/fuyan/user/<id>/annotations.json
{ "items": [{
  "id": "a_...", "kind": "note|ai",
  "anchor": { "start": 1234, "end": 1268, "quote": "…", "prefix": "…", "suffix": "…" },
  "quote": "…", "note": "我的批注", "section": "名词解释",
  "ai": { "messages": [{"role":"user","content":"…"},{"role":"assistant","content":"…"}] },
  "createdAt": "…", "updatedAt": "…"
}] }
```

> 同一段文字（anchor 相同）只会有一条批注：AI 追问追加到 `ai.messages` 末尾，不再新建条目；
> 老数据里重复的 AI 批注会在打开存档时自动合并。

```jsonc
// %APPDATA%/fuyan/user/<id>/ai-threads.json —— 右下角「问 AI」的自由对话
{ "items": [{ "id": "t_...", "title": "发热怎么分类", "messages": [...], "createdAt": "…", "updatedAt": "…" }] }
```

```jsonc
// %APPDATA%/fuyan/user/<id>/progress.json
{
  "quiz": {
    "records": { "A-001": { "ok": true, "ans": 3, "at": "…" } },  // 每题最后一次
    "wrong":   { "A-007": true },                                  // 曾错就一直在
    "fav":     { "A-010": true }
  },
  "sessions": { "choice": { "mode":"seq","play":"quick","filter":"all","order":["A-001",…],"idx":3,"answers":{…},"startedAt":…,"done":false } },
  "naming":  { "mastered": { "n1": true } },
  "modules": { "mastered": { "m1": true } },
  "read":    { "anchor": "sec-qa", "scrollY": 8123 },
  "stats":   { "seconds": 1820 }
}
```

---

## 五、关键实现决策

1. **iframe 而不是把存档 HTML 塞进主文档**：样式隔离（两站差异极大）、存档可独立打开、批注高亮不受主站 CSS 影响。代价：搜索/选中要跨 frame 做，已由 runtime 封装。
2. **批注用 Custom Highlight API，不改 DOM**：改 DOM 会打断存档自己的布局与点击；Highlight 也不影响 `textContent` 偏移，锚点稳定。
3. **q 的存储全在服务端**（不是 localStorage）：换浏览器/换端口不丢，网盘/多设备以后好接；原子写避免写坏。
4. **刷题语义照抄 Kotlin 版**：错题永久、重做做错保留记录、快速模式答对 700ms 自动跳、背题模式恒显答案。
5. **零依赖**：Node 只跑内置模块；zip 用 PowerShell；系统对话框用 PowerShell + WinForms。代价是 Windows 专属（已记入 TODO）。

---

## 六、自测

`tools/e2e.mjs` 用 Edge DevTools 协议驱动真实浏览器，页面里 `web/js/e2e.js` 跑场景并把结果写 `window.__E2E_RESULT`。
9 个场景：reader / quiz / done / digestive / search / ai / settings / library / longpress。
`--screenshot` 可把交互态截图，用于人工看。

---

## 七、与 Android 版的关系

存档格式与题库模型是平台无关的数据契约。Android 端要做同样的「导入存档」：阅读区用 WebView 加载 `content.html`（注入同一份 runtime.js），刷题页用 Compose 重写或用 WebView 复用。`manifest/questions/annotations` 可以直接互通。
