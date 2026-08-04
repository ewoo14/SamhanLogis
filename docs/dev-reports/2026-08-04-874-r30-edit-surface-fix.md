# PR #1057 R30 편집 표면 최종 fix 보고서

- 작업 시작 시각: 2026-08-04 (Asia/Seoul)
- 대상 HEAD: `a761fdd71` (detached HEAD)
- 기준 보고서: `docs/dev-reports/2026-08-04-874-r29-final-review.md`
- 목적: R29가 확정한 결함 1·2·3을 한 라운드에서 닫고, 전이 10종 × 편집 표면 3종 × 본인/타인 조합을 새로 열거·검증한다.
- 제한: Git 상태 변경(`commit/add/checkout/stash/restore`) 금지, Docker/DB 쓰기 금지, 지정된 타 PR 파일·백엔드 파일 수정 금지.

## 진행 로그

### 시작

- R29 최종 리뷰 보고서를 먼저 읽었다.
- 조사 스킬의 원칙에 따라 코드 경로 확인과 RED 테스트를 fix보다 먼저 수행한다.
- 이 파일은 작업 시작 전에 생성했으며, 각 단계의 원문 결과를 아래에 즉시 누적한다.

## RED

### RED 실행 명령

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts --reporter=dot
```

## Phase 2 보완 로그

### 영향 테스트 1차 원문

참조 전수로 식별한 7개 테스트를 한 번에 실행했다.

```text
npx vitest run \
  src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx \
  src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx \
  src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx \
  src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts \
  src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx \
  src/renderer/routes/SlipDetailPage.partner-required.test.tsx \
  src/renderer/utils/lineVat.test.ts \
  --reporter=verbose --no-color

