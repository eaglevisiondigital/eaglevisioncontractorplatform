"""Explicit foreground device loop. No auto-start, CLI, login or credential reader.

Compose with separately approved HTTPSPorts/custody only after hardware/hosted
approval gates. Tests use synthetic Backup/ports and fake wall/monotonic clocks.
"""
import time
from custody import Supervisor
from mailbox import DeviceMailbox
from p1_recovery import Stop


class DeviceRuntime:
    def __init__(self, backup, inbox, outbox, wall=time.time, monotonic=time.monotonic):
        self.backup = backup
        self.supervisor = Supervisor(backup, wall, monotonic)
        self.mailbox = DeviceMailbox(inbox, outbox, backup, self.supervisor)
        self.seen = set()
        self.stopped = False

    def stop(self):
        if self.supervisor.result is None and not self.stopped:
            self.stopped = True
            self.supervisor.result = {'status':'CONTAINMENT_REQUIRED','hostedVerification':False,'automaticRetries':0}
            try:
                self.supervisor.result = self.backup.recover()
            except BaseException:
                pass
        return self.supervisor.result

    def poll(self):
        if self.stopped or self.supervisor.result is not None:
            return self.supervisor.result
        try:
            # Supervision is checked before processing any queued input. A
            # delayed packet must not revive an already expired presence window.
            result = self.supervisor.tick()
            if result is not None:
                self.stopped = True
                return result
            names = sorted(p.name for p in self.mailbox.inbox.iterdir())
            if len(names) > 512:
                raise Stop("Bounded device mailbox exceeded")
            for name in [n for n in names if n not in self.seen][:8]:
                self.mailbox.process_one(name)
                self.seen.add(name)
                if self.supervisor.tick() is not None:
                    self.stopped = True
                    break
            return self.supervisor.result
        except BaseException:
            self.stop()
            raise Stop("Independent device stopped; inspect containment result") from None

    def run(self, operator_action, pause=time.sleep):
        """Foreground only. operator_action must be a nonblocking actual UI poll.

        It returns None, 'present' on an actual human click/key, or 'stop'. Never
        use a timer/heartbeat to return 'present'. No credential/TOTP input here.
        """
        try:
            while not self.stopped:
                if self.poll() is not None:
                    return self.supervisor.result
                action = operator_action()
                if action == 'present':
                    self.supervisor.human_present()
                elif action == 'stop':
                    return self.stop()
                elif action is not None:
                    raise Stop("Unexpected operator control")
                pause(0.1)
        except BaseException:
            return self.stop()
        return self.supervisor.result
