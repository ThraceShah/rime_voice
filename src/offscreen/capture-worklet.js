const CHUNK_FRAMES = 4096;

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK_FRAMES);
    this.length = 0;
    this.port.onmessage = ({ data }) => {
      if (data?.type !== 'flush') return;
      this.sendChunk();
      this.port.postMessage({ type: 'flushed', id: data.id });
    };
  }

  sendChunk() {
    if (!this.length) return;
    const samples = this.length === CHUNK_FRAMES ? this.buffer : this.buffer.slice(0, this.length);
    this.port.postMessage({ type: 'audio', samples }, [samples.buffer]);
    this.buffer = new Float32Array(CHUNK_FRAMES);
    this.length = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    const frames = channels[0].length;
    for (let index = 0; index < frames; index++) {
      let sample = 0;
      for (const channel of channels) sample += channel[index] / channels.length;
      this.buffer[this.length++] = sample;
      if (this.length === CHUNK_FRAMES) this.sendChunk();
    }
    return true;
  }
}

registerProcessor('rime-voice-capture', VoiceCaptureProcessor);
