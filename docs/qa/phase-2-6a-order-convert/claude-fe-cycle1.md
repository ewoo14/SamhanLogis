# Phase 2.6a FE 코드 리뷰 — claude-fe-cycle1

리뷰어: Claude FE  
날짜: 2026-05-30  
브랜치: `feat/phase-2-6-order-to-slip-conversion` (HEAD 0c79ef4d)  
타입체크: `tsc -p tsconfig.web.json --noEmit` → **exit 0 (오류 없음)**

---

## 총평

결함 7건 발견 — FE APPROVE 불가 (수정 후 재검토 필요)

| 등급 | 건수 |
|---|---|
| P0 | 0 |
| P1 | 3 |
| P2 | 2 |
| Minor | 2 |

---

## 점검 항목별 상세

### 1. API 계약 정합 [P1 1건]

**[P1-1] `ConvertResult` 필드 일부 미소비 — `orderStatus` / `fullyConverted` 무시**

- BE `ConvertResultResponse(slipNo, orderStatus, fullyConverted)` 와 FE `ConvertResult { slipNo, orderStatus, fullyConverted }` 타입 정합은 정확하다.
- 그러나 `convertMutation.onSuccess` 에서 `result.slipNo` 만 사용하고, `result.orderStatus` 와 `result.fullyConverted` 는 소비하지 않는다.
- 부분전환 완료 후 사용자에게 "전표 발행" 성공 메시지만 표시 (`출고전표 ${result.slipNo} 발행`)하고, 전량 전환 완료 여부(`fullyConverted=true` → 주문 CONVERTED 전환)를 토스트에 별도 안내하지 않는다.
- **영향**: 부분전환 시 사용자가 추가 전환 가능 여부를 직접 새로고침 전까지 알 수 없음. UX 정보 손실.
- **위치**: `SalesPartnerOrderDetailPage.tsx:188`

```
const msg = `출고전표 ${result.slipNo} 발행`
// result.fullyConverted, result.orderStatus 미사용
```

**나머지 계약 정합 항목 (정상)**

- `ConvertToSlipRequest.items[].orderLineId` = FE `PartnerOrderLine.lineId` 1:1 정확
- `PartnerOrderLine.lineId` = BE `LineResponse.lineId` (라인 UUID 문자열) 정확
- `PartnerOrderLine.convertedQuantity` = BE `LineResponse.convertedQuantity` (int) 정확
- URL path param `orderId`는 화면 route param(orderNumber, `/` → `-` 치환)을 사용, `PartnerOrderIdResolver`가 하이픈형/슬래시형 모두 처리하므로 정합.

---

### 2. 전환 버튼 조건 [P1 1건]

**[P1-2] `CONVERTED` 상태 BE `requireConvertible` 미차단 → FE 방어 필수이나 문서화 부재**

BE `requireConvertible()` 차단 조건:
1. `slipNo != null`
2. `status == CANCELED`
3. `status == CONFIRMING`

`CONVERTED` 상태는 Phase 2.6a 전량전환 경로(`markConvertedIfComplete`)에서 `slipNo`를 설정하지 않으므로 `slipNo=null + status=CONVERTED`가 가능하다. 이 경우 BE `requireConvertible`을 통과한다. FE `NON_CONVERTIBLE_STATUS = {CANCELED, CONFIRMING, CONVERTED}`가 올바르게 차단하고 있으나, BE에 누락된 가드가 존재한다는 사실이 FE 코드 어디에도 주석으로 명시되어 있지 않다.

- **현행 FE 동작**: 정상 (버튼 미표시).
- **문제**: 이 방어가 제거되거나 BE가 CONVERTED 상태를 단순하게 고려할 경우 중복전환 가능성. BE 측 결함 (`requireConvertible` CONVERTED 미차단)을 BE 리뷰에 별도 보고해야 한다.
- **권장**: 해당 라인에 주석 추가.

**나머지 버튼 조건 (정상)**

- `linkedSlipNo == null && !NON_CONVERTIBLE_STATUS.has(status)` 조합 정확.
- `CONFIRMED` 상태 → `markSlipPublished` 경로에서 `slipNo`가 설정되므로 `linkedSlipNo != null` → 버튼 미표시. 정상.
- `canConvert` 조건 AND 결합 정상.

---

### 3. 수량 입력 [정상]

- `remaining = line.quantity - line.convertedQuantity` 계산 정확.
- 초기값: 모달 열 때 `remaining > 0` 라인만 `initQty[lineId] = remaining` 설정. 정상.
- `remaining <= 0` 라인 Input `disabled` + opacity 0.45. 정상.
- onChange clamp: `Math.max(0, Math.min(remaining, raw))`. 정확.
- submit items 필터: `remaining > 0 && qty > 0` 만 포함. 정확.
- 전체 수량 0일 때 제출 버튼 `disabled` (vacuously true 엣지케이스 포함 정상).

---

### 4. invalidate [정상]

```ts
await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })    // 목록
await queryClient.invalidateQueries({ queryKey: ['partner-order', id] })  // 상세
```

두 쿼리 모두 무효화. 정상.

---

### 5. 권한 게이트 canConvert [P1 1건]

**[P1-3] `sales.partner-order.convert` 페이지코드 미등록 — 정적 role 게이트만 적용**

`pagecodes.json`에 등록된 partner-order 관련 코드:
```
sales.partner-order.list, .draft, .edit, .confirm, .history, .history.view,
.print, .edit-requests, .edit-requests.decide, .tutorial
```

`sales.partner-order.convert` 가 **누락**되어 있다.

