#!/usr/bin/env bash
set -euo pipefail

artifact_path="${1:-dist/SnapReceipt-Mac.dmg}"
if [[ ! -f "$artifact_path" ]]; then
  echo "Release artifact not found: $artifact_path" >&2
  exit 1
fi

mountpoint="$(mktemp -d)"
mounted=0
cleanup() {
  if [[ "$mounted" == "1" ]]; then
    hdiutil detach "$mountpoint" -quiet || true
  fi
  rmdir "$mountpoint" 2>/dev/null || true
}
trap cleanup EXIT

hdiutil attach "$artifact_path" -nobrowse -readonly -mountpoint "$mountpoint" >/dev/null
mounted=1

app_path="$(find "$mountpoint" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$app_path" ]]; then
  echo "No application bundle found in $artifact_path" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
spctl --assess --type execute --verbose=4 "$app_path"
xcrun stapler validate "$artifact_path"

artifact_dir="$(dirname "$artifact_path")"
artifact_name="$(basename "$artifact_path")"
hash="$(shasum -a 256 "$artifact_path" | awk '{print toupper($1)}')"
printf '%s  %s\n' "$hash" "$artifact_name" > "$artifact_dir/SHA256SUMS.txt"

echo "codesign: Valid"
echo "Gatekeeper assessment: Accepted"
echo "Notarization ticket: Valid"
echo "SHA256: $hash"
echo "Manifest: $artifact_dir/SHA256SUMS.txt"
