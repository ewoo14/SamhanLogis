# Phase 2.5 FE 리뷰 — Cycle 2 (cycle1 fix cross-check)

- 브랜치: `feat/phase-2-5-partner-order-hold-status-filter`
- HEAD: 7c41e0d9 (fix commit: 0f5c8728)
- 리뷰어: Claude FE
- 일자: 2026-05-30
- 범위: SalesPartnerOrderListPage, SalesPartnerOrderDetailPage, sales.ts, sales.module.css

---

## 검증 항목별 결과

### 1. 기간필터 useEffect 분기 — 무한루프 / 불필요 refetch / UX 리셋 위험

**방식 변경 개요**  
cycle1 fix 는 `useEffect` 기반 기간 초기화를 폐기하고 대신 이벤트 핸들러 `handleStatusFilterChange` 에서 직접 `setStatusFilter` + `setDateFrom('')` + `setDateTo('')` 를 순차 호출하는 방식으로 교체하였다.

**검증 결과**

- `SalesPartnerOrderListPage` 에 있는 `useEffect` 는 단 1개로, 의존성 배열이 `[setPageTitle]` 단독이다. 마운트/언마운트 타이틀 관리 목적이며 기간 상태를 건드리지 않는다. 무한루프 위험 없음.
- `handleStatusFilterChange` 는 React 합성 이벤트 핸들러 내부에서 복수 `setState` 를 동기 연속 호출하는 구조이다. React 18 자동 배칭(automatic batching)에 의해 한 번의 렌더 사이클로 묶이므로 refetch 는 상태 동기화 이후 단 1회 발생한다. 불필요 중간 refetch 없음.
- 사용자가 날짜를 수동으로 입력한 뒤 status 를 전환하면 `handleStatusFilterChange` 호출로 날짜가 초기화된다. 이 동작은 사용 시나리오상 의도적이며(기간 의미가 confirmedAt → createdAt 으로 전환됨), 주석으로도 명시되어 있다. UX 상 허용 가능 범위이나 **사용자 입력 소실**에 해당하므로 향후 고도화 시 확인 다이얼로그 추가를 검토할 수 있다. 현재 스펙 요건에는 부합.

**판정: 이상 없음**

---

### 2. ON_HOLD=warning 뱃지 — CSS 토큰 정합 및 exhaustive 커버리지

**검증 결과**

ListPage 는 design-system Badge 컴포넌트가 아닌 `span + CSS module` 방식(`.statusBadge + STATUS_CLASS`)을 사용한다. `BadgeVariant`(`brand | neutral | success | warning | danger | nts`)와 직접 연결되지 않으므로 variant 오타 위험은 없고, 모든 값이 CSS class 에 직접 매핑된다.

`STATUS_CLASS` Record 커버리지:
```
DRAFT      → .statusDraft    (--state-neutral-bg  / --state-neutral  fallback #f3f4f6/#4b5563)
ON_HOLD    → .statusOnHold   (--state-warning-bg  / --state-warning  = #FEF3C7 / #F59E0B)
CONFIRMING → .statusSent     (--state-info-bg     / --state-info     = #DBEAFE / #3B82F6)
CONFIRMED  → .statusConfirmed(--state-success-bg  / --state-success  = #D1FAE5 / #10B981)
CANCELED   → .statusCanceled (--state-danger-bg   / --state-danger   = #FEE2E2 / #EF4444)
```

5종 모두 커버. exhaustive 충족.

**주의사항(minor)**: `--state-neutral` / `--state-neutral-bg` 는 design-system `tokens.css` 에 정의되지 않은 미등록 토큰이다. `.statusDraft` 는 이 토큰 사용 시 fallback hex(`#f3f4f6`, `#4b5563`)로 처리된다. 현재 기능상 문제는 없으나, 다른 4종 상태가 등록 토큰을 참조하는 것과 달리 `DRAFT` 만 fallback에 의존하는 불일치가 존재한다. cycle1 이전부터 존재하던 패턴이므로 본 cycle 수정 범위 외이며 신규 결함으로 등록하지 않는다.

**ON_HOLD warning 정합**: `--state-warning-bg: #FEF3C7`, `--state-warning: #F59E0B` 는 `tokens.css` 에 등록된 유효 토큰이다. 뱃지 CSS 와 설계 의도 일치.

**판정: 이상 없음**

---

### 3. 버튼 disabled(isPending) / onError 토스트 — mutation 패턴 정합, 409/403 분기

**검증 결과**

