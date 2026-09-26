import { RimePinyinEngine } from './vendor/jsh_rime.mjs';

const files = ['default.yaml', 'rime_frost.schema.yaml', 'rime_frost.table.bin', 'rime_frost.prism.bin', 'rime_frost.reverse.bin'];
let engine;
export async function getEngine() {
  if (!engine) {
    engine = new RimePinyinEngine({ wasmDir: chrome.runtime.getURL('rime').replace(/\/$/, ''), dataFiles: files });
    try { await engine.initialize(); } catch (error) { engine = undefined; throw error; }
  }
  return engine;
}

export async function input(value) { return (await getEngine()).processInput(value); }
export async function select(index) { return (await getEngine()).pickCandidate(index); }
export async function flip(forward) { return (await getEngine()).flipPage(forward); }
export async function clear() { if (engine) await engine.clearInput(); }
