# PR #1057 R33 권한·라벨 정합 보고서

## 범위와 판정 기준

이번 라운드는 개발책임자 결정에 따라 R31 결함 2·3·4를 닫고, R32가 남긴 409 분류 결합을
깨질 때 드러나는 계약으로 보강한다. 서버 권한 계약은 변경하지 않는다. 화면이 전표 유형별
서버 계약을 그대로 따르는 것이 기준이다.

착수 전 확인:

```text
git -C . rev-parse --show-toplevel     # D:/dev/Samhan-Public/.claude/worktrees/w1057
git -C . branch --show-current         # feat/874-set-riusage-global-dc
git -C . rev-parse HEAD                # 0c7b4bf69246a5c495f2f9d7e1fe3a449e353889
```

이번 라운드에서 수정하는 파일은 다음 세 기존 코드 파일, 네 기존 정적 계약 스펙, 이 보고서다.

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`
- `clients/desktop/src/renderer/stores/session.ts` (기존 헬퍼 제거 주석의 새 계약명 동기화)
- `clients/desktop/playwright/sp-08-5-2-purchase-slip-edit-put/sp-08-5-2-purchase-slip-edit-put.spec.ts`
- `clients/desktop/playwright/sp-08-5-3-purchase-slip-soft-delete/sp-08-5-3-purchase-slip-soft-delete.spec.ts`
- `clients/desktop/playwright/sp-08-6-2-sales-slip-edit-put/sp-08-6-2-sales-slip-edit-put.spec.ts`
- `clients/desktop/playwright/sp-08-6-3-sales-slip-soft-delete/sp-08-6-3-sales-slip-soft-delete.spec.ts`

컨테이너 재배포, DB 쓰기, 실제 전이 버튼 클릭, 다른 트랙 파일과 `docs/handoff/`는 범위에서
제외한다.

## 결함별 진단

### 결함 2 — INBOUND 전이 권한의 양방향 불일치

화면의 기존 `slipActionPageCode(action)`은 전표 유형을 받지 않고 `save/send`를
`sales.slip.edit`, `confirm`을 `sales.slip.confirm`, `cancel`을 `sales.slip.cancel`로
고정했다. 서버 `SlipController`는 INBOUND의 저장·전송·취소·확정을 모두
`purchases.slip.edit UPDATE`로 검사한다. `inspect`는 공통
`slip.transfer.process UPDATE`에 더해 INBOUND에서 `inbound.inspection UPDATE`를
추가로 검사한다.

따라서 MANAGER의 INBOUND INSPECTING 처리 완료는 화면에서 활성인데 서버가 거부하고,
WAREHOUSE의 INBOUND 저장·전송·취소·확정은 서버가 허용하는데 화면에서 비활성이다.

### 결함 3 — DRAFT/SAVED 협업수정 진입점 소실

상단 협업수정 버튼 조건이
`canCollabEdit && !canDirectEditSales && !canDirectEditPurchase`였다. 직접수정 권한이
있는 사용자는 협업수정 버튼이 렌더되지 않는다. 직접수정 payload에는 거래처 연락처·주소·대표자,
할인 정보, 회수 조건, 약정 조건 등 overlay 전용 필드가 없고, 서버는 DRAFT/SAVED 협업수정을
허용한다.

### 결함 4 — 취소와 soft delete의 라벨 충돌

상단 `삭제`는 `deletePurchaseSlip`/`deleteSalesSlip`을 호출해 `is_deleted=true`가 되는
soft delete다. 하단 `삭제`는 `handleTransition('cancel')`을 호출해 상태를 `CANCELED`로
바꾼다. 두 동작은 데이터 변경이 다르므로 상단은 `전표 삭제`, 하단은 `전표 취소`로
분리해야 한다. 취소 핸들러와 확인 문구도 취소 동작을 직접 설명해야 한다.

### R32 결합 — 409 원인 표지 변경의 조용한 fallback

R32는 inventory-service가 전달하는 `재고 부족` 표지로 재고 부족 409를 분류했다. 기존
분류기는 인식하지 못한 409를 `concurrent`로 반환했으므로 서버 문구가 바뀌면 사용자에게
동시 전이로 오인시키며 편집 표면을 종전 정책으로 잠갔다.

서버 계약은 이 PR에서 바꾸지 않는다. 화면은 알려진 `재고 부족` 표지를 계속 인식하고,
표지가 없는 409는 `unknown`으로 분리해 별도 안내와 새로고침 정책을 사용한다. 또한
`InventoryClient.java`의 서버 표지를 계약 테스트에서 함께 읽어 결합이 깨지면 테스트가
실패하도록 한다.

## 불변식

1. 화면이 노출·활성화하는 액션은 `SlipController`의 INBOUND/OUTBOUND 권한 계약과 같다.
2. 서버가 허용하는 DRAFT/SAVED 협업수정에는 직접수정 권한 보유 여부와 무관하게 화면 진입점이 있다.
   SHIPPING·DELIVERED·CANCELED·REJECTED에서는 열리지 않는다.
3. soft delete는 삭제 이름과 삭제 mutation을 유지하고, CANCELED 전이는 취소 이름과
   `handleTransition('cancel')`을 사용한다.
4. R32의 알려진 재고 부족·동시 전이 분류는 유지하고, 알려지지 않은 409를 동시 전이로
   조용히 대체하지 않는다.

## RED 원문

제품 코드 수정 전에 회귀 계약을 추가하고 다음 명령을 실행했다.

개발책임자가 요구한 RED-A/B 원문:

```text
RED-A  막혀 있어야 할 것이 그대로 막히고, 되던 것이 그대로 된다
  A1  권한 없는 계정은 여전히 해당 전이 버튼이 disabled 다 (유형별로)
  A2  MANAGER 의 OUTBOUND 전 전이가 종전대로 동작한다
  A3  협업수정 진입점을 추가해도 서버가 거부하는 상태(SHIPPING·DELIVERED·CANCELED·REJECTED)에서는 안 열린다
  A4  soft delete 는 여전히 soft delete 로 동작한다 (취소로 바뀌지 않는다)
  A5  R32 의 재고 부족/동시 전이 분류가 그대로 동작한다

