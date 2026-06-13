#!/usr/bin/env bash
# Scans files for committed secrets. Used by .githooks/pre-commit (staged files)
# and CI (all tracked files). Exits 1 if a likely secret is found.
# Append "# pragma: allowlist secret" to a line to suppress a false positive.
set -uo pipefail

# Files to scan come from args; with no args, scan every tracked file.
# Written for bash 3.2 (macOS default), so no mapfile.
files=()
if [ "$#" -gt 0 ]; then
  files=("$@")
else
  while IFS= read -r line; do files+=("$line"); done < <(git ls-files)
fi

# The scanner itself holds these patterns as literals; never scan it. Lockfiles
# carry integrity hashes that are noise, not secrets.
exclude_re='(^|/)(scan-secrets\.sh|package-lock\.json)$'

patterns=(
  'dyn_[A-Za-z0-9]{20,}'                # Dynamic API token
  '0x[a-fA-F0-9]{64}'                   # raw 32-byte private key
  'AKIA[0-9A-Z]{16}'                    # AWS access key id
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'  # PEM private key block
  '(PRIVATE_KEY|MNEMONIC|SECRET_KEY|API_TOKEN|API_KEY)[[:space:]]*[=:][[:space:]]*[^[:space:]"'"'"']{12,}'
)

found=0
scanned=0
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  printf '%s' "$f" | grep -qE "$exclude_re" && continue
  scanned=$((scanned + 1))
  for p in "${patterns[@]}"; do
    matches=$(grep -nE "$p" "$f" 2>/dev/null | grep -v 'pragma: allowlist secret' || true)
    if [ -n "$matches" ]; then
      echo "POTENTIAL SECRET in $f:"
      printf '%s\n' "$matches" | sed 's/^/  /'
      found=1
    fi
  done
done

if [ "$found" -ne 0 ]; then
  echo ""
  echo "Commit blocked: likely secret(s) above. Move the value to a gitignored"
  echo ".env file, or append '# pragma: allowlist secret' if it is a false positive."
  exit 1
fi
echo "scan-secrets: clean ($scanned files)"
