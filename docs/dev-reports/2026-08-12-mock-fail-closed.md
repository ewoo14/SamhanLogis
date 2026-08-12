# Mock fail-closed 전환 보고서

> 작업일: 2026-08-12
> 범위: Axios/fetch mock egress 차단

## RED — 수정 전 재현 원문

명령:

```text
cd clients/desktop
npx vitest run src/renderer/api/__tests__/mock-fail-closed.test.ts src/renderer/realtime/createRealtimeClient.fail-closed.test.ts --reporter=verbose
```

출력:

```text
 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/wmock/clients/desktop

× src/renderer/realtime/createRealtimeClient.fail-closed.test.ts > mock realtime fail-closed network boundary > mock 모드의 co-edit SSE handler가 없으면 fetch로 이탈하지 않고 명시적으로 실패한다
  → expected [Function] to throw an error
× src/renderer/api/__tests__/mock-fail-closed.test.ts > mock fail-closed network boundary > mock handler가 없는 Axios 요청은 실제 adapter로 진행하지 않고 명시적으로 실패한다
  → expected [Function] to throw error including 'Mock handler not found: GET /mock-un…' but got 'Cannot read properties of undefined (…'

Test Files  2 failed (2)
Tests       2 failed (2)

[coedit-test] 연결 종료 — 5000ms 후 재연결 [TypeError: fetch failed]
  at connect (src/renderer/realtime/createRealtimeClient.ts:129:27)
```

해석: Axios는 mock handler가 없는 요청을 다음 adapter 단계로 넘겼고, co-edit realtime은 mock 모드에서도 실제 `fetch`를 시작했다.

## GREEN — 경계 단위 검증 원문

명령:

```text
cd clients/desktop
npx vitest run src/renderer/api/__tests__/mock-fail-closed.test.ts src/renderer/realtime/createRealtimeClient.fail-closed.test.ts src/renderer/realtime/createRealtimeClient.test.ts --reporter=verbose
```

출력:

```text
✓ src/renderer/realtime/createRealtimeClient.fail-closed.test.ts (1)
✓ src/renderer/realtime/createRealtimeClient.test.ts (3)
✓ src/renderer/api/__tests__/mock-fail-closed.test.ts (1)

Test Files  3 passed (3)
Tests       5 passed (5)
```

비mock SSE 테스트는 기존대로 fetch를 시작했으며, 503 이후 기존 재연결 로그가 유지됐다.

## Desktop 전체 Vitest 원문

명령:

```text
cd clients/desktop
npx vitest run --reporter=dot
```

종료 원문:

```text
Test Files  1 failed, 191 passed (192)
Tests       1 failed, 1,? passed, 2 skipped

Failed Tests 1
src/main/build-output-cjs-interop.test.ts
Error: out/main/index.js 가 없습니다. ... `npm run build` 를 먼저 실행하십시오.

Uncaught Exception
ReferenceError: window is not defined
This error originated in src/renderer/routes/GroupwareApprovalDetailPage.settlement.test.tsx
```

판정: mock fail-closed 변경과 무관한 산출물 미생성 가드 1건 및 테스트 종료 후 정리되지 않은 기존 비동기 uncaught가 남았다. 변경 축 관련 단위 테스트는 별도 실행에서 5/5 통과했다.

## 변경 축 desktop 단위 전량

명령:

```text
cd clients/desktop
npx vitest run src/renderer/api src/renderer/realtime --reporter=dot
```

출력:

```text
Test Files  47 passed (47)
Tests       383 passed | 2 skipped (385)
Duration    4.89s
```

결과: API/realtime 변경 축 단위 전량 통과. 비mock realtime의 기존 503 재연결 로그도 그대로 확인됐다.

## TypeScript 검사 원문

명령:

```text
cd clients/desktop
npx tsc -p tsconfig.web.json --noEmit
```

출력 요약 원문:

```text
error TS2307: Cannot find module '@samhan/design-system' or its corresponding type declarations.
```

동일한 module resolution 실패가 다수 파일에서 발생해 종료 코드 1. 워크트리 의존 패키지 준비 문제로, 이번 변경 파일의 오류로 특정되는 메시지는 없었다.

## Playwright mock 전량 원문

명령:

```text
cd clients/desktop
npx playwright test
```

종료 원문:

```text
command timed out after 604024 milliseconds
```

전량 요약을 반환하지 못했으므로 668건 전체를 통과로 판정하지 않는다. `test-results`에는 진행 중 일부 산출물(예: `1151-postmerge-mock-hardgate`)이 남았지만, 이는 전량 결과가 아니다.

## 이탈 36건 분류 보존

측정 보고서의 분류를 그대로 보존한다.

| 분류 | 건수 | 이번 전환에서 handler 추가로 해소 | 상태 |
|---|---:|---:|---|
| `collab/stream OPTIONS` | 33 | 0 | realtime mock 경계에서 실제 fetch 이전에 명시 실패하도록 차단. Playwright 전량 미완료로 재검증 미확정 |
| 레거시 slip | 2 | 0 | Axios null-handler fail-closed 경계 대상. Playwright 전량 미완료로 재검증 미확정 |
| `sync/last` | 1 | 0 | Axios null-handler fail-closed 경계 대상. Playwright 전량 미완료로 재검증 미확정 |
| 합계 | 36 | 0 | 36건 모두 네트워크 이탈 방지 경계는 추가됐으나, handler 추가 해소 건은 없음 |

현재 보고 시점에는 누락 handler를 예외로 통과시키지 않았다.

## 변경 파일 lint

명령:

```text
cd clients/desktop
npx eslint src/renderer/api/client.ts src/renderer/realtime/createRealtimeClient.ts src/renderer/realtime/createRealtimeClient.test.ts src/renderer/realtime/createRealtimeClient.fail-closed.test.ts src/renderer/api/__tests__/mock-fail-closed.test.ts
```

출력:

```text
(출력 없음)
Process exited with code 0
```

## 측정 라운드 2 — Playwright 배치 결과

### 사전 목록

명령:

```text
cd clients/desktop
npx playwright test --list --reporter=line
```

출력 원문:

```text
Listing tests:
...
Total: 668 tests in 124 files
```

### 배치 1 — co-edit 관련 디렉토리

명령:

