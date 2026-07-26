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
resolve_qa_shots_dir() {
  local committed_dir="$1"
  local dir
  if [ -n "${QA_SHOTS_DIR:-}" ]; then
    dir="$QA_SHOTS_DIR"
  else
    dir="$committed_dir/_local"
  fi
  mkdir -p "$dir"
  printf '%s' "$dir"
}
