import assert from 'node:assert/strict';
import { encodeWav, resample } from '../src/offscreen/wav.js';
import { extractText, transcribe } from '../src/background/asr.js';

const samples = resample([new Float32Array(48000).fill(0.5)], 48000);
assert.equal(samples.length, 16000);
const wav = encodeWav(samples);
const header = new DataView(wav.buffer);
assert.equal(header.getUint32(24, true), 16000);
assert.equal(header.getUint16(22, true), 1);
assert.equal(header.getUint16(34, true), 16);
assert.equal(extractText({ choices: [{ message: { content: '你好。' } }] }), '你好。');
const result = await transcribe('AAAA', { apiKey: 'test', endpoint: 'https://example.com/v1/chat/completions', model: 'asr' }, async (_url, request) => {
  assert.equal(JSON.parse(request.body).messages[0].content[0].input_audio.data, 'data:audio/wav;base64,AAAA');
  return { ok: true, json: async () => ({ choices: [{ message: { content: '测试。' } }] }) };
});
assert.equal(result, '测试。');
console.log('本地音频格式与 ASR 请求测试通过');