Test Files  1 failed | 6 passed (7)
Tests       1 failed | 52 passed (53)
FAIL src/renderer/routes/SlipDetailPage.partner-required.test.tsx
  SlipDetailPage partner-required send guard
  ✓ partnerless outbound send is blocked by the shared preflight guard
  ✓ partnerless outbound send keeps the same Korean alert contract
  ✓ partnerless outbound send does not invoke transition mutation
  × 실제 mobile/desktop 전이 핸들러가 preflight를 조기 차단(early-return)으로 배선한다
    expected source to match /const handleAdvanceStage[\s\S]*?if \(shouldBlockPartnerlessSend/
```

### 1차 영향 테스트 실패 원인과 즉시 수정

기능상 전이는 공통 `handleTransition`에서 이미 조기 차단하지만, 기존 계약 테스트와 desktop footer 표면은
`handleAdvanceStage` 자체의 preflight를 계약으로 보유하고 있었다. `handleAdvanceStage`에 동일한
partnerless-send early return을 복원하고, 통과한 경우에만 공통 조정기를 호출하도록 수정했다. 또한
transition mutation이 409로 거절되는 경우에는 열린 직접수정·기사 표면을 stale로 표시하고 협업 표면을
저장 차단 상태로 바꾼 뒤 최신 전표를 재조회하도록 `onError`를 보강했다. 일반 실패에서는 어떤 폼도 닫지 않는다.

### RED 원문

```text
 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ❯ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (14 tests | 4 failed) 34ms
   × SlipDetailPage lifecycle contract > RED-1: 저장 가능한 협업 입력은 전이 시 보존하거나 명시적으로 폐기 확인한다 11ms
     → expected '/**\n * 전표 상세 + 라이프사이클 transition 화면 …' to contain 'onDirtyChange={setCollabEditDirty}'
   × SlipDetailPage lifecycle contract > RED-2: 전이 성공 시 직접수정·기사 표면도 이전 상태 저장 409 경로를 닫는다 6ms
     → expected '/**\n * 전표 상세 + 라이프사이클 transition 화면 …' to contain 'if (salesEditStale) return'
   × SlipDetailPage lifecycle contract > RED-3: 타 브라우저의 status 변경도 열린 편집 표면을 stale 저장 불가 상태로 수렴시킨다 6ms
     → expected '/**\n * 전표 상세 + 라이프사이클 transition 화면 …' to contain 'previousSlipStatusRef'
   × SlipDetailPage lifecycle contract > RED-4: 전이 실패에서는 discard 조정 플래그만 되돌리고 폼을 닫지 않는다 3ms
     → expected '\n    mutationFn: (vars: { action: Sl…' to contain 'onError'

 Test Files  1 failed (1)
      Tests  4 failed | 10 passed (14)
   Start at 14:53:56
   Duration 3.06s (transform 1.45s, setup 0ms, collect 2.23s, tests 34ms, environment 0ms, prepare 86ms)

 FAIL src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-1: 저장 가능한 협업 입력은 전이 시 보존하거나 명시적으로 폐기 확인한다
AssertionError: expected '/**\n * 전표 상세 + 라이프사이클 transition 화면 …' to contain 'onDirtyChange={setCollabEditDirty}'
 at D:\dev\Samhan-Public\.claude\worktrees\w1057\clients\desktop\src\renderer\routes\SlipDetailPage.lifecycle-contract.test.ts:95:20

 FAIL src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-2: 전이 성공 시 직접수정·기사 표면도 이전 상태 저장 409 경로를 닫는다
AssertionError: expected '/**\n * 전표 상세 + 라이프사이클 transition 화면 …' to contain 'if (salesEditStale) return'
 at D:\dev\Samhan-Public\.claude\worktrees\w1057\clients\desktop\src\renderer\routes\SlipDetailPage.lifecycle-contract.test.ts:111:20

 FAIL src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-3: 타 브라우저의 status 변경도 열린 편집 표면을 stale 저장 불가 상태로 수렴시킨다
AssertionError: expected '/**\n * 전표 상세 + 라이프사이클 transition 화면 …' to contain 'previousSlipStatusRef'
 at D:\dev\Samhan-Public\.claude\worktrees\w1057\clients\desktop\src\renderer\routes\SlipDetailPage.lifecycle-contract.test.ts:119:20

 FAIL src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-4: 전이 실패에서는 discard 조정 플래그만 되돌리고 폼을 닫지 않는다
AssertionError: expected '\n    mutationFn: (vars: { action: Sl…' to contain 'onError'
 at D:\dev\Samhan-Public\.claude\worktrees\w1057\clients\desktop\src\renderer\routes\SlipDetailPage.lifecycle-contract.test.ts:133:37
```

- 결과: 전체 14개 중 기존 계약 10개 GREEN, 신규 RED-1~RED-4 4개 FAIL.
- 실패 이유: 현재 HEAD에 dirty/pending/stale 조정기, 세 표면 close, 외부 status 차단,
  실패 시 discard 플래그 복구가 모두 없다.

## 원인 가설

코드 추적 결과, 세 결함은 별도 API 결함이 아니라 `SlipDetailPage`의 전이 조정기가
`collabEditMode` 하나만 관리하는 구조에서 나온다.

- `transitionMutation.onSuccess`는 `setCollabEditMode(false)`만 호출한다. `salesEditOpen`,
  `purchaseEditOpen`, `editingDriver`는 성공 전이 뒤에도 열려 있고, 이 폼의 저장 경로는
  DRAFT/SAVED 전용이다.
- 협업 입력은 `SlipCollaborationPanel` 내부 `editValues`/`editReason` 로컬 state다. 부모가
  성공 callback에서 edit mode를 false로 만들면 서버에 저장되지 않은 값이 다시 열 때 복구되지
  않는다. 다섯 개의 중간 도착 상태는 백엔드 협업 저장 가드가 허용하므로, 성공 전이 후에도
  dirty 입력을 유지할 수 있어야 한다.
- SSE 수신은 `['slip', id]` query를 invalidate할 뿐이고, 협업 패널은 현재 status를 검사하지
  않는다. 다른 브라우저가 SHIPPING 등으로 바꾸면 로컬 폼은 계속 저장 버튼을 제공한다.

검증 가능한 원인 가설: 전이 요청을 세 편집 표면의 dirty/pending 상태와 분리해 처리한 것이
근본 원인이다. 전이 전에는 pending을 막고 dirty 폐기를 명시적으로 확인하며, 전이 성공 뒤에는
도착 status에서 저장이 유효한 표면만 유지한다. 외부 status 변경으로 저장이 무효화된 dirty
표면은 입력을 화면에 보존하되 저장을 차단하고 충돌 안내를 제공해야 한다. 서버 상태가 변하지
않은 전이 실패에서는 조정 state를 닫지 않아야 한다.

## Phase 1 코드 추적 원문

```text
HEAD: a761fdd71 (detached HEAD)
전이 성공 callback: SlipDetailPage.tsx:1448-1460
  onSuccess: () => {
    setCollabEditMode(false)
    invalidate ['slip', id], ['slips'], ['slipRedline', id]
    setRejectReason('')
  }

편집 표면 state: SlipDetailPage.tsx:1172, 1202, 1222, 1270
  editingDriver / salesEditOpen / purchaseEditOpen / collabEditMode

협업 패널 렌더 조건: SlipCollaborationPanel.tsx:122-126, 404-475
  canEdit && editMode 만 검사하며 현재 전표 status 또는 외부 status 변경을 검사하지 않음.

SSE status 처리: SlipDetailPage.tsx:1363-1437
  slip/realtime event 수신 시 ['slip', id] 를 invalidate하지만 편집 표면 조정 callback은 없음.

직접수정/기사 저장 가드: SlipDetailPage.tsx:1918-1944, 2037, 3740-3831, 3932-3936
  직접수정과 기사 폼은 DRAFT/SAVED에서만 진입 가능하지만 open state가 성공 전이에 의해
  닫히지 않아 SENT 이상에서도 저장 버튼/핸들러 경로가 남음.

전이 실패: 현재 onError 닫기 없음.
  따라서 서버 상태가 바뀌지 않은 400/403/409에서 폼을 유지하는 성과는 보존해야 함.
  단, discard 확인을 성공 전 조기 close로 구현하면 이 불변식을 깨므로 성공 callback에서만 정리해야 함.
```

## Phase 3 구현 결과

### 변경한 파일

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
  - 전이 action의 도착 status를 한 곳에서 계산한다.
  - 직접수정·기사 폼과 협업 폼 각각의 dirty/pending을 전이 전에 확인한다.
  - 전이 성공 시 도착 status에서 저장 가능한 표면은 유지하고, 무효화된 표면만 닫는다.
  - 사용자가 폐기를 확인한 경우에만 유효한 표면도 함께 닫고 고지한다.
  - SSE/refetch로 타 브라우저 status가 바뀌면 clean 표면은 닫고, dirty/pending 표면은 입력을 보존한 stale/blocked 상태로 수렴시켜 저장을 차단한다.
  - 전이 409는 일반 실패와 구분해 열린 표면을 충돌 상태로 고정하고 최신 전표를 재조회한다. 400/403 등 일반 실패에서는 폼·입력을 닫지 않는다.
  - 모바일 `mobilePrimaryAction`, 데스크톱 footer, 삭제 요청 독립 경로가 모두 공통 조정기를 사용하도록 유지했다. partnerless send의 기존 desktop preflight 계약도 유지했다.
- `clients/desktop/src/renderer/components/collab/SlipCollaborationPanel.tsx`
  - 부모에 협업 입력 dirty/pending을 보고한다.
  - 외부 status 충돌 안내를 표시하고, 저장 버튼과 입력을 저장 불가 상태로 만든다. 취소는 가능해 입력을 복사할 기회를 남긴다.
- `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`
  - RED-1~RED-4 실패 테스트를 GREEN 계약으로 고정했다.
  - R30 전이 10종 × 편집 표면 3종 × 본인/타인 정책 matrix를 추가했다.

### GREEN-1: RED-1~RED-4 및 R30 원문

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts --reporter=verbose --no-color

 RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PROCESSING action calls the backend complete transition to enter INSPECTING
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > INSPECTING action calls the backend inspect transition to enter COMPLETED
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > INSPECTING exposes both inspect and reject actions allowed by Slip
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PROCESSING primary action explains inventory application before inspection
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > does not replace the backend INBOUND-only inspection permission guard
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > 일반 SENT 전표는 취소 액션을 노출한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PARTNER_ORDER SENT 전표는 취소 액션을 노출하지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-A: COMPLETED에서 수정 진입과 전이 실행이 모두 가능하다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-B: 전이 후 편집 폼 경로에서 409가 나지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-C: 전이 없이 수정 → 수정완료 하는 정상 경로가 동작한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-1: 저장 가능한 협업 입력은 전이 시 보존하거나 명시적으로 폐기 확인한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-2: 전이 성공 시 직접수정·기사 표면도 이전 상태 저장 409 경로를 닫는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > RED-3: 타 브라우저의 status 변경도 열린 편집 표면을 stale 저장 불가 상태로 수렴시킨다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > RED-4: 전이 실패에서는 discard 조정 플래그만 되돌리고 폼을 닫지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > R30: 전이 10종 × 편집 표면 3종 × 본인/타인 조정 정책을 전수 고정한다

 Test Files  1 passed (1)
 Tests       15 passed (15)
 Start at 15:12:56
 Duration 3.14s (transform 1.74s, setup 0ms, collect 2.55s, tests 15ms, environment 0ms, prepare 147ms)
```

### GREEN-2: 변경 파일 참조 테스트 전수 원문

참조 검색 결과의 7개 테스트 파일을 모두 실행했다.

```text
npx vitest run src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx src/renderer/routes/SlipDetailPage.partner-required.test.tsx src/renderer/utils/lineVat.test.ts --reporter=dot --no-color

 RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ✓ src/renderer/utils/lineVat.test.ts (38 tests) 16ms
 ✓ src/renderer/routes/SlipDetailPage.partner-required.test.tsx (4 tests) 8ms
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (15 tests) 27ms
 ✓ src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx (3 tests) 264ms
 ✓ src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx (94 tests) 152ms
 ✓ src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx (5 tests) 304ms
 ✓ src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx (4 tests) 412ms

 Test Files  7 passed (7)
 Tests       163 passed (163)
 Start at 15:09:09
 Duration 4.54s (transform 4.45s, setup 0ms, collect 15.08s, tests 1.18s, environment 3.10s, prepare 1.74s)
```

최종 409 assertion 추가 후 동일 전수집합을 재실행한 원문:

```text
 RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ✓ src/renderer/utils/lineVat.test.ts (38 tests) 14ms
 ✓ src/renderer/routes/SlipDetailPage.partner-required.test.tsx (4 tests) 10ms
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (15 tests) 32ms
 ✓ src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx (94 tests) 298ms
 ✓ src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx (5 tests) 467ms
 ✓ src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx (3 tests) 529ms
   ✓ SlipCollaborationPanel 협업 패널 배치 > 협업 헤더와 changeSet 수정 이력 목록을 제거하고 코멘트와 버전 이력만 렌더한다 371ms
 ✓ src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx (4 tests) 576ms
   ✓ SlipCollaborationPanel + SlipVersionHistoryPanel 실컴포넌트 연동 (접두사 정합 회귀 가드) > memo anchor 코멘트 클릭 → header.memo 버전이력 항목이 하이라이트된다 (정방향) 406ms

 Test Files  7 passed (7)
 Tests       163 passed (163)
 Start at 15:16:28
 Duration 5.40s (transform 5.07s, setup 0ms, collect 18.09s, tests 1.93s, environment 4.13s, prepare 1.09s)
```

최종 lifecycle 계약 테스트 재실행 원문:

```text
 RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PROCESSING action calls the backend complete transition to enter INSPECTING
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > INSPECTING action calls the backend inspect transition to enter COMPLETED
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > INSPECTING exposes both inspect and reject actions allowed by Slip
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PROCESSING primary action explains inventory application before inspection
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > does not replace the backend INBOUND-only inspection permission guard
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > 일반 SENT 전표는 취소 액션을 노출한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PARTNER_ORDER SENT 전표는 취소 액션을 노출하지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-A: COMPLETED에서 수정 진입과 전이 실행이 모두 가능하다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-B: 전이 후 편집 폼 경로에서 409가 나지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-C: 전이 없이 수정 → 수정완료 하는 정상 경로가 동작한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-1: 저장 가능한 협업 입력은 전이 시 보존하거나 명시적으로 폐기 확인한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-2: 전이 성공 시 직접수정·기사 표면도 이전 상태 저장 409 경로를 닫는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-3: 타 브라우저의 status 변경도 열린 편집 표면을 stale 저장 불가 상태로 수렴시킨다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-4: 전이 실패에서는 discard 조정 플래그만 되돌리고 폼을 닫지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > R30: 전이 10종 × 편집 표면 3종 × 본인/타인 조정 정책을 전수 고정한다

 Test Files  1 passed (1)
 Tests       15 passed (15)
 Start at 15:16:47
 Duration 4.09s (transform 2.06s, setup 0ms, collect 3.11s, tests 17ms, environment 0ms, prepare 144ms)
```

R30 matrix를 본인/타인 × 직접/기사/협업 60칸으로 확장한 뒤의 최종 재실행 원문:

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts --reporter=verbose --no-color

 RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PROCESSING action calls the backend complete transition to enter INSPECTING
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > INSPECTING action calls the backend inspect transition to enter COMPLETED
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > INSPECTING exposes both inspect and reject actions allowed by Slip
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PROCESSING primary action explains inventory application before inspection
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > does not replace the backend INBOUND-only inspection permission guard
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > 일반 SENT 전표는 취소 액션을 노출한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > PARTNER_ORDER SENT 전표는 취소 액션을 노출하지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-A: COMPLETED에서 수정 진입과 전이 실행이 모두 가능하다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-B: 전이 후 편집 폼 경로에서 409가 나지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-C: 전이 없이 수정 → 수정완료 하는 정상 경로가 동작한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-1: 저장 가능한 협업 입력은 전이 시 보존하거나 명시적으로 폐기 확인한다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-2: 전이 성공 시 직접수정·기사 표면도 이전 상태 저장 409 경로를 닫는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-3: 타 브라우저의 status 변경도 열린 편집 표면을 stale 저장 불가 상태로 수렴시킨다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > RED-4: 전이 실패에서는 discard 조정 플래그만 되돌리고 폼을 닫지 않는다
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts > SlipDetailPage lifecycle contract > R30: 전이 10종 × 편집 표면 3종 × 본인/타인 조정 정책을 전수 고정한다

 Test Files  1 passed (1)
 Tests       15 passed (15)
 Start at 15:19:29
 Duration 3.04s (transform 1.59s, setup 0ms, collect 2.40s, tests 15ms, environment 0ms, prepare 146ms)
```

같은 변경 파일 참조 전수 7개 파일의 최종 재실행 원문:

```text
npx vitest run [7개 참조 테스트 파일] --reporter=dot --no-color

 RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop
 ✓ src/renderer/utils/lineVat.test.ts (38 tests) 16ms
 ✓ src/renderer/routes/SlipDetailPage.partner-required.test.tsx (4 tests) 7ms
 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (15 tests) 19ms
 ✓ src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx (94 tests) 129ms
 ✓ src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx (5 tests) 238ms
 ✓ src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx (3 tests) 272ms
 ✓ src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx (4 tests) 363ms

 Test Files  7 passed (7)
 Tests       163 passed (163)
 Start at 15:19:11
 Duration 4.63s (transform 4.42s, setup 0ms, collect 17.08s, tests 1.04s, environment 3.21s, prepare 1.70s)
```

### 타입체크 실행 결과

```text
npm run typecheck

> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도] typecheck 대상 확인 완료
tsc -p tsconfig.node.json --noEmit: exit code 0
tsc -p tsconfig.web.json --noEmit: exit code 0
> @samhan/desktop@0.1.0 typecheck:real-qa
✔ real-QA 추적 집합 검사 및 공식 공유 하네스 테스트 50건 통과
ℹ tests 50
ℹ pass 50
ℹ fail 0

