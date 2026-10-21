#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
.venv/bin/python -B verify_package.py
echo 'BACKUP ONLY, synthetic recovery after its listener was interrupted. No network calls.'
echo 'Do not delete/reset an existing attempt. If recovery already ran, choose report.'
read -r -p 'Mode [report/recover]: ' rehearsal_mode
case "$rehearsal_mode" in report|recover) ;; *) exit 2 ;; esac
read -r -p 'Paste the BACKUP run directory printed earlier (no quotes): ' rehearsal_dir
exec .venv/bin/python -B rehearsal.py "$rehearsal_mode" "$rehearsal_dir"
