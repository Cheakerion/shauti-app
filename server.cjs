// 刷题程序 - 题库 & 更新服务器
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8888;
const BANK_DIR = path.join(__dirname, '题库');
const APK_PATH = path.join(__dirname, 'releases', '刷题.apk');
const HOST = '0.0.0.0'; // listen on all interfaces

// Ensure bank directory exists
if (!fs.existsSync(BANK_DIR)) fs.mkdirSync(BANK_DIR, { recursive: true });

function getLocalIP() {
  try {
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch (e) {}
  return 'localhost';
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // API: list question banks
    if (url.pathname === '/api/banks') {
      const files = fs.readdirSync(BANK_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const stat = fs.statSync(path.join(BANK_DIR, f));
          return {
            name: f,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
      return;
    }

    // API: download question bank
    if (url.pathname.startsWith('/api/banks/')) {
      const fileName = decodeURIComponent(url.pathname.replace('/api/banks/', ''));
      const filePath = path.join(BANK_DIR, fileName);
      if (!fs.existsSync(filePath) || !fileName.endsWith('.md')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Length': content.length,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      });
      res.end(content);
      return;
    }

    // API: app version check
    if (url.pathname === '/api/version') {
      if (!fs.existsSync(APK_PATH)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: '1.0', apkAvailable: false }));
        return;
      }
      const stat = fs.statSync(APK_PATH);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        version: '1.0',
        buildDate: stat.mtime.toISOString(),
        apkSize: stat.size,
        apkAvailable: true,
      }));
      return;
    }

    // API: download APK
    if (url.pathname === '/api/apk') {
      if (!fs.existsSync(APK_PATH)) {
        res.writeHead(404);
        res.end('APK not found');
        return;
      }
      const content = fs.readFileSync(APK_PATH);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': content.length,
      });
      res.end(content);
      return;
    }

    // Serve simple status page
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>刷题服务器</title>
<style>body{font-family:sans-serif;padding:40px;background:#f8fafc}
h1{color:#2563eb}.card{background:#fff;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 3px rgba(0,0,0,.08)}
code{background:#e2e8f0;padding:2px 8px;border-radius:4px}</style></head>
<body>
<h1>刷题服务器已启动</h1>
<div class="card"><strong>本机IP:</strong> ${getLocalIP()}:${PORT}</div>
<div class="card"><strong>题库文件:</strong> ${fs.readdirSync(BANK_DIR).filter(f=>f.endsWith('.md')).length} 个</div>
<div class="card"><strong>APK:</strong> ${fs.existsSync(APK_PATH) ? '可用 (' + (fs.statSync(APK_PATH).size/1024).toFixed(0) + 'KB)' : '未构建'}</div>
<div class="card">
  <strong>手机连接:</strong><br>
  1. 确保手机和电脑在同一WiFi<br>
  2. 在刷题App中点"从电脑下载"<br>
  3. 或在浏览器访问 <code>http://${getLocalIP()}:${PORT}</code>
</div>
</body></html>`);
  } catch (e) {
    res.writeHead(500);
    res.end('Error: ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${getLocalIP()}:${PORT}`);
  console.log(`Banks: ${BANK_DIR}`);
  console.log(`APK: ${APK_PATH}`);
  console.log('Press Ctrl+C to stop');
});
