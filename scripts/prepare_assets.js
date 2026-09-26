import { access, copyFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

await mkdir('vendor/rime', { recursive: true });
for (const name of ['rime-api.wasm', 'rime-api.data']) {
  await copyFile(`node_modules/jsh_rime/data/${name}`, `vendor/rime/${name}`);
}
const dictionary = ['rime_frost.table.bin', 'rime_frost.prism.bin', 'rime_frost.reverse.bin'];
let missing = false;
for (const name of dictionary) {
  try { await access(`vendor/rime/${name}`); }
  catch { missing = true; }
}
if (missing) {
  const result = spawnSync('bash', ['scripts/prepare_dictionary.sh'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('白霜词典编译失败。请安装 rime_deployer 后重试。');
}
for (const name of dictionary) await access(`vendor/rime/${name}`);
