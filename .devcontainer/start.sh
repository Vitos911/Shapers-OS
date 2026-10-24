#!/usr/bin/env bash
set -eu
cd /workspaces/Shapers-OS
if curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null; then
  exit 0
fi
corepack enable
pnpm install --frozen-lockfile
nohup pnpm dev > /tmp/shapers-os-dev.log 2>&1 < /dev/null &
