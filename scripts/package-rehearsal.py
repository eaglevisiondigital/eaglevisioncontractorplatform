"""Deterministic public-only ZIP. No private capsules, tests, HTTPS adapter or keys."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "recovery" / "monterey"
files = ["p1_recovery.py", "custody.py", "mailbox.py", "device.py", "rehearsal.py",
         "requirements.lock", "Setup.command", "Primary.command", "Backup.command",
         "Recover.command", "verify_package.py"]
data = {name: (src / name).read_bytes() for name in files}
data["READ_ME_FIRST.md"] = (root / "docs" / "TWO_COMPUTER_REHEARSAL.md").read_bytes()
data["MANIFEST.json"] = (json.dumps({k: hashlib.sha256(v).hexdigest() for k,v in sorted(data.items())}, indent=2) + "\n").encode()
dest = root / "recovery" / "distribution" / "propel-synthetic-rehearsal.zip"
dest.parent.mkdir(exist_ok=True)
import io
out = io.BytesIO()
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:
    for name, value in sorted(data.items()):
        item = zipfile.ZipInfo("Propel-Synthetic-Rehearsal/" + name, (2026, 1, 1, 0, 0, 0))
        item.create_system = 3
        item.external_attr = (0o100755 if name.endswith(".command") else 0o100644) << 16
        item.compress_type = zipfile.ZIP_STORED
        archive.writestr(item, value)
value = out.getvalue()
if "--check" in sys.argv:
    if not dest.exists() or dest.read_bytes() != value:
        raise SystemExit("Rehearsal distribution is stale")
else:
    dest.write_bytes(value)
print("Public synthetic ZIP SHA-256:", hashlib.sha256(value).hexdigest())