BE `@RequirePermission(page = "sales.partner-order.convert", action = CREATE)` 와 FE `CONVERT_ROLES = ['SALES', 'MANAGER', 'MASTER']` 가 완전히 분리되어 운영된다. 관리자가 동적 RBAC 대시보드에서 convert 권한을 조정해도 FE 버튼 표시에 반영되지 않는다.

- **리스크**: BE는 동적 권한 체크(403)하지만, FE는 정적 role로만 버튼 노출 결정 → SALES 역할 계정이 동적으로 convert 권한을 박탈당해도 FE에서 버튼이 보임.
- **위치**: `SalesPartnerOrderDetailPage.tsx:41`, `clients/desktop/playwright/full-qa/pagecodes.json`

---

### 6. design-system Modal / Button / isPending / 오류 피드백 [P2 2건]

**[P2-1] `data-testid="partner-order-convert-modal"` Modal 컴포넌트에 무효 prop**

`ModalProps`는 `HTMLAttributes`를 확장하지 않으므로 `data-testid`를 prop으로 받지 않는다. 해당 prop은 실제 DOM에 전달되지 않아 Playwright 등 테스트 도구에서 `[data-testid="partner-order-convert-modal"]`로 모달 backdrop 또는 dialog를 찾을 수 없다.

- TypeScript exit 0 — 타입 오류는 아니나 런타임에서 prop이 소비되지 않음.
- Playwright 테스트 작성 시 `data-testid="ds-modal-backdrop"` 또는 내부 `data-testid="partner-order-convert-modal-body"` 사용 필요.
- **위치**: `SalesPartnerOrderDetailPage.tsx:823`

**[P2-2] 409 오류 피드백이 모달 내부/외부 두 곳에 중복 표시 가능**

`convertErrorMessage`는 `setConvertErrorMessage`가 모달 `onClose` 시 초기화되지만, 모달 외부 배너(`data-testid="partner-order-convert-error"`, 줄 461)와 모달 내부 배너(`data-testid="partner-order-convert-modal-error"`, 줄 870)가 동일 상태를 공유한다. 현재 로직에서는 `setConvertOpen(false)` 시 에러 메시지가 초기화되므로 동시 표시는 발생하지 않으나, 구조적으로 둘 다 동일 `convertErrorMessage`를 읽어 잠재적 혼란이 있다.

- 현재 동작: 모달 닫기 시 `setConvertErrorMessage(null)` 호출 → 외부 배너도 자동 소거. 심각한 버그는 아니나 개선 권장.

---

### 7. testid Playwright 정합 / typecheck [Minor 2건]

**[Minor-1] `CONVERTED` STATUS_CLASS → 잘못된 CSS 클래스 (`statusConfirmed` 대신 `statusConverted` 사용해야 함)**

`SalesPartnerOrderListPage.tsx:28`:
```ts
CONVERTED: styles['statusConfirmed']!,
```

`sales.module.css`에 `.statusConverted { background: #ede9fe; color: #5b21b6; }` (보라색)가 정의되어 있으나, `CONVERTED` 상태가 `statusConfirmed` (초록)을 사용한다. 전환완료는 완료(CONFIRMED)와 의미상 구분되어야 한다.

- **위치**: `SalesPartnerOrderListPage.tsx:28`

**[Minor-2] Phase 2.6a 전용 Playwright spec 파일 미존재**

`clients/desktop/playwright/` 하위에 `phase-2-6a-order-convert` 디렉토리와 spec 파일이 없다. 전환 버튼 클릭 → 모달 오픈 → 수량 입력 → 전환 제출 → 성공 토스트 시나리오, 409/403 오류 시나리오에 대한 Playwright 테스트가 부재한다.

---

## 결함 요약표

| ID | 등급 | 파일 | 설명 |
|---|---|---|---|
| P1-1 | P1 | DetailPage.tsx:188 | `result.fullyConverted`/`orderStatus` 미소비 — 부분전환 UX 정보 누락 |
| P1-2 | P1 | DetailPage.tsx:43 | BE `requireConvertible` CONVERTED 미차단 주석 부재 — BE결함 cross-report 필요 |
| P1-3 | P1 | pagecodes.json | `sales.partner-order.convert` 미등록 — 정적 role vs 동적 RBAC 불일치 |
| P2-1 | P2 | DetailPage.tsx:823 | `data-testid` Modal 미지원 prop — Playwright testid 접근 불가 |
| P2-2 | P2 | DetailPage.tsx:461,870 | 에러 배너 외부/내부 구조적 중복 공유 |
| Minor-1 | Minor | ListPage.tsx:28 | CONVERTED → `statusConfirmed` CSS 오매핑 (`statusConverted` 존재) |
| Minor-2 | Minor | playwright/ | Phase 2.6a Playwright spec 파일 미존재 |

---

## 정상 확인 항목

- `convertPartnerOrderToSlip` POST path URL 인코딩, ApiEnvelope unwrap 정확
- `PartnerOrderLine.lineId` → `ConvertToSlipItem.orderLineId` 매핑 정확
- `remainingQuantity = quantity - convertedQuantity` 계산 정확
- 잔여 0 라인 Input disabled + 수량 clamp 정확
- `quantity > 0` 만 items 포함 필터 정확
- invalidate `['partner-orders']` + `['partner-order', id]` 양쪽 정확
- `isPending` disabled 버튼 + 모달 배경 클릭/ESC 차단 정확
- 409 / 403 에러 피드백 한국어 메시지 정확
- design-system `Modal`/`Button`/`Input` import 사용 (자체 작성 없음)
- UUID 사용자 노출 없음 (`lineId` 미표시, `slipNo`만 표시) 정확
- `typecheck` exit 0 확인

---

*Reviewer: Claude FE Sub-agent | cycle 1*
