# #1116 S11 — discovery cache 참조 동일성과 Linux junction 재귀

## 범위

- 대상: `clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts`
- PR: #1118 / 이슈: #1116
- 커밋·push: 하지 않음
- 성능 최적화: 하지 않음

## 결함 2 원인 확정

원인은 **Linux에서 `fs.symlinkSync(targetDir, aliasDir, 'junction')`가 심볼릭 링크로 만들어지고 `fs.Dirent.isDirectory()`가 false를 반환하므로, `walkForEvidenceDiscovery`가 alias 디렉터리 안으로 재귀하지 않는 것**이다.

근거는 다음과 같다.

1. 코드 원문 87~100행(수정 전): walker는 `entry.isDirectory()`가 true인 경우에만 `walkForEvidenceDiscovery(full, out)`를 호출하고, false이면 `out.push(full)`만 한다.
2. 코드 원문 1093행: junction 테스트는 `fs.symlinkSync(targetDir, aliasDir, 'junction')`로 alias를 만든다.
3. Linux Node 22 최소 재현 실행 원문:

```text
[ {"name":"alias","isDirectory":false,"isSymbolicLink":true},
  {"name":"target","isDirectory":true,"isSymbolicLink":false} ]
alias-children [ 'writer.mjs' ]
```

명령은 `docker run --rm node:22-bookworm-slim node -e ...`로 실행했고, 같은 `symlinkSync(..., "junction")` 호출 후 alias에 `writer.mjs`가 실제로 존재함을 확인했다. 따라서 실패 지점은 canonical 경로 불일치가 아니라 walker의 Linux symlink 디렉터리 미재귀다.

수정은 symlink인 항목에 `fs.statSync(full).isDirectory()`를 적용해 실제 디렉터리이면 재귀하도록 했고, canonical 디렉터리 방문 집합을 추가해 symlink 순환 재귀를 막았다.

## 결함 1 수정

`discoveredEvidenceWriters()`가 매 호출 결과 배열을 새로 만들던 문제를 수정했다.

- 이전 discovery의 canonical 파일별 fingerprint와 판정 결과가 파일 수·순서·`mtimeMs`·size·writer 판정까지 같으면 기존 결과 배열 참조를 반환한다.
- 파일 추가·삭제 또는 fingerprint/판정 변경이 있으면 새 결과 배열을 만든다.
- 기존 파일별 cache의 무효화 동작은 유지했다.
- `toBe` 참조 동일성 테스트와 S10 무효화 3건은 변경하지 않았다.

## 로컬 검증

### 지정 전건 명령 — 실제 실행 시도 원문

의존성 미설치 상태의 최초 실행은 Vitest 시작 전 실패했다.

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
vitest.config.ts ... [UNRESOLVED_IMPORT] Could not resolve 'vitest/config'
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
S11_BASELINE_EXIT=1
```

이후 `npm ci --ignore-scripts`가 exit 0으로 완료된 뒤, 수정 전·후에 지정 명령을 실제 실행했다. 전건 실행은 이 로컬 Windows 환경에서 각각 304초, 424초, 904초 제한에 걸렸다. Vitest assertion 출력은 반환되지 않았고, shell 래퍼의 원문은 다음과 같다.

```text
command timed out after 304028 milliseconds
command timed out after 424036 milliseconds
command timed out after 904028 milliseconds
```

종료코드는 Vitest `$LASTEXITCODE`가 아니라 shell timeout의 124이며, 따라서 이를 전건 GREEN으로 주장하지 않는다. timeout 뒤 남은 이번 작업의 Vitest 자식 프로세스 PID 트리는 확인 후 종료했다.

### 관련 4건 targeted 실행 원문

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts -t '발견한 증거 작성자 모집단|파일 추가·삭제|파일 내용만|junction 별칭'; $testExit = $LASTEXITCODE; Write-Output "S11_TARGETED_EXIT=$testExit"; exit $testExit

 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1116/clients/desktop
 ✓ src/renderer/test-utils/harness-false-green-guard.test.ts (53 tests | 49 skipped) 59445ms
   ✓ 발견한 증거 작성자 모집단은 한 번 계산한 결과를 모든 가드가 재사용한다 33868ms
   ✓ S10 RED-A: 호출자 무효화 없이 파일 추가·삭제를 다음 discovery에 반영한다 13858ms
   ✓ S10 RED-A: 파일 내용만 바뀌어 writer가 되면 다음 discovery가 재판정한다 6005ms
   ✓ S10 RED-A: junction 별칭으로 발견한 파일은 원본 삭제 후 canonical cache에서 제거된다 5713ms
 Test Files 1 passed (1)
 Tests 4 passed | 49 skipped (53)
 Duration 60.22s
 S11_TARGETED_EXIT=0
```

