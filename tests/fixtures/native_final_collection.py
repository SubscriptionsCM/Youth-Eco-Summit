import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('final_collection', 'scripts/collect-native-migration.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as directory:
    base = Path(directory)
    initial, current = base / 'initial', base / 'current'
    (initial / 'attachments').mkdir(parents=True)
    current.mkdir()
    body = b'private immutable attachment'
    relative = 'attachments/' + 'a' * 64
    old = initial / relative
    old.write_bytes(body)
    old.chmod(0o600)
    file = {'path': relative, 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}
    data = {'attachments': [file], 'sourceFiles': [{'path': relative, 'sourcePath': '/private/source/file'}]}
    reused, missing = module.retain_attachments(data, initial, current)
    assert reused == 1 and not missing['attachments']
    assert old.stat().st_ino == (current / relative).stat().st_ino
    assert old.read_bytes() == body
    changed = base / 'changed'
    changed.mkdir()
    reused, missing = module.retain_attachments({**data, 'attachments': [{**file, 'sha256': 'b' * 64}]}, initial, changed)
    assert reused == 0 and len(missing['attachments']) == 1
    assert not (changed / relative).exists()
    assert old.read_bytes() == body
    unsafe = base / 'unsafe'
    unsafe.mkdir()
    (unsafe / 'attachments').symlink_to(initial / 'attachments', target_is_directory=True)
    try:
        module.retain_attachments(data, initial, unsafe)
    except RuntimeError:
        pass
    else:
        raise AssertionError('symbolic-link attachment directory accepted')
    with patch.object(module.sys, 'argv', ['collect', str(base / 'never-created')]), contextlib.redirect_stderr(io.StringIO()):
        try:
            module.main()
        except SystemExit as error:
            assert error.code == 2
        else:
            raise AssertionError('capture ran without the frozen-source assertion')
    assert not (base / 'never-created').exists()
    with patch.object(module.sys, 'argv', ['collect', str(base / 'never-created'), '--plan']), patch.object(module.subprocess, 'Popen') as remote, contextlib.redirect_stdout(io.StringIO()) as output:
        module.main()
        assert json.loads(output.getvalue())['captureExecuted'] is False
        remote.assert_not_called()
    assert not (base / 'never-created').exists()

source = 'https://youthecosummit.com'
payload = {'ID': '12', 'user_pass': 'opaque-legacy-hash', 'meta': [{'meta_key': '_um_last_login', 'meta_value': 'old'}]}
record = {'kind': 'user', 'sourceId': '12', 'payload': payload}
initial = {'source': source, 'records': [record]}
mapping = {'format': 'yes-native-staff-mappings/v1', 'source': source, 'mappings': [{'sourceUserId': '12', 'sourceChecksum': module.payload_digest(payload), 'userId': 'unchanged-reviewed-id', 'expectedRole': 'admin'}]}
before = json.dumps(mapping, sort_keys=True)
changed = {'source': source, 'records': [{**record, 'payload': {**payload, 'user_pass': 'changed-opaque-hash', 'meta': [{'meta_key': '_um_last_login', 'meta_value': 'current'}]}}]}
report = module.staff_proof_report(changed, initial, mapping)
assert report == [{'sourceUserId': '12', 'changed': True, 'changedFields': ['meta', 'user_pass'], 'changedMetadataKeys': ['_um_last_login']}]
assert json.dumps(mapping, sort_keys=True) == before
assert module.staff_proof_report(initial, initial, mapping)[0]['changed'] is False
try:
    module.staff_proof_report(changed, initial, {**mapping, 'mappings': [{**mapping['mappings'][0], 'sourceChecksum': 'c' * 64}]})
except RuntimeError:
    pass
else:
    raise AssertionError('unverified reviewed baseline accepted')

spec = importlib.util.spec_from_file_location('stage_collection', 'scripts/stage-native-migration.py')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)
with tempfile.TemporaryDirectory() as directory:
    base = Path(directory).resolve()
    root = base / 'source/native-export-final-fixture'
    root.mkdir(parents=True)
    (root / 'collection-summary.json').write_text(json.dumps({'complete': True, 'source': source}))
    commands, scripts = [], []
    with patch.object(stage, 'BASE', base), patch.object(stage.sys, 'argv', ['stage', str(root), '--stage']), patch.object(stage, 'remote', lambda text: scripts.append(text)), patch.object(stage.subprocess, 'run', lambda argv, **options: commands.append(argv)), contextlib.redirect_stdout(io.StringIO()):
        stage.main()
    assert len(commands) == 2 and all(command[0] == 'rsync' for command in commands)
    assert all('--delete' not in command for command in commands)
    assert any(argument.startswith('--link-dest=') for argument in commands[0])
    assert '--include=/export.json' in commands[0] and '--exclude=*' in commands[0]
    assert all('--include=/wordpress-db.sql.gz' not in command for command in commands)
    assert all('--commit' not in text for text in scripts)
    assert '--offline' in scripts[-1] and "EMAIL_TRANSPORT='disabled'" in scripts[-1]
print('verified')
