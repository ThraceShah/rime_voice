import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { RimePinyinEngine } from '../src/rime/vendor/jsh_rime.mjs';

const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1);
    if (!/^[\w.-]+$/.test(name)) throw new Error('bad path');
    const data = await readFile(new URL(`../vendor/rime/${name}`, import.meta.url));
    response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engine = new RimePinyinEngine({ wasmDir: `http://127.0.0.1:${server.address().port}`, dataFiles: ['default.yaml', 'rime_frost.schema.yaml', 'rime_frost.table.bin', 'rime_frost.prism.bin', 'rime_frost.reverse.bin'] });
try {
  await engine.initialize();
  const state = await engine.processInput('nihao');
  assert.equal(state.candidates[0].text, '你好');
  assert.equal((await engine.pickCandidate(0)).committed, '你好');
  await engine.clearInput();
  const short = await engine.processInput('nh');
  assert(short.candidates.length > 0, '简拼候选为空');
  await engine.clearInput();
  const firstPage = await engine.processInput('ni');
  assert.equal(firstPage.candidates.length, 9);
  assert.equal(firstPage.isLastPage, false);
  const secondPage = await engine.flipPage(true);
  assert.equal(secondPage.pageNo, 1);
  console.log('Rime WASM 与白霜词库测试通过');
} finally {
  await engine.destroy();
  server.close();
}
