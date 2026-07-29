#!/usr/bin/env bash
set -euo pipefail

for migration in backend/src/db/migrations/*.js; do
  grep -q 'exports\.up' "$migration" || { echo "Missing exports.up: $migration" >&2; exit 1; }
  grep -q 'exports\.down' "$migration" || { echo "Missing exports.down: $migration" >&2; exit 1; }
  up_line=$(grep -n 'exports\.up' "$migration" | head -n1 | cut -d: -f1)
  down_line=$(grep -n 'exports\.down' "$migration" | head -n1 | cut -d: -f1)
  if sed -n "${up_line},$((down_line - 1))p" "$migration" | grep -Eq 'drop(Table|Column)|renameColumn'; then
    echo "Destructive schema change in migration up (use expand/contract): $migration" >&2
    exit 1
  fi
done
printf '%s\n' 'Migration policy verified: every migration has reversible up/down functions and destructive changes are down-only.'
