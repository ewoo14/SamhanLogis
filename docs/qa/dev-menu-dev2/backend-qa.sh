#!/usr/bin/env bash
set -uo pipefail
GW=http://127.0.0.1:8080
SCR="C:/Users/user/AppData/Local/Temp/claude/C--dev-Samhan-Public/041c1826-13c2-4f84-96a4-45004098b316/scratchpad"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QA_DEV_DEFAULT_PASSWORD="$(node -e "const { resolveQaCredential } = require(process.argv[1]); process.stdout.write(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))" "$SCRIPT_DIR/../../../scripts/lib/qa-credentials.cjs")"
source "$SCRIPT_DIR/../../../scripts/lib/qa-shots-dir.sh"
# _local 격리(2026-07-27 하네스 흡수 H2 — 기존 하드코딩 절대경로가 커밋된 backend-real-qa.md 를
# 직접 가리켰다. resolve_qa_shots_dir 가 mkdir -p 도 겸한다).
if ! OUT="$(resolve_qa_shots_dir "$SCRIPT_DIR")"; then
  echo '[QA 출력 경로 가드] 출력 경로 판정에 실패해 QA를 중단합니다.' >&2
  exit 1
fi
if [ -z "$OUT" ]; then
  echo '[QA 출력 경로 가드] resolver가 빈 출력 경로를 반환해 QA를 중단합니다.' >&2
  exit 1
fi
EV="$OUT/backend-real-qa.md"

log(){ echo "$@" | tee -a "$EV"; }
: > "$EV"
log "# DEV-2 팝업공지 — Codex 라운드 실서버 QA (mock OFF · 실 게이트웨이:8080 JWT · 실 dashboard · 실 PG)"
log ""
log "재빌드 dashboard(323d7ad67+3922666d7), profile=dev, MinIO 비활성(Noop). 로그인=dev_master(MASTER)."
log ""

# 1) 로그인
TOKEN=$(curl -s -X POST "$GW/api/v1/auth/login" -H "Content-Type: application/json" \
  -d '{"loginId":"dev_master","password":"'"${QA_DEV_DEFAULT_PASSWORD}"'"}' | grep -oP '"token":"\K[^"]+')
if [ -z "${TOKEN:-}" ]; then log "로그인 실패 — 토큰 없음"; exit 1; fi
AUTH="Authorization: Bearer $TOKEN"
log "## 1) 로그인 OK (dev_master=MASTER, JWT 발급)"
log ""

# 2) 공지 등록 (CREATE 권한)
# 한글 본문은 UTF-8 파일로 전달(인라인 -d 는 Git Bash 에서 인코딩 깨짐)
CREATE=$(curl -s -H "$AUTH" -H "Content-Type: application/json; charset=UTF-8" -X POST "$GW/app/notices" \
  --data-binary @"$SCR/create.json")
NID=$(echo "$CREATE" | grep -oP '"id":"\K[^"]+' | head -1)
log "## 2) 공지 등록 (POST /app/notices) → noticeId=$NID"
log '```json'; log "$CREATE"; log '```'; log ""

# 3) magic-byte 검증: 가짜 바이트 + content-type image/png → 4xx 거부 (M-2)
printf 'this-is-NOT-a-real-png-just-text' > "$SCR/fake.png"
FAKE=$(curl -s -w "\n[HTTP %{http_code}]" -H "$AUTH" \
  -F "file=@$SCR/fake.png;type=image/png" -F "caption=QA-fake-image" "$GW/app/notices/$NID/images")
log "## 3) magic-byte 검증 — 가짜 바이트+image/png 업로드 → 거부 기대 (M-2)"
log '```'; log "$FAKE"; log '```'; log ""

# 4) 정상 PNG 업로드 → 200 + 원본 fileName (M-6) + placeholder URL (Noop graceful=M-4, key 미노출=B-1)
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=" | base64 -d > "$SCR/notice.png"
REAL=$(curl -s -w "\n[HTTP %{http_code}]" -H "$AUTH" \
  -F "file=@$SCR/notice.png;type=image/png" -F "caption=QA-real-banner" "$GW/app/notices/$NID/images")
log "## 4) 정상 PNG 업로드 → 200 + 원본 fileName(notice.png)=M-6 + placeholder URL(Noop graceful=M-4·key 미노출=B-1)"
log '```'; log "$REAL"; log '```'; log ""

# 5) admin 목록 → fileName 필드 존재 (M-6)
LIST=$(curl -s -H "$AUTH" "$GW/app/notices")
log "## 5) admin 목록 (GET /app/notices) — fileName(원본명) 노출 확인 (M-6)"
log '```json'; log "$LIST"; log '```'; log ""

# 6) active 조회 → imageUrl=placeholder, object key('app-notices/') 미노출 (B-1)
ACTIVE=$(curl -s -H "$AUTH" "$GW/app/notices/active")
log "## 6) active 조회 (GET /app/notices/active) — imageUrl=placeholder, object key 미노출 (B-1)"
log '```json'; log "$ACTIVE"; log '```'; log ""
if echo "$ACTIVE" | grep -q 'app-notices/'; then log "⚠️ object key 노출 감지"; else log "✅ active 응답에 object key('app-notices/') 미노출"; fi
log ""

# 7) cleanup — soft delete
DEL=$(curl -s -w "[HTTP %{http_code}]" -H "$AUTH" -H "X-User-Id: a0000000-0000-0000-0000-000000000001" -X DELETE "$GW/app/notices/$NID")
log "## 7) cleanup soft-delete → $DEL"
log ""
log "_생성 공지는 soft-delete 로 정리._"
echo "=== EVIDENCE WRITTEN: $EV ==="
