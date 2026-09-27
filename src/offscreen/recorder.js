import { transcribe } from '../background/asr.js';
import { transcribeGeminiFile } from './gemini_file.js';
import { encodeWav, resample } from './wav.js';

const SEGMENT_SECONDS = 75;
const MAX_SESSION_MS = 595000;
let stream, context, source, processor, chunks, session, limitTimer;
let processing = false, aborter, finishTask;

function tellBackground(type, data = {}) {
  void chrome.runtime.sendMessage({ target: 'background', type, ...data }).catch(() => {});
}
function status() {
  const current = session && { id: session.id, contextID: session.contextID, trigger: session.trigger, startedAt: session.startedAt };
  return { recording: !!stream, processing, session: current };
}
async function start(message) {
  if (stream || processing) throw new Error('上一段录音仍在处理中');
  if (!message.settings) throw new Error('录音设置缺失，请重新加载扩展');
  session = { id: message.sessionId, contextID: message.contextID, trigger: message.trigger, settings: message.settings, startedAt: Date.now() };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    context = new AudioContext();
    await context.audioWorklet.addModule(chrome.runtime.getURL('capture-worklet.js'));
    source = context.createMediaStreamSource(stream);
    processor = new AudioWorkletNode(context, 'rime-voice-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    chunks = [];
    let lastLevel = 0;
    processor.port.onmessage = ({ data }) => {
      if (data?.type === 'flushed') { processor.flushDone?.(data.id); return; }
      if (data?.type !== 'audio') return;
      const mono = data.samples;
      chunks.push(mono);
      const now = Date.now();
      if (now - lastLevel >= 140) {
        let power = 0;
        for (let index = 0; index < mono.length; index++) power += mono[index] * mono[index];
        tellBackground('voice-level', { sessionId: session.id, contextID: session.contextID, trigger: session.trigger, level: Math.sqrt(power / mono.length) });
        lastLevel = now;
      }
    };
    source.connect(processor);
    processor.connect(context.destination);
    if (context.state === 'suspended') await context.resume();
    const remaining = Math.max(0, MAX_SESSION_MS - (Date.now() - session.startedAt));
    limitTimer = setTimeout(() => { void autoStop(); }, remaining);
    return status();
  } catch (error) {
    clearTimeout(limitTimer);
    stream?.getTracks().forEach(track => track.stop());
    if (context) await context.close().catch(() => {});
    stream = context = source = processor = chunks = session = undefined;
    throw error;
  }
}
function finishCapture() {
  if (finishTask) return finishTask;
  if (!stream) throw new Error('没有正在进行的录音');
  finishTask = (async () => {
    clearTimeout(limitTimer); limitTimer = undefined;
    stream.getTracks().forEach(track => track.stop());
    source.disconnect();
    await new Promise(resolve => {
      const id = Math.random();
      const timer = setTimeout(resolve, 300);
      processor.flushDone = replyId => {
        if (replyId !== id) return;
        clearTimeout(timer);
        resolve();
      };
      processor.port.postMessage({ type: 'flush', id });
    });
    processor.port.onmessage = null;
    processor.port.close();
    processor.disconnect();
    const captured = { chunks, sourceRate: context.sampleRate, session };
    const closed = context.close();
    stream = context = source = processor = chunks = undefined;
    await closed;
    return captured;
  })().finally(() => { finishTask = undefined; });
  return finishTask;
}
async function autoStop() {
  if (!stream || finishTask) return;
  try {
    const capture = await finishCapture();
    processing = true;
    tellBackground('voice-auto-stopped', { sessionId: capture.session.id, contextID: capture.session.contextID, reason: '单次录音已达到10分钟上限' });
    void processCapture(capture, capture.session.settings);
  } catch (error) {
    tellBackground('voice-result', { sessionId: session?.id, contextID: session?.contextID, error: error.message });
    session = undefined;
  }
}
function toBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
async function processCapture(capture, settings) {
  const { id, contextID } = capture.session;
  const controller = new AbortController();
  aborter = controller;
  const texts = [];
  let useMiMo = settings.provider !== 'Gemini' && settings.provider !== 'Gemini Live';
  const fetcher = async (url, init) => {
    if (controller.signal.aborted) throw new DOMException('录音已取消', 'AbortError');
    const requestController = new AbortController();
    const cancelRequest = () => requestController.abort();
    controller.signal.addEventListener('abort', cancelRequest, { once: true });
    const timeout = url.startsWith('https://generativelanguage.googleapis.com/') ? 20000 : 90000;
    const timer = setTimeout(cancelRequest, timeout);
    try { return await fetch(url, { ...init, signal: requestController.signal }); }
    finally { clearTimeout(timer); controller.signal.removeEventListener('abort', cancelRequest); }
  };
  try {
    const maxFrames = capture.sourceRate * SEGMENT_SECONDS;
    const totalFrames = capture.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (totalFrames < capture.sourceRate / 10) throw new Error('录音太短，请重试');
    const totalSegments = Math.ceil(totalFrames / maxFrames);
    let group = [], groupFrames = 0;
    async function sendGroup() {
      if (!groupFrames) return;
      const wav = encodeWav(resample(group, capture.sourceRate));
      group = []; groupFrames = 0;
      const base64 = toBase64(wav);
      let text;
      if (!useMiMo) {
        try { text = await transcribeGeminiFile(base64, settings, fetcher); }
        catch (error) {
          if (controller.signal.aborted) throw error;
          if (!settings.apiKey) throw new Error(`Gemini 不可用且未配置 MiMo API Key：${error.message}`);
          useMiMo = true;
        }
      }
      if (useMiMo) text = await transcribe(base64, settings, fetcher);
      texts.push(text);
      tellBackground('voice-progress', { sessionId: id, contextID, completed: texts.length, total: totalSegments });
    }
    for (let index = 0; index < capture.chunks.length; index++) {
      const chunk = capture.chunks[index];
      capture.chunks[index] = null;
      for (let offset = 0; offset < chunk.length;) {
        const count = Math.min(chunk.length - offset, maxFrames - groupFrames);
        group.push(chunk.subarray(offset, offset + count));
        groupFrames += count; offset += count;
        if (groupFrames === maxFrames) await sendGroup();
      }
    }
    await sendGroup();
    tellBackground('voice-result', { sessionId: id, contextID, text: texts.join(' ').trim() });
  } catch (error) {
    tellBackground('voice-result', { sessionId: id, contextID, text: texts.join(' ').trim(), error: controller.signal.aborted && error.name === 'AbortError' ? '语音服务超时或录音已取消' : error.message });
  } finally {
    processing = false; aborter = undefined; session = undefined;
  }
}
async function cancel() {
  if (finishTask) await finishTask;
  else if (stream) await finishCapture();
  session = undefined;
  aborter?.abort();
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;
  (async () => {
    if (message.type === 'status') return sendResponse({ ok: true, data: status() });
    if (message.type === 'start') return sendResponse({ ok: true, data: await start(message) });
    if (message.type === 'cancel') { await cancel(); return sendResponse({ ok: true }); }
    if (message.type === 'stop') {
      if (finishTask || processing) return sendResponse({ ok: true, data: { sessionId: session?.id } });
      const capture = await finishCapture();
      processing = true;
      sendResponse({ ok: true, data: { sessionId: capture.session.id } });
      void processCapture(capture, capture.session.settings);
    }
  })().catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
