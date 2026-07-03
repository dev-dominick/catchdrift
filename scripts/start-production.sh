#!/usr/bin/env bash
set -euo pipefail

case "${RAILWAY_SERVICE_NAME:-}" in
  catchdrift-worker)
    exec pnpm start:worker
    ;;
  *)
    pnpm db:migrate
    exec pnpm start:web
    ;;
esac