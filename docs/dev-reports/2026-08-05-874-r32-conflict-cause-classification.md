# PR #1057 R32 — 전이 409 원인 분류 보고서

## 범위

이번 라운드는 R31 결함 1만 다룬다. 재고 부족 같은 정상 업무 실패 409가 동시 전이로 오인되어 열린 직접·기사·협업 편집 표면을 저장 불가로 잠그던 경로를 수정한다. 결함 2·3·4, 시나리오 2~5, 다른 트랙 파일, `docs/handoff/`는 보지 않거나 수정하지 않는다.

## 진단 — 서버 응답에서 원인 구분 가능 여부

**구분 가능하다. 서버 계약 변경은 이번 라운드에 필요하지 않다.**

- 전표 상태 불일치는 `Slip.requireStatus`가 `ErrorCode.CONFLICT`와 현재 상태 문구를 만든다.
- 낙관적 락 충돌은 slip-service `GlobalExceptionHandler`가 `409`, `code=CONFLICT`, `message=동시 수정 충돌 — 다시 시도해 주세요`로 응답한다.
- OUTBOUND `accept`의 재고 예약 실패는 `SlipService.accept` → `InventoryClient.reserveInstances` → inventory-service 409 경로다. `InventoryClient`는 다운스트림 4xx 본문을 버리지 않고 `inventory-service 호출 실패(CONFLICT): ...` 메시지에 포함한다.
- inventory-service의 serial reserve 부족 응답은 `message`에 `재고 부족`을 포함한다. 따라서 최상위 HTTP status와 `code`는 같아도, 현재 API 응답의 message에 있는 재고 부족 표지가 프런트 분류 근거가 된다.

분류기는 `409`이면서 응답 message 계열에 `재고 부족`, `가용 재고 부족`, `예약 재고 부족`이 있을 때만 업무 실패로 분류한다. 그 외 409는 종전 동시 전이 경로로 남겨, 알 수 없는 409를 저장 가능하다고 열어 두지 않는다. 400·403·500은 분류기의 대상이 아니다.

근거 파일:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:485-496`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:841-884`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java:187-196, 287-325`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/GlobalExceptionHandler.java:28-33, 101-118`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockInstanceController.java:117-140`

## RED 원문

수정 코드 작성 전에 추가한 `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`의 R32 RED-A/B를 실행했다.

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts

 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ❯ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (17 tests | 2 failed) 24ms
   × SlipDetailPage lifecycle contract > R32 RED-A: 진짜 동시 전이는 종전 문구·stale/blocked를 유지하고 비-409 처리는 변하지 않는다 5ms
     → classifyTransitionConflict is not a function
   × SlipDetailPage lifecycle contract > R32 RED-B: 재고 부족 409는 업무 실패로 안내하고 직접·기사·협업 입력을 잠그지 않는다 1ms
     → classifyTransitionConflict is not a function

 Test Files 1 failed
      Tests 17 tests | 2 failed (15 passed)
```

RED-A가 고정하는 것:

- 실제 동시 전이 409는 종전 문구를 그대로 사용한다.
- 그 원인은 편집 표면 차단 정책으로 유지된다.
- 400·403·500은 409 분류 경로를 타지 않는다.

RED-B가 고정하는 것:

- 재고 부족 409는 재고 부족 안내를 사용하고 동시 전이 문구를 사용하지 않는다.
- 직접·기사·협업 표면 모두 차단하지 않는다.
- `accept` 및 재고 반영 경로인 `complete` 조합에서 같은 편집 가능 정책을 유지한다.

## GREEN 원문

원인 분류기 구현 후 RED 대상 테스트를 다시 실행했다.

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts

 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (17 tests) 21ms

 Test Files 1 passed (1)
      Tests 17 passed (17)
```

변경 파일을 참조하는 테스트 전수도 실행했다.

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx src/renderer/routes/SlipDetailPage.partner-required.test.tsx src/renderer/utils/lineVat.test.ts

 Test Files 4 passed (4)
      Tests 153 passed (153)
```

사용자 지정 전체 검증의 `npm run typecheck`는 design-system dist를 같은 워크트리에서 갱신한 뒤 성공했다.

