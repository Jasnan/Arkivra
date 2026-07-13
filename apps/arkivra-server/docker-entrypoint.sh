#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

case "${ARKIVRA_PROCESS_ROLE:-all}" in
  all | web)
    node dist/scripts/migrate.js
    ;;
  worker)
    ;;
  *)
    echo "Invalid ARKIVRA_PROCESS_ROLE: ${ARKIVRA_PROCESS_ROLE}" >&2
    exit 1
    ;;
esac

exec node dist/index.js
