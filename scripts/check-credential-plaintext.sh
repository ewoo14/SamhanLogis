#!/usr/bin/env bash
# check-credential-plaintext.sh
# SP-08-8: 자격 평문 비공개 정적 가드
#
# 검사 대상:
#   docs/qa/sp-08-*/          (QA 결과 문서)
#   docs/dev-reports/sp-08-*.md
#   docs/operational-validation/*.md
#   migration/decisions/*.md
#   clients/desktop/playwright/
#   services/*/src/main/
#   clients/{desktop,mobile-staff,arologis-desktop,arologis-mobile}/src/
#
# 금지 패턴:
#   1. NOTION_TOKEN / NOTION_API_KEY  (SP-08-7 일관)
#   2. AWS Access Key  AKIA[0-9A-Z]{16}
#   3. OpenAI Key  sk-[A-Za-z0-9]{20,}
#   4. JWT eyJ…(header.payload.sig)
#   5. Google Sheet ID 평문  1[A-Za-z0-9_-]{43,}  (44자 이상 base62)
#   6. Aligo API Key 직접 대입  ALIGO_KEY=<실값>
#   6b. Aligo UserID 직접 대입  ALIGO_USERID=<실값> / ALIGO_USER_ID=<실값>
#   7. 사업자등록번호 평문 — 픽스처/공개법인/시드 제외
#   8. 한국 전화번호 평문 — 픽스처/placeholder 제외
#
# 화이트리스트:
#   - clients/desktop/playwright/           (테스트 단언 코드)
#   - clients/web/estimate-app/lib/apps-script-shim.js
#   - tools/operational-validation/        ※ 통째 제외 폐기 (Fix 2c) — line 단위 placeholder 예외만 적용
#   - services/*/bin/                      (빌드 산출물)
#   - services/*/src/test/                 (테스트 픽스처)
#   - clients/*/src/renderer/api/mock.ts   (프론트 mock 픽스처)
#   - clients/*/src/renderer/api/excelExportMock.ts
#   - services/*/db/migration/V*__seed_*.sql (시드 데이터)
#   - *.d.ts, node_modules/, build/, dist/, .gradle/, out/
#   - docs/dev-reports/sp-08-8-*           (본 가드 보고서 자체 제외)
#   - .claude/memory/                      (메모리 파일 — UUIDs 정상)
#   - docs/qa/sp-09-2-aligo-sms-real-send/ (review 문서 — 예시 값 포함, 실 자격 아님)
#   - line 단위 허용: PLACEHOLDER_DEV_ONLY / SET_BY_OPS_PC / ${ENV_VAR} / $ENV: / dummy- / example- prefix
#
# 종료 코드: 0=CLEAN, 1=VIOLATION

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── 패턴 정의 ───────────────────────────────────────────────────────────────

# (1) Notion key 명칭 직접 대입 — 값 없이 선언만인 경우는 제외
PATTERN_NOTION="(NOTION_TOKEN(_[A-Za-z0-9_]+)?|NOTION_API_KEY(_[A-Za-z0-9_]+)?)\s*=\s*['\"]?(ntn_|secret_)[A-Za-z0-9_-]{8,}['\"]?"

# (2) AWS Access Key
PATTERN_AWS='AKIA[0-9A-Z]{16}'

# (3) OpenAI Key
PATTERN_OPENAI='sk-[A-Za-z0-9]{20,}'

# (4) JWT (header.payload.signature 3-part)
PATTERN_JWT='eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+'

# (5) Google Sheet ID 평문 (44자 이상 base62 시작 1)
PATTERN_SHEET_ID='1[A-Za-z0-9_-]{43,}'

# (6) Aligo 자격 직접 대입
#   ALIGO_KEY  — API 키 (SAMHAN_ALIGO_KEY 포함: substring 탐지)
#   ALIGO_USERID / ALIGO_USER_ID — Aligo 계정 ID (별도 패턴 필요: ALIGO_KEY 로 미포함)
PATTERN_ALIGO='ALIGO_KEY\s*=\s*[^$\s{"\x27][^\s]*'
PATTERN_ALIGO_USERID='ALIGO_USER(ID|_ID)\s*=\s*[^$\s{"\x27][^\s]*'

