import { input, select, clear, flip } from '../rime/engine.js';
import { DEFAULTS } from './asr.js';
import { createAltHold } from './alt_hold.js';
import { createShiftToggle } from './shift_toggle.js';

const ENGINE_ID = 'rime_mimo_ime';
let active = false, contextId = -1, contextType = 'text', composition = '', state = null;
let inputMode = 'zh', modeLoaded = false;
const modeReady = chrome.storage.local.get('inputMode')
  .then(({ inputMode: saved }) => { inputMode = saved === 'en' ? 'en' : 'zh'; })
  .catch(error => console.error('读取输入模式失败', error))
  .finally(() => { modeLoaded = true; });
let voice = 'idle', voiceContext = -1, voiceTrigger = null, generation = 0;
let voiceSessionId = null, audioLevel = 0, progressText = '', lastLevelRender = 0, levelRenderPending = false;
let queue = Promise.resolve(), creating, closing;
let altLDown = false, pendingModeSwitches = 0;
let latestFocus = null;
const ime = chrome.input.ime;
const sessionStore = chrome.storage.session || chrome.storage.local;

function notify(message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title: 'Rime Voice', message });
}
function enqueue(work) {
  const result = queue.then(work);
  queue = result.catch(error => {
    if (isFocusLoss(error)) { focusError(error, contextId); return true; }
    console.error(error);
    notify(error.message || '输入法发生错误');
    return true;
  });
  return queue;
}
function voiceIndicator() {
  if (voice === 'processing') return `🎙 识别中${progressText}…`;
  const height = Math.min(7, Math.round(Math.sqrt(Math.max(0, audioLevel)) * 14));
  const bars = [0.45, 0.8, 1, 0.7, 0.4].map(scale => '▁▂▃▄▅▆▇█'[Math.max(0, Math.round(height * scale))]).join('');
  return `🎙 ${bars}  ${voiceTrigger === 'hold' ? '松开右 Alt 结束' : 'Alt+L 结束'}`;
}
function focusError(error, target) {
  if (!isFocusLoss(error)) return error;
  if (target >= 0 && contextId === target) {
    contextId = -1; active = false; generation++;
    discardRecording();
    void sessionStore.remove('currentContextID').catch(() => {});
  }
  const stale = new Error('输入焦点已离开');
  stale.name = 'FocusLostError';
  return stale;
}
function isFocusLoss(error) {
  return error?.name === 'FocusLostError' || /Context is not active|engine is not active|IME is not active|input method is not active/i.test(error?.message || '');
}
function hasContext(target) { return active && target >= 0 && contextId === target; }
async function commit(target, text) {
  if (!hasContext(target)) return false;
  try { await ime.commitText({ contextID: target, text }); return true; }
  catch (error) { throw focusError(error, target); }
}
async function render() {
  if (contextType === 'password' || !hasContext(contextId)) return;
  const target = contextId;
  const text = voice !== 'idle' ? voiceIndicator() : inputMode === 'en' ? '' : state ? [state.preeditHead, state.preeditBody, state.preeditTail].join('') || composition : composition;
  try {
    await ime.setComposition({ contextID: target, text, cursor: Array.from(text).length });
    if (!hasContext(target)) return;
    const candidates = (voice !== 'idle' || inputMode === 'en' ? [] : state?.candidates || []).slice(0, 9).map((item, index) => ({ id: index, candidate: item.text, annotation: item.comment || '', label: `${index + 1}` }));
    await ime.setCandidates({ contextID: target, candidates });
    if (!hasContext(target)) return;
    await ime.setCandidateWindowProperties({ engineID: ENGINE_ID, properties: {
      visible: voice === 'idle' && inputMode === 'zh' && !!composition, vertical: true, pageSize: 9,
      cursorVisible: candidates.length > 0, auxiliaryTextVisible: false
    } });
    if (candidates.length && hasContext(target)) await ime.setCursorPosition({ contextID: target, candidateID: Math.min(state?.highlightedIndex || 0, candidates.length - 1) });
  } catch (error) { throw focusError(error, target); }
}
async function reset() {
  composition = ''; state = null;
  await clear();
  if (contextId >= 0 && active) await render();
}
async function switchInputMode() {
  await modeReady;
  if (inputMode === 'zh' && composition && contextId >= 0 && active) {
    await commit(contextId, composition);
  }
  composition = ''; state = null;
  await clear();
  inputMode = inputMode === 'zh' ? 'en' : 'zh';
  await chrome.storage.local.set({ inputMode });
  await render();
}
async function pick(index) {
  if (!state?.candidates?.[index] || contextId < 0) return;
  const target = contextId;
  const result = await select(index);
  if (result?.committed) await commit(target, result.committed);
  composition = ''; state = null;
  await clear(); await render();
}
async function ensureOffscreen() {
  if (closing) await closing;
  const url = chrome.runtime.getURL('offscreen.html');
  if ((await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] })).length) return;
  if (!creating) creating = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Capture microphone audio for speech input' }).finally(() => { creating = undefined; });
  await creating;
}
async function hasOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  return (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] })).length > 0;
}
async function closeOffscreen() {
  if (closing) return closing;
  closing = (async () => {
    if (creating) await creating.catch(() => {});
    if (voice !== 'idle' || !await hasOffscreen()) return;
    const reply = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'status' }).catch(() => null);
    if (reply?.data?.recording) return;
    await chrome.offscreen.closeDocument();
  })().catch(() => {}).finally(() => { closing = undefined; });
  return closing;
}
async function recordMessage(type, data = {}) {
  if (type === 'start') await ensureOffscreen();
  else {
    if (closing) await closing;
    if (creating) await creating.catch(() => {});
    if (!await hasOffscreen()) return type === 'status' ? { recording: false, processing: false, session: null } : undefined;
  }
  const reply = await chrome.runtime.sendMessage({ target: 'offscreen', type, ...data });
  if (!reply?.ok) throw new Error(reply?.error || '录音失败');
  return reply.data;
}
async function startVoice(trigger) {
  if (contextType === 'password' || !active || (trigger === 'hold' && !altHold.isDown())) return;
  const requestGeneration = generation;
  if (contextId < 0) {
    const { currentContextID } = await sessionStore.get('currentContextID');
    if (Number.isInteger(currentContextID) && currentContextID >= 0) contextId = currentContextID;
    else return;
  }
  if (voice !== 'idle') return;
  const settings = { ...DEFAULTS, ...await chrome.storage.local.get(Object.keys(DEFAULTS)) };
  if (settings.provider === 'Gemini Live') settings.provider = 'Gemini';
  if (settings.provider === 'Gemini' && !settings.geminiApiKey && settings.apiKey) settings.provider = 'MiMo';
  const key = settings.provider === 'Gemini' ? settings.geminiApiKey : settings.apiKey;
  if (!key) { notify(settings.provider === 'Gemini' ? '请先填写 Google AI Studio API Key' : '请先填写 MiMo API Key'); return; }
  if (!active || contextId < 0 || generation !== requestGeneration) return;
  voiceContext = contextId;
  voiceTrigger = trigger;
  voiceSessionId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  audioLevel = 0; progressText = '';
  const token = generation;
  voice = 'starting';
  let recorderStarted = false;
  try {
    await sessionStore.set({ voiceSession: { id: voiceSessionId, contextID: voiceContext } });
    await render();
    if (token !== generation || !hasContext(voiceContext)) throw focusError(new Error('Context is not active'), voiceContext);
    await recordMessage('start', { sessionId: voiceSessionId, contextID: voiceContext, trigger, settings });
    recorderStarted = true;
    if (token !== generation || !active || voiceContext !== contextId || (trigger === 'hold' && !altHold.isDown())) {
      await recordMessage('cancel');
      await sessionStore.remove('voiceSession');
      voice = 'idle'; voiceContext = -1; voiceTrigger = voiceSessionId = null;
      return;
    }
    voice = 'recording'; await render();
  } catch (error) {
    const stillFocused = token === generation && hasContext(voiceContext);
    if (recorderStarted) await recordMessage('cancel').catch(() => {});
    await sessionStore.remove('voiceSession').catch(() => {});
    voice = 'idle'; voiceContext = -1; voiceTrigger = voiceSessionId = null;
    void closeOffscreen();
    if (stillFocused && !isFocusLoss(error)) notify(error.name === 'NotAllowedError' ? '请允许麦克风访问' : `无法录音：${error.message}`);
  }
}
async function stopVoice() {
  if (voice !== 'recording') return;
  voice = 'processing'; progressText = '';
  try {
    await render().catch(() => {});
    await recordMessage('stop');
  } catch (error) {
    if (hasContext(voiceContext) && !isFocusLoss(error)) notify(`结束录音失败：${error.message}`);
    await recordMessage('cancel').catch(() => {});
    await sessionStore.remove('voiceSession').catch(() => {});
    voice = 'idle'; voiceContext = -1; voiceTrigger = voiceSessionId = null;
    await render();
    void closeOffscreen();
  }
}
async function toggleVoice() {
  const status = await recordMessage('status');
  if (status.recording) {
    if (voice !== 'recording') {
      voice = 'recording';
      voiceSessionId = status.session.id;
      voiceContext = status.session.contextID;
      voiceTrigger = status.session.trigger;
      if (contextId < 0) contextId = voiceContext;
    }
    await stopVoice();
  } else if (status.processing) {
    notify('上一段语音正在识别，请稍候');
  } else if (voice === 'idle') {
    await startVoice('toggle');
  }
}
const altHold = createAltHold({
  onStart: () => { void enqueue(() => startVoice('hold')); },
  onStop: () => { void enqueue(() => voiceTrigger === 'hold' ? stopVoice() : undefined); }
});
const shiftToggle = createShiftToggle(() => {
  pendingModeSwitches++;
  void enqueue(switchInputMode).finally(() => { pendingModeSwitches--; });
});
function discardRecording() {
  altHold.cancel();
  shiftToggle.cancel();
  altLDown = false;
  if (voice === 'idle') return;
  voice = 'idle'; voiceContext = -1; voiceTrigger = voiceSessionId = null;
  void sessionStore.remove('voiceSession').catch(() => {});
  void enqueue(async () => { try { await recordMessage('cancel'); } catch {} await closeOffscreen(); });
}
async function finishVoiceResult(message) {
  const { voiceSession: saved } = await sessionStore.get('voiceSession');
  if (!saved || saved.id !== message.sessionId || saved.contextID !== message.contextID) { void closeOffscreen(); return; }
  try {
    if (!hasContext(message.contextID)) return;
    if (!message.text?.trim()) throw new Error(message.error || '语音服务未返回识别文字');
    await commit(message.contextID, message.text);
    if (message.error) notify(`后续语音片段失败，已插入已识别部分：${message.error}`);
  } catch (error) {
    const handled = focusError(error, message.contextID);
    if (!isFocusLoss(handled)) notify(`语音输入失败：${handled.message}`);
  }
  finally {
    await sessionStore.remove('voiceSession');
    voice = 'idle'; voiceContext = -1; voiceTrigger = voiceSessionId = null;
    audioLevel = 0; progressText = '';
    await render().catch(() => {});
    void closeOffscreen();
  }
}
chrome.runtime.onMessage.addListener(message => {
  if (message.target !== 'background') return;
  if (message.type === 'voice-result') { void finishVoiceResult(message); return; }
  if (message.sessionId !== voiceSessionId) return;
  if (message.type === 'voice-auto-stopped') {
    voice = 'processing'; progressText = '';
    notify(message.reason || '录音已结束，正在识别');
    void render().catch(() => {});
  } else if (message.type === 'voice-progress') {
    progressText = ` ${message.completed}/${message.total}`;
    void render().catch(() => {});
  } else if (message.type === 'voice-level' && voice === 'recording' && active && contextId === message.contextID) {
    audioLevel = audioLevel * 0.58 + Math.min(1, message.level) * 0.42;
    const now = Date.now();
    if (!levelRenderPending && now - lastLevelRender >= 130) {
      lastLevelRender = now;
      const text = voiceIndicator();
      const target = contextId;
      levelRenderPending = true;
      void ime.setComposition({ contextID: target, text, cursor: Array.from(text).length })
        .catch(error => { focusError(error, target); })
        .finally(() => { levelRenderPending = false; });
    }
  }
});
function isRelevant(key) {
  if (contextType === 'password') return false;
  if (key.type !== 'keydown' || key.altKey || key.ctrlKey || key.metaKey) return false;
  if (/^[a-z]$/i.test(key.key) && !key.shiftKey) return true;
  return !!composition && (/^[1-9]$/.test(key.key) || [' ', 'Backspace', 'Escape', 'Enter', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', '-', '='].includes(key.key));
}
async function handleKey(key) {
  if (contextId < 0) return;
  if (/^[a-z]$/i.test(key.key)) composition += key.key.toLowerCase();
  else if (key.key === 'Backspace') composition = composition.slice(0, -1);
  else if (key.key === 'Escape') { await reset(); return; }
  else if (/^[1-9]$/.test(key.key)) { await pick(Number(key.key) - 1); return; }
  else if (key.key === ' ' || key.key === 'Enter') { if (state?.candidates?.length) await pick(0); else { await commit(contextId, composition); await reset(); } return; }
  else if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', '-', '='].includes(key.key)) {
    const forward = ['PageDown', 'ArrowDown', '='].includes(key.key);
    state = await flip(forward);
    await render(); return;
  }
  state = await input(composition);
  if (state?.committed) { await commit(contextId, state.committed); await reset(); }
  else await render();
}

function focus(context) {
  if (contextId >= 0 && context.contextID !== contextId) discardRecording();
  contextId = context.contextID; contextType = context.type; generation++; composition = ''; state = null;
  void sessionStore.set({ currentContextID: contextId }).catch(() => {});
  void enqueue(reset);
}
ime.onActivate.addListener(engine => { active = engine === ENGINE_ID; if (active && latestFocus) focus(latestFocus); });
ime.onDeactivated.addListener(engine => { if (engine !== ENGINE_ID) return; discardRecording(); active = false; contextId = -1; generation++; composition = ''; state = null; void sessionStore.remove('currentContextID').catch(() => {}); });
ime.onFocus.addListener(context => { latestFocus = context; if (active) focus(context); });
ime.onBlur.addListener(id => { if (latestFocus?.contextID === id) latestFocus = null; if (id === contextId) { discardRecording(); contextId = -1; generation++; composition = ''; state = null; void sessionStore.remove('currentContextID').catch(() => {}); void enqueue(clear); } });
ime.onCandidateClicked.addListener((_engine, id) => { void enqueue(() => pick(id)); });
ime.onKeyEvent.addListener((engine, key, requestId) => {
  if (engine !== ENGINE_ID) return false;
  active = true;
  if (contextId < 0 && latestFocus) focus(latestFocus);
  if (altHold.handle(key)) return false;
  if (shiftToggle.handle(key)) return false;
  if (key.code === 'KeyL' && key.type === 'keyup' && altLDown) { altLDown = false; return true; }
  if (key.code === 'KeyL' && key.altKey && !key.ctrlKey && !key.metaKey && !key.shiftKey) {
    if (key.type === 'keydown' && !altLDown) {
      altLDown = true;
      void enqueue(toggleVoice);
    }
    return true;
  }
  if ((!modeLoaded || pendingModeSwitches > 0) && key.type === 'keydown') {
    const target = contextId, token = generation;
    enqueue(async () => {
      await modeReady;
      if (inputMode === 'en' || !isRelevant(key)) return false;
      if (target !== contextId || token !== generation) return true;
      await handleKey(key);
      return true;
    }).then(handled => ime.keyEventHandled(requestId, handled), () => ime.keyEventHandled(requestId, true));
    return undefined;
  }
  if (inputMode === 'en') return false;
  if (!isRelevant(key)) return false;
  const target = contextId, token = generation;
  enqueue(() => target === contextId && token === generation ? handleKey(key) : undefined)
    .then(() => ime.keyEventHandled(requestId, true), () => ime.keyEventHandled(requestId, true));
  return undefined;
});
