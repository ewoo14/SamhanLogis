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

# 2026-07-28 R4 재수렴 결함3 + R5 재수렴 결함1/3: 자기 자신을 가리키는 UNC admin-share
# (\\localhost\D$\..., \\127.0.0.1\D$\..., \\<호스트명>\D$\..., \\<자기 LAN IP>\D$\...,
# 슬래시/혼합 표기 포함)를 등가의 드라이브 문자 표기(D:\...)로 통일한다 — cygpath/realpath
# 는 순수 lexical 변환이라 "로컬 admin-share = 로컬 드라이브" 지식이 없다(실측: cygpath -u
# 가 //localhost/C$/... 로만 바꾸고 /c/... 로는 통일하지 않는다 — DOCS_QA_ROOT 는 항상
# /c/... 형태로 계산되므로 문자열이 달라 포함 판정이 통과해버린다). 다른 호스트를 가리키는
# admin-share 는 실제로 다른 물리 머신이므로 변환하지 않는다. cygpath 부재(순수 Linux)에서는
# 이 표기 자체가 의미 없으므로(대소문자 폴딩과 같은 환경 신호) 건드리지 않는다.
#
# R5 결함1(재현: //localhost/C$/... 가 통과) — 정규식이 리터럴 백슬래시만 매치해 슬래시
# (//host/C$/...)·혼합(\\host\C$/...) 표기는 매치 자체가 안 됐다. [\\/] 문자 클래스로
# 두 구분자를 모두 받아들인다.
# R5 결함3(재현: 자기 LAN IP UNC 가 10개 사본 전부를 통과) — localhost/127.0.0.1/hostname
# 고정 목록은 "열거"라서 어댑터가 늘 때마다 다시 뚫린다. ipconfig(로컬 전용 조회 — 원격
# 접속 없음)로 이 머신에 실제 바인딩된 IPv4 주소 전부를 모아 대조한다.
_qa_self_lan_addresses() {
  # Windows ipconfig 출력에서 IPv4 주소만 추출한다(로케일 무관 — 값 자체는 숫자.숫자
  # 형태라 번역되지 않는다). 순수 Linux(cygpath 없음)에서는 이 함수가 호출되지 않는다.
  local ipconfig_output addresses
  if ! ipconfig_output="$(ipconfig 2>/dev/null)"; then
    return 1
  fi
  addresses="$(printf '%s\n' "$ipconfig_output" | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' || true)"
  if [ -z "$addresses" ]; then
    return 1
  fi
  printf '%s' "$addresses"
}

_qa_normalize_unc_admin_share() {
  local candidate="$1"
  local unc_admin_share_re='^[\\/][\\/]([^\\/]+)[\\/]([A-Za-z])\$([\\/].*)?$'
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
    local self_addresses
    if ! self_addresses="$(_qa_self_lan_addresses)"; then
      return 1
    fi
    if printf '%s\n' "$self_addresses" | grep -qx -- "$host"; then
      printf '%s:%s' "$drive" "$rest"
      return 0
    fi
  fi
  printf '%s' "$candidate"
}

# 2026-07-28 R5 재수렴 결함2: subst/net use 로 매핑된 드라이브 문자를 실제 대상으로
# 치환한다 — cygpath/realpath 는 순수 lexical 이라 DOS 디바이스 매핑을 모른다(실측:
# cygpath -u 'X:\probe' → '/x/probe', 물리 대상으로 되돌리지 못함). subst/net use
# 명령 자체의 텍스트 출력(둘 다 이 라운드 실측으로 로케일 무관 안정 포맷 확인)을 유일한
# 권위 있는 매핑 소스로 파싱한다 — 실패/비매핑 드라이브는 원본 그대로 폴백한다. 드라이브
# 문자로 시작하지 않는 입력은 이 조회를 완전히 건너뛴다.
#
# subst/net use 프로세스 기동은 각각 약 0.4~0.5초로 느리다(이 라운드 실측 — Windows
# 네트워크 서브시스템 조회 특성상 드라이브 문자와 무관하게 고정 비용). resolve_qa_shots_dir
# 한 번 호출에 _qa_physical_path 가 최대 4번(dir/docs_qa_root 각 1회 + is_within_physical
# 안에서 각 1회 더) 불려 그대로 두면 최대 ~4초까지 누적된다 — 이 셸 프로세스 생애 동안
# 딱 한 번만 조회하고 캐시한다(호출마다 드라이브 매핑이 바뀔 일은 없다).
_QA_SUBST_CACHE_LOADED=""
_QA_SUBST_CACHE_OUTPUT=""
_QA_SUBST_CACHE_STATUS=0
_QA_NETUSE_CACHE_LOADED=""
_QA_NETUSE_CACHE_OUTPUT=""
_QA_NETUSE_CACHE_STATUS=0