```text
npm run typecheck

Exit code: 0
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

전체 `npx vitest run`은 R32 관련 테스트를 포함한 나머지는 통과했으나, 기존 Electron 산출물 상호운용 가드 1건이 로컬 의존성 설치 상태 때문에 실패했다. 첫 실행은 `out/main/index.js` 부재였고, 로컬 desktop build 후 재실행한 원문 원인은 다음과 같다.

```text
FAIL src/main/build-output-cjs-interop.test.ts
Error: 외부 패키지 import 가 실제 Node ESM 로더에서 실패했다:
- electron-store (import Store from 'electron-store'):
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
Node.js v24.14.1
```

해당 실패는 변경한 SlipDetailPage 코드와 무관하며, 변경 파일 참조 전수 4개 파일 153/153과 typecheck는 통과했다. 백엔드는 수정하지 않았으므로 slip-service 테스트는 실행 대상이 아니다.

## 자기 표면 닫기 3절

### 1. 새로 가능해진 상태 조합 전수

재고 부족 409가 발생할 수 있는 전이(`accept`, `complete`)와 현재 열린 편집 표면 3종을 모두 밟았다. 각 조합은 `transitionConflictEditPolicy('inventory')`가 안내 문구를 재고 부족으로 고정하고 `blockEditSurfaces=false`를 반환하는 계약 테스트로 실행했다.

| 409 원인 | 열린 폼 | 전이 종류 | 기대 결과 | 실행 결과 |
|---|---|---|---|---|
| 재고 부족 | 직접수정 | accept, complete | 재고 부족 안내, 저장 가능 | GREEN |
| 재고 부족 | 기사 | accept, complete | 재고 부족 안내, 저장 가능 | GREEN |
| 재고 부족 | 협업 | accept, complete | 재고 부족 안내, 저장 가능 | GREEN |
| 진짜 동시 전이 | 직접수정 | save, send, accept, process, complete, inspect, ship, deliver, confirm, cancel | 종전 문구, stale | GREEN |
| 진짜 동시 전이 | 기사 | 위 10종 | 종전 문구, stale | GREEN |
| 진짜 동시 전이 | 협업 | 위 10종 | 종전 문구, blocked | GREEN |

재고 부족 조합 6개와 진짜 동시 전이 조합 30개를 합쳐 36개를 실행했다. 400·403·500은 모두 `other`로 분류되어 기존 409 전용 처리에 들어가지 않는 A3도 함께 확인했다. 표에 없는 409는 보수적으로 동시 전이로 처리한다.

### 2. 식별자·문구 전수 검색

다음 검색을 워크트리 전체에서 실행했다. `.git`, `node_modules`, build 산출물만 제외했으며 소스·테스트·Playwright·문서를 포함했다.

```text
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!build/**' --glob '!coverage/**' --glob '!*.map' "classifyTransitionConflict|transitionConflictEditPolicy|CONCURRENT_TRANSITION_MESSAGE|INVENTORY_SHORTAGE_MESSAGE|재고가 부족하여 전표를 수락할 수 없습니다|다른 사용자가 먼저 전표를 전이했습니다" .
```

결과는 `SlipDetailPage.tsx`의 구현·호출, lifecycle 계약 테스트, 이 R32 보고서, 과거 R31 증적의 종전 문구뿐이었다. Playwright 및 다른 문서에 새 식별자·새 재고 안내 문구의 누락 사용은 없었다.

### 3. 변경 파일 참조 테스트 전수 실행

`SlipDetailPage.tsx`를 import하거나 파일 경로를 읽는 테스트 전수는 다음 4개였다.

- `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`
- `clients/desktop/src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx`
- `clients/desktop/src/renderer/routes/SlipDetailPage.partner-required.test.tsx`
- `clients/desktop/src/renderer/utils/lineVat.test.ts` (문서/경로 계약 참조)

네 파일 모두 실행했고 153/153 GREEN이다.

## 이 라운드가 보지 않은 것

- 결함 2: INBOUND 권한 화면/서버 불일치
- 결함 3: 협업수정 진입점
- 결함 4: 취소를 삭제로 표시
- 시나리오 2~5 회계 배분·전기
- 컨테이너 재배포, DB 쓰기, 실제 전이 버튼 클릭
- 다른 트랙 `#1061`, `#1045`, `#1063`, `#1066` 파일
- `docs/handoff/`
