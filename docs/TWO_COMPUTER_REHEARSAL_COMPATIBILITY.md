# Synthetic rehearsal Intel compatibility repair

The owner verified the original ZIP SHA/package on the actual 2017 Intel Mac,
Monterey12.7.6/CPython3.14.2. Setup then failed to find a cryptography50.0.2 binary;
setup, pairing and device cases did **not** pass. Preserve that evidence separately
from the previous25 offline passes and network/Python checks.

The [upstream changelog](https://cryptography.io/en/latest/changelog/#v49-0-0)
confirms removal of Intel macOS wheel publishing in49.0.0. The original package
incorrectly reused the operational dependency lock for this synthetic distribution.
The correction is a distinct `rehearsal-requirements.lock`, not a downgrade of
operational recovery. Both Macs use the same rebuilt ZIP and exact versions.

## Exact compatible wheels

Official [cryptography48.0.1](https://pypi.org/pypi/cryptography/48.0.1/json),
[CFFI2.1.1](https://pypi.org/pypi/cffi/2.1.1/json) and
[pycparser3.11](https://pypi.org/pypi/pycparser/3.11/json) release metadata supplied
the version requirements and SHA-256 values. The new lock contains non-yanked
**wheel** digests only, including all transitive dependencies. Source archives are
excluded. No version ranges, fallback versions, compilation or provider activation.

| Exact Monterey/Intel/CPython3.14.2 selection                | SHA-256                                                            | Inspected Intel binary minimum OS |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| `cryptography-48.0.1-cp311-abi3-macosx_10_9_universal2.whl` | `3e4a1a3232eef2e6c732827d5722db29a0cc8b27af2a4d865b094cf954be9ca1` | 10.13.0                           |
| `cffi-2.1.1-cp314-cp314-macosx_10_15_x86_64.whl`            | `d28630f5854ab07ab1fd4aba756de52326c82e6be15d414b12793f1975048b54` | 10.15.0                           |
| `pycparser-3.11-py3-none-any.whl`                           | `51d5a8ba2be0bbe440b99d2112604c95bbbc3c2748a64260186c541e1729cd80` | Pure Python                       |

Cross-target pip resolution/download passed with `--platform macosx_12_0_x86_64
--python-version 3.14.2 --implementation cp --abi cp314 --abi abi3
--require-hashes --only-binary=:all:`. The conservative12.0 target is below12.7.6.
The cp311 stable ABI wheel is compatible with normal CPython3.14, while CFFI uses
the exact cp314 ABI. Inspecting wheel Mach-O load commands independently confirmed
x86_64 slices and the OS minima above; the universal2 cryptography wheel also has
arm64. These are binary/ABI compatibility checks, **not an actual Monterey install
or physical-device rehearsal PASS**. The owner must observe corrected Setup there.

Apple Silicon CPython3.14.2 cross-target resolution also passed using the same
cryptography wheel and `cffi-2.1.1-cp314-cp314-macosx_11_0_arm64.whl`, SHA
`661c298b4821edebead0c91edd2b00374d67ad7c5a1f7a91d4442633b79d6a72`.
The local arm64 CPython3.12.14 environment installed48.0.1 from binary wheels and
ran the focused recovery/protocol tests. No new system Python or OS was installed.

## Fail-closed setup and release boundary

Setup verifies the public inventory before installation, uses only the separate
synthetic lock with `--require-hashes --only-binary=:all: --force-reinstall --no-deps`,
then verifies all three installed versions and an actual native AES-GCM roundtrip.
An installation/native verification error exits before SETUP COMPLETE. Backup,
Primary and Recover launchers repeat the exact dependency guard before any activity.
This catches a partial install or an old50 environment; no automatic substitution.

The older compatibility dependency is restricted to generated synthetic rehearsal
data and the existing AES-GCM/HKDF/HMAC protocol. It is not approval to downgrade
operational cryptography, process untrusted supplier files or custody live tokens.
Operational `requirements.lock`, recovery core, all13 historical migrations and
the approved P1 operation/four artifacts remain unchanged. No hosted requests,
credentials, sessions, database changes, Netlify actions or activation occurred.
Release1.0 remains **NOT READY / NOT AUTHORIZED**, PR#1 draft/unmerged.

Exact new ZIP hash and genuine focused results are in
TWO_COMPUTER_REHEARSAL_VALIDATION.json. The prior broad application/browser results
are historical; they are not needlessly rerun for this compatibility-only repair.
