#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${QA_CLONE_ENV_FILE:-infrastructure/.env.local}"
if [[ ! -f "$ENV_FILE" ]]; then echo "환경 파일이 없습니다: $ENV_FILE" >&2; exit 1; fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ $# -eq 0 ]]; then echo "사용법: clone-db-utf8.sh DB_NAME [DB_NAME ...]" >&2; exit 2; fi
for db in "$@"; do
  [[ "$db" =~ ^[a-zA-Z0-9_]+$ ]] || { echo "허용되지 않은 DB 이름: $db" >&2; exit 2; }
done
for key in QA_CLONE_SOURCE_USER QA_CLONE_SOURCE_PASSWORD QA_CLONE_TARGET_USER QA_CLONE_TARGET_PASSWORD; do
  [[ -n "${!key:-}" ]] || { echo "환경 파일에 $key 이 필요합니다." >&2; exit 1; }
done

SOURCE_HOST="${QA_CLONE_SOURCE_HOST:-samhan-postgres}"
SOURCE_PORT="${QA_CLONE_SOURCE_PORT:-5432}"
IMAGE="${QA_CLONE_IMAGE:-postgres:16-alpine}"
CONTAINER="qa-clone-utf8-$(date +%Y%m%d%H%M%S)-$$"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qa-clone-utf8.XXXXXX")"
TARGET_PORT="${QA_CLONE_TARGET_PORT:-55432}"
cleanup() { set +e; docker rm -f "$CONTAINER" >/dev/null 2>&1; rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "[clone] isolated container: $CONTAINER"
docker run -d --name "$CONTAINER" -p "${TARGET_PORT}:5432" \
  -e POSTGRES_USER="$QA_CLONE_TARGET_USER" -e POSTGRES_PASSWORD="$QA_CLONE_TARGET_PASSWORD" \
  -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U "$QA_CLONE_TARGET_USER" -d postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U "$QA_CLONE_TARGET_USER" -d postgres >/dev/null

for db in "$@"; do
  dump="$TMP_DIR/$db.dump"
  echo "[clone] dumping $db from $SOURCE_HOST:$SOURCE_PORT"
  # custom-format 바이너리를 파일로 받는다. PowerShell 파이프는 사용하지 않는다.
  docker exec -e PGPASSWORD="$QA_CLONE_SOURCE_PASSWORD" samhan-postgres \
    pg_dump -h "$SOURCE_HOST" -p "$SOURCE_PORT" -U "$QA_CLONE_SOURCE_USER" -d "$db" -Fc > "$dump"
  docker exec "$CONTAINER" createdb -U "$QA_CLONE_TARGET_USER" "$db"
  docker cp "$dump" "$CONTAINER:/tmp/$db.dump" >/dev/null
  MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" pg_restore --no-owner --no-privileges -U "$QA_CLONE_TARGET_USER" -d "$db" "/tmp/$db.dump"
  echo "[clone] verifying UTF-8 content in $db"
  columns="$TMP_DIR/$db.columns"
  docker exec -e PGPASSWORD="$QA_CLONE_SOURCE_PASSWORD" samhan-postgres psql \
    -h "$SOURCE_HOST" -p "$SOURCE_PORT" -U "$QA_CLONE_SOURCE_USER" -d "$db" -At -F $'\t' \
    -c "SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE data_type IN ('text','character varying','character') AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3" > "$columns"
  found=0
  while IFS=$'\t' read -r schema table column; do
    [[ -n "$schema" ]] || continue
    source_sql="SELECT count(*) FILTER (WHERE \"$column\"::text ~ '[가-힣]'), count(*) FILTER (WHERE \"$column\"::text LIKE '%?%') FROM \"$schema\".\"$table\""
    source_result="$(docker exec -e PGPASSWORD="$QA_CLONE_SOURCE_PASSWORD" samhan-postgres psql -h "$SOURCE_HOST" -p "$SOURCE_PORT" -U "$QA_CLONE_SOURCE_USER" -d "$db" -At -F '|' -c "$source_sql")"
    source_korean="${source_result%%|*}"; source_question="${source_result##*|}"
    [[ "$source_korean" =~ ^[1-9][0-9]*$ ]] || continue
    found=1
    target_sql="SELECT count(*) FILTER (WHERE \"$column\"::text ~ '[가-힣]'), count(*) FILTER (WHERE \"$column\"::text LIKE '%?%') FROM \"$schema\".\"$table\""
    result="$(docker exec "$CONTAINER" psql -U "$QA_CLONE_TARGET_USER" -d "$db" -At -F '|' -c "$target_sql")"
    korean="${result%%|*}"; question="${result##*|}"
    if [[ "$korean" -lt "$source_korean" || "$question" -gt "$source_question" ]]; then
      sample="$(docker exec "$CONTAINER" psql -U "$QA_CLONE_TARGET_USER" -d "$db" -At -c "SELECT \"$column\"::text FROM \"$schema\".\"$table\" WHERE \"$column\"::text LIKE '%?%' OR \"$column\"::text ~ '[가-힣]' LIMIT 3")"
      echo "UTF-8 검증 실패: db=$db table=$schema.$table column=$column source_korean_rows=$source_korean target_korean_rows=$korean source_question_mark_rows=$source_question target_question_mark_rows=$question" >&2
      echo "  target sample: $sample" >&2
      exit 1
    fi
  done < "$columns"
  [[ "$found" == 1 ]] || echo "[clone] warning: source 한글 컬럼 없음: $db" >&2
  echo "[clone] PASS $db"
done
echo "[clone] PASS all databases; isolated container and dump files will be removed"
