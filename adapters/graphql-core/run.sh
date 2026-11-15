#!/bin/sh
# Runs the graphql-core adapter. Set it up first (see README.md):
#   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
dir=$(cd "$(dirname "$0")" && pwd)
exec "$dir/.venv/bin/python" "$dir/adapter.py" "$@"
