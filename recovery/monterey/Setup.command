#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
echo 'Propel SYNTHETIC rehearsal setup. No platform, Supabase or provider credentials.'
echo 'Use the same working Python 3 installation you already tested.'
read -r -p 'Python command or full path [python3]: ' rehearsal_python
rehearsal_python=${rehearsal_python:-python3}
"$rehearsal_python" -B verify_package.py
"$rehearsal_python" -m venv .venv
echo 'Installing the separate Intel-compatible SYNTHETIC lock: cryptography 48.0.1.'
# Reinstall reviewed wheels even if an earlier failed setup left a partial venv.
# Never alter the operational recovery requirements or compile source packages.
.venv/bin/python -m pip --isolated install --index-url https://pypi.org/simple --require-hashes --only-binary=:all: --force-reinstall --no-deps -r rehearsal-requirements.lock
.venv/bin/python -B verify_package.py --dependencies
echo 'SETUP COMPLETE. No baseline recovery tests were repeated.'
read -r -p 'Press Return to close. ' ignored
