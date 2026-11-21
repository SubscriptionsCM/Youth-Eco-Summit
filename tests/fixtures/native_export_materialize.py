import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile

spec = importlib.util.spec_from_file_location("materializer", "scripts/fetch-wordpress-export.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
body = b"private fixture\r\n\x00\xff"
name = "attachments/" + "a" * 64
file = {"path": name, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
manifest = {"attachments": [file], "sourceFiles": [{"path": name, "sourcePath": "/private/source-file"}]}
files, _ = module.expected_files(manifest)


def archive(member=name, payload=body):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w") as output:
        info = tarfile.TarInfo(member)
        info.size = len(payload)
        output.addfile(info, io.BytesIO(payload))
    stream.seek(0)
    return stream


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    assert module.materialize(archive(), root, files) == 1
    assert (root / name).read_bytes() == body
    assert (root / name).stat().st_mode & 0o077 == 0
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    try:
        module.materialize(archive(payload=b"x" * len(body)), root, files)
    except AssertionError:
        pass
    else:
        raise AssertionError("corrupt bytes accepted")
    assert not (root / name).exists()
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    try:
        module.materialize(archive(member="../escaped"), root, files)
    except AssertionError:
        pass
    else:
        raise AssertionError("path traversal accepted")
    assert not (root.parent / "escaped").exists()
try:
    module.expected_files({"attachments": [dict(file, path="../escape")], "sourceFiles": [{"path": "../escape", "sourcePath": "/private/source-file"}]})
except AssertionError:
    pass
else:
    raise AssertionError("malformed manifest accepted")
print("verified")