```text
cd clients/desktop
npx playwright test playwright/slip-collab playwright/1062-line-input-ux playwright/estimate-collab-real-qa playwright/journal-collab playwright/partner-order-collab playwright/groupware-approval-collab-real-qa playwright/cash-receipt-coedit-real-qa --reporter=line
```

결과 집계:

```text
통과: 0
실패: 0
실행된 스펙: 0
상태: 앱 기동 전 차단
```

종료 원문:

```text
command timed out after 182902 milliseconds
```

실행 중 WebServer 원문:

```text
[WebServer] [vite] Pre-transform error: Failed to resolve entry for package "@samhan/design-system". The package may have incorrect main/module/exports specified in its package.json.
[WebServer] Internal server error: Failed to resolve entry for package "@samhan/design-system". The package may have incorrect main/module/exports specified in its package.json.
```

판정: Playwright worker가 스펙을 실행하기 전에 Vite 의존성 해석에서 반복 실패했다. 이 배치에서는 fail-closed로 빨갛게 된 스펙명을 확보하지 못했다. 빌드·의존성 수정은 하지 않았다.

### 전량 범위 상태

목록 기준 668건/124파일을 확인했으나, 배치 실행은 로컬 `@samhan/design-system` entry resolve 차단으로 0건 실행됐다. 이번 라운드에서 실제 테스트 실패 스펙 목록은 확보되지 않았다.

### 라운드 종료 파일 확인

```text
Test-Path tools/.s24-build-only/build/deep/tracked-writer.mjs
True
```

지정 파일은 삭제되지 않았다.

## 측정 라운드 3 — 실제 Playwright 배치 1

### 대상

```text
playwright/slip-collab
playwright/1062-line-input-ux
```

### 명령

```text
cd clients/desktop
npx playwright test playwright/slip-collab playwright/1062-line-input-ux --reporter=line
```

### 실행 원문

```text
Running 15 tests using 1 worker
...
9 failed
  [chromium] › playwright/1062-line-input-ux/1062-line-input-ux.spec.ts:173:3 › PR #1063 전표 라인 입력 UX mock › 견적 편집 provider 연결 중에는 trailing 빈행 구조 추가를 잠근다
  [chromium] › playwright/1062-line-input-ux/1062-line-input-ux.spec.ts:195:3 › PR #1063 전표 라인 입력 UX mock › 견적 편집 coedit은 기존 행만 교체하고 trailing 빈행의 구조 추가를 잠근다
  [chromium] › playwright/slip-collab/coedit-s2a.shots.spec.ts:269:3 › PR #674 S2a Yjs 코-에디팅 (전표 전체 폼) QA 스크린샷 › desktop-01~03: 편집 모드 진입 → 원격 텍스트+커서 배지 → 수량 셀 clear 재입력
  [chromium] › playwright/slip-collab/coedit-s2a.shots.spec.ts:395:3 › PR #674 S2a Yjs 코-에디팅 (전표 전체 폼) QA 스크린샷 › mobile-01: 모바일(390x844) 편집 모드 반응형
  [chromium] › playwright/slip-collab/slip-collab-panel.spec.ts:84:3 › §7 입출고전표 협업 패널 › 코멘트 등록 → 목록 반영 → 해결 처리
  [chromium] › playwright/slip-collab/slip-collab-panel.spec.ts:116:3 › §7 입출고전표 협업 패널 › 수정 버튼 → 편집 → 수정완료 → 버전이력으로 일원화
  [chromium] › playwright/slip-collab/slip-collab-panel.spec.ts:155:3 › §7 입출고전표 협업 패널 › presence list 백필은 다른 시청자와 본인 아바타를 함께 표시한다
  [chromium] › playwright/slip-collab/slip-collab-panel.spec.ts:175:3 › §7 입출고전표 협업 패널 › S2a direct edit inline form은 헤더와 품목 셀을 fieldPath 단위 coedit input으로 렌더한다
  [chromium] › playwright/slip-collab/slip-collab-panel.spec.ts:216:3 › §7 입출고전표 협업 패널 › 코멘트 anchor(메모) 클릭 ↔ 버전이력 header.memo 항목이 서로 하이라이트된다 (양방향, PR #747 재수렴 HIGH fix)
6 passed (2.6m)
```

### 배치 집계

| 항목 | 수 |
|---|---:|
| 실행 | 15 |
| 통과 | 6 |
| 실패 | 9 |
| 미실행 | 0 |

이 배치에서 확인된 fail-closed 영향 후보는 co-edit/realtime 초기화와 slip 협업 화면 실패 9건이다. handler 추가나 예외 우회는 하지 않았다.

## 측정 라운드 3 — 실제 Playwright 배치 2

### 대상

```text
playwright/journal-collab
playwright/partner-order-collab
playwright/slip-version-history
```

### 명령

```text
cd clients/desktop
npx playwright test playwright/journal-collab playwright/partner-order-collab playwright/slip-version-history --reporter=line
```

### 실행 원문

```text
Running 11 tests using 1 worker
...
8 failed
  [chromium] › playwright/journal-collab/journal-collab-panel.spec.ts:46:3 › §7 회계전표 협업 패널 › 코멘트 등록 → 목록 반영 → 해결 처리
  [chromium] › playwright/journal-collab/journal-collab-panel.spec.ts:69:3 › §7 회계전표 협업 패널 › 코멘트 연결 필드를 선택해 등록하면 anchor 가 반영된다
  [chromium] › playwright/journal-collab/journal-collab-panel.spec.ts:89:3 › §7 회계전표 협업 패널 › 수정 버튼 → 적요/라인메모 편집 → 수정완료 → 수정 이력 diff 반영 (#31 결정1 복구)
  [chromium] › playwright/journal-collab/journal-collab-panel.spec.ts:127:3 › §7 회계전표 협업 패널 › 수정 이력 diff 클릭과 코멘트 anchor 클릭이 activeFieldPath 하이라이트를 공유한다 (결정2 양방향)
  [chromium] › playwright/journal-collab/journal-collab-panel.spec.ts:161:3 › §7 회계전표 협업 패널 › REVERSED 분개에서는 수정 버튼이 노출되지 않는다
  [chromium] › playwright/partner-order-collab/partner-order-collab-panel.spec.ts:46:3 › §7 주문 협업 패널 › 코멘트 등록 → 목록 반영 → 해결 처리
  [chromium] › playwright/partner-order-collab/partner-order-collab-panel.spec.ts:69:3 › §7 주문 협업 패널 › 수정 버튼 → 요청사항/납기/라인비고 편집 → 수정완료 → 버전이력으로 일원화
  [chromium] › playwright/slip-version-history/slip-version-history.spec.ts:68:3 › S2b 전표 버전이력 필드 변경 로그 + 복원 › 버전이력 2건 렌더 + 필드/셀 변경 목록 + 최신 복원버튼 미노출 + 과거 복원
3 passed (55.6s)
```

