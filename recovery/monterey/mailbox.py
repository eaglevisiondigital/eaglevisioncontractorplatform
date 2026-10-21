"""Encrypted file-message receiver on the independent device. No network listener.

An approved external device-to-device transfer delivers only encrypted envelopes;
the key/management custody never travels in this directory or with the primary log.
No CLI or transport activation is provided. process_one is explicitly invoked by a
later reviewed device harness; only Backup can authenticate/acknowledge a session.
"""
import json
import os
import re
from pathlib import Path

from p1_recovery import Stop, private_bytes


def private_directory(root):
    root = Path(root)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink() or root.stat().st_mode & 0o077:
        raise Stop("Private local mailbox required")
    return root


def write_once(path, value):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as out:
            out.write(json.dumps(value, separators=(',', ':')).encode())
            out.flush()
            os.fsync(fd)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        os.close(fd)


class DeviceMailbox:
    def __init__(self, inbox, outbox, backup, supervisor):
        self.inbox = private_directory(inbox)
        self.outbox = private_directory(outbox)
        self.backup, self.supervisor = backup, supervisor

    def process_one(self, name):
        if not re.fullmatch(r'[a-f0-9-]{36}\.json', name):
            raise Stop("Exact encrypted message filename required")
        message = json.loads(private_bytes(self.inbox / name))
        if (not isinstance(message, dict) or set(message) != {'kind', 'packet'}
                or message['kind'] not in ('custody', 'heartbeat')
                or not isinstance(message['packet'], str) or len(message['packet']) > 65536):
            raise Stop("Invalid mailbox envelope")
        if message['kind'] == 'heartbeat':
            self.supervisor.receive_heartbeat(message['packet'])
            return None
        # A lost acknowledgment is uncertainty, not permission to receive/replay.
        ack = self.backup.receive(message['packet'])
        write_once(self.outbox / name, ack)
        return 'ACKNOWLEDGED'
