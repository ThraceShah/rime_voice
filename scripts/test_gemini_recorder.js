import assert from 'node:assert/strict';
import { installAudioWorkletMock } from './mock_audio_worklet.js';

let listener, limitCallback, requestCount = 0, stoppedTracks = 0;
const messages = [];
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => {
  if (delay >= 590000 && delay <= 595000) { limitCallback = callback; return 999999; }
  return originalTimeout(callback, delay, ...args);
};
globalThis.chrome = { runtime: {
  getURL: path => `chrome-extension://test/${path}`,
  onMessage: { addListener: callback => { listener = callback; } },
  sendMessage: async message => { messages.push(message); }
} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
  getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stoppedTracks++; } }] })
} } });
const audio = installAudioWorkletMock({ sampleRate: 48000 });
globalThis.fetch = async (_url, init) => {
  requestCount++;
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'gemini-3.5-transcribe');
  assert.equal(body.generation_config.transcription_config.mode, 'smart');
  assert(body.input[0].data.length > 100);
  return { ok: true, json: async () => ({ steps: [{ content: [{ type: 'text', text: '测试成功。' }] }] }) };
};
await import('../src/offscreen/recorder.js');
function send(message) {
  return new Promise((resolve, reject) => {
    const timer = originalTimeout(() => reject(new Error('录音消息超时')), 5000);
    listener({ target: 'offscreen', ...message }, {}, reply => { clearTimeout(timer); resolve(reply); });
  });
}
try {
  const settings = { provider: 'Gemini', geminiApiKey: 'test', smartMode: true };
  assert((await send({ type: 'start', sessionId: 'gemini-test', contextID: 5, trigger: 'toggle', settings })).ok);
  const frame = new Float32Array(4096).fill(0.08);
  for (let i = 0; i < 15; i++) audio.emit(frame);
  assert(limitCallback, '缺少10分钟自动结束计时器');
  limitCallback();
  assert((await send({ type: 'stop' })).ok, '到达录音上限时再次结束应安全返回');
  for (let i = 0; i < 200 && !messages.some(message => message.type === 'voice-result'); i++) await new Promise(resolve => originalTimeout(resolve, 10));
  assert(messages.some(message => message.type === 'voice-auto-stopped'));
  assert.equal(messages.find(message => message.type === 'voice-result')?.text, '测试成功。');
  assert.equal(requestCount, 1);
  assert.equal(stoppedTracks, 1);
  console.log('Gemini HTTPS SMART 与10分钟自动结束测试通过');
} finally { globalThis.setTimeout = originalTimeout; }
