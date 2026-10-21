"""Verify the public distribution inventory; no network, device or credential reads."""
import hashlib
import json
import sys
from pathlib import Path


def main():
    if sys.version_info < (3, 12):
        raise SystemExit("Use the already tested Python 3.12+ installation; no OS change required.")
    root = Path(__file__).resolve().parent
    inventory = json.loads((root / "MANIFEST.json").read_text())
    for name, expected in inventory.items():
        if "/" in name or "\\" in name or name.startswith("."):
            raise ValueError("Invalid package entry")
        path = root / name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("Package differs from reviewed public inventory")
    print("PACKAGE FILE HASHES MATCH — verify ZIP SHA-256 separately before first setup.")


if __name__ == "__main__":
    main()
