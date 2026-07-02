#!/bin/sh
set -eu

case "${RAILWAY_SERVICE_NAME:-}" in
  catchdrift-worker)
    exec pnpm start:worker
    ;;
  *)
    exec pnpm start:web
    ;;
esac