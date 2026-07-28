"""QA 라이브 캡처 저장 경로 결정 (Python 버전, 루트 공유).

scripts/lib/qa-shots-dir.{cjs,mjs} 와 동일 계약이다 — 그 두 파일은 Node 전용이라, PIL 로
QA PNG 를 직접 생성하는 docs/qa/**/*.py 스크립트는 이 Python 버전을 쓴다(2026-07-27
하네스 흡수 H2 — docs/qa/sp-08-6-3-sales-slip-soft-delete/screenshots/gen_png.py,
docs/qa/sp-08-6-5-accounting-daily-ledger/gen_pngs.py 편입).

기본값은 커밋된 디렉토리 밑의 `_local/` 서브폴더(`.gitignore` 의 `**/_local/` 규칙으로
항상 제외 대상)다. `docs/qa/<slug>/*.png`(커밋된 원본)는 이 함수가 절대 건드리지 않는다.
의도적으로 새 확정 증거를 남기려면 QA_SHOTS_DIR 환경변수로 원하는 경로를 명시적으로
지정한다.

사용법 (standalone 스크립트에서, 패키지가 아니므로 sys.path 로 상대 경로 import):

    import os
    import sys

    _HERE = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(_HERE, '..', '..', '..', '..', 'scripts', 'lib'))
    from qa_shots_dir import resolve_qa_shots_dir  # noqa: E402

    OUT_DIR = resolve_qa_shots_dir(_HERE)
"""
import os
import re
import socket


def _has_explicit_overwrite_intent() -> bool:
    return os.environ.get('QA_ALLOW_OVERWRITE', '').strip().lower() in {'1', 'true', 'yes'}


_UNC_ADMIN_SHARE_RE = re.compile(r'^\\\\([^\\]+)\\([A-Za-z])\$(\\.*)?$')


def _self_lan_addresses() -> set:
    """이 머신에 실제로 바인딩된 IPv4 주소 전부(로컬 전용 조회 — 네트워크 I/O 없음).

    2026-07-28 R5 재수렴 결함3 — 고정 별칭 목록(localhost/127.0.0.1/hostname)은
    "열거"라서 어댑터가 늘 때마다 다시 뚫린다(실측: 자기 LAN IP UNC 가 10개 resolver
    사본 전부를 통과했다). socket.gethostbyname_ex(hostname())는 이 실행 환경에서
    로컬 hostname 조회이며(원격 DNS 라운드트립 아님) 이 머신에 바인딩된 어댑터 IP를
    전부 돌려준다(실측 확인). 실패하거나 결과가 비면 물리 식별을 계속하지 않는다 —
    원격 호스트에 대한 stat 기반 신원 대조는 도달 불가능한 호스트에서 8초+ 행(hang)이
    재현돼 채택하지 않았다.
    """
    try:
        _, _, ip_list = socket.gethostbyname_ex(socket.gethostname())
    except OSError as error:
        raise RuntimeError('QA 출력 경로 가드: 자기 LAN 주소 조회에 실패해 UNC 물리 식별을 계속할 수 없습니다') from error
    if not ip_list:
        raise RuntimeError('QA 출력 경로 가드: 자기 LAN 주소 조회 결과가 비어 있어 UNC 물리 식별을 계속할 수 없습니다')
    return {ip.lower() for ip in ip_list}


def _normalize_unc_admin_share(candidate_dir: str) -> str:
    """자기 자신을 가리키는 UNC admin-share를 등가의 드라이브 문자 표기로 통일한다.

    2026-07-28 R4 결함3 + R5 재수렴 결함3 — 자세한 배경은 scripts/lib/qa-shots-dir.cjs 의
    동명 함수(normalizeUncAdminShareToDrive) 주석 참조. 다른 호스트를 가리키는
    admin-share 는 실제로 다른 물리 머신이므로 변환하지 않는다.
    """
    match = _UNC_ADMIN_SHARE_RE.match(candidate_dir)
    if not match:
        return candidate_dir
    host = match.group(1).lower()
    known_aliases = {'localhost', '127.0.0.1', '.', socket.gethostname().lower()}
    if host not in known_aliases and host not in _self_lan_addresses():
        return candidate_dir
    rest = match.group(3) or '\\'
    return f'{match.group(2)}:{rest}'


