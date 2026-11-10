"""Build a program-only update; existing server accounts and photos stay in place."""
import argparse
import json
import re
import shutil
import xml.etree.ElementTree as ET
from package_release import ROOT, OUT, archive, digest, manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    version = args.version
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', version):
        raise ValueError('Use YYYY-MM-DD for the version')
    build = ROOT / '.build' / f'release-{version}-server/target'
    reports = list((build / 'surefire-reports').glob('TEST-*.xml'))
    tests = sum(int(ET.parse(file).getroot().get('tests')) for file in reports)
    failures = sum(int(ET.parse(file).getroot().get(key, '0')) for file in reports for key in ['failures', 'errors', 'skipped'])
    if not tests or failures:
        raise RuntimeError('All backend tests must pass before packaging')
    app = OUT / f'photowall-{version}-linux'
    if app.exists():
        raise FileExistsError(app)
    (app / 'server').mkdir(parents=True)
    shutil.copy2(build / 'photowall-server-0.1.0.jar', app / 'server/photowall-server.jar')
    shutil.copytree(ROOT / 'web/dist', app / 'web/dist')
    (app / 'deploy').mkdir()
    for name in ['photowall.service.example', 'nginx.conf.example', 'photowall.env.example']:
        text = (ROOT / 'deploy' / name).read_text(encoding='utf-8')
        (app / 'deploy' / name).write_text(text, encoding='utf-8', newline='\n')
    (app / 'README.md').write_text((ROOT / 'README.md').read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
    shutil.copy2(ROOT / 'server/src/main/resources/geodata/NOTICE.txt', app / 'GEODATA-NOTICE.txt')
    (app / 'RELEASE.json').write_text(json.dumps({
        'release': version, 'java': 21, 'dataIncluded': False, 'backendTestsPassed': tests,
        'feature': 'Seven-day persistent login with fixed expiry and logout revocation',
    }, indent=2) + '\n', encoding='utf-8', newline='\n')
    manifest(app)
    bundle = archive(app)
    checksum = digest(bundle)
    (OUT / f'SHA256SUMS-{version}.txt').write_text(f'{checksum}  {bundle.name}\n', encoding='utf-8', newline='\n')
    # Keep the tested existing-server deployment flow and update its artifact identity.
    template = (OUT / 'upgrade-photowall-2026-11-04.sh').read_text(encoding='utf-8')
    template = re.sub(r'FIXED_ARCHIVE=.*?\nfi\n', '', template, count=1, flags=re.DOTALL)
    template = template.replace('2026-11-04', version)
    template = re.sub(r'^EXPECTED=.*$', f'EXPECTED={checksum}', template, count=1, flags=re.MULTILINE)
    old_probe = '''curl --retry 45 --retry-connrefused --retry-delay 1 --retry-max-time 60 --max-time 3 -fsS \\
  http://127.0.0.1:8080/api/albums -o "$WORK/backend-check.json"'''
    new_probe = '''printf 'Waiting for the backend to start...\\n'
DEADLINE=$((SECONDS + 60))
until curl --connect-timeout 1 --max-time 3 -fsS http://127.0.0.1:8080/api/albums -o "$WORK/backend-check.json" 2>"$WORK/backend-check.err"; do
  if (( SECONDS >= DEADLINE )); then cat "$WORK/backend-check.err" >&2; false; fi
  sleep 1
done'''
    if old_probe not in template:
        raise RuntimeError('Deployment template changed; review the readiness probe')
    template = template.replace(old_probe, new_probe)
    script = OUT / f'upgrade-photowall-{version}.sh'
    script.write_text(template, encoding='utf-8', newline='\n')
    print(json.dumps({'archive': str(bundle), 'sha256': checksum, 'upgradeScript': str(script), 'testsPassed': tests}, indent=2))


if __name__ == '__main__':
    main()
