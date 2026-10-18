import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const bundle = read('prebuilt/index.js');
const provenance = JSON.parse(read('prebuilt/PROVENANCE.json'));
assert.equal(createHash('sha256').update(bundle).digest('hex'), provenance.fork_bundle_sha256);
const source = read('src/pages/Terminal.jsx');
const marker = "// Resolve Steam's context hook";
const sourceBody = source.slice(source.indexOf(marker), source.lastIndexOf('export default Terminal;')).trim();
const bundleBody = bundle.slice(bundle.indexOf(marker), bundle.indexOf('\nfunction registerRoutes()')).trim();
assert.equal(sourceBody, bundleBody, 'Source changed: rebuild and test; do not ship the old prebuilt bundle');
for (const relative of ['src/index.tsx', 'src/routes/index.tsx', 'src/panel.tsx']) {
  assert(!read(relative).includes('"/terminals/'), 'Upstream route was not namespaced: ' + relative);
}
assert(bundle.includes('/decky-terminal-focus/terminals/'));
console.log('PASS: prebuilt checksum, editable terminal source parity, and namespaced routes.');
