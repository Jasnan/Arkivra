#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Reset all local Docker Compose data for Arkivra.

This deletes local development data, including:
- Postgres database data
- Uploaded document storage
- Local backups volume

Stop local API and worker processes before running this script. The web
frontend can keep running, but it will fail requests until the API is restarted.

Usage:
  scripts/reset-dev-data.sh [--yes] [--full]

Options:
  --yes   Skip the typed confirmation prompt.
  --full  Start every Docker Compose service after reset.
          By default, only postgres is started for local dev.
USAGE
}

confirm=false
start_full_stack=false

for arg in "$@"; do
  case "$arg" in
    --)
      ;;
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

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == export\ * ]] && line="${line#export }"

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"

    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    [[ -z "${!key+x}" ]] || continue

    if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$env_file"
}

load_env_file ".env"
load_env_file "apps/arkivra-server/.env"

export ARKIVRA_AUTH_SECRET="${ARKIVRA_AUTH_SECRET:-dev-reset-placeholder-auth-secret}"
export ARKIVRA_DOCLING_URL="${ARKIVRA_DOCLING_URL:-http://127.0.0.1:5001}"
export ARKIVRA_ENCRYPTION_KEYS="${ARKIVRA_ENCRYPTION_KEYS:-1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"

database_url="${ARKIVRA_DATABASE_URL:-postgres://arkivra:arkivra@localhost:5432/arkivra}"
database_name="$(
  ARKIVRA_DATABASE_URL="$database_url" node -e '
    const url = new URL(process.env.ARKIVRA_DATABASE_URL);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (databaseName.length === 0) {
      console.error("ARKIVRA_DATABASE_URL must include a database name.");
      process.exit(1);
    }
    console.log(databaseName);
  '
)"

can_connect_to_target_postgres() {
  ARKIVRA_DATABASE_URL="$database_url" pnpm --dir apps/arkivra-server exec node -e '
    import("pg").then(async ({ Client }) => {
      const target = new URL(process.env.ARKIVRA_DATABASE_URL);
      target.pathname = "/postgres";
      const client = new Client({ connectionString: target.toString() });
      await client.connect();
      await client.end();
    }).catch(() => process.exit(1));
  ' >/dev/null 2>&1
}

reset_target_database() {
  ARKIVRA_DATABASE_URL="$database_url" pnpm --dir apps/arkivra-server exec node -e '
    import("pg").then(async ({ Client }) => {
      const target = new URL(process.env.ARKIVRA_DATABASE_URL);
      const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));
      const quoteIdent = (value) => `"${value.replace(/"/g, "\"\"")}"`;
      target.pathname = "/postgres";

      const client = new Client({ connectionString: target.toString() });
      await client.connect();
      await client.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      );
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)}`);
      await client.query(`CREATE DATABASE ${quoteIdent(databaseName)} OWNER arkivra`);
      await client.end();
    }).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  '
}

if [[ "$confirm" != true ]]; then
  echo "This will permanently delete all local Docker Compose data for this app."
  echo "Database to reset: ${database_name}"
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

compose_project="${COMPOSE_PROJECT_NAME:-$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')}"
echo "Removing known local cache/backup volumes for Compose project ${compose_project} if they still exist..."
docker volume rm "${compose_project}_backups" >/dev/null 2>&1 || true

using_existing_postgres=false
if can_connect_to_target_postgres; then
  using_existing_postgres=true
  echo "Using existing Postgres server from ARKIVRA_DATABASE_URL."
else
  echo "Starting local development dependencies..."
  docker compose up postgres -d

  echo "Waiting for Postgres to accept connections..."
  for attempt in {1..30}; do
    if can_connect_to_target_postgres; then
      break
    fi

    if [[ "$attempt" -eq 30 ]]; then
      echo "Postgres did not become ready in time." >&2
      exit 1
    fi

    sleep 1
  done
fi

echo "Dropping and recreating database ${database_name}..."
reset_target_database

echo "Running database migrations for ${database_name}..."
ARKIVRA_DATABASE_URL="$database_url" pnpm db:migrate

if [[ "$start_full_stack" == true ]]; then
  if [[ "$using_existing_postgres" == true ]]; then
    echo "Skipping full Docker Compose stack start because Postgres is already managed outside this Compose project."
  else
    echo "Starting the full Docker Compose stack..."
    docker compose up -d
  fi
fi

echo "Local development data has been reset."