# (7) KFTC 오픈뱅킹 자격 직접 대입 (SP-09-4)
#   KFTC_API_KEY / KFTC_CLIENT_ID / KFTC_CLIENT_SECRET
PATTERN_KFTC='KFTC_(API_KEY|CLIENT_ID|CLIENT_SECRET)\s*=\s*[^$\s{"\x27][^\s]*'

# (7b) CODEF 은행·카드 거래내역 자격 직접 대입 (BC1)
#   CODEF_API_KEY / CODEF_CLIENT_ID / CODEF_CLIENT_SECRET / CODEF_PUBLIC_KEY
PATTERN_CODEF='CODEF_(API_KEY|CLIENT_ID|CLIENT_SECRET|PUBLIC_KEY)\s*=\s*[^$\s{"\x27][^\s]*'

# (8) 인성데이타 퀵프로그램 자격 직접 대입 (SP-10-2)
#   INSUNG_QUICK_API_KEY / INSUNG_QUICK_API_URL / INSUNG_QUICK_PARTNER_ID / INSUNG_QUICK_WEBHOOK_SECRET
#   SAMHAN_INSUNG_* prefix 포함 (substring 탐지).
#   빈 값 의무 — placeholder 자체도 금지 (KFTC 패턴 일관).
PATTERN_INSUNG='INSUNG_(QUICK_)?(API_KEY|API_URL|PARTNER_ID|WEBHOOK_SECRET)\s*=\s*[^$\s{"\x27][^\s]*'

# (9) 개발 QA 계정 비밀번호 — 값은 infrastructure/.env.local 로 분리한다.
PATTERN_DEV_QA='dev_p05_pass!?|samhan!2026|admin1234'

# ─── 스캔 디렉토리 ────────────────────────────────────────────────────────────

CODE_DIRS=(
  "services"
  "clients/desktop/src"
  "clients/mobile-staff/src"
  "clients/arologis-desktop/src"
  "clients/arologis-mobile/src"
  "clients/web"
  "tools/legacy-gas"
)

# 🚨 2026-07-27 재수렴 7차 — `docs/handoff` 추가.
#   sp-08-3-dispatch-parity.spec.ts 가 secret-like 마커를 스캔하는 대상 6개 중
#   `docs/handoff/CURRENT-WORK.md` 만 이 배열에 없었다. 그래서 실 AWS 키 형태를 넣어도
#   이 스크립트는 EXIT=0 이었고(실측), 그 파일의 자격 스캔을 담당하는 유일한 장치가
#   **게이트 0 인 playwright 스펙** 하나였다. `CURRENT-WORK.md` 는 CLAUDE.md 가
#   "PC 이동 직전 반드시 갱신" 으로 규정한 매 세션 **main 직행** 경로다.
#   🔒 여기 추가한 루트를 발동시키는 워크플로가 이 스크립트를 실제로 실행하지 않으면
#   harness-false-green-guard.test.ts 의 G11 이 RED 다(docs-guard.yml 이 그 러너다).
#
# ⚠️ 같은 스캔 대상인 `docs/planning` 은 **일부러 넣지 않았다** — 넣으면
#   `docs/planning/2026-05-19_sp-10-2-insung-quick-program.md:71` 이 INSUNG_QUICK 으로 걸리는데,
#   그건 마크다운 닫는 백틱(`…WEBHOOK_SECRET=` +  ` ` `) 때문에 생기는 **기존 오탐**이다
#   (문서 본문은 "빈 값 유지" 를 지시한다). 해소하려면 파일 화이트리스트를 늘리거나
#   PATTERN_* 의 제외 문자류에 백틱을 넣어야 하는데, 둘 다 이번 축(=관할↔러너 정합)이 아니라
#   자격 가드의 판정 의미를 바꾸는 별건이다. `docs/manual` 은 애초에 secret 스캔 대상이 아니다
#   (sp-05·purchase-inspection-cta 가 읽는 것은 본문 계약이지 자격이 아니다).
DOC_DIRS=(
  "docs/qa"
  "docs/dev-reports"
  "docs/handoff"
  "docs/operational-validation"
  "migration/decisions"
  "clients/desktop/playwright"
  "tools/operational-validation"
)

