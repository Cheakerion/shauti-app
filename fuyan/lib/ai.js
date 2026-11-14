/**
 * 复研 · DeepSeek 接入
 * 服务端代理，前端拿不到 key。流式（SSE）返回。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');

const store = require('./store');

let cachedKey = { value: '', at: 0 };

/** key 解析：config → 环境变量 → DSH 凭据文件 */
function resolveApiKey(cfg) {
  if (cfg && cfg.ai && cfg.ai.apiKey) return cfg.ai.apiKey.trim();
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  if (cachedKey.value && Date.now() - cachedKey.at < 5 * 60 * 1000) return cachedKey.value;
  const candidates = [path.join(os.homedir(), '.dsh', '.credentials.yaml')];
  for (const f of candidates) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      const m = txt.match(/DEEPSEEK_API_KEY\s*:\s*(sk-[A-Za-z0-9_-]+)/);
      if (m) {
        cachedKey = { value: m[1], at: Date.now() };
        return m[1];
      }
    } catch (_) {}
  }
  return '';
}

function httpPost(urlStr, payload, headers, onEvent, signal) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          Accept: 'text/event-stream',
          ...headers,
        },
        timeout: 180000,
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let err = '';
          res.setEncoding('utf8');
          res.on('data', (d) => (err += d));
          res.on('end', () => reject(new Error(`DeepSeek ${res.statusCode}: ${err.slice(0, 500)}`)));
          return;
        }
        res.setEncoding('utf8');
        let buf = '';
        let full = '';
        res.on('data', (chunk) => {
          buf += chunk;
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const data = t.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const obj = JSON.parse(data);
              const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
              const text = (delta && delta.content) || '';
              if (text) {
                full += text;
                onEvent && onEvent({ type: 'delta', text });
              }
              if (obj.choices && obj.choices[0] && obj.choices[0].finish_reason) {
                onEvent && onEvent({ type: 'finish', reason: obj.choices[0].finish_reason });
              }
              if (obj.usage) onEvent && onEvent({ type: 'usage', usage: obj.usage });
            } catch (_) {
              /* 忽略不完整行 */
            }
          }
        });
        res.on('end', () => resolve(full));
      }
    );
    if (signal) signal.addEventListener('abort', () => req.destroy(new Error('aborted')));
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('DeepSeek 请求超时')));
    req.write(body);
    req.end();
  });
}

function buildSystemPrompt({ mode, archiveTitle, sectionTitle, quote }) {
  const concept = [
    '你是「复研」里的学习助教。用户读资料时选了一段文字，想知道它到底是什么意思。',
    '直接对着这个词/这句话讲：① 一句话给定义或结论；② 2–4 个关键点（机制、数字、区别）；③ 容易和什么混、错在哪，一句话点破。',
    '只讲概念本身（定义、机制、区别、易错点），不要联系课程进度或应试场景；不要客套、不要说“根据你选中的内容”；中文作答，术语可括注英文；总长度 260 字以内。',
  ];
  const exam = [
    '你是「复研」复习软件里的学习助教，面向医学本科生。',
    archiveTitle ? `当前课程：《${archiveTitle}》。` : '',
    sectionTitle ? `用户正在阅读的小节：${sectionTitle}。` : '',
    '回答要求：① 先用一句话给结论/定义；② 再列 2–4 个最关键的知识点（有数字就写数字）；③ 最后一句写最容易混淆或最容易错的地方。',
    '语言简洁，中文作答，术语可括注英文；总长度控制在 220 字以内，不要客套、不要展开成论文。',
  ];
  const parts = mode === 'exam' ? exam : concept;
  if (quote) parts.push(`选中的原文：「${quote}」`);
  return parts.filter(Boolean).join('\n');
}

async function chat({ cfg, mode, archiveTitle, sectionTitle, quote, messages, onEvent, signal }) {
  const key = resolveApiKey(cfg);
  if (!key) throw new Error('没有可用的 DeepSeek API Key：请在「设置」里填写');
  const base = (cfg.ai.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = cfg.ai.model || 'deepseek-flash';
  const payload = {
    model,
    messages: [{ role: 'system', content: buildSystemPrompt({ mode, archiveTitle, sectionTitle, quote }) }, ...messages],
    stream: true,
    temperature: typeof cfg.ai.temperature === 'number' ? cfg.ai.temperature : 0.3,
    max_tokens: cfg.ai.maxTokens || 1600,
  };
  const text = await httpPost(
    `${base}/chat/completions`,
    payload,
    { Authorization: 'Bearer ' + key },
    onEvent,
    signal
  );
  return { text, model };
}

async function listModels(cfg) {
  const key = resolveApiKey(cfg);
  if (!key) throw new Error('没有可用的 DeepSeek API Key');
  const base = (cfg.ai.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  return new Promise((resolve, reject) => {
    const mod = base.startsWith('https') ? https : http;
    const req = mod.get(base + '/models', { headers: { Authorization: 'Bearer ' + key }, timeout: 20000 }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(new Error('解析模型列表失败: ' + d.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('超时')));
  });
}

module.exports = { chat, listModels, resolveApiKey, buildSystemPrompt };
