import assert from 'node:assert/strict';

let listener, processor, geminiCalls = 0, mimoCalls = 0, failureMode = 'network';
const messages = [];
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => delay === 20000
  ? originalTimeout(callback, 0)
  : originalTimeout(callback, delay, ...args);
globalThis.chrome = { runtime: {
  onMessage: { addListener: callback => { listener = callback; } },
  sendMessage: async message => { messages.push(message); }
} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
  getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] })
} } });
globalThis.AudioContext = class {
  sampleRate = 16000;
  destination = {};
  createMediaStreamSource() { return { connect: () => {}, disconnect: () => {} }; }
  createScriptProcessor() { processor = { connect: () => {}, disconnect: () => {}, onaudioprocess: null }; return processor; }
  async close() {}
};
globalThis.fetch = async (url, options) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
    geminiCalls++;
    if (failureMode === 'timeout') return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('超时', 'AbortError')), { once: true });
    });
    throw new TypeError('Failed to fetch');
  }
  mimoCalls++;
  assert(JSON.parse(options.body).messages[0].content[0].input_audio.data.startsWith('data:audio/wav;base64,'));
  return { ok: true, json: async () => ({ choices: [{ message: { content: `片段${mimoCalls}` } }] }) };
};
await import('../src/offscreen/recorder.js');
function send(message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('录音消息超时')), 5000);
    listener({ target: 'offscreen', ...message }, {}, reply => { clearTimeout(timer); resolve(reply); });
  });
}
const settings = {
  provider: 'Gemini', geminiApiKey: 'test-gemini', smartMode: true,
  apiKey: 'test-mimo', endpoint: 'https://example.com/v1/chat/completions', model: 'mimo-v2.5-asr'
};
assert((await send({ type: 'start', sessionId: 'fallback-test', contextID: 7, trigger: 'toggle', settings })).ok);
const frame = new Float32Array(4096).fill(0.08);
for (let i = 0; i < 352; i++) processor.onaudioprocess({ inputBuffer: { numberOfChannels: 1, length: frame.length, getChannelData: () => frame } });
assert((await send({ type: 'stop' })).ok);
for (let i = 0; i < 200 && !messages.some(message => message.type === 'voice-result'); i++) await new Promise(resolve => setTimeout(resolve, 10));
const result = messages.find(message => message.type === 'voice-result');
assert.equal(result?.text, '片段1 片段2');
assert.equal(result?.error, undefined);
assert.equal(geminiCalls, 1, '降级后后续片段不应再请求 Gemini');
assert.equal(mimoCalls, 2);
failureMode = 'timeout';
messages.length = 0;
assert((await send({ type: 'start', sessionId: 'timeout-test', contextID: 7, trigger: 'toggle', settings })).ok);
for (let i = 0; i < 6; i++) processor.onaudioprocess({ inputBuffer: { numberOfChannels: 1, length: frame.length, getChannelData: () => frame } });
assert((await send({ type: 'stop' })).ok);
for (let i = 0; i < 200 && !messages.some(message => message.type === 'voice-result'); i++) await new Promise(resolve => originalTimeout(resolve, 10));
assert.equal(messages.find(message => message.type === 'voice-result')?.text, '片段3');
assert.equal(geminiCalls, 2);
assert.equal(mimoCalls, 3);
globalThis.setTimeout = originalTimeout;
console.log('Gemini 网络失败或超时后静默使用 MiMo：通过');
