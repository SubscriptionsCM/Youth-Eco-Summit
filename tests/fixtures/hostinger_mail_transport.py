import importlib.util
import io
import os
from pathlib import Path
import shlex
from types import SimpleNamespace
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path("scripts/hostinger-mail") / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


source = load("source_mail_transport", "source-relay.py")
target = load("target_mail_transport", "sendmail.py")
sender = "noreply@youthecosummit.com"
recipients = ["person+tag@example.org", "private.bcc@example.net"]
command = shlex.join(["yes-sendmail", "-i", "-f", sender, *recipients])
assert source.parse_command(command) == ["-i", "-f", sender, "--", *recipients]
assert source.parse_command(shlex.join(["yes-sendmail", "-oi", "-f" + sender, "--", *recipients])) == ["-i", "-f", sender, "--", *recipients]
for command in [
    "", "id", "yes-sendmail", "yes-sendmail -t", "yes-sendmail --check person@example.org",
    "yes-sendmail -i -f " + sender, "yes-sendmail -i -f attacker@example.org person@example.org",
    "yes-sendmail -i -f " + sender + " person@example.org;id",
    "yes-sendmail -i -f " + sender + " $(id)@example.org",
    "yes-sendmail -X/tmp/log -i -f " + sender + " person@example.org",
    "yes-sendmail -i -i -f " + sender + " person@example.org",
    shlex.join(["yes-sendmail", "-i", "-f", sender, "person\r\nBcc:other@example.org"]),
    shlex.join(["yes-sendmail", "-i", "-f", sender, *(["person@example.org"] * 101)]),
]:
    try:
        source.parse_command(command)
    except ValueError:
        pass
    else:
        raise AssertionError("unsafe command accepted")
with patch.dict(source.os.environ, SSH_ORIGINAL_COMMAND="yes-sendmail --check"), patch.object(source.os, "access", return_value=True), patch.object(source.os, "execv") as execute, patch.object(source.sys, "stdout", io.StringIO()) as output:
    assert source.main() == 0
    assert output.getvalue() == "ready\n"
    execute.assert_not_called()
with patch.dict(source.os.environ, SSH_ORIGINAL_COMMAND="yes-sendmail"), patch.object(source.os, "execv") as execute, patch.object(source.sys, "stderr", io.StringIO()):
    assert source.main() == 64
    execute.assert_not_called()

mime = b"To: person@example.invalid\r\nBcc: private@example.invalid\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Transfer-Encoding: base64\r\n\r\nAAECAyQoeCk=\r\n--x--\r\n\x00\xff"
seen = {}


def run(command, **options):
    seen["command"] = command
    seen["body"] = options["stdin"].read()
    return SimpleNamespace(returncode=69)


with patch.object(target.sys, "argv", ["sendmail", "-i", "-f", sender, *recipients]), patch.object(target.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(mime))), patch.object(target.subprocess, "run", run):
    assert target.main() == 69
assert seen["body"] == mime
assert shlex.split(seen["command"][-1]) == ["yes-sendmail", "-i", "-f", sender, *recipients]
for option in ["BatchMode=yes", "StrictHostKeyChecking=yes", "ForwardAgent=no", "ClearAllForwardings=yes", "RequestTTY=no", "PasswordAuthentication=no"]:
    assert option in seen["command"]
print("verified")
