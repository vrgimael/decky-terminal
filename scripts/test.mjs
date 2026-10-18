import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = resolve(root, process.argv.includes('--prebuilt') ? 'prebuilt/index.js' : 'dist/index.js');
for (const args of [
  ['--check', bundle],
  ['tests/check-router-context.cjs'],
  ['tests/check-keyboard.cjs'],
  ['tests/check-lifecycle.cjs'],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, DECKY_TERMINAL_BUNDLE: bundle },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
