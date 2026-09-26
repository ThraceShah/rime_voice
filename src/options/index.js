import { DEFAULTS } from '../background/asr.js';

const form = document.querySelector('form');
const status = document.querySelector('#status');
const settings = { ...DEFAULTS, ...await chrome.storage.local.get(Object.keys(DEFAULTS)) };
if (settings.provider === 'Gemini Live') settings.provider = 'Gemini';
for (const key of Object.keys(DEFAULTS)) {
  if (key === 'smartMode') form.elements[key].checked = settings[key] !== false;
  else form.elements[key].value = settings[key];
}
function showProvider() {
  const gemini = form.elements.provider.value === 'Gemini';
  document.querySelector('#gemini-fields').hidden = !gemini;
  document.querySelector('#mimo-title').textContent = gemini ? '备用 MiMo（Gemini 不可用时静默接管）' : 'MiMo 设置';
}
form.elements.provider.addEventListener('change', showProvider);
showProvider();
form.addEventListener('submit', async event => {
  event.preventDefault();
  const next = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, key === 'smartMode' ? form.elements[key].checked : form.elements[key].value.trim()]));
  try {
    if (next.provider === 'MiMo' || next.apiKey) {
      const url = new URL(next.endpoint);
      if (url.protocol !== 'https:') throw new Error('API 地址必须使用 HTTPS');
      if (!next.model) throw new Error('模型名称不能为空');
    }
    await chrome.storage.local.set(next);
    status.textContent = '已保存';
  } catch (error) { status.textContent = error.message; }
});
document.querySelector('#microphone').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    status.textContent = '麦克风已授权';
  } catch (error) { status.textContent = `麦克风不可用：${error.message}`; }
});
