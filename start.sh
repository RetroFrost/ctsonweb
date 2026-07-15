#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm install
fi
npm run dev -- --host 0.0.0.0
