#!/usr/bin/python3
"""Copy a completed frozen export to the private VPS and validate files without database access."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

BASE = Path('/root/yes-migration-20261120')
TARGET = 'root@189.72.159.54'


def ssh():
    return ['ssh', '-F', '/dev/null', '-T', '-i', str(BASE / 'migration_ed25519'),
            '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no',
            '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3']


def remote(script):
    subprocess.run([*ssh(), TARGET, 'python3 -'], input=script.encode(), check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('collection', type=Path)
    parser.add_argument('--stage', action='store_true', help='Copy and validate the completed collection; never import database records.')
    args = parser.parse_args()
    if not args.stage:
        parser.error('Use --stage to copy and validate files. No database import is performed.')
    os.umask(0o077)
    root = args.collection.resolve(strict=True)
    if root.parent != BASE / 'source' or not re.fullmatch('native-export-final-[A-Za-z0-9_-]+', root.name):
        raise RuntimeError('Use the completed final collection directory.')
    summary = json.loads((root / 'collection-summary.json').read_text())
    if summary.get('complete') is not True or summary.get('source') != 'https://youthecosummit.com':
        raise RuntimeError('Final collection is not complete.')
    name = root.name
    destination = str(BASE / 'source' / name)
    remote('''from pathlib import Path
import os
os.umask(0o077)
p=Path(%r)
if p.is_symlink():raise RuntimeError('Unsafe private target directory.')
p.mkdir(mode=0o700,exist_ok=True)
p.chmod(0o700)
''' % destination)
    transport = shlex.join(ssh())
    common = ['rsync', '-rltp', '--protect-args', '--checksum', '--timeout=120', '--no-owner', '--no-group',
              '--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=', '-e', transport]
    includes = ['export.json', 'legacy.json', 'collection-summary.json', 'staff-proof-review.json', 'filesystem-manifest.json']
    arguments = [*common, '--link-dest=' + str(BASE / 'source/native-export-initial')]
    arguments += ['--include=/' + item for item in includes]
    arguments += ['--include=/attachments/', '--include=/attachments/**', '--exclude=*', str(root) + '/', TARGET + ':' + destination + '/']
    with (root / 'target-stage.stderr.log').open('ab') as log:
        subprocess.run(arguments, stdout=log, stderr=log, check=True)
        subprocess.run([*common, str(root / 'filesystem') + '/', TARGET + ':/srv/youth-eco-summit/storage/filesystem/'], stdout=log, stderr=log, check=True)
    print(json.dumps({'step': 'target-copy', 'complete': True, 'databaseImported': False}), flush=True)
    remote('''import os,json,hashlib,subprocess,stat
from pathlib import Path
root=Path(%r)
storage=Path('/srv/youth-eco-summit/storage/filesystem')
subprocess.run(['chown','-hR','yesapp:yesapp',str(storage)],check=True)
files=json.load(open(root/'filesystem-manifest.json'))['files']
total=0
for item in files:
 path=storage/item['path']
 if not path.resolve().is_relative_to(storage.resolve()) or path.is_symlink() or not stat.S_ISREG(path.stat().st_mode) or path.stat().st_size!=item['bytes']:raise RuntimeError('Native filesystem metadata failed verification.')
 digest=hashlib.sha256()
 with path.open('rb') as handle:
  for chunk in iter(lambda:handle.read(1024*1024),b''):digest.update(chunk)
 if digest.hexdigest()!=item['sha256']:raise RuntimeError('Native filesystem checksum failed verification.')
 total+=item['bytes']
print(json.dumps({'step':'target-native-filesystem','files':len(files),'bytes':total,'verified':True}),flush=True)
env={key:value for key,value in os.environ.items() if not key.startswith(('DATABASE_','MIGRATION_','WORDPRESS_','SUPABASE_','STORAGE_','EMAIL_'))}
env.update(NODE_ENV='production',EMAIL_TRANSPORT='disabled')
node='/srv/youth-eco-summit/tools/node/bin/node'
env['PATH']=str(Path(node).parent)+':'+env.get('PATH','')
args=[node,'node_modules/tsx/dist/cli.mjs','scripts/import-native-legacy.ts',str(root/'export.json'),'--legacy='+str(root/'legacy.json'),'--offline']
with (root/'offline-validation.log').open('w') as log:result=subprocess.run(args,cwd='/srv/youth-eco-summit/qa/source',env=env,stdout=log,stderr=subprocess.STDOUT)
if result.returncode:raise RuntimeError('Target offline validation failed; inspect its private log.')
print((root/'offline-validation.log').read_text().strip(),flush=True)
review=json.load(open(root/'staff-proof-review.json'))
print(json.dumps({'step':'target-stage-complete','databaseImported':False,'staffProofsChanged':sum(item['changed'] for item in review['staff']),'staffMappingsRewritten':False}),flush=True)
''' % destination)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Private target staging incomplete; no database import or source changes were performed.', file=sys.stderr)
        raise SystemExit(1)
