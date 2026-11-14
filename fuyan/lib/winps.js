/**
 * 复研 · Windows 能力桥
 * 用系统自带 PowerShell 做：系统对话框、zip 压缩/解压。
 * （不引第三方依赖；这些能力在 Electron 中会被原生 API 替代）
 */
'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const PS_DIR = path.join(__dirname, '..', 'tools', 'ps');
const PS = process.env.FUYAN_PS || 'powershell.exe';

function runPS(script, args, opts = {}) {
  const file = path.join(PS_DIR, script);
  return new Promise((resolve, reject) => {
    const argv = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args];
    execFile(PS, argv, { windowsHide: true, timeout: opts.timeout || 120000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const e = new Error((stderr || err.message || '').trim() || 'PowerShell 调用失败');
          e.stdout = stdout;
          return reject(e);
        }
        resolve((stdout || '').trim());
      });
  });
}

/** 返回用户选择的文件夹绝对路径；取消返回 '' */
async function pickFolder(title) {
  try {
    return await runPS('pick-folder.ps1', ['-Title', title || '选择存档文件夹'], { timeout: 300000 });
  } catch (e) {
    return '';
  }
}

/** 返回用户选择的文件绝对路径；取消返回 '' */
async function pickFile(title, filter) {
  try {
    return await runPS('pick-file.ps1', ['-Title', title || '选择文件', '-Filter', filter || '所有文件 (*.*)|*.*'], {
      timeout: 300000,
    });
  } catch (e) {
    return '';
  }
}

async function expandZip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  await runPS('expand-zip.ps1', ['-Zip', zip, '-Dest', dest], { timeout: 300000 });
  return dest;
}

async function compressDir(src, zip) {
  fs.mkdirSync(path.dirname(zip), { recursive: true });
  try { fs.unlinkSync(zip); } catch (_) {}
  await runPS('compress-dir.ps1', ['-Src', src, '-Zip', zip], { timeout: 300000 });
  return zip;
}

module.exports = { pickFolder, pickFile, expandZip, compressDir, runPS };
