#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs/local-stack/clients"
mkdir -p "$LOG_DIR"

SKIP_BUILD=0
SKIP_CLIENTS=0
SERIAL_BUILD=0
REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --skip-clients) SKIP_CLIENTS=1 ;;
    --serial-build) SERIAL_BUILD=1 ;;
    --rebuild) REBUILD=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Sanity check — docker daemon
command -v docker >/dev/null 2>&1 || { echo "[local-stack] 'docker' 미설치" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "[local-stack] Docker daemon 미가동" >&2; exit 1; }
command -v java >/dev/null 2>&1 || { echo "[local-stack] 'java' 미설치 (JDK 17)" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[local-stack] 'npm' 미설치 (Node 20+)" >&2; exit 1; }

cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/ensure-local-env.sh"
ensure_local_env "$ROOT_DIR"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  if [[ "$SERIAL_BUILD" -eq 1 ]]; then
    GRADLE_OPTS_ARRAY=(--no-daemon --no-parallel)
  else
    GRADLE_OPTS_ARRAY=(--parallel --max-workers=2)
  fi
  ./gradlew \
    :services:eureka-server:bootJar \
    :services:api-gateway:bootJar \
    :services:auth-service:bootJar \
    :services:user-service:bootJar \
    :services:product-service:bootJar \
    :services:inventory-service:bootJar \
    :services:slip-service:bootJar \
    :services:accounting-service:bootJar \
    :services:partner-order-service:bootJar \
    :services:dc-config-service:bootJar \
    :services:partner-auth-service:bootJar \
    :services:groupware-service:bootJar \
    :services:notification-service:bootJar \
    :services:dashboard-service:bootJar \
    :services:partner-service:bootJar \
    :services:arologis-service:bootJar \
    "${GRADLE_OPTS_ARRAY[@]}"
fi

if [[ "$REBUILD" -eq 1 ]]; then
  docker compose --env-file "$LOCAL_ENV_FILE" -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build
else
  docker compose --env-file "$LOCAL_ENV_FILE" -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d
fi

wait_http() {
  local name="$1"
  local url="$2"
  local deadline=$((SECONDS + 180))
  until curl -fs "$url" >/dev/null; do
    if [[ "$SECONDS" -gt "$deadline" ]]; then
      echo "[local-stack] TIMEOUT $name $url" >&2
      exit 1
    fi
    sleep 3
  done
  echo "[local-stack] OK $name $url"
}

until docker exec samhan-postgres pg_isready -U samhan >/dev/null 2>&1; do sleep 3; done
echo "[local-stack] OK postgres pg_isready"
wait_http "eureka" "http://localhost:8761/actuator/health"
wait_http "gateway" "http://localhost:8080/actuator/health"
wait_http "auth" "http://localhost:8081/actuator/health"
wait_http "dashboard" "http://localhost:8094/actuator/health"

start_client() {
  local name="$1"
  local path="$2"
  # setsid 로 새 process group 시작 — stop-local-stack 가 group kill 으로 자손 vite/expo 까지 정리
  setsid bash -c "cd '$ROOT_DIR/$path' && npm run local-dev > '$LOG_DIR/$name.log' 2>&1" </dev/null &
  local pid=$!
  echo "$pid" > "$LOG_DIR/$name.pid"
  echo "[local-stack] client $name pid=$pid log=$LOG_DIR/$name.log"
}

if [[ "$SKIP_CLIENTS" -eq 0 ]]; then
  start_client desktop clients/desktop
  start_client mobile clients/mobile
  start_client mobile-staff clients/mobile-staff
  start_client estimate-app clients/web/estimate-app
  start_client order-app clients/web/order-app
  start_client design-system clients/web/design-system
  start_client arologis-desktop clients/arologis-desktop
  start_client arologis-mobile clients/arologis-mobile
fi

cat <<'URLS'

SamhanLogis local stack URLs
  API Gateway       http://localhost:8080
  Eureka            http://localhost:8761
  Grafana           http://localhost:3000  (credentials: infrastructure/.env)
  Prometheus        http://localhost:9090
  MinIO Console     http://localhost:9001  (credentials: infrastructure/.env)
  Desktop           Electron auto launch, Vite renderer http://localhost:5173
  Estimate Web      http://localhost:5183
  Order Web         http://localhost:5180
  Design System     http://localhost:5176
  Arologis Desktop  Electron auto launch, API http://localhost:8097
  Mobile QR         Expo logs under logs/local-stack/clients

Seed command:
  ./scripts/seed-local-stack.ps1
URLS