### 배치 집계

| 항목 | 수 |
|---|---:|
| 실행 | 11 |
| 통과 | 3 |
| 실패 | 8 |
| 미실행 | 0 |

누적 실제 실행: 26건 중 9 통과, 17 실패. 이번 배치도 handler 추가나 fail-closed 예외는 적용하지 않았다.

## 측정 라운드 3 — 실제 Playwright 배치 3

### 대상

```text
playwright/slip-form-v20
playwright/sp-08-4-2-partner-order-edit-put
```

### 명령

```text
cd clients/desktop
npx playwright test playwright/slip-form-v20 playwright/sp-08-4-2-partner-order-edit-put --reporter=line
```

### 실행 원문

```text
Running 11 tests using 1 worker
...
3 failed
  [chromium] › playwright/slip-form-v20/slip-form-v20-matching.spec.ts:279:3 › 전표 V20 입력 → 판매조회 매칭 (TC-V1~V5) › TC-V2: 전표 수정 화면 — 거래처 선택 시 사업자번호 readonly 자동 채움(값 대조)
  [chromium] › playwright/slip-form-v20/slip-form-v20-matching.spec.ts:424:3 › 전표 V20 입력 → 판매조회 매칭 (TC-V1~V5) › TC-V4: 전표 상세 페이지 — V20 6필드 읽기 전용 표시(값 대조)
  [chromium] › playwright/slip-form-v20/slip-form-v20-matching.spec.ts:486:3 › 전표 V20 입력 → 판매조회 매칭 (TC-V1~V5) › TC-V5: 전표 수정 — 프로젝트명 갱신값이 저장 요청 payload 에 정확히 매칭
8 passed (56.4s)
```

### 배치 집계

| 항목 | 수 |
|---|---:|
| 실행 | 11 |
| 통과 | 8 |
| 실패 | 3 |
| 미실행 | 0 |

누적 실제 실행: 37건 중 17 통과, 20 실패.

## 측정 라운드 3 — 실제 Playwright shard 배치 4

### 대상

```text
전체 mock suite shard 1/8
```

### 명령

```text
cd clients/desktop
npx playwright test --shard=1/8 --reporter=line
```

### 실행 원문

```text
command timed out after 244033 milliseconds
```

### 배치 집계

```text
통과: 집계 불가
실패: 집계 불가
실패 스펙명: reporter 요약 미반환
상태: timeout
```

이 shard는 전량 수치에 합산하지 않았다. 실제 결과가 확인된 배치는 1~3뿐이다.

## 라운드 종료 파일 확인

```text
Test-Path tools/.s24-build-only/build/deep/tracked-writer.mjs
True
```

지정 파일은 삭제되지 않았다. handler 추가와 fail-closed 예외 우회도 수행하지 않았다.

## 메우기 라운드 — 배치 1: `slip-collab` + `1062-line-input-ux`

이번 배치에서는 co-edit SSE가 실제 gateway가 아니라 Playwright/Vite mock origin으로 연결되도록 transport 경계를 보정하고, SSE handler를 추가한 뒤 실행했다.

### 실행 원문

```text
npx vitest run src/renderer/realtime/createRealtimeClient.test.ts src/renderer/realtime/createRealtimeClient.fail-closed.test.ts --reporter=verbose

 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/wmock/clients/desktop

 ✓ src/renderer/realtime/createRealtimeClient.test.ts > createRealtimeClient > mock 모드에서는 handler 없이 fetch를 시작하지 않고 명시적으로 실패한다
 ✓ src/renderer/realtime/createRealtimeClient.fail-closed.test.ts > mock realtime fail-closed network boundary > mock 모드의 co-edit SSE는 gateway가 아닌 mock origin handler로만 연결한다
 ✓ src/renderer/realtime/createRealtimeClient.test.ts > createRealtimeClient > 비mock 모드에서는 기존대로 SSE fetch를 시작한다
 ✓ src/renderer/realtime/createRealtimeClient.test.ts > createRealtimeClient > allowMockMode가 있으면 mock origin의 SSE handler로 fetch를 시작한다

 Test Files  2 passed (2)
      Tests  4 passed (4)
   Duration  947ms
```

```text
npx playwright test playwright/slip-collab playwright/1062-line-input-ux --reporter=line

Running 15 tests using 1 worker

  7 failed
    [chromium] › playwright\\slip-collab\\coedit-s2a.shots.spec.ts:269:3 › PR #674 S2a Yjs 코-에디팅 (전표 전체 폼) QA 스크린샷 › desktop-01~03: 편집 모드 진입 → 원격 텍스트+커서 배지 → 수량 셀 clear 재입력
    [chromium] › playwright\\slip-collab\\coedit-s2a.shots.spec.ts:395:3 › PR #674 S2a Yjs 코-에디팅 (전표 전체 폼) QA 스크린샷 › mobile-01: 모바일(390x844) 편집 모드 반응형
    [chromium] › playwright\\slip-collab\\slip-collab-panel.spec.ts:99:3 › §7 입출고전표 협업 패널 › 코멘트 등록 → 목록 반영 → 해결 처리
    [chromium] › playwright\\slip-collab\\slip-collab-panel.spec.ts:131:3 › §7 입출고전표 협업 패널 › 수정 버튼 → 편집 → 수정완료 → 버전이력으로 일원화
    [chromium] › playwright\\slip-collab\\slip-collab-panel.spec.ts:170:3 › §7 입출고전표 협업 패널 › presence list 백필은 다른 시청자와 본인 아바타를 함께 표시한다
    [chromium] › playwright\\slip-collab\\slip-collab-panel.spec.ts:190:3 › PR #674 S2a direct edit inline form은 헤더와 품목 셀을 fieldPath 단위 coedit input으로 렌더한다
    [chromium] › playwright\\slip-collab\\slip-collab-panel.spec.ts:231:3 › §7 입출고전표 협업 패널 › 코멘트 anchor(메모) 클릭 ↔ 버전이력 header.memo 항목이 서로 하이라이트된다 (양방향, PR #747 재수렴 HIGH fix)

  8 passed (2.5m)
```

