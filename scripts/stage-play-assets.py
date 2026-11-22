"""Stage the shared offline pack, worksheet library and launcher icon for Android."""
import json
from pathlib import Path
import shutil
import sys
from urllib.parse import unquote

assets, resources = map(Path, sys.argv[1:])
site = assets / 'site'
if site.exists():
    shutil.rmtree(site)
manifest = json.loads(Path('offline-pack.json').read_text())
for url in manifest['files']:
    relative = Path(unquote(url.lstrip('/')) + ('index.html' if url.endswith('/') else ''))
    target = site / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(relative, target)
for relative in sorted(Path('print').rglob('*.pdf')):
    target = site / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(relative, target)
icon = resources / 'drawable' / 'app_icon.png'
icon.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile('assets/app-icon-512.png', icon)
