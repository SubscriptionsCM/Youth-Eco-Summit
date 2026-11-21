"""Materialize streamed export attachments privately; never write to the source host."""
import argparse
import base64
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile


def expected_files(data):
    attachments = {file["path"]: file for file in data["attachments"]}
    sources = {file["path"]: file["sourcePath"] for file in data["sourceFiles"]}
    assert len(attachments) == len(data["attachments"]) == len(sources), "Duplicate or missing file paths"
    assert attachments.keys() == sources.keys(), "Source file manifest does not match attachments"
    for path, file in attachments.items():
        assert len(path) == 76 and path.startswith("attachments/"), "Invalid private attachment path"
        assert all(char in "0123456789abcdef" for char in path[12:]), "Invalid hashed attachment path"
        assert isinstance(file["bytes"], int) and file["bytes"] > 0, "Invalid attachment size"
        assert len(file["sha256"]) == 64 and all(char in "0123456789abcdef" for char in file["sha256"]), "Invalid attachment hash"
        assert isinstance(sources[path], str) and os.path.isabs(sources[path]), "Source file path must be absolute"
    return attachments, sources


def materialize(stream, root, files):
    directory = root / "attachments"
    directory.mkdir(mode=0o700, exist_ok=True)
    assert not directory.is_symlink() and directory.is_dir(), "Refuse symbolic-link attachment directories"
    directory.chmod(0o700)
    seen = set()
    with tarfile.open(fileobj=stream, mode="r|") as archive:
        for member in archive:
            assert member.name in files and member.name not in seen and member.isfile(), "Unexpected archive member"
            file = files[member.name]
            assert member.size == file["bytes"], "Archive attachment size mismatch"
            seen.add(member.name)
            destination = root / member.name
            assert not destination.is_symlink(), "Refuse symbolic-link destination files"
            source = archive.extractfile(member)
            assert source is not None
            digest, size = hashlib.sha256(), 0
            handle = tempfile.NamedTemporaryFile(dir=directory, prefix=".retaining-", delete=False)
            try:
                with handle:
                    while chunk := source.read(1024 * 1024):
                        size += len(chunk)
                        assert size <= file["bytes"], "Attachment exceeds declared size"
                        digest.update(chunk)
                        handle.write(chunk)
                assert size == file["bytes"] and digest.hexdigest() == file["sha256"], "Attachment checksum mismatch"
                if destination.exists():
                    assert destination.is_file() and destination.stat().st_size == size, "Existing export file conflicts"
                    old = hashlib.sha256()
                    with destination.open("rb") as retained:
                        while chunk := retained.read(1024 * 1024):
                            old.update(chunk)
                    assert old.hexdigest() == file["sha256"], "Existing export file checksum conflicts"
                else:
                    os.replace(handle.name, destination)
                    destination.chmod(0o600)
            finally:
                Path(handle.name).unlink(missing_ok=True)
    assert seen == files.keys(), "Attachment archive is incomplete"
    return len(seen)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=22)
    parser.add_argument("--identity", type=Path, required=True)
    parser.add_argument("--allow-root", action="append", required=True)
    args = parser.parse_args()
    assert re.fullmatch(r"[A-Za-z0-9_.-]+@[A-Za-z0-9.:-]+", args.host), "Use an explicit source SSH user and host"
    path = args.manifest.resolve(strict=True)
    assert path.stat().st_mode & 0o077 == 0, "Export manifest must be private (mode600)"
    data = json.loads(path.read_text())
    files, sources = expected_files(data)
    payload = base64.b64encode(json.dumps({"files": sources, "roots": args.allow_root}).encode()).decode()
    remote = """
import base64,json,sys,tarfile
from pathlib import Path
data=json.loads(base64.b64decode(PAYLOAD))
roots=[Path(root).resolve(strict=True) for root in data['roots']]
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|') as archive:
 for name,raw in data['files'].items():
  path=Path(raw).resolve(strict=True)
  assert any(path.is_relative_to(root) and path!=root for root in roots),'Source escaped approved private roots'
  assert path.is_file() and not Path(raw).is_symlink(),'Source is not a regular retained file'
  info=archive.gettarinfo(str(path),arcname=name)
  assert info.isfile(),'Only regular source files may be exported'
  info.uid=0;info.gid=0;info.uname='';info.gname='';info.mode=0o600
  with path.open('rb') as handle:archive.addfile(info,handle)
""".replace("PAYLOAD", repr(payload))
    command = ["ssh", "-F", "/dev/null", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
               "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3",
               "-p", str(args.port), "-i", str(args.identity), args.host, "python3 -"]
    error_path = path.with_name(path.stem + ".transfer.stderr.log")
    with error_path.open("wb") as errors:
        error_path.chmod(0o600)
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors)
        try:
            process.stdin.write(remote.encode())
            process.stdin.close()
            count = materialize(process.stdout, path.parent, files)
            assert process.wait(timeout=60) == 0, "Source transfer failed"
        except BaseException:
            process.kill()
            process.wait()
            raise
    print(json.dumps({"attachments": count, "bytes": sum(file["bytes"] for file in files.values()), "verified": True}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Private attachment materialization failed; source data was not changed.", file=sys.stderr)
        raise SystemExit(1)
