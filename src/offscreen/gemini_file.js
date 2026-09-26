const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export async function transcribeGeminiFile(base64, settings, fetcher = fetch) {
  if (!settings.geminiApiKey) throw new Error('请先填写 Google AI Studio API Key');
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.geminiApiKey },
    body: JSON.stringify({
      model: 'gemini-3.5-transcribe',
      input: [{ type: 'audio', data: base64, mime_type: 'audio/wav' }],
      generation_config: { transcription_config: { mode: settings.smartMode === false ? 'verbatim' : 'smart' } }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Gemini 文件转写返回 HTTP ${response.status}`);
  const text = (data.steps || [])
    .flatMap(step => step.content || [])
    .filter(item => item.type === 'text')
    .map(item => item.text || '')
    .join(' ').trim();
  if (!text) throw new Error('Gemini 文件转写未返回文字');
  return text;
}
