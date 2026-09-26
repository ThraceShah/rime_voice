import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { transcribeGeminiFile } from '../src/offscreen/gemini_file.js';

assert(process.env.GEMINI_API_KEY, '请设置 GEMINI_API_KEY 环境变量');
const audio = await readFile(new URL('./fixtures/english_test.wav', import.meta.url));
function curlFetch(url, init) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', ['-sS', '--retry', '2', '--retry-all-errors', '--max-time', '60', '-w', '\n%{http_code}', '-H', `x-goog-api-key: ${process.env.GEMINI_API_KEY}`, '-H', 'Content-Type: application/json', '--data-binary', '@-', url]);
    const chunks = [], errors = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => errors.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(Buffer.concat(errors).toString() || `curl 退出码 ${code}`));
      const output = Buffer.concat(chunks).toString();
      const split = output.lastIndexOf('\n');
      const status = Number(output.slice(split + 1));
      const data = JSON.parse(output.slice(0, split));
      resolve({ ok: status >= 200 && status < 300, status, json: async () => data });
    });
    child.stdin.end(init.body);
  });
}
const text = await transcribeGeminiFile(audio.toString('base64'), { geminiApiKey: process.env.GEMINI_API_KEY, smartMode: true }, curlFetch);
assert(/1|one/i.test(text), `转写结果与测试语音不符：${text}`);
console.log(`Gemini HTTPS SMART 转写成功：${text}`);
