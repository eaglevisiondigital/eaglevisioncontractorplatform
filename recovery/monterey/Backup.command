#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
.venv/bin/python -B verify_package.py
echo 'Use this on the 2017 BACKUP Mac. Both Macs must share a trusted LAN/hotspot.'
echo 'Find this Mac Wi-Fi IPv4 address in System Preferences > Network > Wi-Fi > Advanced > TCP/IP.'
read -r -p 'THIS BACKUP Mac private IPv4 address: ' rehearsal_ip
exec .venv/bin/python -B rehearsal.py backup --listen "$rehearsal_ip"