## 신규 파일

- `docs/dev-reports/2026-08-08-1116-s11-guard-cache-identity-and-junction.md`

## #1116 S12 — discovery identity 비교와 G8c 반복 호출 최적화

### 변경

- `discoveredEvidenceWriters()`의 unchanged 비교에서 `every()` 콜백 내부의 캐시 전체 배열 생성을 제거하고, canonical 파일 키로 `Map.get()`하여 O(n)으로 비교하도록 수정했다.
- G8c가 이미 도출한 discovery 결과를 파일마다 다시 `discoveredEvidenceWriters()`로 재계산하던 구조를 제거하고, 동일한 discovery 배열을 `guardRootFor()`에 전달해 재사용하도록 수정했다.
- S11의 `statSync` junction 처리와 `visitedDirectories` 순환 방지 로직은 변경하지 않았다.
- 파일 추가·삭제, 파일 내용 변경, junction 별칭 회귀 테스트는 유지했다.

### 원인 및 성능 확인

S11의 O(n²) 원인(`every()` 내부의 `[...cache.entries()]`)은 실제 원인 중 하나였다. 다만 이를 제거한 뒤에도 G8c가 writer 수만큼 전체 discovery를 반복 호출하는 별도의 O(n²) 병목이 남아 있었다. 첫 수정 후 전건은 977.32초였고 G8c 단독이 915.811초였으며, discovery 결과를 재사용한 뒤 전건은 62.64초로 줄었다.

### 지정 전건 명령 — 최종 실행 원문

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts; $testExit = $LASTEXITCODE; Write-Output "S12_FULL_EXIT=$testExit"; exit $testExit

 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1116/clients/desktop

 ✓ src/renderer/test-utils/harness-false-green-guard.test.ts (53 tests) 61983ms
   ✓ 하네스 거짓 green 가드 > G3a: clients/**/scripts·루트 scripts/ 의 JS/CJS/MJS 캡처 목적지도 _local 격리를 거친다 24718ms
   ✓ 하네스 거짓 green 가드 > G3b: 위 스크립트가 이 저장소의 특정 절대경로(C:/dev/Samhan-Public 등)를 하드코딩하지 않는다 2251ms
   ✓ 하네스 거짓 green 가드 > 발견한 증거 작성자 모집단은 한 번 계산한 결과를 모든 가드가 재사용한다 4670ms
   ✓ 하네스 거짓 green 가드 > S10 RED-A: 호출자 무효화 없이 파일 추가·삭제를 다음 discovery에 반영한다 6684ms
   ✓ 하네스 거짓 green 가드 > S10 RED-A: 파일 내용만 바뀌어 writer가 되면 다음 discovery가 재판정한다 4491ms
   ✓ 하네스 거짓 green 가드 > S10 RED-A: junction 별칭으로 발견한 파일은 원본 삭제 후 canonical cache에서 제거된다 5287ms
   ✓ 하네스 거짓 green 가드 > G8a: 발견 기반 관할이 비어 있지 않고 실제 파일을 포함한다 (전수 discovery 고장 방지) 2870ms
   ✓ 하네스 거짓 green 가드 > G8b: 증거를 쓸 수 있는 파일이 레포에 실제로 다수 존재한다 (모집단 도출이 0건이면 G8c 는 항상 무의미하게 GREEN) 2255ms
   ✓ 하네스 거짓 green 가드 > G8c: 증거를 쓸 수 있는 레포 전 파일이 가드 관할 안에 있다 (루트 집합 누락 = RED) 2278ms
   ✓ 하네스 거짓 green 가드 > G9 파서 sanity: 워크플로 트리거 파싱과 글롭 변환이 실제로 동작한다 (파싱이 깨지면 G9 는 항상 무의미하게 GREEN) 2275ms
   ✓ 하네스 거짓 green 가드 > G9: 가드가 스캔하는 파일 중 ci.yml 이 무시하는 것은 다른 워크플로가 반드시 발동시킨다 2501ms
   ✓ 하네스 거짓 green 가드 > G12 (도출식): 문서 본문을 단언하는 검사 전수를, 그 문서만 바꾸는 PR 이 실제로 실행한다 368ms

 Test Files 1 passed (1)
      Tests 53 passed (53)
   Duration 62.64s (transform 55ms, setup 0ms, collect 146ms, tests 61.98s, environment 0ms, prepare 100ms)

S12_FULL_EXIT=0
```

### 신규 파일

- 없음
