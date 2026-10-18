#!/usr/bin/env bash
# Create or update the §16.1 labels from .github/labels.yml on the current repo.
# Requires: gh (authenticated). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
grep -E '^- \{' .github/labels.yml | while IFS= read -r line; do
  name=$(sed -E 's/.*name: "([^"]+)".*/\1/' <<<"$line")
  color=$(sed -E 's/.*color: "([^"]+)".*/\1/' <<<"$line")
  desc=$(sed -E 's/.*description: "([^"]+)".*/\1/' <<<"$line")
  gh label create "$name" --color "$color" --description "$desc" --force
done