RED-B  결함이 재발하지 않는다
  B1  MANAGER 는 INBOUND INSPECTING 에서 서버가 거부할 버튼이 활성이 아니다
  B2  WAREHOUSE 는 INBOUND 저장·전송·취소·확정을 화면에서 할 수 있다
  B3  직접수정 권한이 있어도 DRAFT/SAVED 에서 협업수정 진입점이 있다
  B4  취소 버튼과 삭제 버튼이 서로 다른 이름이고, 각 이름이 실제 동작과 맞다
  B5  409 분류의 서버-화면 결합이 깨지면 테스트가 실패한다
```

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts

 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1057/clients/desktop

 ❯ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (21 tests | 4 failed) 36ms
   × SlipDetailPage lifecycle contract > R33 RED-A/B: 전표 유형별 서버 권한 요구사항과 화면 활성 조건을 일치시킨다 5ms
     → slipActionPermissionRequirements is not a function
   × SlipDetailPage lifecycle contract > R33 RED-B3: 직접수정 권한이 있어도 DRAFT/SAVED 협업수정 진입점이 있고 종결 상태는 닫혀 있다 0ms
     → canOpenCollabEdit is not a function
   × SlipDetailPage lifecycle contract > R33 RED-B4: 취소와 soft delete는 이름·핸들러·확인 문구가 실제 동작과 다르지 않다 11ms
     → expected source to contain 'const handleCancelSlip'
   × SlipDetailPage lifecycle contract > R33 RED-B5: 알 수 없는 409를 동시전이로 조용히 대체하지 않고 서버 표지 결합을 검사한다 2ms
     → expected 'concurrent' to be 'unknown'

 Test Files 1 failed (1)
 Tests 21 tests | 4 failed | 17 passed
```

RED-A 원문은 다음을 고정한다.

- INBOUND 저장·전송·취소·확정은 `purchases.slip.edit UPDATE`여야 한다.
- INBOUND 검수 완료는 `slip.transfer.process UPDATE`와 `inbound.inspection UPDATE`를 모두 요구한다.
- MANAGER는 INBOUND 검수 완료에서 비활성이고 WAREHOUSE는 INBOUND 저장·전송·취소·확정에서 활성이다.
- OUTBOUND MANAGER의 종전 전이 집합은 유지된다.

