#!/usr/bin/env bash
# QA 라이브 캡처 저장 경로 결정 (Bash 버전, 루트 공유).
#
# scripts/lib/qa-shots-dir.{cjs,mjs,py} 와 동일 계약이다 — 그 파일들은 Node/Python 전용이라,
# curl/tee 로 evidence 를 직접 쓰는 docs/qa/**/*.sh 스크립트는 이 Bash 버전을 source 한다
# (2026-07-27 하네스 흡수 H2 — docs/qa/dev-menu-dev2/backend-qa.sh 편입).
#
# 기본값은 커밋된 디렉토리 밑의 `_local/` 서브폴더(`.gitignore` 의 `**/_local/` 규칙으로
# 항상 제외 대상)다. 의도적으로 새 확정 증거를 남기려면 QA_SHOTS_DIR 환경변수로 원하는
# 경로를 명시적으로 지정한다.
#
# 사용법:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SCRIPT_DIR/../../scripts/lib/qa-shots-dir.sh"
#   OUT="$(resolve_qa_shots_dir "$SCRIPT_DIR")"
_qa_has_explicit_overwrite_intent() {
  case "${QA_ALLOW_OVERWRITE:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

_qa_physical_path() {
  local candidate="$1"
  if command -v realpath >/dev/null 2>&1; then
    realpath -m -- "$candidate"
  else
    readlink -f -- "$candidate"
  fi
}

_qa_is_within_physical() {
  local parent
  local candidate
  parent="$(_qa_physical_path "$1")"
  candidate="$(_qa_physical_path "$2")"
  case "$candidate" in
    "$parent"|"$parent"/*) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_qa_shots_dir() {
  local committed_dir="$1"
  local dir
  if [ -n "${QA_SHOTS_DIR:-}" ]; then
    dir="$(_qa_physical_path "$QA_SHOTS_DIR")"
  else
    dir="$(_qa_physical_path "$committed_dir/_local")"
  fi

  local script_dir
  local docs_qa_root
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
  docs_qa_root="$(_qa_physical_path "$script_dir/../../docs/qa")"

  if [ -n "${QA_SHOTS_DIR:-}" ] && _qa_is_within_physical "$docs_qa_root" "$dir" && ! _qa_has_explicit_overwrite_intent; then
    printf '%s\n' "[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: $dir. 명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오." >&2
    return 1
  fi

  mkdir -p "$dir"
  printf '%s' "$dir"
}
