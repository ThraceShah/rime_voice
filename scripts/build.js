import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/rime', { recursive: true });
await Promise.all([
  cp('manifest.json', 'dist/manifest.json'),
  cp('options.html', 'dist/options.html'),
  cp('offscreen.html', 'dist/offscreen.html'),
  cp('icon.png', 'dist/icon.png'),
  cp('LICENSE', 'dist/LICENSE'),
  cp('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md'),
  cp('vendor/RIME_FROST_LICENSE.txt', 'dist/RIME_FROST_LICENSE.txt'),
  cp('vendor/JSH_RIME_LICENSE.txt', 'dist/JSH_RIME_LICENSE.txt'),
  cp('vendor/LIBRIME_LICENSE.txt', 'dist/LIBRIME_LICENSE.txt'),
  cp('vendor/rime', 'dist/rime', { recursive: true })
]);
await build({ entryPoints: { background: 'src/background/index.js', offscreen: 'src/offscreen/recorder.js', options: 'src/options/index.js' }, outdir: 'dist', bundle: true, format: 'esm', platform: 'browser', target: 'chrome116', logLevel: 'info' });