# ─── 화이트리스트 ─────────────────────────────────────────────────────────────

WHITELIST_PATTERNS=(
  'clients/desktop/playwright/'
  'clients/web/estimate-app/lib/apps-script-shim\.js'
  'services/.*/bin/'
  'services/.*/src/test/'
  'clients/.*/src/renderer/api/mock\.ts'
  'clients/.*/src/renderer/api/excelExportMock\.ts'
  'db/migration/V[0-9]+__seed_'
  'docs/dev-reports/sp-08-8-'
  '\.claude/memory/'
  'docs/qa/sp-09-2-aligo-sms-real-send/'
  'docs/qa/sp-09-3-ocr-receipt-shell/'
  'docs/qa/sp-09-4-kftc-shell/'
  'docs/qa/sp-09-5-phase9-integration/'
  'docs/dev-reports/sp-09-summary\.md'
  'docs/dev-reports/sp-09-5-vendor-integration-summary\.md'
  'docs/qa/sp-10-2-insung-quick-vendor/'
  'docs/operational-validation/sp-10-2-insung-key-rotation\.md'
)
# tools/operational-validation/ 은 통째 화이트리스트 제외 폐기 (Fix 2c).
# 대신 scan_pattern 내 line 단위 placeholder 필터로만 허용.

# ─── 확장자 필터 ─────────────────────────────────────────────────────────────

CODE_EXTS=(
  --include="*.ts"
  --include="*.tsx"
  --include="*.js"
  --include="*.jsx"
  --include="*.java"
  --include="*.kt"
  --include="*.yml"
  --include="*.yaml"
  --include="*.properties"
  --include="*.sh"
  --include="*.ps1"
)

DOC_EXTS=(
  --include="*.md"
  --include="*.mdx"
  --include="*.log"
)

EXCLUDE_DIRS=(
  --exclude-dir=node_modules
  --exclude-dir=build
  --exclude-dir=dist
  --exclude-dir=".gradle"
  --exclude-dir=out
  --exclude-dir=".git"
)

EXCLUDE_FILES=(
  --exclude="*.d.ts"
)

# ─── 유틸 함수 ────────────────────────────────────────────────────────────────

is_whitelisted() {
  local file_path="$1"
  for wl in "${WHITELIST_PATTERNS[@]}"; do
    if echo "$file_path" | grep -qE "$wl"; then
      return 0
    fi
  done
  return 1
}

