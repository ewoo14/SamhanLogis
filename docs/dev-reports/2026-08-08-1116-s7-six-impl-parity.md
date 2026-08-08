# PR #1138 / 이슈 #1116 — S7 six-implementation parity

## 결론

- S6 차단 결함 수정: `scripts/lib/qa-shots-dir.sh`가 `regenerate` 선언 시 보호 분기를 건너뛰도록 수정했다.
- 행위 울타리를 `.ps1`·`.sh`·`.py`까지 실제 자식 프로세스로 실행하는 6종 parity 행렬로 확장했다.
- 복구 상태 전체 가드: **54 passed / 0 failed / 0 skipped**.
- 커밋·push 없음, 공유 Docker 재기동 없음, DB 쓰기 없음, 커밋된 QA/매뉴얼 증거 덮어쓰기 없음.

## 인터프리터 확인

| 구현 | 실행기 | 상태 | 처리 |
|---|---|---|---|
| `.ps1` | Windows PowerShell 5.1 | 있음 | 실제 실행 |
| `.sh` | Git Bash `C:\Program Files\Git\bin\bash.exe` (`cygpath` 있음) | 있음 | 실제 실행 |
| `.py` | Python 3.14.4 | 있음 | 실제 실행 |
| `pwsh` | PowerShell Core | 없음 | 조용한 skip 없이 Windows PowerShell 5.1로 `.ps1` 실행 |

## RED-first 원문

수정 전 S7 테스트 실행:

```text
tests 54
pass 53
fail 1

AssertionError [ERR_ASSERTION]: sh/regenerate 판정 불일치
'BLOCK' !== 'ALLOW'

[QA 출력 경로 가드] ... docs/manual/screenshots.
명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.
```

원인: `.sh`는 두 번째 인자 `regenerate`를 받아 `protect=0`으로 계산했지만, 실제 커밋 증거 경로 차단 조건이 `$protect`를 참조하지 않았다.

## 6종 판정 대조표

동일한 resolver 입력 경로를 각 구현에 적용했다. `BLOCK`은 `QA_ALLOW_OVERWRITE=1` 가드 오류를 실제로 반환한 경우다.

| 입력 케이스 | cjs | mjs | ts | ps1 | sh | py |
|---|---:|---:|---:|---:|---:|---:|
| `docs/qa` 보호 미선언 | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK |
| `docs/qa-shots` 보호 미선언 | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK |
| `docs/dev-reports` 보호 미선언 | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK | BLOCK |
| `docs/manual/screenshots` regenerate | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| 저장소 밖 경로 | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| 기본값 `<committedDir>/_local` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |

실행 로그:

```text
[S7 six-impl parity] cjs/docs/qa=BLOCK mjs/docs/qa=BLOCK ts/docs/qa=BLOCK ps1/docs/qa=BLOCK sh/docs/qa=BLOCK py/docs/qa=BLOCK
cjs/docs/qa-shots=BLOCK mjs/docs/qa-shots=BLOCK ts/docs/qa-shots=BLOCK ps1/docs/qa-shots=BLOCK sh/docs/qa-shots=BLOCK py/docs/qa-shots=BLOCK
cjs/docs/dev-reports=BLOCK mjs/docs/dev-reports=BLOCK ts/docs/dev-reports=BLOCK ps1/docs/dev-reports=BLOCK sh/docs/dev-reports=BLOCK py/docs/dev-reports=BLOCK
cjs/manual regenerate=ALLOW mjs/manual regenerate=ALLOW ts/manual regenerate=ALLOW ps1/manual regenerate=ALLOW sh/manual regenerate=ALLOW py/manual regenerate=ALLOW
cjs/repo outside=ALLOW mjs/repo outside=ALLOW ts/repo outside=ALLOW ps1/repo outside=ALLOW sh/repo outside=ALLOW py/repo outside=ALLOW
cjs/default=ALLOW mjs/default=ALLOW ts/default=ALLOW ps1/default=ALLOW sh/default=ALLOW py/default=ALLOW
```

## 뮤테이션 증명

`.sh`의 수정 조건에서 일시적으로 `$protect` 검사를 제거한 뒤 같은 테스트를 실행했다.

```text
manual regenerate 6종 판정 불일치
actual:   ['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'BLOCK', 'ALLOW']
expected: ['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'ALLOW']
tests 54 / pass 53 / fail 1
```

뮤테이션은 즉시 원상복구했고, 복구 후 전체 실행은 `54 passed / 0 failed / 0 skipped`였다.

## 변경 통계

```text
 .../desktop/scripts/qa-output-path-guard.test.cjs | 99 ++++++++++++++++++++++
 scripts/lib/qa-shots-dir.sh                        |  2 +-
 2 files changed, 100 insertions(+), 1 deletion(-)
```

`git diff --stat` 기준 삭제 줄 수는 **1줄**이다. 기존 S6 보고서 `docs/dev-reports/2026-08-08-1116-s6-reconvergence.md`는 작업 전부터 존재한 미추적 파일이며 건드리지 않았다.

## 신규/변경 파일

- 변경: `clients/desktop/scripts/qa-output-path-guard.test.cjs`
- 변경: `scripts/lib/qa-shots-dir.sh`
- 신규 보고서: `docs/dev-reports/2026-08-08-1116-s7-six-impl-parity.md`
- 보존된 기존 미추적 파일: `docs/dev-reports/2026-08-08-1116-s6-reconvergence.md`
