import assert from 'node:assert/strict';

export function installAudioWorkletMock({ sampleRate, onClose = () => {} }) {
  let node;
  globalThis.AudioContext = class {
    sampleRate = sampleRate;
    destination = {};
    audioWorklet = { addModule: async url => assert(url.endsWith('/capture-worklet.js')) };
    createMediaStreamSource() { return { connect: () => {}, disconnect: () => {} }; }
    async close() { onClose(); }
  };
  globalThis.AudioWorkletNode = class {
    port = {
      onmessage: null,
      postMessage: data => {
        if (data.type === 'flush') this.port.onmessage({ data: { type: 'flushed', id: data.id } });
      },
      close: () => {}
    };
    constructor() { node = this; }
    connect() {}
    disconnect() {}
  };
  return {
    emit(samples) { node.port.onmessage({ data: { type: 'audio', samples: samples.slice() } }); }
  };
}
