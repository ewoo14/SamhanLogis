#!/usr/bin/env bash
set -Euo pipefail

SOURCE_CONTAINER="samhan-postgres"
TARGET_CONTAINER="recon845-pg"
SOURCE_USER="samhan"
TARGET_USER="samhan"
DBS=(auth_db user_db groupware_db slip_db)
SERVICES=(recon845-gateway recon845-auth recon845-user recon845-groupware recon845-slip)
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/reconv2-845.XXXXXX")"

cleanup() {
  docker start "${SERVICES[@]}" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "SOURCE_CONTAINER=$SOURCE_CONTAINER"
echo "TARGET_CONTAINER=$TARGET_CONTAINER"
docker inspect "$SOURCE_CONTAINER" --format 'SOURCE={{.Name}}|IMAGE={{.Config.Image}}|STATUS={{.State.Status}}'
docker inspect "$TARGET_CONTAINER" --format 'TARGET={{.Name}}|IMAGE={{.Config.Image}}|STATUS={{.State.Status}}|NETWORKS={{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'

docker stop "${SERVICES[@]}" >/dev/null

for db in "${DBS[@]}"; do
  dump="$TMP_DIR/$db.dump"
  restore_log="$TMP_DIR/$db.restore.log"
  echo "DUMP_BEGIN=$db"
  docker exec "$SOURCE_CONTAINER" pg_dump -U "$SOURCE_USER" -d "$db" -Fc > "$dump"
  bytes="$(wc -c < "$dump" | tr -d ' ')"
  echo "DUMP_FILE=$db|BYTES=$bytes"
  docker exec "$TARGET_CONTAINER" dropdb -U "$TARGET_USER" --if-exists --force "$db"
  docker exec "$TARGET_CONTAINER" createdb -U "$TARGET_USER" "$db"
  docker cp "$dump" "$TARGET_CONTAINER:/tmp/$db.dump" >/dev/null
  set +e
  MSYS_NO_PATHCONV=1 docker exec "$TARGET_CONTAINER" pg_restore --no-owner --no-privileges -U "$TARGET_USER" -d "$db" "/tmp/$db.dump" >"$restore_log" 2>&1
  status=$?
  set -e
  errors="$(grep -c '^pg_restore: error:' "$restore_log" || true)"
  echo "RESTORE=$db|STATUS=$status|ERRORS=$errors"
  if [[ "$errors" != "0" ]]; then
    grep '^pg_restore: error:' "$restore_log"
  fi
  MSYS_NO_PATHCONV=1 docker exec "$TARGET_CONTAINER" rm -f "/tmp/$db.dump"

  columns="$TMP_DIR/$db.columns"
  docker exec "$SOURCE_CONTAINER" psql -U "$SOURCE_USER" -d "$db" -At -F $'\t' \
    -c "SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE data_type IN ('text','character varying','character') AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3" > "$columns"
  found=0
  checked=0
  while IFS=$'\t' read -r schema table column; do
    [[ -n "$schema" ]] || continue
    sql="SELECT count(*) FILTER (WHERE \"$column\"::text ~ '[가-힣]'), count(*) FILTER (WHERE \"$column\"::text LIKE '%?%') FROM \"$schema\".\"$table\""
    source_result="$(docker exec "$SOURCE_CONTAINER" psql -U "$SOURCE_USER" -d "$db" -At -F '|' -c "$sql")"
    source_korean="${source_result%%|*}"
    source_question="${source_result##*|}"
    [[ "$source_korean" =~ ^[1-9][0-9]*$ ]] || continue
    found=1
    checked=$((checked + 1))
    target_result="$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$db" -At -F '|' -c "$sql")"
    target_korean="${target_result%%|*}"
    target_question="${target_result##*|}"
    if [[ "$target_korean" -lt "$source_korean" || "$target_question" -gt "$source_question" ]]; then
      echo "UTF8_FAIL=$db|$schema.$table.$column|SOURCE_KO=$source_korean|TARGET_KO=$target_korean|SOURCE_Q=$source_question|TARGET_Q=$target_question"
      exit 20
    fi
  done < "$columns"
  echo "UTF8_VERIFY=$db|KOREAN_COLUMNS=$checked|FOUND=$found|PASS=true"
done

echo "SOURCE_GROUPWARE_SAMPLE_BEGIN"
docker exec "$SOURCE_CONTAINER" psql -U "$SOURCE_USER" -d groupware_db -At -c "SELECT title FROM approval_lines WHERE title ~ '[가-힣]' ORDER BY created_at DESC LIMIT 5"
echo "SOURCE_GROUPWARE_SAMPLE_END"
echo "TARGET_GROUPWARE_SAMPLE_BEGIN"
docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d groupware_db -At -c "SELECT title FROM approval_lines WHERE title ~ '[가-힣]' ORDER BY created_at DESC LIMIT 5"
echo "TARGET_GROUPWARE_SAMPLE_END"
echo "SOURCE_SLIP_SAMPLE_BEGIN"
docker exec "$SOURCE_CONTAINER" psql -U "$SOURCE_USER" -d slip_db -At -F '|' -c "SELECT product_name, model_name, specification FROM slip_lines WHERE product_name ~ '[가-힣]' ORDER BY created_at DESC LIMIT 5"
echo "SOURCE_SLIP_SAMPLE_END"
echo "TARGET_SLIP_SAMPLE_BEGIN"
docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d slip_db -At -F '|' -c "SELECT product_name, model_name, specification FROM slip_lines WHERE product_name ~ '[가-힣]' ORDER BY created_at DESC LIMIT 5"
echo "TARGET_SLIP_SAMPLE_END"

docker start "${SERVICES[@]}" >/dev/null
echo "CLONE_PASS=true"
