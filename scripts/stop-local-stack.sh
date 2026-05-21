#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs/local-stack/clients"

KEEP_CLIENTS=0
DOWN_VOLUMES=0
for arg in "$@"; do
  case "$arg" in
    --keep-clients) KEEP_CLIENTS=1 ;;
    --down-volumes) DOWN_VOLUMES=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$KEEP_CLIENTS" -eq 0 && -d "$LOG_DIR" ]]; then
  for pid_file in "$LOG_DIR"/*.pid; do
    [[ -f "$pid_file" ]] || continue
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
      # setsid 로 시작된 process group 전체 kill (자손 vite/expo 포함)
      if kill -0 "$pid" 2>/dev/null; then
        kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
        echo "[stop] client pid=$pid ($(basename "$pid_file" .pid)) terminated"
      else
        echo "[stop] client pid=$pid ($(basename "$pid_file" .pid)) already gone"
      fi
      rm -f "$pid_file"
    fi
  done
fi

cd "$ROOT_DIR"
if [[ "$DOWN_VOLUMES" -eq 1 ]]; then
  echo "[stop] docker compose down -v (volume 포함 삭제)"
  docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml down -v
else
  echo "[stop] docker compose down"
  docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml down
fi

echo "[stop] local stack stopped"