RED-B 원문은 다음을 고정한다.

- 직접수정 권한이 있어도 DRAFT/SAVED 협업수정 진입점이 있다.
- SHIPPING·DELIVERED·CANCELED·REJECTED 협업수정 진입점은 닫혀 있다.
- soft delete와 CANCELED 전이는 서로 다른 식별자·라벨·호출 경로를 갖는다.
- 재고 서버 표지의 인식 결합이 사라지거나 409 미인식 fallback이 되면 테스트가 실패한다.

## 조치

수정 전 RED를 확인했으므로 다음 순서로 구현한다.

1. 유형과 액션을 함께 받는 서버 권한 요구사항 계산기를 도입하고, 전이 실행·disabled·취소
   표시의 모든 화면 경로가 같은 계산기를 사용하도록 한다.
2. 협업수정 진입을 직접수정 조건과 독립시키고, 사용자에게 `협업 수정`으로 표시한다.
3. soft delete `전표 삭제`와 cancel `전표 취소`를 라벨·핸들러·확인 문구에서 분리한다.
4. R32 분류기에 `unknown`을 추가해 서버 표지 변경을 별도 오류로 드러내고, 서버 표지
   계약 테스트를 추가한다.

구현 결과:

- `slipActionPermissionRequirements(action, mode)`가 INBOUND/OUTBOUND와 액션을 함께 받아
  서버 계약을 계산한다. 저장·전송·취소·확정은 INBOUND에서
  `purchases.slip.edit UPDATE`, INBOUND 검수 완료는
  `slip.transfer.process UPDATE`와 `inbound.inspection UPDATE` 모두를 요구한다.
  `handleTransition`, 진행 버튼 disabled, 취소 버튼 disabled/권한 안내가
  `canAccessSlipAction`을 공유한다.
- 직접수정과 soft delete도 `canOpenDirectEdit`/`canSoftDeleteSlip`로 유형·상태·권한을
  계산하도록 묶었다. 따라서 역할 매트릭스가 전이뿐 아니라 DRAFT/SAVED 편집·삭제 표면과
  종결 상태 잠금까지 같은 순수 helper를 통해 검증한다. 이에 맞춰 기존 네 Playwright
  정적 계약의 인라인 권한 문자열 단언도 새 계약 helper 단언으로 갱신했다.
- `canOpenCollabEdit`를 직접수정 권한과 독립시켜 DRAFT/SAVED 및 서버 허용 중간 상태의
  `협업 수정` 진입점을 렌더한다. SHIPPING·DELIVERED·CANCELED·REJECTED는 계속 닫는다.
  데스크톱 상단·모바일 메뉴·완료 footer 모두 같은 라벨을 사용한다.
- soft delete 상단 버튼은 `전표 삭제`, CANCELED 전이 footer는 `전표 취소`로 분리했다.
  후자는 `handleCancelSlip`에서 `handleTransition('cancel')`만 호출하며,
  전자는 기존 delete mutation을 유지한다. 확인창 문구도 전표 취소 동작을 명시한다.
- 409 분류는 `재고 부족` 표지와 기존 동시전이 표지를 각각 인식하고, 둘 다 아닌 409는
  `unknown`으로 남긴다. `unknown`은 원인 불명 안내와 편집 표면 잠금을 사용한다.
  `InventoryClient.java`의 `재고 부족` fallback 표지를 계약 테스트에서 함께 확인한다.

## GREEN 원문

### 변경 파일 참조 Vitest

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx src/renderer/routes/SlipDetailPage.partner-required.test.tsx src/renderer/utils/lineVat.test.ts

✓ lineVat.test.ts (38 tests)
✓ partner-required.test.tsx (4 tests)
✓ lifecycle-contract.test.ts (22 tests)
✓ lineIdContract.test.tsx (94 tests)
Test Files  4 passed (4)
Tests       158 passed (158)
```

### 변경 파일을 직접 읽는 Playwright 계약

```text
npx playwright test playwright/sp-08-5-2-purchase-slip-edit-put/sp-08-5-2-purchase-slip-edit-put.spec.ts playwright/sp-08-5-3-purchase-slip-soft-delete/sp-08-5-3-purchase-slip-soft-delete.spec.ts playwright/sp-08-6-2-sales-slip-edit-put/sp-08-6-2-sales-slip-edit-put.spec.ts playwright/sp-08-6-3-sales-slip-soft-delete/sp-08-6-3-sales-slip-soft-delete.spec.ts --reporter=line

