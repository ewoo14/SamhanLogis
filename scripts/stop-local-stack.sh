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
  # MIG-23 사이클 1e fix (Codex Security MINOR) — ps 명령으로 process command 가
  # bash/node/npm/expo/vite 패턴인지 검증 후 종료. tampered/stale pid 시 무관 process 종료 차단.
  for pid_file in "$LOG_DIR"/*.pid; do
    [[ -f "$pid_file" ]] || continue
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
      if kill -0 "$pid" 2>/dev/null; then
        cmd=$(ps -p "$pid" -o comm= 2>/dev/null || true)
        if [[ "$cmd" =~ ^(bash|sh|node|npm|expo|vite|electron)$ ]]; then
          # setsid 로 시작된 process group 전체 kill (자손 vite/expo 포함)
          kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
          echo "[stop] client pid=$pid ($(basename "$pid_file" .pid) comm=$cmd) terminated"
        else
          echo "[stop] client pid=$pid ($(basename "$pid_file" .pid)) skipped — unexpected comm='$cmd'" >&2
        fi
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