_qa_subst_output_cached() {
  if [ -z "$_QA_SUBST_CACHE_LOADED" ]; then
    if ! _QA_SUBST_CACHE_OUTPUT="$(subst 2>/dev/null)"; then
      _QA_SUBST_CACHE_STATUS=1
    fi
    _QA_SUBST_CACHE_LOADED=1
  fi
  if [ "$_QA_SUBST_CACHE_STATUS" -ne 0 ]; then
    return 1
  fi
  printf '%s' "$_QA_SUBST_CACHE_OUTPUT"
}

_qa_netuse_output_cached() {
  if [ -z "$_QA_NETUSE_CACHE_LOADED" ]; then
    if ! _QA_NETUSE_CACHE_OUTPUT="$(net use 2>/dev/null)"; then
      _QA_NETUSE_CACHE_STATUS=1
    fi
    _QA_NETUSE_CACHE_LOADED=1
  fi
  if [ "$_QA_NETUSE_CACHE_STATUS" -ne 0 ]; then
    return 1
  fi
  printf '%s' "$_QA_NETUSE_CACHE_OUTPUT"
}

_qa_resolve_dos_device_drive() {
  local candidate="$1"
  if ! command -v cygpath >/dev/null 2>&1; then
    printf '%s' "$candidate"
    return 0
  fi
  case "$candidate" in
    [A-Za-z]:[\\/]*) : ;;
    *)
      printf '%s' "$candidate"
      return 0
      ;;
  esac
  local drive="${candidate:0:1}"
  local rest="${candidate:2}"
  local subst_output subst_line
  if ! subst_output="$(_qa_subst_output_cached)"; then
    return 1
  fi
  subst_line="$(printf '%s' "$subst_output" | grep -i -- "^${drive}:\\\\: =>" || true)"
  if [ -n "$subst_line" ]; then
    printf '%s%s' "${subst_line#*=> }" "$rest"
    return 0
  fi
  local net_use_output net_use_line target
  if ! net_use_output="$(_qa_netuse_output_cached)"; then
    return 1
  fi
  net_use_line="$(printf '%s' "$net_use_output" | grep -iE -- "^(OK|Disconnected)[[:space:]]+${drive}: " || true)"
  if [ -n "$net_use_line" ]; then
    target="$(printf '%s' "$net_use_line" | awk '{print $3}')"
    if [ -n "$target" ]; then
      printf '%s%s' "$target" "$rest"
      return 0
    fi
  fi
  printf '%s' "$candidate"
}

