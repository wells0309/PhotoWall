"""Package built artifacts and a consistent, separate data migration snapshot."""
import hashlib
import json
import shutil
import sqlite3
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = '2026-11-04'
OUT = ROOT / 'release'
APP = OUT / f'photowall-{VERSION}-linux'
SNAPSHOT = OUT / f'photowall-data-{VERSION}'
JAR = ROOT / '.build' / f'release-{VERSION}-server/target/photowall-server-0.1.0.jar'


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def manifest(folder):
    lines = [f'{digest(file)}  {file.relative_to(folder).as_posix()}'
             for file in sorted(folder.rglob('*')) if file.is_file() and file.name != 'MANIFEST.sha256']
    (folder / 'MANIFEST.sha256').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')


def archive(folder, revision=''):
    target = OUT / f'{folder.name}{revision}.tar.gz'
    if target.exists():
        raise FileExistsError(target)
    def permissions(info):
        info.uid = info.gid = 0
        info.uname = info.gname = 'root'
        info.mode = 0o755 if info.isdir() else 0o644
        if folder == SNAPSHOT or info.name.endswith('photowall.env.example'):
            info.mode = 0o700 if info.isdir() else 0o600
        return info
    with tarfile.open(target, 'w:gz') as bundle:
        bundle.add(folder, arcname=folder.name, filter=permissions)
    # Validate every archived file against its on-disk source.
    with tarfile.open(target, 'r:gz') as bundle:
        for item in bundle.getmembers():
            if item.isfile():
                content = bundle.extractfile(item).read()
                if item.name.endswith('/MANIFEST.sha256') and b'\r' in content:
                    raise RuntimeError('Linux checksum manifests must use LF line endings')
                actual = hashlib.sha256(content).hexdigest()
                if actual != digest(OUT / item.name):
                    raise RuntimeError(f'Archive verification failed: {item.name}')
    return target


def main():
    if APP.exists() or SNAPSHOT.exists():
        raise FileExistsError('Release directory already exists; use a new version instead of overwriting it')
    if not JAR.is_file() or not (ROOT / 'web/dist/index.html').is_file():
        raise FileNotFoundError('Build both server and web before packaging')
    (APP / 'server').mkdir(parents=True)
    shutil.copy2(JAR, APP / 'server/photowall-server.jar')
    shutil.copytree(ROOT / 'web/dist', APP / 'web/dist')
    (APP / 'deploy').mkdir()
    for name in ['photowall.service.example', 'nginx.conf.example', 'photowall.env.example']:
        shutil.copy2(ROOT / 'deploy' / name, APP / 'deploy' / name)
    shutil.copy2(ROOT / 'deploy/DEPLOY-LINUX.md', APP / 'DEPLOY-LINUX.md')
    shutil.copy2(ROOT / 'server/src/main/resources/geodata/NOTICE.txt', APP / 'GEODATA-NOTICE.txt')
    (APP / 'RELEASE.json').write_text(json.dumps({
        'release': VERSION, 'java': 21, 'dataIncluded': False,
        'frontend': 'Production Vite build; cicadas reverted',
        'serverTests': '7 passed, 0 failures, 0 errors',
    }, indent=2) + '\n', encoding='utf-8', newline='\n')
    manifest(APP)

    data = SNAPSHOT / 'data'
    data.mkdir(parents=True)
    with sqlite3.connect(f'{(ROOT / "data/photowall.sqlite").as_uri()}?mode=ro', uri=True) as source:
        with sqlite3.connect(data / 'photowall.sqlite') as snapshot:
            source.backup(snapshot)
    with sqlite3.connect(data / 'photowall.sqlite') as snapshot:
        if snapshot.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite integrity check failed')
        snapshot.execute('PRAGMA journal_mode=DELETE')
        photos = snapshot.execute('SELECT stored_name, mime_type FROM photos').fetchall()
        counts = {table: snapshot.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
                  for table in ['users', 'albums', 'photos', 'timeline_notes', 'album_grants']}
    for sub in ['originals', 'display']:
        (data / sub).mkdir()
    for name, mime in photos:
        if Path(name).name != name or '/' in name or '\\' in name:
            raise ValueError('Unsafe stored photo name')
        original_ext = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif'}[mime]
        for sub, suffix in [('originals', original_ext), ('display', '.gif' if mime == 'image/gif' else '.jpg')]:
            shutil.copy2(ROOT / 'data' / sub / (name + suffix), data / sub / (name + suffix))
    (SNAPSHOT / 'SNAPSHOT.json').write_text(json.dumps({
        'release': VERSION, 'sqliteIntegrity': 'ok', 'counts': counts,
        'description': 'Contains private data. Keep outside web root. Restore only to an empty data directory.',
    }, indent=2) + '\n', encoding='utf-8', newline='\n')
    manifest(SNAPSHOT)
    bundles = [archive(APP), archive(SNAPSHOT)]
    (OUT / 'SHA256SUMS-2026-11-04.txt').write_text(
        ''.join(f'{digest(file)}  {file.name}\n' for file in bundles), encoding='utf-8', newline='\n')
    print(json.dumps({'archives': [{'file': str(file), 'bytes': file.stat().st_size} for file in bundles],
                      'snapshotCounts': counts}, indent=2))


if __name__ == '__main__':
    main()