scan_pattern() {
  local pattern="$1"
  local label="$2"
  local found_ref="$3"   # nameref — bash 4.3+
  local dirs=("${@:4}")

  local ext_flags=()
  # DOC_DIRS 에 해당하면 DOC_EXTS, 아니면 CODE_EXTS 사용
  for d in "${dirs[@]}"; do
    local abs_d="${REPO_ROOT}/${d}"
    [ -d "$abs_d" ] || continue

    local exts=("${CODE_EXTS[@]}")
    # docs/ 하위는 md/mdx 포함 추가
    if echo "$d" | grep -qE '^docs/|^clients/desktop/playwright'; then
      exts+=("${DOC_EXTS[@]}")
    fi

    while IFS= read -r line; do
      local file_path
      file_path=$(echo "$line" | cut -d: -f1)

      is_whitelisted "$file_path" && continue

      # services 는 src/main/ 만 검사
      if echo "$d" | grep -q "^services"; then
        echo "$file_path" | grep -q "src/main/" || continue
      fi

      # placeholder 키워드 있는 줄 허용 — 단 KFTC 레이블은 예외 없이 차단:
      #   KFTC 는 외부 vendor 자격이므로 placeholder 사용 자체가 정책 위반.
      #   env-template 에는 반드시 빈 값(=) 유지. placeholder 사용 금지.
      #
      # 일반 패턴 허용:
      #   - PLACEHOLDER_DEV_ONLY / SET_BY_OPS_PC   (표준 placeholder 형식)
      #   - ${ENV_VAR:...} / $ENV:VAR              (환경변수 참조)
      #   - dummy- / example- prefix 값            (명백한 예시 값)
      #   - <MASK> 형식 마스킹                     (문서 마스킹 표기)
      #   - REDACTED_*                             (저장소 자격 placeholder)
      if [ "$label" != "KFTC" ] && [ "$label" != "CODEF" ] && [ "$label" != "INSUNG_QUICK" ]; then
        if echo "$line" | grep -qE 'PLACEHOLDER_DEV_ONLY|SET_BY_OPS_PC|\$\{|\$ENV:|dummy-|example-|<[A-Z_]+>|REDACTED_[A-Z0-9_]+'; then
          continue
        fi
      fi

      printf '%s\n' "  [${label}] ${line}"
      eval "${found_ref}=1"
    done < <(grep -rEn "${EXCLUDE_DIRS[@]}" "${EXCLUDE_FILES[@]}" "${exts[@]}" \
               -e "$pattern" "$abs_d" 2>/dev/null || true)
  done
}

# ─── Sheet ID 스캔: 코드베이스 내 환경변수 default 값으로 삽입된 경우 검사 ──

scan_sheet_id_in_code() {
  local found_ref="$1"
  local abs_dir

  # application.yml 내 default 값으로 직접 박힌 경우만 탐지
  # 패턴: sheet-id: ${VAR:1RJqO3...} 또는 sheet-id: 1RJqO3...
  # 화이트리스트: docs/ 와 테스트 파일에서 reference 문서 내 mention 은 제외
  # 단, src/main/resources/application.yml 내 default 값 존재는 허용
  # (BOOTSTRAP_SHEET_ID 환경변수로 오버라이드 가능하므로 정보 노출 낮음)
  # → 신규 hardcode 삽입 방지 목적으로 docs/ + playwright 만 검사
  for dir in "docs/operational-validation" "docs/dev-reports" "docs/qa"; do
    abs_dir="${REPO_ROOT}/${dir}"
    [ -d "$abs_dir" ] || continue

    while IFS= read -r line; do
      local file_path
      file_path=$(echo "$line" | cut -d: -f1)
      is_whitelisted "$file_path" && continue

      # 문서 내 단순 mention (URL, 괄호 안 값) 은 정보 노출 위험 낮아 허용
      # 단, 환경변수 대입 형태 GOOGLE_SHEETS_SHEET_ID=1RJqO3... 는 위반
      if echo "$line" | grep -qE 'GOOGLE_SHEETS_SHEET_ID\s*=\s*1[A-Za-z0-9_-]{43}'; then
        printf '%s\n' "  [SHEET_ID_ASSIGN] ${line}"
        eval "${found_ref}=1"
      fi
    done < <(grep -rEn "${EXCLUDE_DIRS[@]}" --include="*.md" --include="*.mdx" \
               -e 'GOOGLE_SHEETS_SHEET_ID\s*=\s*1[A-Za-z0-9_-]{43}' "$abs_dir" 2>/dev/null || true)
  done
}

# ─── 메인 ─────────────────────────────────────────────────────────────────────

