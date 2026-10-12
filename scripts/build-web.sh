#!/usr/bin/env bash

set -euo pipefail

# The Android client bundles only the static web application and replaces
# /api/backend/* and /api/app-download/* with native handlers. Those routes
# require a Next.js server and are therefore not valid in output: 'export'.
# Hide them for the duration of the export, then always restore the source
# files so the normal standalone build still contains the server routes.
server_routes=(
  "app/api/backend/[...path]/route.ts"
  "app/api/app-download/android/route.ts"
)
moved_routes=()

restore_routes() {
  for ((index = ${#moved_routes[@]} - 1; index >= 0; index--)); do
    route="${moved_routes[index]}"
    mv -- "$route.android-static-export" "$route"
  done
}

trap restore_routes EXIT INT TERM

if [[ "${OUTPUT_MODE:-}" == "export" ]]; then
  for route in "${server_routes[@]}"; do
    if [[ -f "$route" ]]; then
      mv -- "$route" "$route.android-static-export"
      moved_routes+=("$route")
    fi
  done
fi

next build
