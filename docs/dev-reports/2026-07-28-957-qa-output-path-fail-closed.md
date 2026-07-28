# PR #957 — QA 출력 경로 조회 실패 fail-closed 보완

## 범위

조사 보고서 `957-leak-sweep.md`의 6건을 원문으로 확인하고, 물리 경로 판정에 필요한 조회가 실패할 때 안전 경로로 진행하지 않도록 보완했다. 이번 변경은 다음 불변식을 기준으로 했다.

- N-1: 물리 식별에 필요한 정보를 얻지 못하면 명시적 실패로 중단한다.
- N-2: resolver의 실패 상태를 호출부가 그대로 존중한다.
- N-3: Node/TypeScript 6개, Python 1개, Bash 1개, PowerShell 2개 등 10개 resolver 사본을 같은 계약으로 맞춘다.
- N-4: `_local` 격리 디렉터리와 OS temp 등 정상적인 외부 출력 경로는 계속 생성·기록할 수 있어야 한다.

조사 보고서가 이번 라운드 범위에서 제외한 경로 표기별 판정표, 다른 OS 컨테이너, `operational-validation.ps1` 항목 4의 `Join-Path` 배열은 수정하지 않았다.

## RED-first 원문

추가한 프로브:

```text
node --test --test-name-pattern "957-RED" clients/desktop/scripts/qa-output-path-guard.test.cjs
```

수정 전 원문 결과는 6건 전부 실패였다.

```text
not ok 1 - 957-RED-1 — Node 물리 조회가 false로 흡수되면 안 되고 커밋 QA 대상은 차단되어야 한다
  Missing expected exception: 조회 실패를 경로 없음으로 해석해 물리 docs/qa alias가 허용되었습니다
not ok 2 - 957-RED-2 — Python commonpath 조회 실패는 False가 아니라 명시적 실패여야 한다
  commonpath 조회 실패가 허용 경로로 흘렀습니다: ALLOW
not ok 3 - 957-RED-3 — Bash 포함 판정 조회 실패는 외부 경로로 오인하지 않고 resolver가 실패해야 한다
  Bash 조회 실패가 허용 경로로 흘렀습니다: ALLOW /tmp/...
not ok 4 - 957-RED-4 — Bash 실제 소비자는 resolver의 nonzero 상태를 무시하고 다음 쓰기로 진행하면 안 된다
  resolver return 1 뒤에도 소비자가 진행했습니다: CONTINUED
not ok 5 - 957-RED-5 — 공유 PowerShell 물리 조회 실패는 $null lexical fallback으로 낮아지면 안 된다
  Get-QaFinalPhysicalPath가 조회 예외를 $null로 삼키는 fallback을 유지합니다
not ok 6 - 957-RED-6 — operational-validation.ps1은 물리 판정 실패 시 Continue/기본 False로 REPORT 쓰기를 진행하면 안 된다
  전역 Continue가 물리 조회 실패를 비종료 오류로 만듭니다
ℹ tests 6
ℹ pass 0
ℹ fail 6
```

## 변경 내역 — 10개 resolver 사본

| 사본 | 변경한 판정/실패 계약 |
|---|---|
| `scripts/lib/qa-shots-dir.cjs` | `existsSync` 루프를 `lstatSync`로 교체하고 ENOENT/ENOTDIR만 누락 경로로 허용했다. 그 밖의 조회 오류와 `realpath` 오류는 throw한다. UNC 자기 LAN 조회 실패도 throw한다. |
| `scripts/lib/qa-shots-dir.mjs` | CJS와 동일한 ancestor lstat, realpath, UNC 조회 실패 전파 계약을 반영했다. |
| `clients/desktop/playwright/support/qa-screenshot-dir.mjs` | 루트 resolver와 동일하게 물리 조회 실패를 허용 경로로 낮추지 않도록 반영했다. |
| `clients/desktop/playwright/support/qa-screenshot-dir.ts` | 위 계약의 TypeScript 사본을 반영하고 정규식 호스트 캡처를 undefined-safe하게 했다. |
| `clients/desktop/src/main/capture.ts` | Electron capture resolver에 동일한 fail-closed 판정을 반영하고 TypeScript 검사를 통과하도록 호스트 캡처를 보강했다. |
| `qa/playwright/utils/screenshot.ts` | Playwright 캡처 resolver에 동일한 물리 조회·UNC 실패 전파와 TypeScript 처리를 반영했다. |
| `scripts/lib/qa_shots_dir.py` | `lstat` ancestor 탐색에서 ENOENT/ENOTDIR만 누락으로 처리하고, DNS/OSError, strict realpath, `commonpath ValueError`는 RuntimeError로 전파했다. |
| `scripts/lib/qa-shots-dir.sh` | `ipconfig`, `subst`, `net use`, `realpath/readlink`, 포함 판정의 실패 상태를 보존하고 빈 출력·mkdir 실패를 중단했다. |
| `scripts/lib/qa-shots-dir.ps1` | `Get-Item`/Win32/link 조회 오류를 `$null`/lexical 경로로 바꾸지 않고 Stop/throw로 전파했다. 정상적인 없는 하위 경로만 부모에 이어 붙인다. |
| `infrastructure/scripts/operational-validation.ps1` | 전역 `Continue`를 `Stop`으로 바꾸고 동일 물리 resolver를 반영했다. 선택적 추가 anchor가 실제로 없는 정상 상황은 건너뛰되 조회 오류는 중단하며 report 디렉터리 생성도 Stop을 사용한다. |

