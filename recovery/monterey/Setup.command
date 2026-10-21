#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
echo 'Propel SYNTHETIC rehearsal setup. No platform, Supabase or provider credentials.'
echo 'Use the same working Python 3 installation you already tested.'
read -r -p 'Python command or full path [python3]: ' rehearsal_python
rehearsal_python=${rehearsal_python:-python3}
"$rehearsal_python" -B verify_package.py
"$rehearsal_python" -m venv .venv
if ! .venv/bin/python -c 'import cryptography; assert cryptography.__version__ == "50.0.2"' 2>/dev/null; then
  echo 'Installing only the existing hash-pinned encryption dependencies from PyPI.'
  .venv/bin/python -m pip --isolated install --index-url https://pypi.org/simple --require-hashes --only-binary=:all: -r requirements.lock
fi
echo 'SETUP COMPLETE. No baseline recovery tests were repeated.'
read -r -p 'Press Return to close. ' ignored
