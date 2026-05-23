#!/usr/bin/env bash
# Refuse to commit anything that looks like a private key or secret.
# Wired into .pre-commit-config.yaml as a local hook.

set -e

bad=$(git diff --cached --name-only | grep -E "\.(priv|pem|p12|pfx)$|/id_[a-z0-9_]+$" || true)
if [ -n "$bad" ]; then
    echo "REFUSED: private key or sensitive material staged:"
    echo "$bad" | sed 's/^/  /'
    exit 1
fi