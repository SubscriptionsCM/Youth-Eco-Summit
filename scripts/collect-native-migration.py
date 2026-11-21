#!/usr/bin/python3
"""Collect a frozen source privately on Compactum; never change source files or DNS."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys

BASE = Path('/root/yes-migration-20261120')
SOURCE = 'u794443438@145.79.212.116'
SOURCE_HOME = '/home/u794443438'
WORDPRESS = SOURCE_HOME + '/domains/youthecosummit.com/public_html'
TOOLS = SOURCE_HOME + '/yes-native-migration-tools'


def private_json(path, data):
    with path.open('x', encoding='utf8') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    path.chmod(0o600)


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def payload_digest(payload):
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(raw.encode()).hexdigest()


def ssh():
    return ['ssh', '-F', '/dev/null', '-T', '-p', '65002', '-i', str(BASE / 'migration_ed25519'),
            '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no',
            '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3']


def capture(arguments, destination, errors, payload=None):
    partial = destination.with_name(destination.name + '.partial')
    with errors.open('ab') as log, partial.open('xb') as output:
        process = subprocess.Popen([*ssh(), SOURCE, shlex.join(arguments)],
                                   stdin=subprocess.PIPE if payload is not None else subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=log)
        try:
            if payload is not None:
                process.stdin.write(payload)
                process.stdin.close()
            shutil.copyfileobj(process.stdout, output, 1024 * 1024)
            if process.wait() != 0:
                raise RuntimeError('Source read failed; inspect the private collection log.')
        except BaseException:
            process.kill()
            process.wait()
            raise
    partial.chmod(0o600)
    partial.replace(destination)


def validate_export(data):
    if data.get('format') != 'yes-wordpress-export/v1' or data.get('source') != 'https://youthecosummit.com':
        raise RuntimeError('Unexpected source export identity.')
    if data.get('issues') or data['counts'] != {'records': len(data['records']), 'attachments': len(data['attachments'])}:
        raise RuntimeError('Source export is incomplete or has unresolved file issues.')


def retain_attachments(data, initial, root):
    """Reuse only exact, independently hash-verified objects; never mutate the initial snapshot."""
    files = {item['path']: item for item in data['attachments']}
    sources = {item['path']: item for item in data['sourceFiles']}
    if len(files) != len(data['attachments']) or len(sources) != len(data['sourceFiles']) or files.keys() != sources.keys():
        raise RuntimeError('Duplicate or missing attachment identities.')
    directory = root / 'attachments'
    directory.mkdir(mode=0o700, exist_ok=True)
    if directory.is_symlink() or not directory.is_dir():
        raise RuntimeError('Unsafe private attachment directory.')
    missing, reused = [], 0
    for path, file in files.items():
        if not re.fullmatch(r'attachments/[a-f0-9]{64}', path):
            raise RuntimeError('Invalid private attachment path.')
        if not isinstance(file['bytes'], int) or file['bytes'] <= 0 or not re.fullmatch('[a-f0-9]{64}', file['sha256']):
            raise RuntimeError('Invalid attachment metadata.')
        old, target = initial / path, root / path
        if old.is_symlink() or target.exists() or target.is_symlink():
            raise RuntimeError('Unsafe attachment reuse path.')
        if old.is_file() and old.stat().st_size == file['bytes'] and digest(old) == file['sha256']:
            if old.stat().st_mode & 0o077:
                raise RuntimeError('Initial attachment is not private.')
            os.link(old, target)
            reused += 1
        else:
            missing.append(file)
    return reused, {'attachments': missing, 'sourceFiles': [sources[item['path']] for item in missing]}


def staff_proof_report(current, initial, reviewed):
    if reviewed['format'] != 'yes-native-staff-mappings/v1' or reviewed['source'] != current['source']:
        raise RuntimeError('Invalid reviewed staff mappings.')
    old = {r['sourceId']: r['payload'] for r in initial['records'] if r['kind'] == 'user'}
    new = {r['sourceId']: r['payload'] for r in current['records'] if r['kind'] == 'user'}
    report = []
    for mapping in reviewed['mappings']:
        identity = mapping['sourceUserId']
        before, after = old.get(identity), new.get(identity)
        if not before or not after or payload_digest(before) != mapping['sourceChecksum']:
            raise RuntimeError('Reviewed staff baseline cannot be verified; mappings were not changed.')
        fields = sorted(key for key in before.keys() | after.keys() if before.get(key) != after.get(key))
        keys = []
        a = {m['meta_key']: m for m in before.get('meta', [])}
        b = {m['meta_key']: m for m in after.get('meta', [])}
        for key in sorted(a.keys() | b.keys()):
            if a.get(key) != b.get(key):
                keys.append(key if re.fullmatch('[a-z_]{1,100}', key) or key == 'community-events-location' else '[nonstandard metadata key redacted]')
        report.append({'sourceUserId': identity, 'changed': bool(fields), 'changedFields': fields, 'changedMetadataKeys': keys})
    return report


def filesystem_manifest(root):
    entries = []
    for parent, directories, files in os.walk(root, followlinks=False):
        for name in directories + files:
            path = Path(parent) / name
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                raise RuntimeError('The private filesystem contains an unsupported link or special file.')
            if stat.S_ISREG(mode):
                entries.append({'path': str(path.relative_to(root)), 'bytes': path.stat().st_size, 'sha256': digest(path)})
    return entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--source-frozen', action='store_true', help='Assert that the operator has already frozen source writes.')
    parser.add_argument('--wordpress-files', action='store_true', help='Also retain a full fresh WordPress files archive, excluding the new subdirectory.')
    parser.add_argument('--plan', action='store_true', help='Print the plan without contacting the source or creating files.')
    args = parser.parse_args()
    if args.plan:
        print(json.dumps({'captureExecuted': False, 'steps': ['current-primary-and-legacy-readonly-exports', 'verified-hardlink-reuse-and-missing-files', 'read-only-wordpress-sql-gzip-backup', 'checksum-rsync-private-filesystem', 'staff-proof-change-report-only'], 'wordpressFiles': args.wordpress_files}))
        return
    if not args.source_frozen:
        parser.error('Capture requires --source-frozen after the operator has frozen source writes.')
    os.umask(0o077)
    root = args.destination.resolve()
    if root.exists() or not root.is_relative_to(BASE / 'source') or root.parent != BASE / 'source':
        raise RuntimeError('Use a new direct child directory of the private migration source directory.')
    if shutil.disk_usage(BASE).free < (16 if args.wordpress_files else 12) * 1024 ** 3:
        raise RuntimeError('Insufficient migration backup headroom on Compactum; source capture was not started.')
    root.mkdir(mode=0o700)
    initial = BASE / 'source/native-export-initial'
    errors = root / 'collection.stderr.log'
    for filename, script in [('export.json', 'export-wordpress.php'), ('legacy.json', 'export-wordpress-legacy.php')]:
        capture(['/usr/local/bin/wp', '--path=' + WORDPRESS,
                 '--exec=if (defined("DISABLE_WP_CRON") && !DISABLE_WP_CRON) throw new RuntimeException("Cron must remain disabled during capture"); if (!defined("DISABLE_WP_CRON")) define("DISABLE_WP_CRON", true);',
                 'eval-file', TOOLS + '/' + script, '-'], root / filename, errors)
        validate_export(json.loads((root / filename).read_text()))
        print(json.dumps({'step': filename, 'complete': True}), flush=True)
    primary = json.loads((root / 'export.json').read_text())
    legacy = json.loads((root / 'legacy.json').read_text())
    previous = json.loads((initial / 'export.json').read_text())
    reviewed = json.loads((BASE / 'native-reviewed-staff-mappings.json').read_text())
    staff = staff_proof_report(primary, previous, reviewed)
    # A change report is reviewable first; approved mappings are never rewritten by collection.
    private_json(root / 'staff-proof-review.json', {'mappingRewritten': False, 'staff': staff})
    print(json.dumps({'step': 'staff-proof-review', 'mappingRewritten': False, 'staff': staff}), flush=True)
    reused = downloaded = 0
    for filename, data in [('primary', primary), ('legacy', legacy)]:
        count, missing = retain_attachments(data, initial, root)
        reused += count
        if missing['attachments']:
            manifest = root / (filename + '-missing-files.json')
            private_json(manifest, missing)
            command = [sys.executable, str(BASE / 'fetch-wordpress-export.py'), str(manifest), '--host', SOURCE,
                       '--port', '65002', '--identity', str(BASE / 'migration_ed25519'),
                       '--allow-root', WORDPRESS + '/wp-content/uploads', '--allow-root', SOURCE_HOME + '/yes-private-entry-uploads']
            with errors.open('ab') as log:
                subprocess.run(command, stdout=log, stderr=log, check=True)
            downloaded += len(missing['attachments'])
    print(json.dumps({'step': 'attachments', 'reused': reused, 'downloaded': downloaded, 'verified': True}), flush=True)
    # Reuse the previously successful no-tempfile mysqldump reader with credentials in a pipe.
    capture(['/usr/bin/python3', '-'], root / 'wordpress-db.sql.gz', errors,
            payload=(BASE / 'source_dump.py').read_bytes())
    tables = sql_bytes = 0
    with gzip.open(root / 'wordpress-db.sql.gz', 'rb') as handle:
        for line in handle:
            sql_bytes += len(line)
            tables += int(line.startswith(b'CREATE TABLE '))
    if not tables or not sql_bytes:
        raise RuntimeError('The final SQL backup did not validate.')
    print(json.dumps({'step': 'wordpress-sql', 'tables': tables, 'uncompressedBytes': sql_bytes, 'verified': True}), flush=True)
    storage = root / 'filesystem'
    storage.mkdir(mode=0o700)
    transport = shlex.join(ssh())
    command = ['rsync', '-rltp', '--checksum', '--no-owner', '--no-group', '--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=',
               '--link-dest=' + str(BASE / 'source/storage'), '-e', transport,
               SOURCE + ':' + SOURCE_HOME + '/yes-private-storage/', str(storage) + '/']
    with errors.open('ab') as log:
        subprocess.run(command, stdout=log, stderr=log, check=True)
    files = filesystem_manifest(storage)
    private_json(root / 'filesystem-manifest.json', {'format': 'yes-private-filesystem/v1', 'files': files})
    print(json.dumps({'step': 'private-filesystem', 'files': len(files), 'bytes': sum(f['bytes'] for f in files), 'verified': True}), flush=True)
    if args.wordpress_files:
        capture(['tar', '--exclude=./new', '-C', WORDPRESS, '-czf', '-', '.'], root / 'wordpress-files.tar.gz', errors)
        subprocess.run(['gzip', '-t', str(root / 'wordpress-files.tar.gz')], check=True)
    summary = {'complete': True, 'source': primary['source'], 'capturedAt': primary['capturedAt'],
               'primaryRecords': len(primary['records']), 'legacyRecords': len(legacy['records']),
               'accounts': len(primary['nativeAccounts']['accounts']), 'attachments': reused + downloaded,
               'attachmentBytes': sum(f['bytes'] for data in [primary, legacy] for f in data['attachments']),
               'reusedAttachments': reused, 'downloadedAttachments': downloaded,
               'filesystemFiles': len(files), 'filesystemBytes': sum(f['bytes'] for f in files),
               'sqlTables': tables, 'sqlBytes': sql_bytes, 'sqlGzipSha256': digest(root / 'wordpress-db.sql.gz'),
               'staffProofChanges': sum(item['changed'] for item in staff), 'staffMappingsRewritten': False,
               'wordpressFiles': args.wordpress_files, 'postgresCaptured': False}
    private_json(root / 'collection-summary.json', summary)
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Final collection incomplete; source data and approved staff mappings were not changed. Inspect private logs.', file=sys.stderr)
        raise SystemExit(1)