Running 20 tests using 1 worker
20 passed (6.8s)
```

실제 전이 버튼·DB를 건드리는 real-QA 스펙은 개발책임자의 이번 라운드 금지 범위라 실행하지
않았다. 위 네 파일은 `fs.readFileSync`로 이 화면을 직접 읽는 정적 계약이라 전부 실행했다.

### 사용자 지정 검증 원문

```text
cd clients/desktop
npx vitest run

Test Files  1 failed | 199 passed (200)
Tests       1 failed | 1771 passed (1772)
```

유일한 실패 원문:

```text
src/main/build-output-cjs-interop.test.ts
외부 패키지 import 가 실제 Node ESM 로더에서 실패했다:
- electron-store (import Store from 'electron-store'):
D:\dev\Samhan-Public\.claude\worktrees\w1057\clients\desktop\node_modules\electron\index.js:17
    throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
Node.js v24.14.1
```

이 실패는 `SlipDetailPage.tsx`/권한·라벨 변경과 무관한 Electron 설치 산출물 문제다. 같은
실패 테스트를 단독 실행해도 동일한 `node_modules/electron/index.js:17` 오류가 재현됐다.
변경 파일 참조 테스트 158건은 모두 통과했다.

```text
npm run typecheck

> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도] typecheck 대상 확인 완료
ℹ tests 50
ℹ pass 50
ℹ fail 0
Process exited with code 0
```

추가로 `npm run build`도 성공해 변경된 renderer 산출물을 생성했다. build 경고(폰트 경로,
대형 chunk, 동적/정적 import 중복)는 기존 번들 구성 경고이며 이번 권한·라벨 변경의 실패가
아니다.

## 갱신된 전 상태 대조표

기준: `Slip.java`의 도메인 전이, `SlipController.java`의 권한, `SlipService.java`의
협업수정 허용 상태, `SlipDetailPage.tsx`의 액션 집합·권한 계산·진입점·라벨을 대조한다.
`권한 보유 시`는 해당 유형의 서버 요구 권한을 모두 가진 계정을 뜻한다.

| 유형 | 상태 | 도메인 허용 액션 | 화면 허용 액션 | 차집합 |
|---|---|---|---|---|
| INBOUND | DRAFT | 저장, 취소, 직접수정, 협업수정, soft delete | `purchases.slip.edit UPDATE` 저장·취소, 직접수정, 협업수정, `purchases.slip.delete DELETE` 전표 삭제 | 0 |
| INBOUND | SAVED | 전송, 취소, 직접수정, 협업수정, soft delete | `purchases.slip.edit UPDATE` 전송·취소, 직접수정, 협업수정, `purchases.slip.delete DELETE` 전표 삭제 | 0 |
| INBOUND | SENT | 수락, 반려, 취소, 협업수정 | transfer 수락, `slip.reject UPDATE` 반려, `purchases.slip.edit UPDATE` 전표 취소, 협업수정 | 0 |
| INBOUND | ACCEPTED | 처리 시작, 반려, 협업수정 | transfer 처리 시작, `slip.reject UPDATE` 반려, 협업수정 | 0 |
| INBOUND | PROCESSING | 검수 대기, 협업수정 | transfer 검수 대기, 협업수정 | 0 |
| INBOUND | INSPECTING | 처리 완료, 반려, 협업수정 | transfer + `inbound.inspection UPDATE` 처리 완료, `slip.reject UPDATE` 반려, 협업수정 | 0 |
| INBOUND | COMPLETED | 확정, 협업수정 | `purchases.slip.edit UPDATE` 확정, 협업수정 | 0 |
| INBOUND | SHIPPING | 도메인 도달 불가 | 없음 | 0 |
| INBOUND | DELIVERED | 도메인 도달 불가 | 없음 | 0 |
| INBOUND | CONFIRMED | 협업수정 | 협업수정 | 0 |
| INBOUND | REJECTED | 없음 | 없음 | 0 |
| INBOUND | CANCELED | 없음 | 없음 | 0 |
| OUTBOUND | DRAFT | 저장, 취소, 직접수정, 기사편집, 협업수정, soft delete | `sales.slip.edit UPDATE` 저장, `sales.slip.cancel UPDATE` 취소, 직접수정, 기사편집, 협업수정, `sales.slip.edit DELETE` 전표 삭제 | 0 |
| OUTBOUND | SAVED | 전송, 취소, 직접수정, 기사편집, 협업수정, soft delete | `sales.slip.edit UPDATE` 전송, `sales.slip.cancel UPDATE` 취소, 직접수정, 기사편집, 협업수정, `sales.slip.edit DELETE` 전표 삭제 | 0 |
| OUTBOUND | SENT | 수락, 반려, 취소, 협업수정 | transfer 수락, `slip.reject UPDATE` 반려, `sales.slip.cancel UPDATE` 전표 취소, 협업수정 | 0 |
| OUTBOUND | ACCEPTED | 처리 시작, 반려, 협업수정 | transfer 처리 시작, `slip.reject UPDATE` 반려, 협업수정 | 0 |
| OUTBOUND | PROCESSING | 검수 대기, 협업수정 | transfer 검수 대기, 협업수정 | 0 |
| OUTBOUND | INSPECTING | 처리 완료, 반려, 협업수정 | transfer 처리 완료, `slip.reject UPDATE` 반려, 협업수정 | 0 |
| OUTBOUND | COMPLETED | 배송 시작, 협업수정 | transfer 배송 시작, 협업수정 | 0 |
| OUTBOUND | SHIPPING | 배송 완료 | transfer 배송 완료 | 0 |
| OUTBOUND | DELIVERED | 확정 | `sales.slip.confirm UPDATE` 확정 | 0 |
| OUTBOUND | CONFIRMED | 협업수정 | 협업수정 | 0 |
| OUTBOUND | REJECTED | 없음 | 없음 | 0 |
| OUTBOUND | CANCELED | 없음 | 없음 | 0 |

`OUTBOUND/SENT/PARTNER_ORDER`는 도메인 정책상 취소가 없는 주문 전표이므로 표의 SENT
취소 행은 일반 `MANUAL` 전표 기준이다. 이 sourceType 차이는 화면과 서버 모두 동일하게
적용된다.

역할별 실행 대조도 별도 계약 테스트로 밟았다. 화면에 실제 존재하는 액션만 유형별로
열거했다.

| 역할 | INBOUND | OUTBOUND |
|---|---|---|
| MANAGER | 저장·전송·수락·처리 시작·검수 대기·확정·반려·취소 활성, 검수 완료는 `inbound.inspection UPDATE` 부재로 비활성 | 저장·전송·수락·처리 시작·검수 대기·처리 완료·배송 시작·배송 완료·확정·반려·취소 활성 |
| SALES | 전이 없음 | 저장·전송·취소 활성 |
| WAREHOUSE | 저장·전송·수락·처리 시작·검수 대기·처리 완료·검수 완료·확정·취소 활성 | 수락·처리 시작·검수 대기·처리 완료·검수 완료·배송 시작·배송 완료 활성 |
| ACCOUNTANT | 전이 없음 | 확정 활성 |

직접수정·기사편집·협업수정·soft delete는 각 상태의 진입 조건과 위 전이 권한을 독립적으로
대조했다. 협업수정은 네 역할 모두 `slip.audit-overlay UPDATE`가 있을 때만 열리며,
직접수정/soft delete는 INBOUND `purchases.slip.edit`/`purchases.slip.delete`, OUTBOUND
`sales.slip.edit`의 update/delete를 각각 사용한다. 대표 역할 매트릭스 계약은
`MANAGER·SALES·WAREHOUSE·ACCOUNTANT × INBOUND/OUTBOUND × 유형별 노출 액션` 전체에서
기대값과 실제값이 일치했다.

**전 상태 대조 집계: 24행, 양방향 차집합 0. 역할별 액션 대조 차집합: 0.**

## 자기 표면 닫기 3절

### 1. 새로 가능해진 상태·화면·권한 조합 전수

계약 테스트에서 다음을 전부 실행했다.

- `INBOUND/OUTBOUND × DRAFT/SAVED/SENT/ACCEPTED/PROCESSING/INSPECTING/COMPLETED/SHIPPING/DELIVERED/CONFIRMED/REJECTED/CANCELED`
- MANAGER·SALES·WAREHOUSE·ACCOUNTANT의 역할별 권한 차이를 대표 권한 집합으로 재현
- 진행·반려·직접수정·기사편집·협업수정·취소·soft delete
- R32 재고 부족·동시 전이·미인식 409

실제 전이·DB 쓰기는 금지되어 있으므로, 역할과 상태 조합은 순수 권한/상태 계약으로 밟고
실제 버튼 호출은 하지 않았다. 실행한 역할 테스트는 INBOUND 9액션과 OUTBOUND 11액션을
각각 MANAGER·SALES·WAREHOUSE·ACCOUNTANT에 대해 전수 평가했고, DRAFT/SAVED/SENT/
ACCEPTED/PROCESSING/INSPECTING/COMPLETED/SHIPPING/DELIVERED/CONFIRMED/REJECTED/
CANCELED 12상태는 24행 대조표로 확인했다.

### 2. 제거·개명 식별자와 라벨 전수 조사

수정 후 다음 명령을 워크트리 전체에서 실행했다. `.git`, `node_modules`, dist/build/
coverage, map 산출물은 제외했고, `clients/desktop/out`은 `npm run build` 후 포함하여
확인했다.

```powershell
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!build/**' --glob '!coverage/**' --glob '!*.map' "slipActionPageCode|handleDeleteSlip|canCollabEdit && !canDirectEditSales && !canDirectEditPurchase|전표 취소|전표 삭제|협업 수정|재고 부족|INVENTORY_SHORTAGE_MARKERS|unknown" .
```

결과:

- `slipActionPageCode`, `handleDeleteSlip`, 기존 협업 조건은 active source·mock·Playwright·
  manual에 0건이다. 전체 결과에 남은 6개 파일은 과거 설계/결정/이전 보고서와 이번 회귀
  테스트의 `not.toContain` 음성 단언뿐이다. `session.ts`의 stale 주석도 새 helper 이름으로
  바꾸었다.
- 새 화면 라벨은 desktop header/mobile menu/footer의 `전표 삭제`, `전표 취소`, `협업 수정`
  으로 확인됐다. 삭제 modal 내부의 단독 `삭제` 확인 버튼은 modal title이 `매입 전표 삭제`/
  `매출 전표 삭제`이고 delete mutation만 호출하므로 footer 취소와 혼동되는 동일 화면
  action label이 아니다.
- `INVENTORY_SHORTAGE_MARKERS`, `재고 부족`, `unknown`은 화면·`InventoryClient.java`·
  Vitest 계약에 함께 존재한다. 알 수 없는 409를 `concurrent`로 되돌리는 fallback은 없다.
- 테스트·Playwright·mock·문서·매뉴얼에 제거된 식별자의 active 소비자는 없었다. 과거 문서의
  역사적 기록은 변경하지 않았다.

### 3. 변경 파일 참조 테스트

`SlipDetailPage.tsx`를 import하거나 경로를 읽는 변경 관련 계약 테스트를 전수 수집해 모두
실행했고, 사용자 지정 명령도 원문 그대로 실행했다. real-QA 실행 스펙은 직접 전이/DB 쓰기
금지와 충돌해 실행하지 않았다.

## 안 본 것

- 회계 배분·전기 시나리오 2~5.
- `slip-service` 권한 계약 자체 변경.
- 컨테이너 재배포·DB 쓰기·실제 전이 버튼 클릭.
- PR #1061·#1045·#1063·#1066 파일.
- `docs/handoff/`.
- Gradle 전체 스위트.
- real-QA live 스펙(실제 앱 왕복/전이/DB 정리).

## 신규 파일

```text
docs/dev-reports/2026-08-05-874-r33-permission-and-label-alignment.md
```
