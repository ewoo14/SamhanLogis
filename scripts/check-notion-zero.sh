#!/usr/bin/env bash
# check-notion-zero.sh
# SP-08-7: Notion runtime 의존 zero 정적 가드
#
# 검사 대상:
#   clients/web/        (estimate-app 포함, shim 파일 제외)
#   clients/desktop/src/
#   clients/mobile-staff/src/
#   clients/arologis-desktop/src/   (2026-07-27 #851 R1 fix — arologis-ci.yml 전용 잡이
#                                     실제로 게이트하는 arologis 표면)
#   clients/arologis-mobile/src/    (상동)
#   services/*/src/main/
#   shared/*/src/main/               (2026-07-27 #851 R1 fix — services 와 동일한 Gradle
#                                     Java 모듈 레이아웃. arologis-ci.yml·ci.yml 둘 다
#                                     shared/** 변경에 트리거되므로 두 워크플로 모두 이제
#                                     이 표면을 실제로 검사한다)
#
# 검사 제외:
#   node_modules/ build/ dist/ *.d.ts
#   docs/ tools/legacy-gas/ tools/operational-validation/
#   clients/web/estimate-app/lib/apps-script-shim.js
#     → shim 은 Notion noop 차단 구현체. api.notion.com 문자열이
#       런타임 호출이 아닌 차단 목록 선언으로만 존재하여 허용.
#   clients/desktop/playwright/ (테스트 단언 코드)
#
# 종료 코드: 0=CLEAN, 1=VIOLATION

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PATTERNS=(
  'api\.notion\.com'
  'Notion-Version'
  '@notionhq/client'
  'notion-sdk'
  'NOTION_TOKEN'
  'NOTION_API_KEY'
  'NOTION_KEY'
)

SCAN_DIRS=(
  "clients/web"
  "clients/desktop/src"
  "clients/mobile-staff/src"
  "clients/arologis-desktop/src"
  "clients/arologis-mobile/src"
  "services"
  "shared"
)

INCLUDE_EXTS=(
  --include="*.ts"
  --include="*.tsx"
  --include="*.js"
  --include="*.jsx"
  --include="*.java"
  --include="*.kt"
  --include="*.yml"
  --include="*.yaml"
  --include="*.properties"
)

EXCLUDE_DIRS=(
  --exclude-dir=node_modules
  --exclude-dir=build
  --exclude-dir=dist
  --exclude-dir=".gradle"
)

EXCLUDE_FILES=(
  --exclude="*.d.ts"
  --exclude="*.md"
  --exclude="*.mdx"
)

# 화이트리스트 파일 (shim / 테스트 단언) — grep 후 필터링
WHITELIST_PATTERNS=(
  'clients/web/estimate-app/lib/apps-script-shim\.js'
  'clients/desktop/playwright/'
  'clients/web/estimate-app/playwright/'
)

build_pattern() {
  local joined
  joined=$(IFS='|'; echo "${PATTERNS[*]}")
  echo "$joined"
}

main() {
  local pattern
  pattern="$(build_pattern)"

  local found=0
  local violations=()

  for dir in "${SCAN_DIRS[@]}"; do
    local abs_dir="${REPO_ROOT}/${dir}"
    if [ ! -d "$abs_dir" ]; then
      continue
    fi

    # services·shared 디렉토리는 Gradle Java 모듈 레이아웃이라 src/main/ 하위만 검사
    local grep_path
    grep_path="${abs_dir}"
    if [ "$dir" = "services" ] || [ "$dir" = "shared" ]; then
      INCLUDE_EXTS+=(--include="*.java" --include="*.kt" --include="*.properties" --include="*.yml")
    fi

    while IFS= read -r line; do
      local file_path
      file_path=$(echo "$line" | cut -d: -f1)

      # 화이트리스트 필터
      local whitelisted=false
      for wl in "${WHITELIST_PATTERNS[@]}"; do
        if echo "$file_path" | grep -qE "$wl"; then
          whitelisted=true
          break
        fi
      done

      # services·shared 는 src/main/ 만 검사 (src/test/ 제외)
      if [ "$dir" = "services" ] || [ "$dir" = "shared" ]; then
        if ! echo "$file_path" | grep -q "src/main/"; then
          continue
        fi
      fi

      if [ "$whitelisted" = false ]; then
        found=1
        violations+=("$line")
      fi
    done < <(grep -rEn "${EXCLUDE_DIRS[@]}" "${EXCLUDE_FILES[@]}" "${INCLUDE_EXTS[@]}" \
               -e "$pattern" "$grep_path" 2>/dev/null || true)
  done

  if [ "${#violations[@]}" -gt 0 ]; then
    echo "============================================================"
    echo "[FAIL] Notion runtime 의존 발견 — SP-08-7 정책 위반"
    echo "============================================================"
    for v in "${violations[@]}"; do
      echo "  VIOLATION: $v"
    done
    echo ""
    echo "처리 지침:"
    echo "  - 실제 Notion API 호출: 즉시 제거 후 SamhanLogis MS 엔드포인트로 대체"
    echo "  - noop/shim 차단 목적: tools/legacy-gas/ 또는 apps-script-shim.js 이동"
    echo "  - 환경변수 선언: 제거 또는 .env.example 주석 처리"
    echo "  - 예외 승인 필요 시: DevOps에게 화이트리스트 추가 요청"
    echo "============================================================"
    exit 1
  fi

  echo "[PASS] Notion runtime 의존 zero 확인 완료 — 위반 없음"
  exit 0
}

main "$@"
