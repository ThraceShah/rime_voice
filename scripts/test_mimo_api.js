import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { DEFAULTS, transcribe } from '../src/background/asr.js';

const path = process.argv[2];
assert(path, '用法：MIMO_API_KEY=... node scripts/test_mimo_api.js <sample-16k.wav|--sample>');
assert(process.env.MIMO_API_KEY, '请设置 MIMO_API_KEY 环境变量');
const wav = path === '--sample'
  ? await readFile(new URL('./fixtures/english_test.wav', import.meta.url))
  : await readFile(path);
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
assert.equal(wav.readUInt16LE(20), 1, '需要 PCM WAV');
assert.equal(wav.readUInt16LE(22), 1, '需要单声道');
assert.equal(wav.readUInt32LE(24), 16000, '需要 16 kHz');
assert.equal(wav.readUInt16LE(34), 16, '需要 16 bit');
const text = await transcribe(wav.toString('base64'), {
  ...DEFAULTS,
  apiKey: process.env.MIMO_API_KEY,
  endpoint: process.env.MIMO_ENDPOINT || DEFAULTS.endpoint,
  model: process.env.MIMO_MODEL || DEFAULTS.model
}, async (...args) => {
  const response = await fetch(...args);
  if (response.ok) {
    const data = await response.clone().json();
    assert(Array.isArray(data.choices), '响应缺少 choices');
    assert(data.choices[0]?.message, '响应缺少 message');
  }
  return response;
});
assert(text, '识别文本为空');
if (path === '--sample') assert(/one|two|three/i.test(text), `示例语音识别结果与预期不符：${text}`);
console.log(`识别成功：${text}`);