Process exit code: 0
```

타입체크 중 기존 로컬 미추적 real-QA 스펙 1개에 대한 로컬 실행 모드 경고와 CRLF 경고가 출력됐지만,
검사 실패는 없었다. 해당 파일은 이번 라운드에서 생성·수정하지 않았다.

## 새로 가능해진 상태·화면 조합 전수표

표의 `직접`은 SAVED/DRAFT 직접수정 폼, `기사`는 OUTBOUND 기사 폼, `협업`은
`SlipCollaborationPanel` 편집 표면이다. `유지`는 저장 가능하므로 입력을 그대로 두는 뜻이다.
`닫힘`은 저장 경로가 무효화되어 성공 후 닫는 뜻이다. 타인 열의 `stale/차단`은 dirty/pending
입력을 화면에 보존하지만 저장을 disabled하고 사용자에게 충돌을 고지한다. clean이면 즉시 닫는다.

| 전이 (도착) | 본인 브라우저 — 직접 / 기사 / 협업 | 타인 브라우저 — 직접 / 기사 / 협업 |
|---|---|---|
| send → SENT | 닫힘 / 닫힘 / 유지 | clean: 닫힘 / 닫힘 / 유지; dirty·pending: stale / stale / blocked |
| accept → ACCEPTED | 닫힘 / 닫힘 / 유지 | clean: 닫힘 / 닫힘 / 유지; dirty·pending: stale / stale / 유지 |
| reject → REJECTED | 닫힘 / 닫힘 / 닫힘 | clean: 닫힘 / 닫힘 / 닫힘; dirty·pending: stale / stale / blocked |
| process → PROCESSING | 닫힘 / 닫힘 / 유지 | clean: 닫힘 / 닫힘 / 유지; dirty·pending: stale / stale / 유지 |
| complete → INSPECTING | 닫힘 / 닫힘 / 유지 | clean: 닫힘 / 닫힘 / 유지; dirty·pending: stale / stale / 유지 |
| inspect → COMPLETED | 닫힘 / 닫힘 / 유지 | clean: 닫힘 / 닫힘 / 유지; dirty·pending: stale / stale / 유지 |
| ship → SHIPPING | 닫힘 / 닫힘 / 닫힘 | clean: 닫힘 / 닫힘 / 닫힘; dirty·pending: stale / stale / blocked |
| deliver → DELIVERED | 닫힘 / 닫힘 / 닫힘 | clean: 닫힘 / 닫힘 / 닫힘; dirty·pending: stale / stale / blocked |
| confirm → CONFIRMED | 닫힘 / 닫힘 / 유지 | clean: 닫힘 / 닫힘 / 유지; dirty·pending: stale / stale / 유지 |
| cancel → CANCELED | 닫힘 / 닫힘 / 닫힘 | clean: 닫힘 / 닫힘 / 닫힘; dirty·pending: stale / stale / blocked |

`save → SAVED`는 아래 lifecycle 10종에 포함되지 않는 직접수정 저장 operation이며, 저장 가능한
직접수정·협업 표면을 유지하는 별도 경로로 구현했다.

본인 브라우저에 dirty 입력이 있으면 위 전이 직전에 저장/폐기 확인을 띄운다. 취소하면 전이하지
않고 입력을 유지한다. 확인하면 명시적으로 폐기한 뒤 위 표의 성공 후 정책을 적용한다. 따라서
저장 가능한 협업 입력은 자동으로 조용히 삭제되지 않는다.

## 참조 전수 결과

### 변경 식별자 검색

```text
rg -n "transitionDestinationStatus|isDirectEditStatus|isCollabEditStatus|transitionDiscardRef|previousSlipStatusRef|salesEditStale|purchaseEditStale|editingDriverStale|collabEditBlockedReason|onDirtyChange|onPendingChange|setCollabEditMode" clients/desktop/src/renderer/routes/SlipDetailPage.tsx clients/desktop/src/renderer/components/collab/SlipCollaborationPanel.tsx clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts
```

결과를 식별자별로 대조해 정의·호출·렌더 prop·계약 테스트의 참조를 모두 확인했다. 제거·이동·개명한
기존 식별자는 없으며, 남은 참조는 위 3개 파일 안의 의도된 정의/소비뿐이다. 검색 결과에 없는
오래된 단일 `setCollabEditMode(false)` 성공-only 조정 경로는 남기지 않았다.

### 변경 파일을 참조하는 테스트 검색 결과

```text
clients/desktop/src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx
clients/desktop/src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx
clients/desktop/src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx
clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts
clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx
clients/desktop/src/renderer/routes/SlipDetailPage.partner-required.test.tsx
clients/desktop/src/renderer/utils/lineVat.test.ts
```

## 조사 스킬 종료 판정

```text
DEBUG REPORT
Symptom:       lifecycle 전이 후 협업·직접수정·기사 편집 표면이 저장 가능성 변화와 무관하게 닫히거나 남아 409를 만듦.
Root cause:    전이 성공 callback이 collabEditMode 하나만 닫았고, dirty/pending 및 타 브라우저 status 변화 조정기가 없었음.
Fix:           SlipDetailPage.tsx:1109-1138, 1570-1621, 2085-2160 및 SlipCollaborationPanel.tsx:29-37, 242-252, 404-482.
Evidence:      RED-1~RED-4/R30 15/15, 영향 테스트 7/7 파일 163/163, typecheck exit code 0.
Regression:    SlipDetailPage.lifecycle-contract.test.ts:94-172.
Status:        DONE_WITH_CONCERNS — 금지된 Docker/DB/재배포 없이 실제 SSE·서버 409 왕복은 실행하지 않음.
```

## 최종 상태 및 이 라운드가 보지 않은 것

- `git diff --check`: 출력 없음, 통과.
- Git 상태 변경 명령은 실행하지 않았다. 현재 변경은 product 3개 파일, 기존 테스트 1개 파일,
  신규 보고서 1개뿐이다.
- 새로 만든 파일: `docs/dev-reports/2026-08-04-874-r30-edit-surface-fix.md` 1개.
- 백엔드 전이 의미, DB, Docker, 재배포, 금지된 타 PR 파일은 보지 않았고 수정하지 않았다.
- 이 라운드는 실제 브라우저 2개를 띄운 SSE 왕복, 실제 서버 409 응답, 실제 DB 저장을 수행하지
  않았다. 대신 status 조정기·전이 도착 정책·충돌 차단을 계약 테스트로 고정하고, 영향 테스트
  전수와 타입체크를 실행했다.
- 따라서 남은 실환경 확인 항목은 SSE 지연 중 저장 클릭 race, 각 role별 실제 권한 조합,
  백엔드가 반환하는 409 payload 문구의 UI 표시뿐이다. 이 항목들은 이번 라운드의 코드 변경으로
  새로 열지 않았으며, 사용자 승인 없이 DB/Docker/배포를 건드리지 않기 위해 여기서 멈춘다.
