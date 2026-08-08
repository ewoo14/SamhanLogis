# #1116 S26 최종 재수렴 — 정적 1차 + 결과 최종 가드 적대적 검증

## 판정

**BLOCK — 증거 무결성 결함 1건이다.**

S24의 세 결함은 닫혔다. 1,244,567 bytes인 실제 `git ls-files -co --exclude-standard -z` 모집단에서 `build` 아래 tracked writer가 G3a를 exit 1로 만들었고, Git 열거 자체가 실패하면 명시적 예외로 red가 됐다. Python 주석의 `"""` 뒤 실제 writer와 동일 unreadable 후보 경고 1회 계약도 61건 suite에서 통과했다.

S25 결과 검사는 일반 크기 오염에서 tracked 수정과 non-ignored untracked 잔재의 상태 코드·경로를 모두 출력한다. 병렬 worktree 72개 중 다른 세 worktree에 실제 `docs/qa` 잔재가 있는 동안 현재 worktree 검사는 exit 0이어서 worktree 간 오차단도 없었다. 세 적용 잡의 정상 CI 경로가 tracked `docs/qa`를 쓰는 경로도 발견하지 못했다.

그러나 대규모 오염에서는 `scripts/check-docs-qa-clean.cjs`의 `spawnSync`가 Node 기본 buffer를 넘는다. 실제 `docs/qa` 모집단을 임시 Git index로 dirty하게 만든 결과 `git status` 원출력은 1,235,722 bytes·15,316항목이었지만 post-check는 다음 한 줄만 남겼다.

```text
[docs/qa 결과 검사] git status 실행 실패: spawnSync git ENOBUFS
```

검사 자체는 exit 1이므로 false-green은 아니다. 하지만 S25 계약의 최소 진단인 “무엇이 더럽혀졌는지 목록”이 전부 소실된다. 이는 검증 품질이 아니라 실패 증거 무결성 결함이며, 이번 라운드의 BLOCK이다.

코드·커밋·push·Docker·`.gitguardian.yaml`은 건드리지 않았다. probe와 임시 index는 모두 제거했고 최종 신규 파일은 이 보고서 1건이다.

## 1. S24 세 결함 재검증

### 1.1 ENOBUFS와 tracked `build` writer

현재 저장소 모집단을 구현과 같은 명령으로 buffer로 받아 정확히 측정했다.

```text
S26_GIT_LS_FILES_EXACT_BYTES=1244567
```

다음 probe를 `git add -f`로 stage한 뒤 G3a만 파이프 없이 실행했다.

```js
// tools/.s26-build-only/build/deep/tracked-writer.mjs
const OUT = 'docs/qa/.s26-build-only.png'
fs.writeFileSync(OUT, 'probe')
```

```text
S26_TRACKED_BUILD_G3A_EXIT=1
tools/.s26-build-only/build/deep/tracked-writer.mjs → const OUT
Tests 1 failed | 60 skipped
```

즉 기본 1MiB를 넘는 실제 저장소 상태에서도 skip basename 아래 tracked writer가 G3a에 도달한다. `directoryContainsTrackedFile()`에는 `maxBuffer: 50 * 1024 * 1024`가 있고, 같은 실행에서 목록을 정상 열거했다.

Git 실행 자체가 실패할 때의 fail-closed도 PATH에서 Git만 제외해 재현했다.

```text
S26_GIT_ENUMERATION_FAILURE_EXIT=1
Error: unable to enumerate tracked evidence files with git ls-files
Caused by: spawnSync git ENOENT
```

빈 집합으로 흡수한 green은 재현되지 않았다.

### 1.2 Python 주석의 triple delimiter

61건 전체 suite의 S24 회귀가 다음 원형을 양성 writer로 판정했다.

```python
# Documentation delimiter example: """
OUT = 'docs/qa/.s24-comment-triple-writer.png'
with open(OUT, 'wb') as handle:
    handle.write(b'probe')
```

`hasPythonEvidenceWrite(source) === true`와 `hasUnisolatedTextEvidenceWrite(...) === true` 단언이 통과했다. 주석 delimiter가 이후 코드를 삼키는 경로는 닫혔다.

### 1.3 동일 경고 반복

S24 내장 회귀는 동일 unreadable untracked 후보에 대해 `discoveredEvidenceWriters()`를 두 번 호출하고 `console.warn`이 1회인지 단언한다. 전체 suite에서 이 테스트가 통과했다. 기준 실행의 경고 두 블록은 서로 다른 테스트가 만든 서로 다른 후보였고, 같은 후보의 21회 반복은 없었다.