### 배치 결과

Playwright 15건 중 통과 8건, 실패 7건. SSE handler 추가만으로는 페이지 초기화에 필요한 Axios mock 응답 누락이 남아 있으며, 실패 목록은 위 원문 그대로 보존했다. 이 배치에서 기존 9실패 중 2건은 해소됐고, 7건은 다음 handler 조사 대상으로 남았다.

### 배치 1 보정 확인 — 단일 스펙

```text
npx playwright test playwright/slip-collab/slip-collab-panel.spec.ts --grep "코멘트 등록" --reporter=line

Running 1 test using 1 worker

[1/1] [chromium] › playwright\\slip-collab\\slip-collab-panel.spec.ts:99:3 › §7 입출고전표 협업 패널 › 코멘트 등록 → 목록 반영 → 해결 처리

  1 passed (5.8s)
```

공통 presence client와 slip collab client에 mock-origin transport 사용을 명시한 뒤, 기존 실패 스펙의 대표 단건이 통과했다.

### 메우기 라운드 — 배치 2: `1062-line-input-ux`

```text
npx playwright test playwright/1062-line-input-ux --reporter=line

Running 8 tests using 1 worker

[1/8] ... 후보 2건 이상은 UUID 없이 읽을 수 있는 품목 표 모달을 연다
[2/8] ... 견적 신규 화면은 trailing 빈행을 두고, 후보 확정 후 다음 빈행을 만든다
[3/8] ... 견적 후보 모달을 취소하면 blur lookup 없이 미확정 draft를 버린다
[4/8] ... 견적 확정 품목을 삭제하고 blur하면 공란을 유지한다
[5/8] ... 견적 편집 coedit에서 1행 품목 해제는 2행 로컬·coedit 값을 건드리지 않는다
[6/8] ... provider 실패 폴백과 분리된 자동 빈행 계약은 원문 단정을 유지한다
[7/8] ... 견적 편집 provider 연결 중에는 trailing 빈행 구조 추가를 잠근다
[8/8] ... 견적 편집 coedit은 기존 행만 교체하고 trailing 빈행의 구조 추가를 잠근다

  8 passed (19.1s)
```

배치 결과: 통과 8건, 실패 0건. 실패 스펙 없음.

### 메우기 라운드 — 배치 3: `slip-collab`

```text
npx playwright test playwright/slip-collab --reporter=line

Running 7 tests using 1 worker

[1/7] ... desktop-01~03: 편집 모드 진입 → 원격 텍스트+커서 배지 → 수량 셀 clear 재입력
[CHECK] 매출 전표 수정 인라인 폼 오픈: PASS
[CHECK-①] header.memo 원격 텍스트 병합: PASS
[CHECK-③-memo] 커서 배지 count=1 text="원격사용자A" — PASS
[CHECK-②] items.line-001.quantity 원격 값: "7" (기대: 7 — 원격 사용자가 2→7 수정)
[CHECK-③-qty] 커서 배지 count=1 text="원격사용자B" — PASS
[CHECK-⑤-clear] 수량 clear 후 값: "0" — PASS (7로 복원 안 됨)
[CHECK-⑤-reenter] 수량 재입력 값: "5" (기대: 5)
[CHECK-⑥] UUID 비노출: PASS
[CHECK] 품목 행 수: 4 (기대: 3)
[2/7] ... mobile-01: 모바일(390x844) 편집 모드 반응형
[CHECK] 모바일 수정 인라인 폼 오픈: PASS
[CHECK-⑥] 모바일 UUID 비노출: PASS
[3/7] ... 코멘트 등록 → 목록 반영 → 해결 처리
[4/7] ... 수정 버튼 → 편집 → 수정완료 → 버전이력으로 일원화
[5/7] ... presence list 백필은 다른 시청자와 본인 아바타를 함께 표시한다
[6/7] ... S2a direct edit inline form은 헤더와 품목 셀을 fieldPath 단위 coedit input으로 렌더한다
[7/7] ... 코멘트 anchor(메모) 클릭 ↔ 버전이력 header.memo 항목이 서로 하이라이트된다

  7 passed (21.4s)
```

배치 결과: 통과 7건, 실패 0건. 실패 스펙 없음.

### 메우기 라운드 — 배치 4: `journal-collab` + `partner-order-collab` + `slip-version-history`

```text
npx playwright test playwright/journal-collab playwright/partner-order-collab playwright/slip-version-history --reporter=line

Running 11 tests using 1 worker

[1/11] ... 회계전표 협업 패널 › 코멘트 등록 → 목록 반영 → 해결 처리
[2/11] ... 회계전표 협업 패널 › 코멘트 연결 필드를 선택해 등록하면 anchor 가 반영된다
[3/11] ... 회계전표 협업 패널 › 수정 버튼 → 적요/라인메모 편집 → 수정완료 → 수정 이력 diff 반영
[4/11] ... 회계전표 협업 패널 › 수정 이력 diff 클릭과 코멘트 anchor 클릭이 activeFieldPath 하이라이트를 공유한다
[5/11] ... 회계전표 협업 패널 › REVERSED 분개에서는 수정 버튼이 노출되지 않는다
[6/11] ... 주문 협업 패널 › 코멘트 등록 → 목록 반영 → 해결 처리
[7/11] ... 주문 협업 패널 › 수정 버튼 → 요청사항/납기/라인비고 편집 → 수정완료 → 버전이력으로 일원화
[8/11] ... 잠금 상태 주문(ord-canceled)에서는 수정 버튼이 노출되지 않는다
[9/11] ... 잠금 상태 주문(ord-converted)에서는 수정 버튼이 노출되지 않는다
[10/11] ... 잠금 상태 주문(ord-confirming)에서는 수정 버튼이 노출되지 않는다
[11/11] ... S2b 전표 버전이력 필드 변경 로그 + 복원

  11 passed (15.0s)
```

배치 결과: 통과 11건, 실패 0건. 실패 스펙 없음.

### 메우기 라운드 — 배치 5: `slip-form-v20`

