#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_root="$repo_root/skills"
target_root="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 1
fi

mkdir -p "$target_root"

if [ "$#" -gt 0 ]; then
  skills=("$@")
else
  skills=()
  while IFS= read -r -d '' dir; do
    skills+=("$(basename "$dir")")
  done < <(find "$source_root" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)
fi

for skill in "${skills[@]}"; do
  src="$source_root/$skill"
  dest="$target_root/$skill"

  if [ ! -d "$src" ]; then
    echo "missing skill: $skill" >&2
    exit 1
  fi

  rsync -a --delete \
    --exclude='.git/' \
    --exclude='outputs/' \
    --exclude='generated/' \
    --exclude='tmp/' \
    --exclude='__pycache__/' \
    --exclude='.pytest_cache/' \
    --exclude='.DS_Store' \
    "$src/" "$dest/"

  echo "synced $skill -> $dest"
done