## 2. 결과 검사

### 2.1 단위 테스트와 일반 dirty 목록

```text
node --test scripts/check-docs-qa-clean.test.cjs
tests 2, pass 2, fail 0
S26_POSTCHECK_UNIT_EXIT=0
```

실제 tracked 보고서 한 건을 수정하고 non-ignored untracked 파일 한 건을 함께 만든 probe는 exit 1이었고 두 항목을 모두 표시했다.

```text
S26_POSTCHECK_DIRTY_EXIT=1
[docs/qa 결과 검사] 더럽혀진 항목:
   M docs/qa/1001-partner-ledger-r53-real-qa/qa-report.md
  ?? docs/qa/s26-post-check-probe.txt
```

probe 제거 뒤 검사는 exit 0이었다. `docs/qa/**/_local/` ignored 파일을 둔 대조군도 `.gitignore:85:**/_local/`에 의해 계약대로 exit 0이었다. 이는 S25가 명시한 “tracked 변경 + non-ignored untracked 잔재 0”과 일치한다.

### 2.2 BLOCK — 대규모 dirty 목록이 post-check ENOBUFS로 소실된다

작업 파일을 수정하지 않고 별도 임시 `GIT_INDEX_FILE`을 `git read-tree --empty`로 구성했다. 같은 환경에서 먼저 50MB buffer로 원출력을 측정하고, 이어 실제 post-check를 실행했다.

```text
S26_EMPTY_INDEX_STATUS_BYTES=1235722
S26_EMPTY_INDEX_STATUS_LINES=15316
S26_LARGE_DIRTY_POSTCHECK_EXIT=1
[docs/qa 결과 검사] git status 실행 실패: spawnSync git ENOBUFS
```

원인은 `scripts/check-docs-qa-clean.cjs`의 `spawnSync(..., { encoding: 'utf8' })`에 `maxBuffer`가 없는 것이다. 일반 dirty probe에서는 목록을 보이지만, 현재 저장소의 `docs/qa` 모집단만으로도 Node 기본 buffer를 넘길 수 있다. 이 경우 red는 유지되나 상태 코드와 경로 목록 15,316항목이 하나도 남지 않아 범인 특정의 최소 증거 계약을 지키지 못한다.

### 2.3 병렬 worktree 오차단

`git worktree list --porcelain`로 72개 worktree를 열거하고 각 worktree의 `docs/qa` 상태를 읽기 전용으로 조사했다. 다른 세 worktree에는 실제 잔재가 있었다.

```text
S26_WORKTREE_COUNT=72
S26_OTHER_WORKTREES_WITH_DOCS_QA_RESIDUE=3
824-tax   2항목
qa-combo 31항목
tpl-914  10항목
```

그 상태에서 현재 `t1116`의 post-check는 다음과 같았다.

```text
[docs/qa 결과 검사] 통과: tracked 변경 + non-ignored untracked 잔재 0
S26_CURRENT_CHECK_WITH_OTHER_WORKTREE_RESIDUE_EXIT=0
```

각 Git worktree는 별도 working tree와 index를 사용하고, 스크립트도 자신의 `__dirname`에서 현재 repo root를 계산한다. 따라서 다른 worktree에서 QA 라운드가 파일을 만들고 지우는 동안 현재 잡이 red가 되는 경로는 재현되지 않았다. GitHub-hosted CI 잡도 잡별 새 checkout이므로 이 공유 worktree 오차단과 무관하다.

### 2.4 정상 `docs/qa` 쓰기 CI 경로

전체 `.github/workflows`에서 `docs/qa` 직접 쓰기 명령을 검색하고, 세 적용 잡의 실행 사슬을 별도로 추적했다.

- `frontend-desktop`: build/typecheck/Vitest/round-910 계약 뒤 검사한다. Vitest는 `src/**/*.test.{ts,tsx}`만 수집하며, 이번 가드 전체 실행 뒤 실제 post-check가 clean이었다.
- `desktop-playwright`: 기본 설정은 `*-real-qa`·수동 캡처를 제외한다. 실행되는 mock 캡처는 `resolveQaShotsDir()`를 거쳐 기본 `docs/qa/<slug>/_local`로 가고, Playwright 자체 산출물은 `playwright-report`·`playwright-json`·`test-results`로 간다.
- `harness-false-green-guard`: 지정 61건 suite 뒤 검사한다. suite의 probe는 `finally`에서 제거되며, 이번 동일 순서 실행 후 post-check가 clean이었다.