```text
npx playwright test playwright/slip-form-v20 --reporter=line

Running 5 tests using 1 worker

[1/5] ... TC-V1: 전표 작성 폼에서 실재 V20 필드(배송주소·감리주소) 입력란 표시 검증
[2/5] ... TC-V2: 전표 수정 화면 — 거래처 선택 시 사업자번호 readonly 자동 채움(값 대조)
[3/5] ... TC-V3: 전표 작성 — V20 입력값이 저장 요청 payload 에 정확히 매칭
[4/5] ... TC-V4: 전표 상세 페이지 — V20 6필드 읽기 전용 표시(값 대조)
[5/5] ... TC-V5: 전표 수정 — 프로젝트명 갱신값이 저장 요청 payload 에 정확히 매칭

  1 failed
    [chromium] › playwright\\slip-form-v20\\slip-form-v20-matching.spec.ts:486:3 › 전표 V20 입력 → 판매조회 매칭 (TC-V1~V5) › TC-V5: 전표 수정 — 프로젝트명 갱신값이 저장 요청 payload 에 정확히 매칭

  4 passed (22.4s)
```

실패 원문:

```text
TimeoutError: page.waitForRequest: Timeout 10000ms exceeded while waiting for event "request"
  at ...slip-form-v20-matching.spec.ts:520:12
```

TC-V5는 현재 mock.ts에 PUT handler가 없다는 전제 아래 실제 브라우저 PUT을 관찰하도록 작성된 스펙이다. fail-closed에서 PUT handler를 추가하면 Axios interceptor가 in-process 응답을 반환하므로 브라우저 네트워크 요청은 발생하지 않아, handler 추가만으로는 이 단정을 통과시킬 수 없다. 단정을 약화하거나 삭제하지 않고, 이 1건은 설계 조정이 필요한 잔여 건으로 보존한다.

### 회귀 확인 — 기존 `sp-08-4-2-partner-order-edit-put`

```text
npx playwright test playwright/sp-08-4-2-partner-order-edit-put --reporter=line

Running 6 tests using 1 worker

[1/6] ... T1 BE contract keeps direct PUT body shape and optimistic lock field
[2/6] ... T2 FE wires edit button for internal roles and submits direct PUT request
[3/6] ... T3 conflict banner uses Korean reload prompt on 409
[4/6] ... T4 version history panel (버전이력) renders actor, time, and changed field summary
[5/6] ... T5: 409 reload 후 success 피드백 + UUID fallback 가드
[6/6] ... T6: 409 reload 후 재저장 흐름 정적 계약

  6 passed (3.4s)
```

배치 결과: 통과 6건, 실패 0건. 실패 스펙 없음.

### 메우기 라운드 — 배치 6: `slip-form-v20` 재검증

TC-V5를 위해 `PUT /slips/{id}/sales` mock handler를 추가했다. handler는 `SlipUpdateRequest` body를 실제 요청 shape 그대로 기록하고, GET 상세와 동일한 envelope로 응답한다. 스펙은 브라우저 실 네트워크 요청이 아니라 mock interceptor가 기록한 동일 payload를 읽되, `projectName` 정확 일치 단정은 유지했다.

```text
npx playwright test playwright/slip-form-v20 --reporter=line

Running 5 tests using 1 worker

[1/5] ... TC-V1: 전표 작성 폼에서 실재 V20 필드(배송주소·감리주소) 입력란 표시 검증
[2/5] ... TC-V2: 전표 수정 화면 — 거래처 선택 시 사업자번호 readonly 자동 채움(값 대조)
[3/5] ... TC-V3: 전표 작성 — V20 입력값이 저장 요청 payload 에 정확히 매칭
[4/5] ... TC-V4: 전표 상세 페이지 — V20 6필드 읽기 전용 표시(값 대조)
[5/5] ... TC-V5: 전표 수정 — 프로젝트명 갱신값이 저장 요청 payload 에 정확히 매칭

  5 passed (12.4s)
```

배치 결과: 통과 5건, 실패 0건. 실패 스펙 없음.

### 최종 단위 검증 및 파일 확인

```text
npx vitest run src/renderer/api/mock.test.ts src/renderer/realtime/createRealtimeClient.test.ts src/renderer/realtime/createRealtimeClient.fail-closed.test.ts --reporter=verbose

 Test Files  3 passed (3)
      Tests  158 passed | 2 skipped (160)
   Duration  2.89s
```

```text
$trackedWriter = Test-Path 'tools/.s24-build-only/build/deep/tracked-writer.mjs'; $wmockProcesses = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'worktrees\\wmock' }); Write-Output "tracked-writer=$trackedWriter"; Write-Output "wmock-node-processes=$($wmockProcesses.Count)"
tracked-writer=True
wmock-node-processes=0
```

추적 파일 삭제 없음. 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`가 존재하며, wmock 잔류 Node 프로세스도 없다.

## 메우기 라운드 요약

이번 라운드에서 확인한 우선순위 실패 계열은 모두 해소됐다.

- `1062-line-input-ux`: 8/8 통과
- `slip-collab`: 7/7 통과
- `journal-collab` + `partner-order-collab` + `slip-version-history`: 11/11 통과
- `slip-form-v20`: 5/5 통과
- 기존 회귀 `sp-08-4-2-partner-order-edit-put`: 6/6 통과
- 단위 테스트: 158 passed, 2 skipped

이번 라운드의 잔여 실패 스펙: 없음.

## 전량 확인 라운드 — shard 1/8

### 실행 원문

```text
npx playwright test --shard=1/8 --reporter=line

