#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
.venv/bin/python -B verify_package.py --dependencies
echo 'Use this on the PRIMARY MacBook Pro. No real credentials or private P1 files.'
read -r -p 'BACKUP Mac private IPv4 address: ' rehearsal_ip
echo 'Scenario: loss, tamper, wrong-run, duplicate, lost-ack, incomplete, expired'
read -r -p 'Scenario [loss]: ' rehearsal_scenario
rehearsal_scenario=${rehearsal_scenario:-loss}
exec .venv/bin/python -B rehearsal.py primary --peer "$rehearsal_ip" --scenario "$rehearsal_scenario"
