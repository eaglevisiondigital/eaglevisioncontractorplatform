"""Credential-free R0 device intake. Run on the proposed second computer only.

No network, credential reader, identifiers/serials, hosted mode or configuration
change. Output is intake evidence, never proof of independent recovery readiness.
"""
import argparse
import json
import platform
import ssl
import subprocess
from datetime import datetime, timezone


def fixed_read(arguments):
    try:
        result = subprocess.run(arguments, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=3, check=False,
                                env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "LANG": "C", "LC_ALL": "C"})
        if result.returncode or len(result.stdout) > 4096:
            return None
        return result.stdout.decode("utf-8", errors="strict").strip()
    except (OSError, UnicodeError, subprocess.TimeoutExpired):
        return None


def collect():
    mac = platform.system() == "Darwin"
    encryption = "NOT_VERIFIED"
    model = build = None
    if mac:
        model = fixed_read(["/usr/sbin/sysctl", "-n", "hw.model"])
        build = fixed_read(["/usr/bin/sw_vers", "-buildVersion"])
        status = fixed_read(["/usr/bin/fdesetup", "status"])
        if status == "FileVault is On.":
            encryption = "FILEVAULT_ON_BOOT_VOLUME_ONLY"
        elif status == "FileVault is Off.":
            encryption = "FILEVAULT_OFF"
        elif status and ("progress" in status.lower() or "encrypting" in status.lower()):
            encryption = "TRANSITION_INCOMPLETE"
    version = platform.mac_ver()[0] if mac else platform.release()
    return {
        "schema": "propel-p1-r0-device-intake-v1",
        "observedAtUtc": datetime.now(timezone.utc).isoformat(),
        "hardwareModel": model,
        "system": platform.system(),
        "version": version,
        "build": build,
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "tlsLibrary": ssl.OPENSSL_VERSION,
        "bootVolumeEncryption": encryption,
        "montereyCredentialCustody": "PROHIBITED" if mac and version.startswith("12.") else "NOT_EVALUATED",
        "osSupport": "REQUIRES_CURRENT_VENDOR_AND_MODEL_REVIEW",
        "physicalIndependence": "NOT_VERIFIED",
        "custodyStorageVolume": "NOT_VERIFIED",
        "separateCredentials": "NOT_INSTALLED_OR_INSPECTED",
        "independentPowerNetwork": "NOT_VERIFIED",
        "humanOperator": "NOT_VERIFIED",
        "rehearsal": "NOT_RUN",
        "hostedRequests": 0,
        "readiness": "INTAKE_ONLY_NOT_APPROVAL_OR_PASS",
    }


def main():
    parser = argparse.ArgumentParser(description="Read-only credential-free device intake; no hosted or execution mode.")
    parser.parse_args()
    print(json.dumps(collect(), indent=2))


if __name__ == "__main__":
    main()