def _normalize_physical_path(candidate_dir: str) -> str:
    if os.name == 'nt':
        if candidate_dir.startswith('\\\\?\\UNC\\'):
            candidate_dir = '\\\\' + candidate_dir[len('\\\\?\\UNC\\'):]
        elif candidate_dir.startswith('\\\\?\\'):
            candidate_dir = candidate_dir[len('\\\\?\\'):]
        candidate_dir = _normalize_unc_admin_share(candidate_dir)
    return os.path.normcase(os.path.normpath(candidate_dir))


def _is_missing_path_error(error: OSError) -> bool:
    return error.errno in {getattr(os, 'ENOENT', 2), getattr(os, 'ENOTDIR', 20)}


def _resolve_physical_path(candidate_dir: str) -> str:
    """존재하지 않는 출력 하위 경로만 물리 부모에 이어 붙이고 조회 오류는 전파한다."""
    current = os.path.abspath(candidate_dir)
    missing_parts = []

    while True:
        try:
            os.lstat(current)
        except OSError as error:
            if not _is_missing_path_error(error):
                raise RuntimeError(
                    f'QA 출력 경로 가드: 물리 경로 조회에 실패했습니다: {candidate_dir}: {error}'
                ) from error
            parent = os.path.dirname(current)
            if parent == current:
                raise RuntimeError(
                    f'QA 출력 경로 가드: 물리 경로 루트를 확인할 수 없습니다: {candidate_dir}'
                ) from error
            missing_parts.insert(0, os.path.basename(current))
            current = parent
            continue

        try:
            resolved = os.path.realpath(current, strict=True)
        except OSError as error:
            raise RuntimeError(
                f'QA 출력 경로 가드: 물리 경로 조회에 실패했습니다: {candidate_dir}: {error}'
            ) from error
        return os.path.join(resolved, *missing_parts)


def _is_remote_unc_path(candidate_dir: str) -> bool:
    if os.name != 'nt':
        return False
    match = re.match(r'^\\\\([^\\]+)\\', candidate_dir)
    if not match:
        return False
    host = match.group(1).lower()
    known_aliases = {'localhost', '127.0.0.1', '.', socket.gethostname().lower()}
    return host not in known_aliases and host not in _self_lan_addresses()


def _is_within_physical(parent_dir: str, candidate_dir: str) -> bool:
    if _is_remote_unc_path(candidate_dir):
        return False
    parent = _normalize_physical_path(_resolve_physical_path(parent_dir))
    candidate = _normalize_physical_path(_resolve_physical_path(candidate_dir))
    try:
        return os.path.commonpath([parent, candidate]) == parent
    except ValueError as error:
        raise RuntimeError(
            f'QA 출력 경로 가드: 물리 경로 포함 판정에 실패했습니다: {parent_dir} / {candidate_dir}'
        ) from error


def resolve_qa_shots_dir(committed_dir: str) -> str:
    """committed_dir 은 기존 커밋 캡처가 있는(또는 있을) 절대경로.

    반환값은 이번 실행에서 실제로 PNG 를 써야 할 절대경로(디렉토리는 이미 생성됨).
    """
    committed = os.path.abspath(committed_dir)
    override = os.environ.get('QA_SHOTS_DIR', '')
    if override.strip():
        directory = os.path.abspath(override)
    else:
        directory = os.path.join(committed, '_local')

    docs_qa_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'qa'))
    if override.strip() and _is_within_physical(docs_qa_root, directory) and not _has_explicit_overwrite_intent():
        raise RuntimeError(
            f'[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: {directory}. '
            '명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.'
        )

    os.makedirs(directory, exist_ok=True)
    return directory
