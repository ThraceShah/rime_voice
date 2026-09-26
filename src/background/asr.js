export const DEFAULTS = {
  provider: 'MiMo',
  endpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
  model: 'mimo-v2.5-asr',
  apiKey: '',
  geminiApiKey: '',
  smartMode: true
};

export function extractText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(part => part.text || '').join('').trim();
  return typeof data?.text === 'string' ? data.text.trim() : '';
}

export async function transcribe(base64, settings, fetcher = fetch) {
  if (!settings.apiKey) throw new Error('请先在设置页填写 API Key');
  const endpoint = new URL(settings.endpoint);
  if (endpoint.protocol !== 'https:') throw new Error('API 地址必须使用 HTTPS');
  const response = await fetcher(endpoint.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${base64}` } }] }], stream: false })
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'API Key 无效或没有权限' : `语音服务返回 HTTP ${response.status}`);
  const data = await response.json();
  const text = extractText(data);
  if (!text) throw new Error('语音服务未返回识别文字');
  return text;
}
