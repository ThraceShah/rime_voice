#!/usr/bin/env bash
set -euo pipefail

if ! command -v rime_deployer >/dev/null; then
  echo '需要安装 rime_deployer' >&2
  exit 1
fi
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
git clone --quiet https://github.com/gaboolic/rime-frost.git "$work_dir/frost"
git -C "$work_dir/frost" checkout --quiet 3ad2cb34e3c5763ba3f8da0a617fcaa221b355aa
mkdir -p "$work_dir/build/cn_dicts"
for name in 8105 base ext others; do
  cp "$work_dir/frost/cn_dicts/$name.dict.yaml" "$work_dir/build/cn_dicts/"
done
cat > "$work_dir/build/rime_frost.dict.yaml" <<'EOF'
---
name: rime_frost
version: "2026.09"
import_tables:
  - cn_dicts/8105
  - cn_dicts/base
  - cn_dicts/ext
  - cn_dicts/others
...
EOF
cp "$repo_root/vendor/rime/rime_frost.schema.yaml" "$work_dir/build/"
cp "$repo_root/vendor/rime/default.yaml" "$work_dir/build/"
rime_deployer --compile "$work_dir/build/rime_frost.schema.yaml" "$work_dir/build" "$work_dir/build" "$work_dir/build/compiled"
cp "$work_dir/build/compiled/"*.bin "$repo_root/vendor/rime/"
echo '白霜词典已重新编译到 vendor/rime/'
