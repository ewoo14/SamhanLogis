# PR #1138 / 이슈 #1116 — S9 fix: CI Git Bash 부재 하네스 수정

## 결론

CI Linux에서 `cygpath`가 없다는 이유로 S7 전체가 red가 되지 않도록
`clients/desktop/scripts/qa-output-path-guard.test.cjs`의 실행기 탐색과 S7 parity
하네스를 수정했다. `.sh` resolver는 Linux에서 `bash` 자체가 있으면 검증하고,
실행기가 없는 resolver만 해당 이름과 사유를 출력한 뒤 제외한다. Node resolver는
항상 실제 parity 검증에 남으므로 테스트 전체 skip으로 계약 검증이 0이 되지 않는다.

resolver 구현 파일(`scripts/lib/qa-shots-dir.sh`, `.ps1`, `.py`)은 변경하지 않았다.

## RED-first — 수정 전 실패 원문

Windows에서 Linux의 `cygpath` 부재 탐지 결과를 주입하도록 작성한 회귀 테스트를
먼저 실행했다. 기존 `findGitBashExecutable()`은 주입 인자를 받지 않고 실제
Windows Git Bash를 탐색했으므로, 모사한 Linux 후보를 선택하지 못했다.

명령:

```text
node --test --test-name-pattern='S9 RED' clients/desktop/scripts/qa-output-path-guard.test.cjs
```

RED 원문:

```text
✖ S9 RED — Linux bash는 cygpath가 없어도 .sh resolver 후보가 된다 (51.2924ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1053.3297

✖ failing tests:

test at clients\\desktop\\scripts\\qa-output-path-guard.test.cjs:190:1
✖ S9 RED — Linux bash는 cygpath가 없어도 .sh resolver 후보가 된다 (51.2924ms)
  AssertionError [ERR_ASSERTION]: cygpath 부재를 이유로 Linux bash 후보를 제외했습니다
  + actual - expected
  
  + 'C:\\Program Files\\Git\\bin\\bash.exe'
  - 'mock-linux-bash'
      at TestContext.<anonymous> (C:\\dev\\Samhan-Public\\.claude\\worktrees\\t1116b\\clients\\desktop\\scripts\\qa-output-path-guard.test.cjs:196:10)
```

종료코드는 PowerShell 실행 결과의 `Script error: Exit code: 1`로 확인했다.

## 수정 내용

- `findGitBashExecutable()`에 `platform`, `candidates`, `probe` 주입 지점을 추가했다.
- Windows에서는 기존처럼 `cygpath`를 확인한다.
- 비-Windows에서는 `bash -c 'exit 0'`만 확인하므로 순수 POSIX `.sh` 동작을 검증할 수 있다.
- S7의 PowerShell/Git Bash/Python 무조건 assert를 제거했다.
- 실행 가능한 resolver만 동일 입력의 protect/regenerate parity에 참여시킨다.
- 제외 resolver는 `[S7 resolver skip] 이름: 사유`로 출력한다.
- Windows에서 실행기가 모두 있으면 기존처럼 6개 resolver가 모두 참여한다.

## GREEN — 수정 후 원문

전체 테스트 명령:

```text
node --test clients/desktop/scripts/qa-output-path-guard.test.cjs
```

핵심 GREEN 출력 원문:

```text
[S7 six-impl parity] cjs/docs/qa=BLOCK mjs/docs/qa=BLOCK ts/docs/qa=BLOCK ps1/docs/qa=BLOCK sh/docs/qa=BLOCK py/docs/qa=BLOCK cjs/docs/qa-shots=BLOCK mjs/docs/qa-shots=BLOCK ts/docs/qa-shots=BLOCK ps1/docs/qa-shots=BLOCK sh/docs/qa-shots=BLOCK py/docs/qa-shots=BLOCK cjs/docs/dev-reports=BLOCK mjs/docs/dev-reports=BLOCK ts/docs/dev-reports=BLOCK ps1/docs/dev-reports=BLOCK sh/docs/dev-reports=BLOCK py/docs/dev-reports=BLOCK cjs/manual regenerate=ALLOW mjs/manual regenerate=ALLOW ts/manual regenerate=ALLOW ps1/manual regenerate=ALLOW sh/manual regenerate=ALLOW py/manual regenerate=ALLOW cjs/repo outside=ALLOW mjs/repo outside=ALLOW ts/repo outside=ALLOW ps1/repo outside=ALLOW sh/repo outside=ALLOW py/repo outside=ALLOW cjs/default=ALLOW mjs/default=ALLOW ts/default=ALLOW ps1/default=ALLOW sh/default=ALLOW py/default=ALLOW
✔ S9 — Linux bash는 cygpath가 없어도 .sh resolver 후보가 된다 (0.2381ms)
✔ S7 RED-B — 여섯 resolver는 동일 입력에서 protect/regenerate 판정을 모두 일치시킨다 (17931.418ms)
ℹ tests 55
ℹ suites 0
ℹ pass 55
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 77551.454
```

