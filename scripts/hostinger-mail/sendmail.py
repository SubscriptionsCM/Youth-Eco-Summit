#!/usr/bin/python3
"""Native sendmail interface to the account's restricted Hostinger MTA."""
import shlex
import subprocess
import sys

ROOT = "/srv/youth-eco-summit/config/hostinger-mail"


def main():
    remote = shlex.join(["yes-sendmail", *sys.argv[1:]])
    if len(remote) > 32768 or "\x00" in remote:
        print("Mail arguments rejected.", file=sys.stderr)
        return 64
    command = [
        "/usr/bin/ssh", "-F", "/dev/null", "-T", "-p", "65002", "-i", ROOT + "/id_ed25519",
        "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
        "-o", "PasswordAuthentication=no", "-o", "KbdInteractiveAuthentication=no",
        "-o", "PreferredAuthentications=publickey", "-o", "StrictHostKeyChecking=yes",
        "-o", "UserKnownHostsFile=" + ROOT + "/known_hosts", "-o", "GlobalKnownHostsFile=/dev/null",
        "-o", "ForwardAgent=no", "-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no",
        "-o", "RequestTTY=no", "-o", "ConnectTimeout=8", "-o", "ConnectionAttempts=1",
        "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=2", "-o", "LogLevel=ERROR",
        "u794443438@145.79.212.116", remote,
    ]
    try:
        result = subprocess.run(command, stdin=sys.stdin.buffer, stdout=sys.stdout.buffer,
                                stderr=sys.stderr.buffer, timeout=45)
    except (OSError, subprocess.TimeoutExpired):
        print("Mail transport unavailable.", file=sys.stderr)
        return 75
    return result.returncode if result.returncode >= 0 else 128 - result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
