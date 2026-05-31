# FE 리뷰 — 슬라이스 D1 (confirm 자동발행 폐지) — Cycle 1

**리뷰어**: Claude FE agent  
**날짜**: 2026-05-31  
**브랜치**: `feat/slice-d1-confirm-no-autopublish`  
**결론**: CHANGES_REQUESTED

---

## 결론 요약

**무변경 판정 부분 타당 / 부분 부정확.**

- order-app 성공 핸들러가 `slipNo / status / slipPublishStatus` 필드에 직접 의존하지 않는 것은 사실이나, **`res.ok` 필드 불일치 버그**가 이미 존재하고 있어 "무변경 OK"라고 단언하기 어렵다.
- 이 버그는 D1 이전부터 존재하므로 D1이 회귀를 *유발*하지는 않았으나, D1 리뷰에서 발견된 기존 P1 결함이다.
- desktop / mobile-staff 에 D1 confirm 경로 회귀 없음.

---

## Finding 목록

### P1-001 — order-app `res.ok` 필드 불일치 (기존 버그, D1 무관)

**심각도**: P1  
**위치**: `clients/web/order-app/index.html` L6096  
**내용**:

sendOrderFromUi 성공 핸들러가 `res.ok` 를 성공 판별자로 사용한다.

```js
.withSuccessHandler(res => {
  if(res && res.ok) {          // L6096
    icon.textContent = '✅';
    txt.textContent = '전송이 완료되었습니다';
    ...
  } else {
    icon.textContent = '⚠️';
    txt.textContent = '전송 실패\n' + (res ? (res.error || '') : '');  // L6108
  }
})
```

그런데 `samhanApi.ts`의 `sendOrderFromUi` handler는 `r.data`를 그대로 반환한다.

```ts
sendOrderFromUi: ([payload]) => {
  ...
  return http
    .post(`/partner-orders/${...}/confirm`, payload)
    .then((r) => r.data)   // ApiResponse<ConfirmResponse> 전체
},
```

`r.data`(axios 응답 body)는 `ApiResponse<ConfirmResponse>` 이므로 구조는 다음과 같다:

```json
{
  "success": true,
  "code": "OK",
  "message": "성공",
  "data": { "orderNo": "...", "slipNo": null, "status": "DRAFT", ... },
  "timestamp": "..."
}
```

`ApiResponse`에 `ok` 필드는 없다. 따라서 `res.ok`는 항상 `undefined`(falsy)이므로 **주문 전송 성공 시에도 반드시 "전송 실패" 분기로 빠진다**. `res.error`도 존재하지 않으므로 화면에는 "전송 실패\n" 만 표시된다.

**D1 이전부터 존재**: `git show main:clients/web/order-app/index.html`에서 동일 패턴 확인. D1이 유발한 회귀가 아니라 기존 결함이다.

**수정 방향**: `res.ok` → `res.success` (ApiResponse 계약 일치) 또는 `samhanApi.ts`의 `sendOrderFromUi`에서 `r.data.data` (ConfirmResponse inner)를 반환하고 `res.ok`를 `res.ok !== undefined && ...`가 아닌 별도 성공 판별 방식으로 변경. 단 다른 RPC의 응답 구조와 일관성 확보 필요.

---

### P2-001 — `PartnerOrderDetailPage` CONVERTIBLE_STATUS 화이트리스트 — D1 이후 DRAFT 주문 전환 가능성 확인

