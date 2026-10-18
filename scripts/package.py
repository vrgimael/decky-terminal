#!/usr/bin/env python3
"""Create the ZIP layout accepted by Decky's local-plugin installer."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prebuilt', action='store_true', help='Use the verified initial bundle without Node dependencies')
args = parser.parse_args()
package = json.loads((ROOT / 'package.json').read_text())
folder = package['name']
bundle = ROOT / ('prebuilt/index.js' if args.prebuilt else 'dist/index.js')
if not bundle.is_file():
    parser.error('Bundle missing: run pnpm build, or pass --prebuilt for the verified initial bundle')
output = ROOT / 'out' / f"{folder}-{package['version']}.zip"
output.parent.mkdir(exist_ok=True)
files = [(ROOT / name, name) for name in ['plugin.json', 'package.json', 'main.py', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md']]
files += [(p, p.relative_to(ROOT).as_posix()) for p in sorted((ROOT / 'py_modules').rglob('*.py'))]
files.append((bundle, 'dist/index.js'))
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for source, relative in files:
        info = zipfile.ZipInfo(f'{folder}/{relative}', date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, source.read_bytes())
    assert archive.testzip() is None
    manifests = [name for name in archive.namelist() if name.endswith('/plugin.json') and name.count('/') == 1]
    assert manifests == [f'{folder}/plugin.json']
    assert archive.read(f'{folder}/dist/index.js') == bundle.read_bytes()
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n')
print(output)
print(f'SHA256 {digest}')