추가 호출부 보완:

- `docs/qa/dev-menu-dev2/backend-qa.sh`에서 `resolve_qa_shots_dir`의 nonzero 상태와 빈 반환값을 검사하고, 실패 시 `backend-real-qa.md` 쓰기로 진행하지 않도록 했다.

## GREEN 원문

### RED 프로브

```text
node --test --test-name-pattern "957-RED" clients/desktop/scripts/qa-output-path-guard.test.cjs
ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
```

### 기존 가드 스위트

```text
node --test clients/desktop/scripts/qa-output-path-guard.test.cjs
ℹ tests 45
ℹ pass 45
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

이 실행에는 resolver inventory 10개, N-1 UTF-16 checkout 비교, N-2 exact inventory, N-3 다른 호스트 UNC 허용, junction/subst/UNC 적대 경로, Python/Bash/PowerShell 및 실제 자식 프로세스 경로 테스트가 포함됐다.

### 과차단 회귀와 정적 검증

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
Test Files  1 passed (1)
Tests       49 passed (49)

npm run typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
Exit code: 0

LOCAL_WRITE_OK  C:\Users\user\AppData\Local\Temp\957-local-tNnnbb\committed\_local
PY_COMPILE_OK
POWERSHELL_PARSE_OK
bash -n scripts/lib/qa-shots-dir.sh                         # exit 0
bash -n docs/qa/dev-menu-dev2/backend-qa.sh                 # exit 0
```

`LOCAL_WRITE_OK`는 OS temp 아래에 resolver를 통해 `_local`을 생성하고 `probe.txt`를 실제로 쓰고 읽은 결과다. 기존 가드 스위트의 `T-3` 정당한 repo-relative `-OutDir` 성공과 `qa/playwright captureForQa` 기본 출력/명시적 승격 성공도 45/45 안에 포함된다. `N-3`의 실제 다른 호스트 UNC 경로는 10개 사본 모두 정상적으로 외부 경로로 유지됐다.

## RED 프로브가 재현한 실패 경계

| 프로브 | 조회 실패 재현 | 수정 후 결과 |
|---|---|---|
| RED-1 | CJS `fs.existsSync`를 junction alias에서 `false`로 모킹 | `lstatSync`가 조회 실패를 누락으로 흡수하지 않고, 물리 docs/qa 대상은 차단 |
| RED-2 | Python `os.path.commonpath`를 `ValueError`로 모킹 | `False` fallback 대신 RuntimeError |
| RED-3 | Bash `_qa_is_within_physical`를 status 2로 모킹 | `ALLOW`/mkdir 대신 BLOCK |
| RED-4 | 실제 `backend-qa.sh` 소비부에서 resolver nonzero를 주입 | `CONTINUED` 없이 status 1로 중단 |
| RED-5 | 공유 PowerShell 소스의 `$null`/`Test-Path False` fallback 구조 검사 | 조회 오류를 `$null` lexical 후보로 낮추는 구조 제거 |
| RED-6 | operational validation의 전역 Continue/optional anchor 구조 검사 | 물리 판정 실패를 report 쓰기로 진행시키는 구조 제거 |

## diff 수치

최종 작업 트리에서 실행한 `git diff --numstat` 원문은 다음과 같다. UTF-16LE PowerShell 두 파일은 Git이 바이너리로 분류하므로 해당 출력이 `-\t-\t<file>`로 표시된다. `git diff --check`도 오류 없이 종료했다.

```text
39  7   clients/desktop/playwright/support/qa-screenshot-dir.mjs
44  7   clients/desktop/playwright/support/qa-screenshot-dir.ts
112 0   clients/desktop/scripts/qa-output-path-guard.test.cjs
44  6   clients/desktop/src/main/capture.ts
8   1   docs/qa/dev-menu-dev2/backend-qa.sh
-   -   infrastructure/scripts/operational-validation.ps1
44  7   qa/playwright/utils/screenshot.ts
39  7   scripts/lib/qa-shots-dir.cjs
39  7   scripts/lib/qa-shots-dir.mjs
-   -   scripts/lib/qa-shots-dir.ps1
93  22  scripts/lib/qa-shots-dir.sh
61  9   scripts/lib/qa_shots_dir.py
```

## 인계 메모

- git 쓰기 명령(commit/push/checkout/reset/stash)은 실행하지 않았다.
- 변경 파일만 작업 트리에 남겼고, 검증용 임시 경로는 OS temp에서 생성 후 제거했다.
- 새 이슈를 등록하지 않았다.
