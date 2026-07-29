#!/usr/bin/env bash
set -euo pipefail

workflow=".github/workflows/backend-tests.yml"
test -f "$workflow"
grep -q '^  pull_request:' "$workflow"
grep -q '^  workflow_dispatch:' "$workflow"
grep -q '^concurrency:' "$workflow"
grep -q 'cancel-in-progress: true' "$workflow"
grep -q 'npm run migrate:status' "$workflow"
grep -q 'npm audit --omit=dev --audit-level=high' "$workflow"
grep -q 'npm audit --audit-level=high' "$workflow"
grep -q 'npm test' "$workflow"
printf '%s\n' 'CI policy verified: PR/manual triggers, concurrency cancellation, migration validation, tests and high-severity audits are mandatory.'