_qa_physical_path() {
  local candidate="$1"
  if ! candidate="$(_qa_resolve_dos_device_drive "$candidate")"; then
    return 1
  fi
  if ! candidate="$(_qa_normalize_unc_admin_share "$candidate")"; then
    return 1
  fi
  local resolved
  if command -v realpath >/dev/null 2>&1; then
    if ! resolved="$(realpath -m -- "$candidate")" || [ -z "$resolved" ]; then
      return 1
    fi
  else
    if ! resolved="$(readlink -f -- "$candidate")" || [ -z "$resolved" ]; then
      return 1
    fi
  fi
  # D-2 (2026-07-28 R1 적대검증): MSYS/Git-Bash 환경에서 realpath -m 은 입력 표기를
  # 그대로 보존한다 — POSIX 입력(`/c/...`)은 POSIX로, Windows 입력(`C:\...`, `C:/...`)은
  # Windows 형식(`C:/...`)으로 남는다. 반면 이 파일의 다른 호출부는 `pwd -P` 로 항상
  # POSIX 형식을 만들어 두 값이 바이트 단위로 어긋났다(실측: win-backslash/win-fwdslash
  # 둘 다 차단 실패). cygpath 가 있으면(MSYS/Cygwin 환경의 신호 — 순수 Linux 에는 없다)
  # POSIX 정규형으로 통일해 비교 기준을 하나로 맞춘다. 존재하지 않는 하위 경로에도
  # 동작해야 하므로(realpath -m 과 동일 계약) cygpath 실패 시 원래 값으로 폴백한다.
  if command -v cygpath >/dev/null 2>&1; then
    if ! resolved="$(cygpath -u -- "$resolved" 2>/dev/null)" || [ -z "$resolved" ]; then
      return 1
    fi
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
  if ! parent="$(_qa_casefold_if_windows "$(_qa_physical_path "$1")")"; then
    return 2
  fi
  if ! candidate="$(_qa_casefold_if_windows "$(_qa_physical_path "$2")")"; then
    return 2
  fi
  if [ -z "$parent" ] || [ -z "$candidate" ]; then
    return 2
  fi
  case "$candidate" in
    "$parent"|"$parent"/*) return 0 ;;
    *) return 1 ;;
  esac
}

_qa_evidence_root() {
  local current="$1"
  while true; do
    current="$(_qa_physical_path "$current")" || return 1
    local leaf parent parent_leaf
    leaf="${current##*/}"
    parent="${current%/*}"
    parent_leaf="${parent##*/}"
    if [ "$(printf '%s' "$parent_leaf" | tr '[:upper:]' '[:lower:]')" = "docs" ]; then
      printf '%s' "$current"
      return 0
    fi
    [ "$parent" = "$current" ] && return 1
    current="$parent"
  done
}

resolve_qa_shots_dir() {
  local committed_dir="$1"
  local protection_mode="${2:-protect}"
  local protect=1
  [ "$protection_mode" = "regenerate" ] && protect=0
  local dir
  if [ -n "${QA_SHOTS_DIR:-}" ]; then
    if ! dir="$(_qa_physical_path "$QA_SHOTS_DIR")"; then
      printf '%s\n' '[QA 출력 경로 가드] 출력 경로의 물리 식별에 실패했습니다.' >&2
      return 1
    fi
  else
    if ! dir="$(_qa_physical_path "$committed_dir/_local")"; then
      printf '%s\n' '[QA 출력 경로 가드] 기본 출력 경로의 물리 식별에 실패했습니다.' >&2
      return 1
    fi
  fi

  if [ -n "${QA_SHOTS_DIR:-}" ]; then
    local qa_evidence_root
    if ! qa_evidence_root="$(_qa_evidence_root "$committed_dir")"; then
      printf '%s\n' '[QA 출력 경로 가드] 호출자의 QA 증거 루트 물리 식별에 실패했습니다.' >&2
      return 1
    fi
    local within_status=0
    if [ -n "$qa_evidence_root" ] && _qa_is_within_physical "$qa_evidence_root" "$dir"; then
      within_status=0
    else
      within_status=$?
    fi
    if [ "$protect" -eq 1 ] && [ "$within_status" -eq 0 ] && ! _qa_has_explicit_overwrite_intent; then
      printf '%s\n' "[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: $dir. 명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오." >&2
      return 1
    fi
    if [ "$within_status" -ne 0 ] && [ "$within_status" -ne 1 ]; then
      printf '%s\n' '[QA 출력 경로 가드] 출력 경로 포함 판정에 실패했습니다.' >&2
      return 1
    fi
  fi

  if ! mkdir -p "$dir"; then
    printf '%s\n' "[QA 출력 경로 가드] 출력 디렉터리를 만들지 못했습니다: $dir" >&2
    return 1
  fi
  printf '%s' "$dir"
}
