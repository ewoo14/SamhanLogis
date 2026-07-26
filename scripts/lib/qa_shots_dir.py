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


def resolve_qa_shots_dir(committed_dir: str) -> str:
    """committed_dir 은 기존 커밋 캡처가 있는(또는 있을) 절대경로.

    반환값은 이번 실행에서 실제로 PNG 를 써야 할 절대경로(디렉토리는 이미 생성됨).
    """
    override = os.environ.get('QA_SHOTS_DIR', '')
    if override.strip():
        directory = os.path.abspath(override)
    else:
        directory = os.path.join(committed_dir, '_local')
    os.makedirs(directory, exist_ok=True)
    return directory