종료코드는 위 출력의 `fail 0` 및 PowerShell 도구 결과의 `Exit code: 0`으로
확인했다. 기존 테스트가 자식 resolver의 차단 stderr를 출력하는 것은 의도된
보호 판정 증거이며, 테스트 자체는 55/55 통과했다.

## ① 새로 가능해진 상태·환경 조합과 결과

| 환경 | 실행 resolver | 결과 |
|---|---|---|
| PowerShell·bash·Python 모두 있음(현재 Windows) | cjs/mjs/ts/ps1/sh/py 6개 | S7 전체 입력에서 6개 모두 동일 판정, GREEN |
| PowerShell 있음, bash 없음 | cjs/mjs/ts/py 4개 | ps1은 `ps1: 이 환경에 ...`로 출력 후 제외, 나머지 4개 parity 실제 검증 |
| PowerShell·bash·Python 모두 없음 | cjs/mjs/ts 3개 | 세 process resolver의 이름·부재 사유 출력 후 Node 3개 parity 실제 검증 |
| Linux에서 bash 있음, cygpath 없음 | cjs/mjs/ts/sh 4개(+Python이 있으면 py) | `.sh`는 bash 자체로 실제 검증, `cygpath` 부재만으로 제외되지 않음 |

위 조합의 공통 규칙은 resolver 전체를 skip하지 않고, 실행 가능한 resolver의
protect/regenerate 일치를 계속 assert한다는 것이다. Windows 전체 조합은 이번
전체 실행에서 실제로 `cjs/mjs/ts/ps1/sh/py` 6개가 모두 참여한 로그로 확인했다.
Linux 조합은 주입 회귀 테스트가 `mock-linux-bash`를 선택하는 GREEN으로 확인했다.

## ② 제거·이동·개명 식별자 전수 grep

명령:

```text
node --check clients/desktop/scripts/qa-output-path-guard.test.cjs
rg -n -F "assert.ok(POWERSHELL_EXE" clients/desktop/scripts/qa-output-path-guard.test.cjs
rg -n -F "assert.ok(GITBASH_EXE" clients/desktop/scripts/qa-output-path-guard.test.cjs
rg -n -F "assert.ok(PYTHON_EXE" clients/desktop/scripts/qa-output-path-guard.test.cjs
```

결과:

```text
Exit code: 0
(세 assert 검색 결과 0건)
```

수정 후 식별자 위치 확인:

```text
findGitBashExecutable: 191, 1706, 1725
GITBASH_SKIP_REASON: 256, 1186, 1393, 1726, 1736, 1765, 1796, 1835, 2080
POWERSHELL_SKIP_REASON: 255, 919, 957, 1052, 1081, 1106, 1138, 1179, 1319, 1349, 1396, 1446, 1485, 1528, 2103
PYTHON_SKIP_REASON: 1648, 1656, 1682, 2056
```

기존 resolver 구현의 식별자나 파일은 제거·이동·개명하지 않았다.

## ③ 변경 파일을 참조하는 테스트 전부 실행

변경한 테스트 파일 자체가 참조하는 전체 Node test 파일을 실행했다.

```text
node --test clients/desktop/scripts/qa-output-path-guard.test.cjs
```

결과:

```text
tests 55
pass 55
fail 0
skipped 0
Exit code: 0
```

이 파일을 실행 대상으로 등록한 CI 경로는 `.github/workflows/qa-e2e.yml`의
`QA 출력 경로·덮어쓰기 가드` step이며, 이번 라운드에서는 사용자 지시대로
전체 Desktop mock 스위트는 실행하지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-1116-s9-ci-gitbash-absence.md`

기존 파일 수정:

- `clients/desktop/scripts/qa-output-path-guard.test.cjs`

resolver 구현 파일 신규/수정 없음.
