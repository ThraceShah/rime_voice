export function resample(chunks, sourceRate, targetRate = 16000) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const input = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
  const output = new Float32Array(Math.floor(length * targetRate / sourceRate));
  for (let i = 0; i < output.length; i++) {
    const position = i * sourceRate / targetRate;
    const start = Math.floor(position);
    const fraction = position - start;
    output[i] = input[start] * (1 - fraction) + (input[Math.min(start + 1, length - 1)] || 0) * fraction;
  }
  return output;
}

export function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)), true));
  return new Uint8Array(buffer);
}
