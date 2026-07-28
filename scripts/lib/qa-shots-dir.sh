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

# 2026-07-28 R4 재수렴 결함3: 자기 자신을 가리키는 UNC admin-share
# (\\localhost\D$\..., \\127.0.0.1\D$\..., \\<호스트명>\D$\...)를 등가의 드라이브
# 문자 표기(D:\...)로 통일한다 — cygpath/realpath 는 순수 lexical 변환이라 "로컬
# admin-share = 로컬 드라이브" 지식이 없다(실측: cygpath -u 가 //localhost/C$/... 로만
# 바꾸고 /c/... 로는 통일하지 않는다 — DOCS_QA_ROOT 는 항상 /c/... 형태로 계산되므로
# 문자열이 달라 포함 판정이 통과해버린다). 다른 호스트를 가리키는 admin-share 는
# 실제로 다른 물리 머신이므로 변환하지 않는다. cygpath 부재(순수 Linux)에서는 이
# 표기 자체가 의미 없으므로(대소문자 폴딩과 같은 환경 신호) 건드리지 않는다.
_qa_normalize_unc_admin_share() {
  local candidate="$1"
  local unc_admin_share_re='^\\\\([^\\]+)\\([A-Za-z])\$(\\.*)?$'
  if command -v cygpath >/dev/null 2>&1 && [[ "$candidate" =~ $unc_admin_share_re ]]; then
    local host drive rest self_host
    host="$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
    drive="${BASH_REMATCH[2]}"
    rest="${BASH_REMATCH[3]:-\\}"
    self_host="$(printf '%s' "${HOSTNAME:-}" | tr '[:upper:]' '[:lower:]')"
    case "$host" in
      localhost|127.0.0.1|.)
        printf '%s:%s' "$drive" "$rest"
        return 0
        ;;
    esac
    if [ -n "$self_host" ] && [ "$host" = "$self_host" ]; then
      printf '%s:%s' "$drive" "$rest"
      return 0
    fi
  fi
  printf '%s' "$candidate"
}

_qa_physical_path() {
  local candidate="$1"
  candidate="$(_qa_normalize_unc_admin_share "$candidate")"
  local resolved
  if command -v realpath >/dev/null 2>&1; then
    resolved="$(realpath -m -- "$candidate")"
  else
    resolved="$(readlink -f -- "$candidate")"
  fi
  # D-2 (2026-07-28 R1 적대검증): MSYS/Git-Bash 환경에서 realpath -m 은 입력 표기를
  # 그대로 보존한다 — POSIX 입력(`/c/...`)은 POSIX로, Windows 입력(`C:\...`, `C:/...`)은
  # Windows 형식(`C:/...`)으로 남는다. 반면 이 파일의 다른 호출부는 `pwd -P` 로 항상
  # POSIX 형식을 만들어 두 값이 바이트 단위로 어긋났다(실측: win-backslash/win-fwdslash
  # 둘 다 차단 실패). cygpath 가 있으면(MSYS/Cygwin 환경의 신호 — 순수 Linux 에는 없다)
  # POSIX 정규형으로 통일해 비교 기준을 하나로 맞춘다. 존재하지 않는 하위 경로에도
  # 동작해야 하므로(realpath -m 과 동일 계약) cygpath 실패 시 원래 값으로 폴백한다.
  if command -v cygpath >/dev/null 2>&1; then
    resolved="$(cygpath -u -- "$resolved" 2>/dev/null)" || resolved="$(realpath -m -- "$candidate" 2>/dev/null || readlink -f -- "$candidate")"
  fi
  printf '%s' "$resolved"
}

# Windows(NTFS/MSYS) 파일시스템은 대소문자를 구분하지 않는다 — 같은 근거로 win32
# 분기를 쓰는 .cjs/.mjs/.ts/.ps1 resolver 와 대칭(D-2). cygpath 존재를 그 환경 신호로
# 쓴다: 순수 Linux(CI)에는 cygpath 가 없고 그 파일시스템은 대소문자를 구분하므로
# 원래 표기를 그대로 비교해야 한다(대문자 표기가 실제로 "다른" 이름일 수 있다).
_qa_casefold_if_windows() {
  if command -v cygpath >/dev/null 2>&1; then
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
  else
    printf '%s' "$1"
  fi
}

_qa_is_within_physical() {
  local parent
  local candidate
  parent="$(_qa_casefold_if_windows "$(_qa_physical_path "$1")")"
  candidate="$(_qa_casefold_if_windows "$(_qa_physical_path "$2")")"
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
