#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Reset all local Docker Compose data for Arkivra.

This deletes local development data, including:
- Postgres database data
- Uploaded document storage
- Local backups volume
- Docling cache volume

Stop local API and worker processes before running this script. The web
frontend can keep running, but it will fail requests until the API is restarted.

Usage:
  scripts/reset-dev-data.sh [--yes] [--full]

Options:
  --yes   Skip the typed confirmation prompt.
  --full  Start every Docker Compose service after reset.
          By default, only postgres and docling are started for local dev.
USAGE
}

confirm=false
start_full_stack=false

for arg in "$@"; do
  case "$arg" in
    --yes)
      confirm=true
      ;;
    --full)
      start_full_stack=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f docker-compose.yml ]]; then
  echo "Run this script from the repository root." >&2
  exit 1
fi

if [[ "$confirm" != true ]]; then
  echo "This will permanently delete all local Docker Compose data for this app."
  echo "Stop any local API and worker processes before continuing."
  echo "Type RESET to continue:"
  read -r response

  if [[ "$response" != "RESET" ]]; then
    echo "Reset cancelled."
    exit 0
  fi
fi

echo "Stopping services and deleting Docker Compose volumes..."
docker compose down --volumes --remove-orphans

echo "Removing known local cache/backup volumes if they still exist..."
docker volume rm arkivra_backups arkivra_docling-data >/dev/null 2>&1 || true

if [[ "$start_full_stack" == true ]]; then
  echo "Starting the full Docker Compose stack..."
  docker compose up -d
else
  echo "Starting local development dependencies..."
  docker compose up postgres docling -d

  echo "Waiting for Postgres to accept connections..."
  for attempt in {1..30}; do
    if docker compose exec -T postgres pg_isready -U arkivra -d arkivra >/dev/null 2>&1; then
      break
    fi

    if [[ "$attempt" -eq 30 ]]; then
      echo "Postgres did not become ready in time." >&2
      exit 1
    fi

    sleep 1
  done

  echo "Running database migrations..."
  pnpm db:migrate
fi

echo "Local development data has been reset."
