import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/rime\//, '');
    if (!/^[\w.-]+$/.test(name)) throw new Error('bad path');
    const data = await readFile(new URL(`../vendor/rime/${name}`, import.meta.url));
    response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const listeners = {}, replies = new Map(), storage = {};
const notifications = [];
let committed = '', composition = '', candidates = [], windowVisible = false, requestNo = 0;
let recording = false, processing = false, recorderSession, failVoiceRender = false, cancelCount = 0;
const event = name => ({ addListener: callback => { listeners[name] = callback; } });
globalThis.chrome = {
  storage: { local: {
    get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(key => key in storage).map(key => [key, storage[key]])),
    set: async values => { Object.assign(storage, values); }
  }, session: {
    get: async key => key in storage ? { [key]: storage[key] } : {},
    set: async values => { Object.assign(storage, values); },
    remove: async key => { delete storage[key]; }
  } },
  runtime: {
    getURL: path => base + path,
    getContexts: async () => [{}],
    onMessage: event('message'),
    sendMessage: async message => {
      if (message.type === 'status') return { ok: true, data: { recording, processing, session: recorderSession } };
      if (message.type === 'start') {
        recorderSession = { id: message.sessionId, contextID: message.contextID, trigger: message.trigger };
        recording = true; return { ok: true };
      }
      if (message.type === 'cancel') { cancelCount++; recording = false; processing = false; return { ok: true }; }
      recording = false; processing = true;
      queueMicrotask(() => {
        listeners.message({ target: 'background', type: 'voice-result', sessionId: recorderSession.id, contextID: recorderSession.contextID, text: '语音测试。' });
        processing = false;
      });
      return { ok: true };
    }
  },
  notifications: { create: details => { notifications.push(details.message); } },
  input: { ime: {
    onActivate: event('activate'), onDeactivated: event('deactivated'), onFocus: event('focus'),
    onBlur: event('blur'), onCandidateClicked: event('candidate'), onKeyEvent: event('key'),
    setComposition: async value => {
      if (failVoiceRender && value.text.startsWith('🎙')) throw new Error('[input.ime.setComposition]: Context is not active. request context id = 1, current context id = -1');
      if (value.cursor > Array.from(value.text).length) throw new Error('ChromeOS IME 光标越界');
      composition = value.text;
    },
    setCandidates: async value => { candidates = value.candidates; },
    setCandidateWindowProperties: async value => { windowVisible = value.properties.visible; },
    setCursorPosition: async () => {},
    commitText: async value => { committed += value.text; composition = ''; },
    keyEventHandled: (id, handled) => { replies.get(id)?.(handled); replies.delete(id); }
  } }
};
try {
  await import('../src/background/index.js');
  listeners.activate('rime_mimo_ime');
  listeners.focus({ contextID: 1, type: 'text' });
  async function send(key, type = 'keydown', extras = {}) {
    const id = String(++requestNo);
    const reply = new Promise(resolve => replies.set(id, resolve));
    const result = listeners.key('rime_mimo_ime', { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, type, ...extras }, id);
    if (result !== undefined) replies.delete(id);
    const handled = result === undefined ? await reply : result;
    if (!handled && type === 'keydown' && /^[a-z]$/i.test(key)) committed += key;
    return handled;
  }
  async function shift() {
    await send('Shift');
    await send('Shift', 'keyup');
  }
  async function waitMode(value) {
    for (let i = 0; i < 200 && storage.inputMode !== value; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(storage.inputMode, value);
  }
  for (const letter of 'zsw') assert.equal(await send(letter), true);
  assert(windowVisible && candidates.length > 0);
  await shift(); await waitMode('en');
  assert.equal(committed, 'zsw');
  assert.equal(composition, '');
  assert.equal(windowVisible, false);
  assert.equal(await send('a'), false);
  assert.equal(committed, 'zswa');
  await shift(); await waitMode('zh');
  for (const letter of 'nihao') assert.equal(await send(letter), true);
  assert.equal(candidates[0].candidate, '你好');
  storage.apiKey = 'test-key';
  async function waitUntil(predicate) {
    for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert(predicate(), '等待输入法状态超时');
  }
  assert.equal(await send('l', 'keydown', { altKey: true }), true);
  assert.equal(await send('l', 'keyup', { altKey: true }), true);
  await waitUntil(() => recording && composition.includes('Alt+L'));
  assert.equal(windowVisible, false, '录音时不应显示候选词窗');
  listeners.message({ target: 'background', type: 'voice-level', sessionId: recorderSession.id, contextID: 1, level: 0.3 });
  await waitUntil(() => composition.includes('▃') || composition.includes('▄') || composition.includes('▅'));
  assert.equal(await send('l', 'keydown', { altKey: true }), true);
  assert.equal(await send('l', 'keyup', { altKey: true }), true);
  await waitUntil(() => committed.includes('语音测试。'));
  assert.equal(recording, false);
  assert.equal(await send('l', 'keydown', { altKey: true }), true);
  assert.equal(await send('l', 'keyup', { altKey: true }), true);
  await waitUntil(() => recording);
  await import(`../src/background/index.js?restart=${Date.now()}`);
  assert.equal(await send('l', 'keydown', { altKey: true }), true);
  assert.equal(await send('l', 'keyup', { altKey: true }), true);
  await waitUntil(() => committed.split('语音测试。').length === 3);
  assert.equal(recording, false);
  storage.provider = 'Gemini Live'; storage.geminiApiKey = 'test-gemini-key';
  assert.equal(await send('l', 'keydown', { altKey: true }), true);
  assert.equal(await send('l', 'keyup', { altKey: true }), true);
  await waitUntil(() => recording && composition.includes('Alt+L'));
  assert.equal(await send('l', 'keydown', { altKey: true }), true);
  assert.equal(await send('l', 'keyup', { altKey: true }), true);
  await waitUntil(() => committed.split('语音测试。').length === 4);
  storage.provider = 'MiMo';
  await send('Alt', 'keydown', { code: 'AltRight', altKey: true });
  await waitUntil(() => recording && composition.includes('右 Alt'));
  await send('Alt', 'keyup', { code: 'AltRight', altKey: false });
  await waitUntil(() => committed.split('语音测试。').length === 5);
  failVoiceRender = true;
  assert.equal(await send('l', 'keydown', { altKey: true }), true);
  assert.equal(await send('l', 'keyup', { altKey: true }), true);
  await waitUntil(() => cancelCount > 0);
  assert.equal(recording, false, '状态渲染失败后麦克风应释放');
  assert(notifications.some(message => message.includes('重新点击输入框')), '失焦错误应显示友好提示');
  console.log('中英文切换、紧凑录音状态、Alt+L 与 Worker 重启后停止测试通过');
} finally { server.close(); }