- `holdMutation.isPending` / `releaseMutation.isPending` 각각 해당 버튼의 `disabled` 에 정확히 연결됨.
- onError 분기:
  - hold: 409 → `'진행중(DRAFT) 상태인 주문서만 보류할 수 있습니다.'`, 403 → `'주문서 보류 처리 권한이 없습니다. 관리자에게 문의해 주세요.'`, 기타 → 범용 메시지
  - release: 409 → `'보류(ON_HOLD) 상태인 주문서만 해제할 수 있습니다.'`, 403 → `'주문서 보류 해제 권한이 없습니다. 관리자에게 문의해 주세요.'`, 기타 → 범용 메시지
  - `axios.isAxiosError(error)` 외부 가드 후 내부 중첩 if 구조 정확. non-axios 에러는 fallback 메시지로 처리됨.
- 에러 표시 방식은 `holdErrorMessage` state → inline `errorBanner` div. 기존 `printErrorMessage` / `deleteErrorMessage` / `conflictMessage` 패턴과 동일하게 일관됨.
- 이 컴포넌트에는 `useToast` 를 사용하지 않으며, 기존 패턴도 toast 를 사용하지 않는다. 패턴 정합 유지됨.

**판정: 이상 없음**

---

### 4. 버튼 variant 위계 — design-system 정합

**버튼 목록 (최종 순서)**:
```
인쇄      variant="secondary"
수정      variant="primary"       ← cycle1 fix: 위치가 보류 버튼보다 앞으로 이동
보류      variant="warning"       ← cycle1 fix: secondary → warning 변경
보류 해제 variant="secondary"
삭제      variant="danger"
```

**design-system Button 지원 variant**: `primary | secondary | ghost | danger | warning` (Button.tsx line 5)

`warning` variant 는 `Button.module.css` 에 `.variant-warning` 으로 정의되어 있으며 `--state-warning(#F59E0B)` 을 배경색으로 사용한다. 유효한 variant.

**위계 평가**:
- `primary` = 수정 (주 작업 흐름)
- `warning` = 보류 (파괴적이지 않으나 주의 필요한 상태 전환)
- `secondary` = 보류 해제 / 인쇄 (보조 동작)
- `danger` = 삭제 (비가역 동작)

위계 구성이 의미론적으로 적절하다.

**판정: 이상 없음**

---

### 5. 기간필터 비움(undefined) 시 BE 호출 param / queryKey 정합

**검증 결과**

```ts
// listPartnerOrders 내부
if (filters.dateFrom) params['dateFrom'] = filters.dateFrom
if (filters.dateTo)   params['dateTo']   = filters.dateTo
```

`dateFrom` 상태가 `''` 인 경우 `dateFrom || undefined` → `undefined` 로 변환되고, `filters.dateFrom` 이 `undefined` 이면 조건 분기에서 생략된다. 결과적으로 BE 호출 시 `from`/`to` 파라미터가 완전히 누락되며, 전체 기간 조회가 수행된다. 스펙과 일치.

**queryKey 구성**:
```ts
['partner-orders', dateFrom, dateTo, partnerId, statusFilter, searchKeyword, 0]
```
각 필터 상태값이 queryKey 에 포함되어 있으므로, 필터 변경 시 TanStack Query 가 캐시 미스로 인식하여 자동 refetch 한다. trailing `0` 은 page=0 고정을 의미하며, 페이지네이션 미구현 단계에서 안전하다.

`invalidateQueries({ queryKey: ['partner-orders'] })` 는 prefix 매칭으로 동작하므로 DetailPage mutation 성공 후 ListPage 캐시가 올바르게 무효화된다.

**판정: 이상 없음**

---

### 6. Typecheck 0 유지

```
node_modules/.bin/tsc --noEmit
```
출력 없음 = 에러 0건. strict mode 하에서 타입 에러 없음.

**판정: 이상 없음**

---

## 종합 판정

**FE APPROVE (cycle2)**

cycle1 P1 4건 + P2 1건 모두 올바르게 수정됨. 신규 결함 없음.

| 항목 | 결과 |
|---|---|
| 기간필터 useEffect 분기 | 이상 없음 |
| ON_HOLD=warning 뱃지 | 이상 없음 |
| 버튼 disabled/onError 토스트 | 이상 없음 |
| 버튼 variant 위계 | 이상 없음 |
| 기간필터 undefined BE 파라미터 | 이상 없음 |
| typecheck | 0 에러 |

**비고 (non-blocking)**  
`--state-neutral` / `--state-neutral-bg` 토큰이 design-system `tokens.css` 에 미등록 상태이며 `.statusDraft` 가 fallback hex 에 의존한다. 현재 기능 결함은 아니며 cycle1 이전부터 존재하던 패턴이므로 별도 토큰 등록 이슈로 추후 관리를 권장한다.
