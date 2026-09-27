import assert from 'node:assert/strict';
import { installAudioWorkletMock } from './mock_audio_worklet.js';

let listener, requestCount = 0;
const messages = [];
globalThis.chrome = { runtime: {
  getURL: path => `chrome-extension://test/${path}`,
  onMessage: { addListener: callback => { listener = callback; } },
  sendMessage: async message => { messages.push(message); }
} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
  getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] })
} } });
const audio = installAudioWorkletMock({ sampleRate: 16000 });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  requestCount++;
  const body = JSON.parse(options.body);
  assert(body.messages[0].content[0].input_audio.data.startsWith('data:audio/wav;base64,'));
  return { ok: true, json: async () => ({ choices: [{ message: { content: `片段${requestCount}` } }] }) };
};
await import('../src/offscreen/recorder.js');
function send(message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('录音消息超时')), 5000);
    listener({ target: 'offscreen', ...message }, {}, reply => { clearTimeout(timeout); resolve(reply); });
  });
}
try {
  const settings = { provider: 'MiMo', apiKey: 'test', endpoint: 'https://example.com/v1/chat/completions', model: 'asr' };
  assert((await send({ type: 'start', sessionId: 'long-test', contextID: 3, trigger: 'toggle', settings })).ok);
  const frame = new Float32Array(4096).fill(0.08);
  for (let i = 0; i < 352; i++) audio.emit(frame);
  assert((await send({ type: 'status' })).data.recording);
  const stopped = await send({ type: 'stop' });
  assert(stopped.ok, '长录音必须可以立即停止');
  for (let i = 0; i < 200 && !messages.some(message => message.type === 'voice-result'); i++) await new Promise(resolve => setTimeout(resolve, 10));
  const result = messages.find(message => message.type === 'voice-result');
  assert(result, '长录音缺少识别结果');
  assert.equal(result.text, '片段1 片段2');
  assert.equal(requestCount, 2);
  assert(messages.some(message => message.type === 'voice-level' && message.level > 0));
  console.log('90 秒录音停止、音量事件与分段转写测试通过');
} finally { globalThis.fetch = originalFetch; }
