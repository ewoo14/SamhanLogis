# Designer 리뷰 — D2 MergeConvertDialog (사이클 1)

> 리뷰어: Designer  
> 대상 파일:
> - `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
> - `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`
> - 참조 가이드: `docs/design/d2-merge-convert-dialog-guide.md`
> 날짜: 2026-05-31

---

## 판정: CHANGES_REQUESTED

P1 결함 4건, P2 결함 7건 확인.

---

## P1 (필수 수정 — 머지 차단)

### P1-1. 비가역 경고 배너 — danger 토큰 미적용 (warning 클래스 재사용)

**가이드 §2.1 요구:** 병합 전환은 단일주문 전환보다 파급 범위가 크므로 `--color-danger-*` 토큰으로 격상. 배경 `--color-danger-50` (#FFF1F1), 테두리 `--color-danger-200`, 텍스트 `--color-danger-700`.

**구현 실제 (MergeConvertDialog.tsx 350-355행):**
```tsx
<div
  className={styles['convertWarningBanner']}   // warning 오렌지 계열 — 단일전환 클래스 그대로 재사용
  role="note"
  style={{ marginBottom: 16 }}
>
```

`sales.module.css` 1075-1083행의 `.convertWarningBanner` 정의:
```css
border: 1px solid var(--state-warning, #92400e);
background: var(--state-warning-bg, #fef3c7);   /* 오렌지 배경 */
color: var(--state-warning, #92400e);
```

가이드가 명시한 danger(빨강) 배경이 아닌 warning(오렌지) 배경이 그대로 사용됨. 사용자가 단일주문 전환과 병합 전환을 시각적으로 구분할 수 없어 위험 수준 차등이 전달되지 않는다.

**수정 방향:** `sales.module.css`에 `.mergeConvertWarningBanner` 클래스를 신규 추가하고 danger 토큰을 적용하거나, 인라인 스타일로 가이드 §3.1 토큰을 직접 지정. 기존 `.convertWarningBanner`는 단일전환 모달에서 계속 사용하므로 변경 불가.

---

### P1-2. 헤더 충돌 섹션 — 라디오+직접입력 혼합 패턴 미준수 (라디오와 텍스트 인풋이 독립 입력으로 분리됨)

**가이드 §2.3 결정 D-UI-01 요구:** 3개 라디오 옵션 — (1) 주문1 값 (2) 주문2 값 (3) 직접 입력. 직접 입력 라디오를 선택해야만 텍스트 인풋이 활성화. 라디오 미선택 상태(none)를 초기값으로 유지하고 충돌 필드 미선택 시 병합 발행 버튼 비활성.

**구현 실제 (MergeConvertDialog.tsx 421-458행):**
- 주문별 값은 라디오로 제공됨 (부분 구현)
- 그러나 직접 입력 인풋은 "세 번째 라디오 옵션"이 아니라 라디오 그룹과 별개로 항상 표시되는 독립 텍스트 인풋
- `checked={shippingFields[key] === val}` 비교이므로 직접 입력란에 타이핑하면 라디오가 전부 해제됨
- 직접 입력 라디오(`radio-custom`) 자체가 없으므로 `merge-convert-conflict-{fieldKey}-radio-custom` testid 누락
- 초기값이 라디오 미선택 상태이므로 `canSubmit` 조건(`hasSomeQty && !!selectedWarehouse`)에 충돌 필드 미선택 조건이 **포함되지 않음** → 창고 선택 + 수량만 있으면 충돌 필드를 선택하지 않아도 버튼이 활성화되어 빈 값이 BE로 전송될 수 있음

가이드 §2.7 비활성 조건 4-AND 중 마지막 항목(`충돌 필드가 있는데 미선택인 항목 존재`)이 `canSubmit` 로직에서 누락됨.

**수정 방향:**
1. 직접 입력을 세 번째 `<input type="radio" name="..." value="__custom__">` 옵션으로 리팩터링
2. 직접 입력 라디오 선택 시에만 텍스트 인풋 `disabled={false}`
3. `canSubmit` 조건에 `conflictFields.every(k => shippingFields[k] !== undefined)` 추가

---

### P1-3. "병합 발행" 버튼 텍스트 불일치

**가이드 §2.7:** 버튼 레이블 `"병합 발행 →"` (화살표 포함), 로딩 텍스트 `"병합 발행 중…"`.

**구현 실제 (MergeConvertDialog.tsx 333행):**
```tsx
{mergeMutation.isPending ? '발행 중…' : '병합 발행'}
```

정상 상태 텍스트가 `'병합 발행'`으로 화살표(`→`) 누락, 로딩 텍스트도 `'발행 중…'`으로 앞에 `'병합 '`이 빠짐.  
가이드 §2.7에서 `"병합 발행 →"` 레이블은 모달 타이틀(`"출고전표로 병합 전환"`)과 연계된 행동 유도 카피이므로 일치해야 한다.

**수정 방향:** `'병합 발행 →'` / `'병합 발행 중…'`으로 교체.

---

### P1-4. 비가역 경고 카피 — N주문 all-or-nothing 재고 예약 위험 미전달

**가이드 §2.1 확정 카피:**
```
주의: 병합 발행 후에는 출고전표가 즉시 생성되며 재고가 예약됩니다.
이 작업은 되돌릴 수 없습니다. ({N}개 주문, {M}개 품목 전환 예정)
```

**구현 실제 (MergeConvertDialog.tsx 356-359행):**
```tsx
<strong>주의:</strong> 병합 발행 시 출고전표가 즉시 발행됩니다. 이 작업은 되돌릴 수 없습니다.
{selectedOrders.length >= 2
  ? ` (${selectedOrders.length}개 주문을 단일 전표로 병합)`
  : null}
```

두 가지 문제:
1. "재고가 예약됩니다" 문구 누락 — all-or-nothing 재고 예약 위험(핵심 위험)이 전달되지 않음
2. `{M}개 품목` (전환수량 > 0인 라인 수) 동적 값 누락 — 가이드가 명시한 동적 카피를 정적 문자열로 단순화

**수정 방향:** 가이드 확정 카피 그대로 적용. `{M}`은 `Object.values(qtyMap).filter(q => q > 0).length`로 계산.

---

## P2 (권고 수정 — 머지 전 처리 권장)

### P2-1. 충돌 섹션 색상 하드코딩

**가이드 §3.1:** `--color-warning-50`, `--color-warning-200`, `--color-warning-700` 토큰 사용.

**구현 실제 (MergeConvertDialog.tsx 397-403행):**
```tsx
background: '#FFFBEB',        // 하드코딩 — --color-warning-50 (#FEF6E7) 와 다른 값
border: '1px solid #FDE68A',  // 하드코딩 — --color-warning-200 (#F8DA9A) 와 다른 값
```
```tsx
color: '#92400E',  // 403행 — 토큰 참조 없음
color: '#6B7280',  // 444행, 444행, 558행 — 하드코딩
color: '#1E40AF',  // 497행 상태 배지 — 하드코딩
background: '#EFF6FF',  // 495행 — 하드코딩
```

design-system 컬러 토큰 미참조. 테마 변경 시 일관성이 깨진다.

**수정 방향:** 가이드 §3.1 토큰 표 참조하여 `var(--color-warning-50)` 등으로 교체. 그룹 헤더 상태 배지는 `Badge` 컴포넌트(`variant="warning"` / `variant="neutral"`) 사용 권고.

---

### P2-2. 상태 배지 — `Badge` 컴포넌트 미사용

**가이드 §2.4 그룹 헤더 명세:**
```tsx
<Badge variant={statusVariant}>{statusLabel}</Badge>
```
`DRAFT → variant="warning"`, `ON_HOLD → variant="neutral"` 매핑 명시.

**구현 실제 (MergeConvertDialog.tsx 489-499행):**
```tsx
<span
  style={{
    fontSize: 11,
    padding: '1px 6px',
    borderRadius: 10,
    background: '#EFF6FF',    // 파란색 하드코딩 — DRAFT가 blue? warning 이어야 함
    color: '#1E40AF',
  }}
>
  {PARTNER_ORDER_STATUS_LABEL_LOCAL[order.status]}
</span>
```

DRAFT 상태가 파란 배지로 렌더링됨. 가이드 매핑에서 DRAFT = warning(주황), ON_HOLD = neutral(회색). 의미 차이가 있다.  
`Badge` 컴포넌트를 사용하면 design-system 토큰이 자동 적용된다.

---

### P2-3. 모달 타이틀 불일치

**가이드 §1.1 레이아웃:** 모달 헤더 타이틀 `"출고전표 병합 전환"`.  
**가이드 §8.2 버튼 레이블:** `"출고전표로 병합 전환"`.

**구현 실제 (MergeConvertDialog.tsx 305행):**
```tsx
title="출고전표로 병합 전환"
```
모달 타이틀과 버튼 레이블이 동일한 문구를 사용. 가이드 §1.1은 타이틀을 `"출고전표 병합 전환"`으로, 버튼은 `"출고전표로 병합 전환"`으로 구분하고 있다. 현재 구현은 버튼 레이블 문구로 통일됨. 의미상 큰 차이는 아니나 가이드 불일치.

---

### P2-4. 오류 배너 위치 — 가이드 순서와 역전

**가이드 §1.1 레이아웃 순서:** [A] 비가역 경고 → [B] 창고 선택 → [C] 충돌 섹션 → [D] 라인 표 → [F] 오류 배너.  
가이드 §2.6: "헤더 충돌 섹션 바로 아래 노출".

**구현 실제 (MergeConvertDialog.tsx 338-370행):** 오류 배너가 최상단에 렌더링됨 (비가역 경고 위).

이 순서가 나쁘지는 않지만(오류를 먼저 보여주는 것도 UX 패턴으로 쓰임) 가이드와 다르다. 특히 비가역 경고가 오류 배너 아래로 밀리면 항상-최상단 규칙이 깨진다. 가이드 §2.1: "모달 본문 최상단. 창고 선택 및 라인 표보다 위."

오류 배너가 최상단이면 비가역 경고는 오류 배너 아래로 내려가 "항상 최상단" 요건을 충족하지 못한다.

**수정 방향:** 렌더링 순서를 비가역경고 → 창고선택 → 충돌섹션 → 라인표 → 오류배너 순으로 재정렬.

---

### P2-5. `autoFocus` 미구현

**가이드 §2.2:** "모달 오픈 직후 `WarehouseAutocomplete` 인풋에 `autoFocus` 적용".  
**가이드 §5.1 포커스 관리:** 모달 오픈 시 첫 포커스 대상 = 창고 인풋.

**구현 실제 (MergeConvertDialog.tsx 379-389행):** `WarehouseAutocomplete`에 `autoFocus` prop 없음. 모달 오픈 후 포커스 위치 불명확.

---

### P2-6. `discountInfo` 충돌 감지 누락

**가이드 §2.3 충돌 감지 대상 필드:** `shippingAddress`, `paymentDueLabel`, `receiverPhone`, `memo`, `discountInfo`.

**구현 실제 (MergeConvertDialog.tsx 180-197행):**
```tsx
const keys: ShippingFieldKey[] = [
  'partnerName',
  'shippingAddress',
  'receiverPhone',
  'paymentDueLabel',
  'memo',
  // discountInfo 누락
]
```

`discountInfo`가 충돌 감지 루프에서 제외됨. `extractShippingFieldValue` 함수(109행)에서 `discountInfo`는 항상 `''`를 반환하므로 어차피 충돌이 발생하지 않는다. 그러나 이 처리는 주석(107-109행)에서 "PartnerOrderDetail에 노출 안 됨"이라고 명시하고 있어 BE 데이터 구조상의 제약임. 가이드와 구현 모두 불일치이므로 가이드 §9 미결 항목으로 기록 필요.  
현재 구현에서는 `discountInfo` 값이 없기 때문에 실질적 결함은 없으나, 가이드-구현 불일치는 명시적으로 추적해야 한다.

---

### P2-7. 성공 토스트 카피 — 병합 N건 정보 누락

**가이드 §2.7 성공 처리 카피:**
```
출고전표 {slipNo} 발행 완료 — {N}개 주문 병합 전환
```
(4초 자동 소멸)

**구현 실제 (SalesPartnerOrderListPage.tsx 157-159행):**
```tsx
setConvertSuccessMessage(`출고전표 ${slipNo} 발행 완료`)
// 3초 후 자동 소멸
setTimeout(() => setConvertSuccessMessage(null), 3000)
```

두 가지 불일치:
1. `— {N}개 주문 병합 전환` 후미 문구 누락 — 사용자가 몇 건이 병합됐는지 확인 불가
2. 소멸 타이머 3초 vs 가이드 4초

---

## 종합 요약

| 번호 | 중요도 | 영역 | 내용 |
|---|---|---|---|
| P1-1 | P1 | 비가역 경고 | warning 토큰 재사용 — danger 토큰 격상 미적용 |
| P1-2 | P1 | 충돌 섹션 | 라디오+직접입력 혼합 패턴 미완성, 4-AND 비활성 조건 누락 |
| P1-3 | P1 | 버튼 카피 | `'병합 발행 →'` / `'병합 발행 중…'` 텍스트 불일치 |
| P1-4 | P1 | 비가역 경고 카피 | "재고 예약" 문구 + {M}개 품목 동적값 누락 |
| P2-1 | P2 | 컬러 토큰 | 충돌 섹션 및 그룹 헤더 다수 색상 하드코딩 |
| P2-2 | P2 | Badge 컴포넌트 | 상태 배지 하드코딩 span — DRAFT가 파란 배지로 잘못 표시 |
| P2-3 | P2 | 모달 타이틀 | 타이틀 문구 가이드 §1.1과 불일치 |
| P2-4 | P2 | 오류 배너 위치 | 렌더링 순서 — 오류배너가 비가역경고보다 위 |
| P2-5 | P2 | 포커스 관리 | WarehouseAutocomplete autoFocus 누락 |
| P2-6 | P2 | 충돌 감지 | discountInfo 누락 (BE 제약 기인, 가이드 §9에 미결 추가 필요) |
| P2-7 | P2 | 성공 토스트 | N건 병합 문구 + 4초 소멸 불일치 |

**P1 결함 4건이 모두 해소되어야 APPROVE 전환.**
