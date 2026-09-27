import assert from 'node:assert/strict';

let Capture;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { messages: [], onmessage: null, postMessage(message) { this.messages.push(message); } }; }
};
globalThis.registerProcessor = (name, constructor) => {
  assert.equal(name, 'rime-voice-capture');
  Capture = constructor;
};
await import('../src/offscreen/capture-worklet.js');

const capture = new Capture();
for (let index = 0; index < 32; index++) {
  assert.equal(capture.process([[new Float32Array(128).fill(0.4), new Float32Array(128).fill(0.2)]]), true);
}
assert.equal(capture.port.messages.length, 1);
assert.equal(capture.port.messages[0].type, 'audio');
assert.equal(capture.port.messages[0].samples.length, 4096);
assert(Math.abs(capture.port.messages[0].samples[0] - 0.3) < 0.000001);
capture.process([[new Float32Array(128).fill(0.1)]]);
capture.port.onmessage({ data: { type: 'flush', id: 7 } });
assert.equal(capture.port.messages[1].samples.length, 128);
assert.equal(capture.port.messages[2].type, 'flushed');
assert.equal(capture.port.messages[2].id, 7);
console.log('AudioWorklet 单声道合成与尾帧刷新测试通过');
