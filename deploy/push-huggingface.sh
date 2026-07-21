#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

if [[ -z "${HF_SPACE_ID:-}" ]]; then
  read -r -p "Hugging Face Space ID (username/reelhouse): " HF_SPACE_ID
  export HF_SPACE_ID
fi

if [[ ! "${HF_SPACE_ID}" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then
  echo "HF_SPACE_ID must look like username/reelhouse." >&2
  exit 1
fi

if [[ -z "${HF_TOKEN:-}" ]]; then
  read -r -s -p "Hugging Face write token: " HF_TOKEN
  echo
  export HF_TOKEN
fi

if [[ -z "${HF_TOKEN}" ]]; then
  echo "A Hugging Face write token is required." >&2
  exit 1
fi

snapshot="$(mktemp -d -t reelhouse-space-XXXXXX)"
cleanup() {
  rm -rf "${snapshot}"
}
trap cleanup EXIT INT TERM

git ls-files Dockerfile .dockerignore README.md backend deploy frontend \
  | tar -cf - -T - \
  | tar -xf - -C "${snapshot}"

cd "${snapshot}"
git init --quiet --initial-branch=main
git config user.name "Reelhouse deploy"
git config user.email "reelhouse-deploy@users.noreply.github.com"
git add --all
git commit --quiet -m "Deploy Reelhouse"
git remote add space \
  "https://oauth2:${HF_TOKEN}@huggingface.co/spaces/${HF_SPACE_ID}"
git push --force space main

echo
echo "Deployment pushed successfully."
echo "Space: https://huggingface.co/spaces/${HF_SPACE_ID}"