workflow 본문의 `docs/qa` 직접 쓰기 명령은 0건이었다. `qa/playwright`의 `captureForQa()`도 기본 `_local`을 사용하지만 그 `playwright` 잡은 이번 단계 결과 검사 적용 대상이 아니다. tracked `docs/qa`를 정상 갱신하는 적용 잡은 발견하지 못했다.

현재 SHA의 원격 상태도 확인했다.

```text
headRefOid=3bd870df10def822c0af5eae595ada1abab3d1a0
mergeable=MERGEABLE
mergeStateStatus=CLEAN
gh pr checks 1118: 43/43 pass, exit 0
```

세 적용 잡 `Frontend Desktop`, `Desktop Playwright`, `하네스 거짓 green 가드`도 모두 pass였다.

### 2.5 적용하지 않은 잡과 단계적 범위

결과 검사 호출은 정확히 세 곳이다.

- `.github/workflows/ci.yml`의 `frontend-desktop`
- `.github/workflows/qa-e2e.yml`의 `desktop-playwright`
- `.github/workflows/harness-guard.yml`의 `harness-false-green-guard`

세 곳 모두 테스트 뒤 `if: always()`다. S25 보고서는 “아직 적용하지 않은 잡은 그 밖의 모든 CI 잡”이라고 명시하고, 미실행 파일은 정적 가드가 담당한다고 적었다. 따라서 적용 안 된 잡의 실행 오염은 결과 검사에 도달하지 않는다는 단계적 한계가 문서에 명시돼 있다.

## 3. 정적 가드 유지

파이프 없이 전체 지정 명령을 실행했다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts

Test Files 1 passed (1)
Tests 61 passed (61)
Vitest Duration 38.22s
S26_STATIC_EXIT=0
S26_STATIC_WALL_SECONDS=39.97
```

S13~S23의 양성 probe와 오차단 대조군이 포함된 61건 전부가 통과했다. 포함 범위는 무마커 JS/TS, 중첩 PowerShell, tracked skip basename, Python·`.cts`·Batch 직접 writer, 읽기 실패 fail-closed, stat 치환 뒤 내용 변경, junction·ignored output 대조군, Python 주석·한 줄 문자열·정상 triple docstring, Batch REM, 문서, 정상 marker writer다.

개발책임자가 판정에서 제외한 네 형태는 재결함으로 세지 않았다. 가드 소스 105~114행 주석은 quoted Batch 목적지, marker/write 도움말 문자열, Python `Path('docs') / 'qa'`, Batch `%OUT%`를 정확히 열거하고, 미실행 파일에서는 미탐이며 세 적용 잡에서 실제 실행된 뒤 남은 tracked/non-ignored 잔재만 결과 검사가 받는다고 적는다. S25 보고서도 같은 범위와 한계를 명시한다.

## probe 정리와 파일 상태

다음을 제거했다.

- `tools/.s26-build-only/**`와 stage entry
- `docs/qa/s26-post-check-probe.txt`
- tracked 보고서에 넣었던 한 줄 probe
- `docs/qa/s26-result-guard/_local/**`
- 임시 `GIT_INDEX_FILE`

probe 정리 뒤 `git status --short`는 비어 있었다. 최종 상태에서는 이 보고서만 신규 파일이며 가드 소스·워크플로·`.gitguardian.yaml` diff는 0이다.

## 이 라운드가 보지 않은 것

- 개발책임자가 판정에서 제외한 quoted Batch 목적지, marker와 write가 같은 도움말 문자열, Python `Path('docs') / 'qa'` 조립, Batch `%OUT%` 변수 목적지는 실행·판정하지 않았다. 주석과 S25 문서의 한계 명시만 확인했다.
- 전체 `frontend-desktop`·`desktop-playwright` 잡을 로컬에서 다시 실행하지 않았다. 현재 SHA의 해당 GitHub 잡 pass와 각 실행 경로·출력 resolver를 확인했고, 로컬에서는 지정 61건 가드와 결과 검사만 실행했다.
- 적용하지 않은 CI 잡의 결과 오염을 동적으로 실행하지 않았다. 그 잡들에는 post-check가 없다는 도달성과 S25의 단계적 범위 명시만 확인했다.
- 테스트가 파일을 쓴 뒤 삭제하거나 원문 복구하는 일시적 쓰기, ignored 경로 쓰기, 악의적인 `git restore/clean`은 결과 검사의 계약 밖이므로 판정하지 않았다.
- Linux/macOS의 파일 잠금·symlink 차이는 실행하지 않았다. 공유 Docker 스택, 제품 UI/API, 운영 데이터는 보지 않았다.