main() {
  local found=0

  echo "============================================================"
  echo " SP-08-8 자격 평문 비공개 가드 — 검사 시작"
  echo "============================================================"

  # S1 좁은 검증: 전체 레거시 패턴/서비스 스캔 없이 docs와 memory만 검사한다.
  if [ "${CREDENTIAL_GUARD_SCOPE:-}" = "s1" ]; then
    while IFS= read -r line; do
      printf '%s\n' "  [DEV_QA_PASSWORD_S1] ${line}"
      found=1
    done < <(git -C "$REPO_ROOT" grep -n -I -E "$PATTERN_DEV_QA" -- docs .claude/memory 2>/dev/null || true)

    if [ "$found" -eq 1 ]; then
      echo " [FAIL] S1 docs/memory 개발 QA 평문 발견"
      exit 1
    fi
    echo " [PASS] S1 docs/memory 개발 QA 평문 없음"
    exit 0
  fi

  # 1) Notion key 직접 대입
  scan_pattern "$PATTERN_NOTION" "NOTION_KEY" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 2) AWS Access Key
  scan_pattern "$PATTERN_AWS" "AWS_KEY" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 3) OpenAI Key
  scan_pattern "$PATTERN_OPENAI" "OPENAI_KEY" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 4) JWT
  scan_pattern "$PATTERN_JWT" "JWT_TOKEN" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 5) Aligo API Key 직접 대입
  scan_pattern "$PATTERN_ALIGO" "ALIGO_KEY" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 5b) Aligo UserID 직접 대입 (ALIGO_KEY 패턴으로 미탐지되는 ALIGO_USERID / ALIGO_USER_ID)
  scan_pattern "$PATTERN_ALIGO_USERID" "ALIGO_USERID" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 5c) KFTC 오픈뱅킹 자격 직접 대입 (SP-09-4)
  scan_pattern "$PATTERN_KFTC" "KFTC" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 5d) CODEF 은행·카드 거래내역 자격 직접 대입 (BC1)
  scan_pattern "$PATTERN_CODEF" "CODEF" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 5e) 인성데이타 퀵프로그램 자격 직접 대입 (SP-10-2)
  scan_pattern "$PATTERN_INSUNG" "INSUNG_QUICK" found \
    "${CODE_DIRS[@]}" "${DOC_DIRS[@]}"

  # 5f) 개발 QA 계정 비밀번호
  scan_pattern "$PATTERN_DEV_QA" "DEV_QA_PASSWORD" found \
    "${DOC_DIRS[@]}"

  # S1 확장: docs 및 운영 규칙 memory도 같은 개발 QA 평문 패턴으로 직접 검사한다.
  # 기존 is_whitelisted()의 memory 예외는 vendor/API 패턴에만 적용하고, S1 패턴은 예외 없이 검사한다.
  while IFS= read -r line; do
    printf '%s\n' "  [DEV_QA_PASSWORD_MEMORY] ${line}"
    found=1
  done < <(grep -rEn --exclude-dir=.git -e "$PATTERN_DEV_QA" \
    "$REPO_ROOT/docs" "$REPO_ROOT/.claude/memory" 2>/dev/null || true)

  # 6) Sheet ID 환경변수 직접 대입 (docs 영역만)
  scan_sheet_id_in_code found

  if [ "$found" -eq 1 ]; then
    echo ""
    echo "============================================================"
    echo " [FAIL] 자격 평문 비공개 정책 위반 — SP-08-8"
    echo "============================================================"
    echo ""
    echo " 처리 지침:"
    echo "   - 실 API 키/토큰: 즉시 제거 + .env 분리 + .gitignore 추가"
    echo "   - 일반 서비스 자격 (Aligo/Notion): PLACEHOLDER_DEV_ONLY 또는 SET_BY_OPS_PC 대체"
    echo "   - 외부 vendor 자격 [KFTC / INSUNG_QUICK]: 빈 값(=) 또는 AWS SSM Parameter Store 참조로 대체"
    echo "     (KFTC / INSUNG_QUICK 는 placeholder 자체도 금지 — env-template 은 반드시 빈 값 유지)"
    echo "   - 문서 mention: 값 제거 후 '<SHEET_ID>' 등 마스킹 처리"
    echo "   - 예외 승인 필요 시: DevOps 에게 화이트리스트 추가 요청"
    echo "============================================================"
    exit 1
  fi

  echo ""
  echo " [PASS] 자격 평문 비공개 — 위반 없음"
  echo "============================================================"
  exit 0
}

main "$@"