Running 84 tests using 1 worker, shard 1 of 8

  4 failed
    [chromium] › playwright\\ac-4-partner-standardize\\ac-4-partner-standardize.spec.ts:464:3 › AC-4 발송금지 거래처 (blocked-partners) › BP-1 다이얼로그 자동 포커스 + 자동완성 선택 → POST payload partnerCode 단언 → 닫힘
    [chromium] › playwright\\ac-4-partner-standardize\\ac-4-partner-standardize.spec.ts:530:3 › AC-4 발송금지 거래처 (blocked-partners) › BP-2 [#825 CM2] 발송금지 검색=전체 — SUSPENDED 거래처 노출·선택·POST payload 단언
    [chromium] › playwright\\ac-4-partner-standardize\\ac-4-partner-standardize.spec.ts:585:3 › AC-4 발송금지 거래처 (blocked-partners) › BP-3 [#825 재수렴 #5] 확정 선택-draft 불일치 등록 차단 — P1 선택 후 P2 검색어 타이핑 중 등록은 POST 미발생, P2 선택 확정 후 P2 payload 통과
    [chromium] › playwright\\ac-4-partner-standardize\\ac-4-partner-standardize.spec.ts:661:3 › AC-4 발송금지 거래처 (blocked-partners) › BP-4 [#840 R1 dim5 MED-4] 동명(상호 동일·code 상이) committed 게이트 — P1 확정 후 동명 재입력 미선택 등록은 POST 미발생(이름 같아도 차단), P2 명시 선택만 P2 partnerCode payload

  80 passed (2.2m)
```

실패 원문 핵심:

```text
Error: expect(received).not.toBeNull()
Received: null
Timeout 5000ms exceeded while waiting on the predicate
at ac-4-partner-standardize.spec.ts:522:5
at ac-4-partner-standardize.spec.ts:579:5
at ac-4-partner-standardize.spec.ts:656:5
at ac-4-partner-standardize.spec.ts:738:5
```

### shard 1 결과

84건 중 통과 80건, 실패 4건. 실패 스펙은 BP-1, BP-2, BP-3, BP-4이며 모두 발송금지 거래처 POST payload 관찰 실패다. 다음 라운드에서 handler 누락 여부를 조사한다. 현재까지 실제 실행 누계: 84/668.

## 전량 확인 라운드 — shard 2/8

### 실행 원문

```text
npx playwright test --shard=2/8 --reporter=line

Running 91 tests using 1 worker, shard 2 of 8

  1 failed
    [chromium] › playwright\\compensation-failures\\compensation-failures.spec.ts:58:3 › D-SER-23 보상 실패 복구 화면 › 미해소 목록 기본 렌더 — 전표번호 행 + 미해소 배지 표시

    TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
    waiting for locator('[data-testid="compensation-failures-page"]') to be visible

  90 passed (2.0m)
```

### shard 2 결과

91건 중 통과 90건, 실패 1건. 실패 스펙은 D-SER-23 보상 실패 복구 화면 기본 렌더 1건이다. 현재 실행 누계: 175/668 (통과 170, 실패 5).

## 전량 확인 라운드 — shard 3/8

### 실행 원문

```text
npx playwright test --shard=3/8 --reporter=line

Running 77 tests using 1 worker, shard 3 of 8

  15 failed
    [chromium] › playwright\\dispatch-board\\dispatch-modification-redispatch.spec.ts:60:3 › 배차 수정제안 재배차 루프 (배차현황 경유, Option A) › 수정 요청 → mock 수락 → 재배차 시작 시 그룹 미발송 + 작성 중으로 복귀한다
    [chromium] › playwright\\dispatch-board\\dispatch-modification-redispatch.spec.ts:85:3 › 배차 수정제안 재배차 루프 (배차현황 경유, Option A) › 수정 거부 회신 시 상세 상태 배너에 거부 사유가 표시된다
    [chromium] › playwright\\dispatch-board\\dispatch-modification-redispatch.spec.ts:102:3 › 배차 수정제안 재배차 루프 (배차현황 경유, Option A) › 보드 DRAFT 상세에서 기사/차량 수동기입 + 수동 발송완료 시 모달에 배차 완료가 표시된다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-comments.spec.ts:39:3 › AROLOGIS 배차현황 코멘트 mock › 상세 모달에서 코멘트 목록을 보여주고 조회 전용으로 작성/삭제를 막는다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-completed-history.spec.ts:83:3 › AROLOGIS 배차현황 뷰 mock › UPDATE 권한은 상세에서 수정/취소 요청 버튼이 노출되고 코멘트는 조회 전용을 유지한다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-completed-history.spec.ts:97:3 › AROLOGIS 배차현황 뷰 mock › VIEW 전용 사용자는 상세에서 수정/취소 요청 버튼을 볼 수 없다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-completed-history.spec.ts:111:3 › AROLOGIS 배차현황 뷰 mock › 행 클릭 후 차량그룹, 전표, 기사 상세를 보여준다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-completed-history.spec.ts:123:3 › AROLOGIS 배차현황 뷰 mock › 행 클릭은 arologisDispatchId 대신 task UUID 상세 key 를 사용한다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-completed-history.spec.ts:134:3 › AROLOGIS 배차현황 뷰 mock › arologisDispatchId 없는 수동-only 완료 task 도 행 클릭으로 상세를 연다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-completed-history.spec.ts:146:3 › AROLOGIS 배차현황 뷰 mock › UPDATE 권한 사용자는 배차현황 상세에서 타사 기사/차량을 수동 입력한다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-completed-history.spec.ts:164:3 › AROLOGIS 배차현황 뷰 mock › VIEW 전용 사용자는 기사/차량 입력 액션을 볼 수 없다
    [chromium] › playwright\\dispatch-completed-history\\dispatch-completed-history.spec.ts:194:3 › AROLOGIS 배차현황 뷰 mock › 화면 텍스트에 raw UUID가 노출되지 않는다
    [chromium] › playwright\\estimate-version-history\\estimate-version-history.spec.ts:68:3 › Phase 2.2 견적서 버전이력 + 복원 › 버전이력 2건 렌더 + 최신 복원버튼 미노출 + 과거 복원 → confirm → 성공 toast
    [chromium] › playwright\\estimate-version-history\\estimate-version-history.spec.ts:106:3 › Phase 2.2 견적서 버전이력 + 복원 › 편집 불가(QUOTE_ACCEPTED) 견적 — 복원 버튼 비활성 + 안내 문구
    [chromium] › playwright\\groupware-approval-line-config-s4c\\detail-stepview.spec.ts:32:1 › S4c: detail StepView creator/GROUP/USER fallback and non-admin active template label

  62 passed (3.7m)
```

실패 원문 대표:

```text
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('dispatch-task-detail-body')
Timeout: 5000ms

Error: expect(locator).toBeVisible() failed
Locator: getByTestId('dispatch-comment-thread')
Timeout: 5000ms

Error: expect(locator).toBeVisible() failed
Locator: getByTestId('estimate-version-history-panel')
Timeout: 5000ms

Error: expect(locator).toContainText() failed
Locator: getByTestId('groupware-approval-detail-no')
Expected substring: "A2G2-DETAIL-001"
```

### shard 3 결과

77건 중 통과 62건, 실패 15건. 배차 상세/코멘트·견적 버전이력·그룹웨어 상세 handler 표면이 새 실패 후보로 드러났다. 현재 실행 누계: 252/668 (통과 232, 실패 20).

## 전량 확인 라운드 — shard 4/8

### 실행 원문

```text
npx playwright test --shard=4/8 --reporter=line

Running 91 tests using 1 worker, shard 4 of 8

  3 failed
    [chromium] › playwright\\menu-5category-view-only-gates\\view-only-mutation-gates.spec.ts:254:3 › menu-5category view-only mutation gates › 회계 수정 요청 view-only: 수락/거절 버튼이 비활성화된다
    [chromium] › playwright\\menu-5category-view-only-gates\\view-only-mutation-gates.spec.ts:262:3 › menu-5category view-only mutation gates › 회계 수정 요청 update 보유: 수락/거절 버튼이 활성화된다
    [chromium] › playwright\\menu-5category-view-only-gates\\view-only-mutation-gates.spec.ts:320:3 › menu-5category view-only mutation gates › 알리고 주소록 500 뒤 stale focus로 UPDATE가 회수되면 재시도 안내가 권한 안내로 바뀐다

  88 passed (2.1m)
```

실패 원문:

```text
Error: expect(locator).toBeDisabled() failed
Locator: locator('[data-testid^="admin-accounting-edit-requests-approve-"]').first()
Expected: disabled
Timeout: 5000ms

Error: expect(locator).not.toBeDisabled() failed
Locator: locator('[data-testid^="admin-accounting-edit-requests-approve-"]').first()
Expected: not disabled
Timeout: 5000ms

Error: expect(received).toBe(expected)
Expected: 1
Received: 0
at view-only-mutation-gates.spec.ts:362:23
```

### shard 4 결과

91건 중 통과 88건, 실패 3건. 현재 실행 누계: 343/668 (통과 320, 실패 23).

## 전량 확인 라운드 — shard 5/8

### 실행 원문

```text
npx playwright test --shard=5/8 --reporter=line

Running 78 tests using 1 worker, shard 5 of 8

  78 passed (1.3m)
```

### shard 5 결과

78건 중 통과 78건, 실패 0건. 현재 실행 누계: 421/668 (통과 398, 실패 23).

## 전량 확인 라운드 — shard 6/8

### 실행 원문

```text
npx playwright test --shard=6/8 --reporter=line

Running 86 tests using 1 worker, shard 6 of 8

  86 passed (1.6m)
```

### shard 6 결과

86건 중 통과 86건, 실패 0건. 현재 실행 누계: 507/668 (통과 484, 실패 23).

## 전량 확인 라운드 — shard 7/8

### 실행 원문

```text
npx playwright test --shard=7/8 --reporter=line

Running 80 tests using 1 worker, shard 7 of 8

  3 failed
    [chromium] › playwright\\sp-08-6-6-tax-invoice-emit\\sp-08-6-6-tax-invoice-emit.spec.ts:118:3 › SP-08-6-6 세금계산서 발행 (T1~T5) › T1: 발행 CTA → BE POST /{id}/issue 응답 (ISSUED 전이)
    [chromium] › playwright\\sp-09-1-nts-etax-emit-shell\\sp-09-1-nts-etax-emit-shell.spec.ts:301:3 › SP-09-1 NTS e-Tax 국세청 전자세금계산서 발행 shell (T1~T5) › T2: FE 계약 — "세금계산서 발행" 버튼 + emit-nts API + ACCOUNTANT/MASTER 권한
    [chromium] › playwright\\sp-09-1-nts-etax-emit-shell\\sp-09-1-nts-etax-emit-shell.spec.ts:404:3 › SP-09-1 NTS e-Tax 국세청 전자세금계산서 발행 shell (T1~T5) › T3: audit — TAX_INVOICE_EMIT_NTS 감사 로그 + eTaxExternalId 표시 › ISSUED detail 진입

  77 passed (48.4s)
```

실패 원문:

```text
Error: pageerror: Mock handler not found: GET /accounting/tax-invoices/ti-002/realtime, Mock handler not found: GET /accounting/tax-invoices/ti-002/realtime
Expected length: 0
Received length: 2

Error: pageerror: Mock handler not found: GET /accounting/tax-invoices/ti-001/realtime, Mock handler not found: GET /accounting/tax-invoices/ti-001/realtime
Expected length: 0
Received length: 2

Error: ISSUED detail 페이지 로드 실패
Expected: truthy
Received: false
```

### shard 7 결과

80건 중 통과 77건, 실패 3건. 세금계산서 realtime handler 누락 계열이 확인됐다. 현재 실행 누계: 587/668 (통과 561, 실패 26).

## 전량 확인 라운드 — shard 8/8

### 실행 원문

```text
npx playwright test --shard=8/8 --reporter=line

Running 81 tests using 1 worker, shard 8 of 8

  81 passed (2.7m)
```

### shard 8 결과

81건 중 통과 81건, 실패 0건.

## 전량 확인 라운드 — typecheck

### 실행 원문

```text
npm run typecheck

> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

> @samhan/desktop@0.1.0 typecheck:real-qa
> node --test scripts/real-qa-cleanup-scope.test.cjs && node --test scripts/real-qa-scope.test.cjs

ℹ tests 2
ℹ pass 2
ℹ fail 0

ℹ tests 51
ℹ pass 51
ℹ fail 0
```

명령 종료 코드: 0. typecheck 통과.

## 전량 확인 라운드 — 최종 집계

| shard | 실행 | 통과 | 실패 |
|---|---:|---:|---:|
| 1/8 | 84 | 80 | 4 |
| 2/8 | 91 | 90 | 1 |
| 3/8 | 77 | 62 | 15 |
| 4/8 | 91 | 88 | 3 |
| 5/8 | 78 | 78 | 0 |
| 6/8 | 86 | 86 | 0 |
| 7/8 | 80 | 77 | 3 |
| 8/8 | 81 | 81 | 0 |
| 합계 | **668** | **562** | **26** |

668건 중 668건을 실제 실행했다. 못 돈 shard: 없음.

### 전량 잔여 실패 목록

- `ac-4-partner-standardize`: BP-1, BP-2, BP-3, BP-4 (4건)
- `compensation-failures`: 미해소 목록 기본 렌더 (1건)
- `dispatch-board/dispatch-modification-redispatch`: 3건
- `dispatch-completed-history`: 9건
- `estimate-version-history`: 2건
- `groupware-approval-line-config-s4c/detail-stepview`: 1건
- `menu-5category-view-only-gates`: 3건
- `sp-08-6-6-tax-invoice-emit`: T1 (1건)
- `sp-09-1-nts-etax-emit-shell`: T2, T3 (2건)

합계 26건. 모두 이번 전량 확인에서 새로 확인된 잔여 실패이며, 이번 라운드에서는 handler 추가를 수행하지 않고 목록만 보존했다.

## 전량 확인 라운드 — 종료 파일/프로세스 확인

```text
$trackedWriter = Test-Path 'tools/.s24-build-only/build/deep/tracked-writer.mjs'; $wmockProcesses = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'worktrees\\wmock' }); Write-Output "tracked-writer=$trackedWriter"; Write-Output "wmock-node-processes=$($wmockProcesses.Count)"
tracked-writer=True
wmock-node-processes=0
```

삭제된 추적 파일 없음. `tools/.s24-build-only/build/deep/tracked-writer.mjs` 존재. 남은 wmock Node 프로세스 없음.

## 잔여 26건 메우기 라운드 — handler 보강 배치 1

보강 내용:

- accounting/arologis/dispatch/partner/inventory/list-level realtime client에 mock-origin transport 허용 설정 추가
- `POST /api/v1/partners/admin/blocks` handler 추가
- `GET /api/v1/accounting/edit-requests` handler 추가
- `/admin/notification/aligo/address-book/sync` mock 응답을 실제 `AligoAddressBookSyncResponse` shape으로 보강

### 실행 원문

```text
npx playwright test playwright/menu-5category-view-only-gates playwright/compensation-failures playwright/ac-4-partner-standardize --grep "회계 수정 요청|알리고 주소록 500|발송금지|미해소 목록" --reporter=line

Running 8 tests using 1 worker

  8 passed (44.2s)
```

배치 결과: 통과 8건, 실패 0건.

## 잔여 26건 메우기 라운드 — handler 보강 배치 2

### 실행 원문

```text
npx playwright test playwright/dispatch-board/dispatch-modification-redispatch.spec.ts playwright/dispatch-completed-history/dispatch-comments.spec.ts playwright/dispatch-completed-history/dispatch-completed-history.spec.ts playwright/estimate-version-history playwright/groupware-approval-line-config-s4c/detail-stepview.spec.ts playwright/sp-08-6-6-tax-invoice-emit playwright/sp-09-1-nts-etax-emit-shell --reporter=line

Running 29 tests using 1 worker

  29 passed (1.2m)
```

배치 결과: 통과 29건, 실패 0건. 기존 잔여 26건의 원인이었던 mock-origin SSE 경계와 관련 화면 초기화 handler가 해소됐다.

## 전량 재검증 라운드 — shard 1/8

```text
npx playwright test --shard=1/8 --reporter=line

Running 84 tests using 1 worker, shard 1 of 8

  84 passed (1.8m)
```

## Playwright full rerun — shard 2/8

```text
npx playwright test --shard=2/8 --reporter=line

Running 91 tests using 1 worker, shard 2 of 8

  91 passed (1.6m)
```

shard 2 result: 91 executed / 91 passed / 0 failed.

## Playwright full rerun — shard 3/8

```text
npx playwright test --shard=3/8 --reporter=line

Running 77 tests using 1 worker, shard 3 of 8

  77 passed (2.3m)
```

shard 3 result: 77 executed / 77 passed / 0 failed.

## Playwright full rerun — shard 4/8

```text
npx playwright test --shard=4/8 --reporter=line

Running 91 tests using 1 worker, shard 4 of 8

  91 passed (1.9m)
```

shard 4 result: 91 executed / 91 passed / 0 failed.

## Playwright full rerun — shard 5/8

```text
npx playwright test --shard=5/8 --reporter=line

Running 78 tests using 1 worker, shard 5 of 8

  78 passed (1.1m)
```

shard 5 result: 78 executed / 78 passed / 0 failed.

## Playwright full rerun — shard 6/8

```text
npx playwright test --shard=6/8 --reporter=line

Running 86 tests using 1 worker, shard 6 of 8

  86 passed (1.6m)
```

shard 6 result: 86 executed / 86 passed / 0 failed.

## Playwright full rerun — shard 7/8

```text
npx playwright test --shard=7/8 --reporter=line

Running 80 tests using 1 worker, shard 7 of 8

  80 passed (51.4s)
```

shard 7 result: 80 executed / 80 passed / 0 failed.

## Playwright full rerun — shard 8/8

```text
npx playwright test --shard=8/8 --reporter=line

Running 81 tests using 1 worker, shard 8 of 8

  81 passed (2.7m)
```

shard 8 result: 81 executed / 81 passed / 0 failed.

### 전량 재검증 집계

| shard | 실행 | 통과 | 실패 |
|---|---:|---:|---:|
| 1/8 | 84 | 84 | 0 |
| 2/8 | 91 | 91 | 0 |
| 3/8 | 77 | 77 | 0 |
| 4/8 | 91 | 91 | 0 |
| 5/8 | 78 | 78 | 0 |
| 6/8 | 86 | 86 | 0 |
| 7/8 | 80 | 80 | 0 |
| 8/8 | 81 | 81 | 0 |
| 합계 | 668 | 668 | 0 |

8개 shard 모두 실행했으며, 미실행 shard는 없다.

## 마무리 검증

### desktop typecheck 원문

```text
npm run typecheck

> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

Exit code: 0
```

typecheck 통과. 출력 중 기존 real-QA 스코프 신선도 안내 및 줄바꿈 경고가 있었으나 오류는 없었다.

### 파일·프로세스 확인 원문

```text
$trackedWriter = Test-Path 'tools/.s24-build-only/build/deep/tracked-writer.mjs'; $wmockProcesses = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'worktrees\\wmock' }); Write-Output "tracked-writer=$trackedWriter"; Write-Output "wmock-node-processes=$($wmockProcesses.Count)"

tracked-writer=True
wmock-node-processes=0
```

추적 파일 삭제 없음(`tracked-writer.mjs` 존재), wmock 잔여 node 프로세스 없음.
shard 1 결과: 84건 중 통과 84건, 실패 0건.
