#!/usr/bin/python3
"""Forced mail-only SSH command; no website, database or PHP is involved."""
import os
import shlex
import string
import sys
import re

TRANSPORT = "/usr/sbin/hsendmail"
SENDER = "noreply@youthecosummit.com"
LOCAL_CHARACTERS = set(string.ascii_letters + string.digits + ".!#$%&'*+/=?^_" + chr(96) + "{|}~-")


def address(value):
    if len(value) > 254 or value.count("@") != 1:
        return False
    local, domain = value.split("@")
    labels = domain.split(".")
    return (0 < len(local) <= 64 and all(char in LOCAL_CHARACTERS for char in local)
            and not local.startswith(".") and not local.endswith(".") and ".." not in local
            and len(labels) >= 2 and len(labels[-1]) >= 2
            and all(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label) for label in labels))


def parse_command(command):
    if not command or len(command) > 32768 or "\x00" in command:
        raise ValueError("invalid command")
    tokens = shlex.split(command)
    if tokens == ["yes-sendmail", "--check"]:
        return []
    if not tokens or tokens.pop(0) != "yes-sendmail":
        raise ValueError("invalid command")
    flags, recipients, sender = [], [], None
    seen = set()
    positional = False
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if not positional and token == "--":
            positional = True
        elif not positional and token in ("-i", "-oi", "-t"):
            flag = "-i" if token in ("-i", "-oi") else token
            if flag in seen:
                raise ValueError("duplicate flag")
            seen.add(flag)
            flags.append(flag)
        elif not positional and (token == "-f" or token.startswith("-f") and sender is None):
            if sender is not None:
                raise ValueError("duplicate sender")
            if token == "-f":
                index += 1
                if index >= len(tokens):
                    raise ValueError("missing sender")
                sender = tokens[index]
            else:
                sender = token[2:]
            if not address(sender) or sender.lower() != SENDER:
                raise ValueError("sender is not authorized")
        else:
            positional = True
            if not address(token):
                raise ValueError("invalid recipient")
            recipients.append(token)
            if len(recipients) > 100:
                raise ValueError("too many recipients")
        index += 1
    # Health checks have a distinct verb; empty/no-recipient commands never submit.
    if sender is None or not recipients:
        raise ValueError("sender and recipients required")
    return [*flags, "-f", SENDER, "--", *recipients]


def main():
    try:
        args = parse_command(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
    except ValueError:
        print("Mail command rejected.", file=sys.stderr)
        return 64
    if not os.access(TRANSPORT, os.X_OK):
        print("Mail transport unavailable.", file=sys.stderr)
        return 75
    if not args:
        print("ready")
        return 0
    os.environ.clear()
    os.environ.update(HOME="/home/u794443438", USER="u794443438", LOGNAME="u794443438",
                      PATH="/usr/bin:/bin", LANG="C.UTF-8")
    try:
        os.execv(TRANSPORT, [TRANSPORT, *args])
    except OSError:
        print("Mail transport unavailable.", file=sys.stderr)
        return 75


if __name__ == "__main__":
    raise SystemExit(main())
