"""Verify the public distribution inventory; no network, device or credential reads."""
import hashlib
from importlib.metadata import version
import json
import sys
from pathlib import Path

DEPENDENCIES = {"cryptography": "48.0.1", "cffi": "2.1.1", "pycparser": "3.11"}


def check_dependencies():
    try:
        if any(version(name) != expected for name, expected in DEPENDENCIES.items()):
            raise ValueError()
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        # Smoke-check the installed native wheel, not just its package metadata.
        cipher = AESGCM(bytes(range(32)))
        nonce, data, aad = bytes(range(12)), b"synthetic-setup-only", b"propel-rehearsal"
        if cipher.decrypt(nonce, cipher.encrypt(nonce, data, aad), aad) != data:
            raise ValueError()
    except Exception:
        raise SystemExit("SETUP NOT COMPLETE: exact synthetic binary dependencies failed verification. Run Setup.command from the corrected ZIP; do not substitute versions.") from None
    print("SYNTHETIC DEPENDENCIES VERIFIED: cryptography 48.0.1 / cffi 2.1.1 / pycparser 3.11")


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
    if sys.argv[1:] == ["--dependencies"]:
        check_dependencies()
    elif sys.argv[1:]:
        raise SystemExit("Unknown package-verification option")


if __name__ == "__main__":
    main()
