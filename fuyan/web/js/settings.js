/* 复研 · 设置 */
import { state, $, esc, toast, confirmDialog, fmtDate } from './core.js';
import { api } from './api.js';
import { App } from './app.js';

let cfg = null;

export async function render() {
  const r = await api.getConfig();
  cfg = r.config;
  const hasKey = r.hasKey;
  state.aiReady = !!hasKey;
  App.setCrumbs(`<b>设置</b>`);
  const main = $('#main');
  main.className = 'main scroll';
  main.innerHTML = `<div class="wrap">
    <div class="lib-hero" style="padding-bottom:8px"><h1>设置</h1>
      <p>DeepSeek 用你当前的账号扣费；夸克网盘走本机已有的授权链路。</p></div>
    <div class="set-grid">

      <div class="card">
        <h3>DeepSeek</h3>
        <p class="hint">用于正文选区「问 DeepSeek」与批注追问。Key 只存在本机，请求由本地服务转发，网页里拿不到。</p>
        <label class="field"><span>API Key</span>
          <input id="ai-key" type="password" placeholder="${hasKey ? '已配置（留空不修改）' : 'sk-...'}" autocomplete="off">
          <small>${hasKey ? '当前已有可用 Key；也可以留空，直接读取本机 DSH 凭据。' : '没有 Key 时，会尝试读环境变量 DEEPSEEK_API_KEY 或 ~/.dsh/.credentials.yaml。'}</small>
        </label>
        <label class="field"><span>接口地址</span>
          <input id="ai-base" type="text" value="${esc(cfg.ai.baseUrl || 'https://api.deepseek.com')}">
        </label>
        <label class="field"><span>模型</span>
          <input id="ai-model" type="text" value="${esc(cfg.ai.model || 'deepseek-flash')}" list="model-list">
          <datalist id="model-list"></datalist>
          <small>默认 deepseek-flash（快、便宜）；要更强推理可换 deepseek-v4-pro。</small>
        </label>
        <div class="btns">
          <button class="btn primary" id="ai-save">保存</button>
          <button class="btn" id="ai-test">测试连接</button>
        </div>
        <div id="ai-state" class="small muted" style="margin-top:10px"></div>
      </div>

      <div class="card">
        <h3>在线存档库（GitHub）</h3>
        <p class="hint">把存档包和 <code>archives.json</code> 放到 GitHub（Releases 或仓库里），这里填 <code>archives.json</code> 的 raw 地址；存档库首页就会出现「GitHub 在线存档」，别人点一下就能下载导入。</p>
        <div class="kv"><b>清单地址</b><span class="mono small">${esc((cfg.archives && cfg.archives.catalogUrl) || '未配置')}</span></div>
        <label class="field"><span>archives.json 地址</span>
          <input id="catalog-url" type="text" placeholder="https://raw.githubusercontent.com/<你的账号>/<仓库>/main/archives.json" value="${esc((cfg.archives && cfg.archives.catalogUrl) || '')}">
        </label>
        <div class="btns"><button class="btn primary" id="catalog-save">保存</button>
          <button class="btn" id="catalog-check">测试读取</button></div>
        <div id="catalog-state" class="small muted" style="margin-top:10px"></div>
      </div>

      <div class="card">
        <h3>夸克网盘（作者通道）</h3>
        <p class="hint">这是你自己账号的「作者通道」：把存档包放到网盘「${esc((cfg.quark && cfg.quark.transferDir) || 'dsh传输')}」就能自己取回；同名文件更新后软件会提示。普通用户用 GitHub / 本地包即可，不需要网盘。</p>
        <div class="kv"><b>传输目录</b><span>${esc((cfg.quark && cfg.quark.transferDir) || 'dsh传输')}</span></div>
        <div class="kv"><b>目录 FID</b><span class="mono">${esc((cfg.quark && cfg.quark.fid) || '')}</span></div>
        <div class="kv"><b>连接状态</b><span id="qk-state"><span class="status-dot"></span> 未检测</span></div>
        <div class="btns"><button class="btn" id="qk-test">测试连接</button>
          <button class="btn" id="qk-open">从网盘导入…</button></div>
      </div>

      <div class="card">
        <h3>软件更新</h3>
        <p class="hint">填 GitHub 仓库（<code>owner/repo</code>）后，软件会自动拉 <code>version.json</code> 比对；GitHub 上有新版本时，顶栏会出现「⬆ 有更新」。</p>
        <label class="field"><span>GitHub 仓库</span>
          <input id="up-repo" type="text" placeholder="makainuo/fuyan" value="${esc((cfg.update && cfg.update.repo) || '')}">
          <small>会自动尝试 jsDelivr 与 raw 两个源。</small>
        </label>
        <div class="row" style="gap:10px">
          <label class="field" style="flex:1"><span>分支</span>
            <input id="up-branch" type="text" placeholder="main" value="${esc((cfg.update && cfg.update.branch) || 'main')}">
          </label>
          <label class="field" style="flex:1"><span>仓库内路径（version.json 所在目录）</span>
            <input id="up-path" type="text" placeholder="fuyan/" value="${esc((cfg.update && cfg.update.path) || '')}">
          </label>
        </div>
        <label class="field"><span>或直接填 version.json 地址（优先生效）</span>
          <input id="up-manifest" type="text" placeholder="https://raw.githubusercontent.com/…/version.json" value="${esc((cfg.update && cfg.update.manifestUrl) || '')}">
        </label>
        <div class="kv"><b>当前版本</b><span id="up-local">—</span></div>
        <div class="kv"><b>检查结果</b><span id="up-state">未检查</span></div>
        <div class="btns"><button class="btn primary" id="up-save">保存</button>
          <button class="btn" id="up-check">检查更新</button></div>
      </div>

      <div class="card">
        <h3>数据</h3>
        <p class="hint">存档、批注、做题进度都存在本机 data 目录，可以直接复制备份。</p>
        <div class="kv"><b>数据目录</b><span class="mono small" id="data-dir">—</span></div>
        <div class="btns"><button class="btn" id="data-open">打开数据目录</button>
          <button class="btn" id="data-export">导出全部存档…</button>
          <button class="btn danger" id="app-quit">退出软件</button></div>
      </div>

      <div class="card">
        <h3>各存档进度</h3>
        <p class="hint">重置只影响做题记录 / 已背标记，批注不会删。</p>
        <div id="arch-list"></div>
      </div>

      <div class="card">
        <h3>关于</h3>
        <p class="hint">复研 MedReview · 基于好友的 shauti-app 刷题框架 + 两份复习站的内容与视觉。</p>
        <div class="kv"><b>版本</b><span>${esc((await api.health()).version || '')}</span></div>
        <div class="kv"><b>存档格式</b><span class="mono">fuyan/archive@1</span></div>
        <div class="kv"><b>技术</b><span>Node 本地服务 + 原生 JS 前端；无 npm 依赖</span></div>
        <div class="kv"><b>致谢</b><span>Cheakerion/shauti-app（Kotlin 刷题 App 设计）</span></div>
      </div>
    </div>
  </div>`;

  bindAi(r);
  bindQuark();
  bindCatalog();
  bindUpdate();
  bindData();
  drawArchives();
}