**심각도**: P2  
**위치**: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` L51  

```ts
const CONVERTIBLE_STATUS: ReadonlySet<string> = new Set(['DRAFT', 'ON_HOLD'])
```

D1 이후 confirm이 DRAFT 주문을 생성하므로, 거래처 confirm으로 생성된 DRAFT 주문도 이 화이트리스트에 포함되어 "출고전표 전환" 버튼이 표시된다. 이는 의도된 동작(명시적 convert 액션으로만 전표 발행)으로 정합하다.

단, `SalesPartnerOrderDetailPage.tsx` L46~50 주석에 다음과 같이 기술되어 있다:

```
CONFIRMED 포함 나머지 상태는 전환 불가(BE 409 또는 business rule 위반).
```

D1 이전에는 confirm 후 CONFIRMED 상태가 되었으므로 이 주석은 "confirm 완료 주문은 이미 전표 발행됨 → 전환 불가"라는 의도였다. D1 이후에는 confirm 완료 주문이 DRAFT이므로 전환 가능 상태로 표시되는데, 이것이 의도인지 명시적 문서화가 없다. **주석 갱신 필요** (logic은 correct하나 설명이 outdated).

---

### P2-002 — `PARTNER_ORDER_STATUS_LABEL` 의 CONFIRMED 레이블이 "완료" — D1 이후 CONFIRMED 주문 잔존 대응

**심각도**: P2  
**위치**: `clients/desktop/src/renderer/api/sales.ts` L334~341

```ts
const PARTNER_ORDER_STATUS_LABEL: Record<PartnerOrderStatus, string> = {
  DRAFT: '진행중',
  ...
  CONFIRMED: '완료',
  ...
}
```

D1 이후 신규 confirm은 DRAFT를 생성하므로 CONFIRMED 상태는 D1 이전 레거시 주문에만 존재한다. 레거시 CONFIRMED 주문이 UI에서 "완료"로 표시되는 것은 적절하다. 단 D1 이후 CONFIRMED 주문이 `CONVERTIBLE_STATUS`에 포함되지 않으므로 전환 불가 — 레거시 CONFIRMED 주문에 대한 전환 불가 처리가 의도적으로 보존됨. 이슈 없음.

---

## 점검 항목별 결과

### 1. order-app 무변경 타당성

**grep 결과 (order-app src)**: `slipNo`, `slipPublishStatus`, `CONFIRMED`, `PENDING_RETRY`, `NOT_REQUIRED` — 0건 (타입스크립트 소스 파일 기준).

**index.html grep 결과**: 동일 5개 키워드 모두 0건.

**`sendOrderFromUi` 핸들러**: `r.data`를 반환. 성공 핸들러는 `res.ok`만 판별하며 `slipNo/status/slipPublishStatus`에 접근하지 않는다.

**판정**: 성공 핸들러가 슬립 발행 결과 필드에 비의존인 것은 사실이나, `res.ok` 필드 불일치로 인해 주문 전송 성공 시 항상 "전송 실패" 분기로 동작하는 기존 버그가 존재한다. D1 변경으로 이 버그가 새로 생긴 것은 아니다.

### 2. 본사 데스크톱 — DRAFT 주문 표시 + convert 가능

- `SalesPartnerOrderListPage.tsx`: `STATUS_CLASS`에 `DRAFT: styles['statusDraft']` 매핑 존재. DRAFT 주문은 "진행중"으로 정상 표시된다.
- `SalesPartnerOrderDetailPage.tsx`: `CONVERTIBLE_STATUS = new Set(['DRAFT', 'ON_HOLD'])` — confirm으로 생성된 DRAFT 주문에 "출고전표 전환" 버튼이 표시된다. D1 설계 의도에 부합.
- from-estimate 경로도 DRAFT를 생성하므로 동일 코드 경로를 이미 사용 중. 회귀 없음.

### 3. 다른 클라이언트

- `clients/mobile-staff`: `createMobilePartnerOrder`는 `POST /api/v1/slips/mobile-order` (slip-service) 를 직접 호출하며 partner-order-service confirm 엔드포인트와 무관. D1 영향 없음.
- `PartnerOrderCreateScreen.tsx`의 성공 화면에서 `result.slipNo`를 표시하나, 이는 slip-service 응답이므로 D1과 무관.

### 4. ApiResponse 계약

`ApiResponse.ok(data)` → `{success: true, code: "OK", message: "성공", data: ..., timestamp: ...}`.  
`ApiResponse`에 `ok` 필드는 없다. 성공 판별자 불일치 확인됨 (P1-001).

---

## Finding 개수 요약

| 심각도 | 건수 |
|--------|------|
| P0 | 0 |
| P1 | 1 (res.ok 필드 불일치 — 기존 버그) |
| P2 | 2 (주석 outdated, CONFIRMED 레이블 참고) |
| **합계** | **3** |

---

## APPROVE/CHANGES_REQUESTED 판정

**CHANGES_REQUESTED**

D1 변경 자체(BE 코드)가 order-app FE에 신규 회귀를 일으키지는 않는다. 그러나 리뷰 과정에서 발견된 P1-001(`res.ok` 불일치)은 거래처 주문 전송 성공 시 항상 실패 메시지를 표시하는 심각한 기존 결함이다. 슬라이스 D1과 병행하여 또는 후속 핫픽스로 수정이 필요하다. P2 항목들은 주석/문서 수준이므로 머지를 블록하지 않으나 후속 슬라이스에서 처리 권장.
