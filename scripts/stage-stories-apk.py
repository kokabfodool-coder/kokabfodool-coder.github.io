"""Copy the verified Android release into the website's stable download path."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

build = Path(sys.argv[1])
badge = (build / 'apk-badging.txt').read_text()
signature = (build / 'apk-signature.txt').read_text()
fingerprint = 'ee4e5f8887447d750263ce35798c3c0c0e5a7a01a03d678712ad49d48abdb729'
match = re.search(r"^package: name='com\.kokabfodool\.offline' versionCode='(\d+)' versionName='([^']+)'", badge, re.M)
if not match:
    raise SystemExit('Unexpected Android package or version')
version_code, version_name = int(match.group(1)), match.group(2)
apk = build / ('Kawkab-Fudool-' + version_name + '.apk')
if not apk.is_file():
    raise SystemExit('Signed APK not found: ' + str(apk))
if fingerprint not in signature or "targetSdkVersion:'36'" not in badge:
    raise SystemExit('Expected the established signing certificate and Android 16 target')

downloads = Path('downloads/apps')
destination = downloads / 'kawkab-fudool.apk'
shutil.copyfile(apk, destination)
destination.with_suffix('.apk.idsig').unlink(missing_ok=True)
metadata = {'unified': {'file': destination.name, 'version': version_name, 'versionCode': version_code,
                        'bytes': destination.stat().st_size,
                        'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
                        'certificate_sha256': fingerprint}}
(downloads / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n')
