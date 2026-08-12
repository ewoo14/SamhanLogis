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
RUN_ID="$(date +%s%N)-$$"
cleanup() { set +e; docker rm -f "$CONTAINER" >/dev/null 2>&1; rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "[clone] isolated container: $CONTAINER"
# Let Docker allocate the host port so concurrent clones cannot bind-race.
docker run -d --name "$CONTAINER" -p '127.0.0.1::5432' \
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
  # Keep the expected database unique even when the request includes a real
  # database named `${db}_expected` or another clone is running concurrently.
  expected_db="${db}__qa_expected_${RUN_ID}"
  if ((${#expected_db} > 63)); then
    expected_db="${expected_db:0:$((63 - ${#RUN_ID} - 14))}__qa_expected_${RUN_ID}"
  fi
  expected_snapshot="/tmp/$db.expected.sql"
  target_snapshot="/tmp/$db.target.sql"
  expected_schema="/tmp/$db.expected.schema.sql"
  target_schema="/tmp/$db.target.schema.sql"
  docker exec "$CONTAINER" createdb -U "$QA_CLONE_TARGET_USER" "$expected_db"
  MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" pg_restore \
    --no-owner --no-privileges -U "$QA_CLONE_TARGET_USER" -d "$expected_db" "/tmp/$db.dump"
  if ! MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" sh -c \
    "pg_dump -U '$QA_CLONE_TARGET_USER' -d '$expected_db' --format=plain --data-only --no-owner --no-privileges --no-comments > '$expected_snapshot'; pg_dump -U '$QA_CLONE_TARGET_USER' -d '$db' --format=plain --data-only --no-owner --no-privileges --no-comments > '$target_snapshot'; pg_dump -U '$QA_CLONE_TARGET_USER' -d '$expected_db' --format=plain --schema-only --no-owner --no-privileges > '$expected_schema'; pg_dump -U '$QA_CLONE_TARGET_USER' -d '$db' --format=plain --schema-only --no-owner --no-privileges > '$target_schema'; sed -i '/^\\\\restrict /d; /^\\\\unrestrict /d' '$expected_snapshot' '$target_snapshot' '$expected_schema' '$target_schema'; cmp -s '$expected_snapshot' '$target_snapshot' && cmp -s '$expected_schema' '$target_schema'"; then
    echo "UTF-8 검증 실패: db=$db 원본/복제본 스냅샷 불일치" >&2
    exit 1
  fi
  # Re-dump the target after the first comparison. This catches mutations
  # injected after the first snapshot, without ever re-reading the live source.
  # Hold SHARE ROW EXCLUSIVE locks while the final snapshots are taken and
  # compared. ACCESS SHARE (pg_dump/SELECT) remains possible, while INSERT /
  # UPDATE / DELETE and DDL cannot pass the handoff barrier.
  lock_sql="$TMP_DIR/$db.lock.sql"
  cat > "$lock_sql" <<'SQL'
BEGIN;
DO $$
DECLARE
  table_ref record;
BEGIN
  FOR table_ref IN
    SELECT schemaname, tablename
      FROM pg_catalog.pg_tables
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  LOOP
    EXECUTE format(
      'LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',
      table_ref.schemaname,
      table_ref.tablename
    );
  END LOOP;
END
$$;
SELECT pg_sleep(86400);
SQL
  docker cp "$lock_sql" "$CONTAINER:/tmp/$db.lock.sql" >/dev/null
  docker exec -d "$CONTAINER" sh -c \
    "psql -v ON_ERROR_STOP=1 -U '$QA_CLONE_TARGET_USER' -d '$db' -f '/tmp/$db.lock.sql' > '/tmp/$db.lock.log' 2>&1" >/dev/null
  for _ in $(seq 1 60); do
    locked="$(docker exec "$CONTAINER" psql -U "$QA_CLONE_TARGET_USER" -d "$db" -Atqc \
      "SELECT count(*) FROM pg_catalog.pg_locks WHERE locktype = 'relation' AND mode = 'ShareRowExclusiveLock' AND granted")"
    [[ "$locked" =~ ^[1-9][0-9]*$ ]] && break
    sleep 0.1
  done
  [[ "$locked" =~ ^[1-9][0-9]*$ ]] || {
    echo "UTF-8 검증 실패: db=$db 최종 검증 잠금 확보 실패" >&2
    exit 1
  }
  if ! MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" sh -c \
    "pg_dump -U '$QA_CLONE_TARGET_USER' -d '$db' --format=plain --data-only --no-owner --no-privileges --no-comments > '/tmp/$db.target.final.sql'; pg_dump -U '$QA_CLONE_TARGET_USER' -d '$db' --format=plain --schema-only --no-owner --no-privileges > '/tmp/$db.target.final.schema.sql'; sed -i '/^\\\\restrict /d; /^\\\\unrestrict /d' '/tmp/$db.target.final.sql' '/tmp/$db.target.final.schema.sql'; cmp -s '$expected_snapshot' '/tmp/$db.target.final.sql' && cmp -s '$expected_schema' '/tmp/$db.target.final.schema.sql'"; then
    echo "UTF-8 검증 실패: db=$db 원본/복제본 스냅샷 불일치 (최종 재검증)" >&2
    exit 1
  fi
  echo "[clone] PASS $db"
done
echo "[clone] PASS all databases; isolated container and dump files will be removed"