function bindCatalog() {
  const save = $('#catalog-save');
  const check = $('#catalog-check');
  const stateBox = $('#catalog-state');
  if (!save) return;
  save.onclick = async () => {
    const url = $('#catalog-url').value.trim();
    try {
      await api.saveConfig({ archives: { catalogUrl: url } });
      toast('已保存', 'ok');
      stateBox.innerHTML = '<span class="status-dot ok"></span> 已保存；回到存档库刷新即可看到';
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  check.onclick = async () => {
    const url = $('#catalog-url').value.trim();
    if (url) {
      try { await api.saveConfig({ archives: { catalogUrl: url } }); } catch (_) {}
    }
    stateBox.textContent = '读取中…';
    try {
      const r = await api.catalog();
      if (!r.configured) return (stateBox.textContent = '还没填地址');
      if (!r.ok) return (stateBox.innerHTML = `<span class="status-dot bad"></span> ${esc(r.message || '读取失败')}`);
      stateBox.innerHTML = `<span class="status-dot ok"></span> 读取成功，共 ${r.items.length} 个存档`;
    } catch (e) {
      stateBox.innerHTML = `<span class="status-dot bad"></span> ${esc(e.message)}`;
    }
  };
}

function bindAi(r) {
  $('#ai-save').onclick = async () => {
    const patch = {
      ai: {
        baseUrl: $('#ai-base').value.trim() || 'https://api.deepseek.com',
        model: $('#ai-model').value.trim() || 'deepseek-flash',
      },
    };
    const key = $('#ai-key').value.trim();
    if (key) patch.ai.apiKey = key;
    try {
      await api.saveConfig(patch);
      state.config = (await api.getConfig()).config;
      toast('已保存', 'ok');
      render();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  $('#ai-test').onclick = async () => {
    const box = $('#ai-state');
    box.innerHTML = '正在连接 DeepSeek…';
    try {
      const r = await api.aiTest();
      if (r.ok) {
        box.innerHTML = `<span class="status-dot ok"></span> 连接正常，可用模型：${r.models.map(esc).join('、')}`;
        const dl = $('#model-list');
        dl.innerHTML = r.models.map((m) => `<option value="${esc(m)}">`).join('');
      } else {
        box.innerHTML = `<span class="status-dot bad"></span> ${esc(r.error || '失败')}`;
      }
    } catch (e) {
      box.innerHTML = `<span class="status-dot bad"></span> ${esc(e.message)}`;
    }
  };
}

function bindQuark() {
  $('#qk-test').onclick = async () => {
    const box = $('#qk-state');
    box.innerHTML = '<span class="status-dot"></span> 检测中…';
    try {
      const r = await api.quarkStatus();
      if (r.status.ok) box.innerHTML = `<span class="status-dot ok"></span> 已连接`;
      else box.innerHTML = `<span class="status-dot bad"></span> ${esc(r.status.message)}`;
    } catch (e) {
      box.innerHTML = `<span class="status-dot bad"></span> ${esc(e.message)}`;
    }
  };
  $('#qk-open').onclick = async () => {
    const lib = await import('./library.js');
    lib.openQuark();
  };
}

function bindUpdate() {
  const draw = (r) => {
    $('#up-local').textContent = `${(r.local && r.local.version) || '?'}（update ${(r.local && r.local.update) || 0}）`;
    if (!r.ok) {
      $('#up-state').innerHTML = `<span class="status-dot bad"></span> ${esc(r.message || '检查失败')}`;
      return;
    }
    $('#up-state').innerHTML = r.hasUpdate
      ? `<span class="status-dot bad"></span> ${esc(r.message)} · 远端 v${esc(r.remote.version)}`
      : `<span class="status-dot ok"></span> ${esc(r.message || '已是最新')}`;
  };
  api.appUpdate().then(draw).catch((e) => { $('#up-state').textContent = e.message; });
  $('#up-save').onclick = async () => {
    try {
      await api.saveConfig({
        update: {
          repo: $('#up-repo').value.trim(),
          branch: $('#up-branch').value.trim() || 'main',
          path: $('#up-path').value.trim(),
          manifestUrl: $('#up-manifest').value.trim(),
        },
      });
      toast('已保存，正在重新检查…', 'ok');
      draw(await api.appUpdate());
    } catch (e) { toast(e.message, 'bad'); }
  };
  $('#up-check').onclick = async () => {
    $('#up-state').textContent = '检查中…';
    try { draw(await api.appUpdate()); } catch (e) { $('#up-state').textContent = e.message; }
  };
}

function bindData() {
  api.health().then((h) => {
    $('#data-dir').textContent = h.dataDir;
    $('#data-dir').dataset.path = h.dataDir;
  });
  $('#data-open').onclick = () => {
    const p = $('#data-dir').dataset.path;
    if (p) api.reveal(p).catch(() => {});
  };
  $('#data-export').onclick = async () => {
    toast('正在逐个导出存档包…', '', 2000);
    for (const a of state.archives) {
      try { await api.exportArchive(a.id); } catch (e) { toast(`${a.title} 导出失败：${e.message}`, 'bad'); }
    }
    toast('已导出到 data/exports', 'ok', 3200);
  };
  $('#app-quit').onclick = async () => {
    const ok = await confirmDialog('退出复研？', '会关闭本地服务；重新使用请再双击「启动复研.bat」。', { okText: '退出' });
    if (!ok) return;
    try { await api.quit(); } catch (_) {}
    document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#6b7280;font-family:system-ui">复研已退出，可以关闭这个窗口了。</div>';
  };
}

function drawArchives() {
  const box = $('#arch-list');
  if (!box) return;
  if (!state.archives.length) { box.innerHTML = '<div class="muted small">还没有存档</div>'; return; }
  box.innerHTML = state.archives.map((a) => `<div class="kv" style="align-items:center;gap:10px">
    <b style="color:var(--ink)">${esc(a.title)}</b>
    <span class="muted small">v${esc(a.version)}</span>
    <span class="spacer"></span>
    <button class="btn sm" data-reset="${esc(a.id)}">重置做题记录</button>
  </div>`).join('');
  box.querySelectorAll('[data-reset]').forEach((b) => {
    b.onclick = async () => {
      const ok = await confirmDialog('重置做题记录？', '这个存档的答题记录、错题、已背标记会清空；批注保留。', { okText: '重置', danger: true });
      if (!ok) return;
      try {
        await api.resetProgress(b.dataset.reset, 'all');
        toast('已重置', 'ok');
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
}

export function destroy() {}
