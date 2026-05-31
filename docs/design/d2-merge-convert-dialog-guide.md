# D2 MergeConvertDialog — UX 디자인 가이드
## 다중 주문 병합 → 단일 출고전표 전환 모달

> 작성: Designer (2026-05-31)
> 설계 출처: `docs/superpowers/specs/2026-05-31-order-merge-to-slip-design.md` §4.4
> 구현 대상: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
> 참조 패턴: `SalesPartnerOrderDetailPage.tsx` 단일주문 전환 모달 (Phase 2.6a)

---

## 1. 모달 레이아웃

### 1.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [모달 헤더]  출고전표 병합 전환                              ×  닫기(ESC)   │
│─────────────────────────────────────────────────────────────────────────────│
│  [A] 비가역 경고 배너 (danger 토큰, 항상 최상단)                             │
│─────────────────────────────────────────────────────────────────────────────│
│  [B] 창고 필수 선택 — WarehouseAutocomplete (필수 표시 *)                    │
│─────────────────────────────────────────────────────────────────────────────│
│  [C] 헤더 충돌 섹션 (선택 주문 중 서로 다른 값이 있는 경우에만 노출)         │
│      배송지   ┌─ 주문1 값 ─────────────────────┐  (●) 선택                 │
│               ├─ 주문2 값 ─────────────────────┤  ( ) 선택                 │
│               └─ 직접 입력 (/ 병기) ────────────┘  ( ) 직접 입력            │
│      납기일   [동일 값이면 이 행 자체 미노출]                                 │
│─────────────────────────────────────────────────────────────────────────────│
│  [D] 주문별 라인 그룹 표 (스크롤 가능, max-height: 400px)                   │
│                                                                             │
│  ▼ 주문번호: 2026/05/31-1  거래처: 삼한항공(주)                [진행중 배지] │
│  ┌──────────────┬────────┬────────┬────────┬──────────────────┐            │
│  │ 품목명       │ 모델명 │ 주문   │ 잔여   │ 전환수량          │            │
│  ├──────────────┼────────┼────────┼────────┼──────────────────┤            │
│  │ 항공화물박스  │ AHB-L  │   100  │    60  │ [  60  ] ▲▼     │            │
│  │ 포장테이프   │ PT-01  │    50  │    50  │ [  50  ] ▲▼     │            │
│  └──────────────┴────────┴────────┴────────┴──────────────────┘            │
│                                                                             │
│  ▼ 주문번호: 2026/05/31-2  거래처: 삼한항공(주)                [보류 배지]  │
│  ┌──────────────┬────────┬────────┬────────┬──────────────────┐            │
│  │ 품목명       │ 모델명 │ 주문   │ 잔여   │ 전환수량          │            │
│  ├──────────────┼────────┼────────┼────────┼──────────────────┤            │
│  │ 항공화물백   │ HM-02  │   200  │   200  │ [ 200  ] ▲▼     │            │
│  └──────────────┴────────┴────────┴────────┴──────────────────┘            │
│─────────────────────────────────────────────────────────────────────────────│
│  [E] 요약 표 (라인 합계 행)                                                  │
│      총 라인 수: 3건   전환 예정 수량 합계: 310                              │
│─────────────────────────────────────────────────────────────────────────────│
│  [F] 오류 배너 (조건부 노출 — API 응답 오류 / 재고 부족 409)                 │
│─────────────────────────────────────────────────────────────────────────────│
│  [푸터]           [취소]            [병합 발행 →] (primary, 비활성 조건 有)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 모달 크기

| 속성 | 값 | 근거 |
|---|---|---|
| `size` prop | `"xl"` | 다주문 라인 표가 좁으면 가독성 불가. InboundInspectionDialog와 동일 |
| 최소 너비 | 860px | 5컬럼 표 + 전환수량 입력 공간 확보 |
| 라인 표 max-height | 400px | 2개 주문 그룹 + 각 3~5 라인 기준. 초과 시 내부 스크롤 |
| 푸터 높이 | 56px | `Modal` 컴포넌트 기본 footer 규격 |

---

## 2. 영역별 상세 명세

### 2.1 [A] 비가역 경고 배너

**위치:** 모달 본문 최상단. 창고 선택 및 라인 표보다 위.

**토큰:**

| 속성 | 값 |
|---|---|
| background | `var(--color-danger-50)` (#FFF1F1) |
| border | `1px solid var(--color-danger-200)` (#FECACA) |
| border-radius | `var(--radius-md)` (4px) |
| padding | `var(--space-3) var(--space-4)` (12px 16px) |
| margin-bottom | `var(--space-4)` (16px) |
| font-size | `var(--font-size-sm)` (13px) |
| color | `var(--color-danger-700)` (#991B1B) |

**경고 카피 (한국어 확정):**

```
주의: 병합 발행 후에는 출고전표가 즉시 생성되며 재고가 예약됩니다.
이 작업은 되돌릴 수 없습니다. ({N}개 주문, {M}개 품목 전환 예정)
```

- `{N}` = 선택된 주문 수 (예: 2)
- `{M}` = 전환수량 > 0 인 라인 수 (예: 3)
- `{M}` 이 0이면 괄호 내 부분 생략("이 작업은 되돌릴 수 없습니다."까지만)
- `role="note"` 접근성 속성 적용 (단일주문 모달의 `convertWarningBanner` 패턴 계승)

**비교:** 단일주문 전환 모달(`convertWarningBanner` CSS 클래스)은 warning(오렌지) 토큰을 사용했으나, 병합 전환은 여러 주문에 걸친 재고 예약이라 되돌리기 더 어려우므로 danger(빨강) 토큰으로 격상한다.

---

### 2.2 [B] 창고 필수 선택

**컴포넌트:** `WarehouseAutocomplete` — SlipFormPage·단일주문 전환 모달 기존 패턴 그대로 재사용.

```tsx
<WarehouseAutocomplete
  warehouses={warehousesQuery.data ?? []}
  value={convertWarehouse?.id ?? null}
  onChange={(_id, warehouse) => setConvertWarehouse(warehouse)}
  label="출고 창고"
  placeholder="창고 코드 또는 이름 입력…"
  hideVirtual
  required                          // 라벨 * 표시 강제
  disabled={isBusy || warehousesQuery.isLoading}
  error={warehouseError}            // 미선택 + 전환수량 있을 때
/>
```

**에러 문구:** `출고 창고를 선택하세요.`

**강조 규칙:**
- 모달 오픈 직후 `WarehouseAutocomplete` 인풋에 `autoFocus` 적용 (첫 번째 상호작용 대상).
- 창고 미선택 상태에서 "병합 발행" 버튼 클릭 시 에러 메시지 노출 + 창고 인풋으로 포커스 이동 (`scrollIntoView`).

---

### 2.3 [C] 헤더 충돌 섹션

#### 충돌 감지 로직

선택된 주문들의 헤더 필드(배송지/납기일/인수자 연락처/입금예정일/할인율/메모) 중 값이 2개 이상이고 서로 다른 경우에만 해당 행을 노출한다. **모든 주문이 동일 값이면 해당 행은 자동 채워진 것으로 간주하고 UI에 표시하지 않는다.**

| 필드명 | BE 키 | 충돌 없을 때 | 충돌 있을 때 |
|---|---|---|---|
| 배송지 | `shippingAddress` | 자동 채움, 표시 안 함 | 충돌 행 노출 |
| 납기일 | `paymentDueLabel` | 자동 채움, 표시 안 함 | 충돌 행 노출 |
| 인수자 연락처 | `receiverPhone` | 자동 채움, 표시 안 함 | 충돌 행 노출 |
| 메모 | `memo` | 자동 채움, 표시 안 함 | 충돌 행 노출 |
| 할인 정보 | `discountInfo` | 자동 채움, 표시 안 함 | 충돌 행 노출 |

#### 충돌 행 UX 패턴 — 결정 D-UI-01

**결정: 라디오 선택 + 직접 입력(/ 병기) 혼합 패턴**

각 충돌 필드에 대해 3개 라디오 옵션을 제공한다:

```
배송지 *  [충돌 아이콘] ──────────────────────────────────────
  (●) 주문 2026/05/31-1 값: "서울시 강남구 테헤란로 123"
  ( ) 주문 2026/05/31-2 값: "부산시 해운대구 센텀로 200"
  ( ) 직접 입력 (/ 병기 등)
      └─ [______________________________] (text input, 직접 입력 선택 시 활성화)
```

| 요소 | 상세 |
|---|---|
| 충돌 아이콘 | 주황 삼각형 경고 `⚠` (unicode U+26A0), `color: var(--color-warning-700)` |
| 라디오 버튼 | 기본 HTML `<input type="radio">` + 커스텀 레이블, focus ring: `outline: 2px solid var(--line-focus)` |
| 주문번호 표시 | 주문번호만 노출 (UUID 비공개 원칙 준수) |
| 직접 입력 인풋 | `type="text"`, `placeholder="예: 서울/부산"`, 직접입력 라디오 미선택 시 `disabled` |
| 섹션 배경 | `background: var(--color-warning-50)` (#FEF6E7), `border: 1px solid var(--color-warning-200)` |
| 섹션 margin-bottom | `var(--space-4)` |

**결정 근거:**
- 이카운트 참조(판매입력 화면 §1.1 캡처)에서 헤더 필드(배송주소/인수자번호 등)는 한 행씩 독립 입력. 충돌 해소는 사용자가 명시적으로 선택해야 함.
- 설계 D-MRG-03: "FE가 최종 병합 헤더 확정 전송, BE는 그대로 저장" — 사용자가 직접 확인·선택한 값만 BE로 전송해야 한다.
- 라디오는 키보드(`↑↓`, `Tab`) 탐색이 자연스럽고 ERP 업무 환경의 키보드 중심 워크플로우에 적합.
- `/ 병기` 직접 입력 옵션 제공으로 "서울/부산" 같은 병기 형식을 강요하지 않고 사용자 선택에 맡김 (설계 §1 "FE가 선택 또는 `/`로 병기한 최종 헤더").

**초기값 규칙:**
- 충돌 필드: 라디오 미선택 상태(none)로 시작 → "병합 발행" 버튼 비활성 조건에 포함.
- 비충돌 필드: 공통 값을 `shippingInfo` state에 자동 채움.

---

### 2.4 [D] 주문별 라인 그룹 표

#### 그룹 헤더

```tsx
// 그룹 헤더 행 — 주문번호 + 거래처명 + 상태 배지
<tr style={{ background: 'var(--color-neutral-50)' }}>
  <td colSpan={5} style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13 }}>
    주문번호: {order.orderNo}
    <span style={{ marginLeft: 12, fontWeight: 400, color: 'var(--color-neutral-500)' }}>
      {order.partnerName}
    </span>
    <Badge variant={statusVariant}>{statusLabel}</Badge>
  </td>
</tr>
```

**상태 배지 매핑:**

| 주문 상태 | Badge variant | 표시 텍스트 |
|---|---|---|
| DRAFT | `"warning"` | 진행중 |
| ON_HOLD | `"neutral"` | 보류 |

#### 라인 표 컬럼

| 컬럼 | 내용 | 정렬 | 너비 |
|---|---|---|---|
| 품목명 | `productName` + 하단 소자 `modelName` | left | flex |
| 모델명 | `modelName` | left | 120px |
| 주문수량 | `quantity` (정수) | right | 72px |
| 잔여수량 | `quantity - convertedQuantity` | right | 72px |
| 전환수량 | `<Input type="number">` (편집가능) | center | 100px |

**전환수량 입력 규칙:**
- `min={0}`, `max={remaining}` — 잔여 초과 입력 시 `remaining` 으로 clamp
- 기본값: 잔여 전량 (`remaining`)
- 잔여가 0 인 라인은 `disabled` 처리 + 배경 `var(--color-neutral-100)` + "전환완료" 소자 (단일주문 전환 모달 패턴 동일)
- `aria-label={`${productName} 전환수량`}`
- `data-testid={`merge-convert-qty-${orderNo}-${idx}`}` (QA 자동화용, UUID 불포함)

**라인 표 스타일:**
- 헤더 배경: `var(--color-neutral-50)`
- 헤더 border-bottom: `1px solid var(--color-neutral-200)`
- 행 border-bottom: `1px solid var(--color-neutral-100)`
- 폰트: `var(--font-size-sm)` (13px)

---

### 2.5 [E] 요약 행

라인 표 하단에 고정 표시. 스크롤과 무관하게 항상 보여야 한다.

```
총 주문: 2건  |  총 라인: 3건  |  전환 예정 수량 합계: 310개
```

- 폰트: `var(--font-size-sm)` 13px, `fontWeight: 500`
- 색상: `var(--color-neutral-700)`
- padding: `var(--space-3) var(--space-4)`
- background: `var(--color-neutral-50)`
- border-top: `1px solid var(--color-neutral-200)`

---

### 2.6 [F] 오류 배너

API 응답 오류 발생 시 헤더 충돌 섹션 바로 아래 노출. 단일주문 전환 모달의 `errorBanner` CSS 클래스 패턴 재사용.

**409 재고 부족 메시지 (한국어 확정):**

단일 품목 부족:
```
재고 부족으로 병합 발행할 수 없습니다.
{품목명} ({모델명}) — 요청 {N}개 / 가용 {M}개
수량을 줄이거나 담당자에게 재고 보충을 요청해 주세요.
```

복수 품목 부족:
```
재고 부족 품목이 있어 병합 발행할 수 없습니다.
{첫번째 품목명} ({모델명}) — 요청 {N}개 / 가용 {M}개 외 {K}건 부족
품목별 전환수량을 조정하거나 나누어 전환해 주세요.
```

거래처 불일치 (409 partnerCode):
```
병합은 같은 거래처 주문만 가능합니다. 선택을 다시 확인해 주세요.
```

기타 오류:
```
병합 발행에 실패했습니다. 잠시 후 다시 시도해 주세요.
```

- `role="alert"` 접근성 적용 (스크린리더 즉시 알림)
- `whiteSpace: "pre-line"` (개행 문자 처리)

---

### 2.7 [F] 푸터 버튼

```
[ 취소 ]                              [ 병합 발행 → ]
(secondary)                           (primary, disabled 조건 有)
```

**"병합 발행" 비활성 조건 (모두 AND):**
- `isBusy` (API 요청 중)
- `convertWarehouse === null` (창고 미선택)
- 전환수량 > 0 인 라인 수 === 0 (전환 대상 없음)
- 충돌 필드가 있는데 미선택인 항목 존재

**로딩 텍스트:** `"병합 발행 중…"` (Spinner 없이 텍스트만, 단일주문 전환 모달과 동일 패턴)

**성공 처리:**
- 모달 닫기
- 주문 목록 react-query invalidate (`['partner-orders']`)
- 성공 토스트/배너: `출고전표 {slipNo} 발행 완료 — {N}개 주문 병합 전환` (4초 후 자동 소멸)

---

## 3. design-system 토큰 참조표

### 3.1 컬러 토큰

| 역할 | 토큰 | 실값 |
|---|---|---|
| 비가역 경고 배경 | `--color-danger-50` | #FFF1F1 |
| 비가역 경고 테두리 | `--color-danger-200` | #FECACA |
| 비가역 경고 텍스트 | `--color-danger-700` | #991B1B |
| 충돌 섹션 배경 | `--color-warning-50` | #FEF6E7 |
| 충돌 섹션 테두리 | `--color-warning-200` | #F8DA9A |
| 충돌 아이콘 | `--color-warning-700` | #B47A1F |
| 라인 표 헤더 배경 | `--color-neutral-50` | #F7F8FA |
| 라인 표 border | `--color-neutral-200` | #D6DCE3 |
| 라인 표 행 구분선 | `--color-neutral-100` | #EDF0F4 |
| 전환완료 라인 배경 | `--color-neutral-100` | #EDF0F4 |
| 전환완료 텍스트 | `--color-neutral-400` | #8E97A4 |
| 그룹 헤더 배경 | `--color-neutral-50` | #F7F8FA 또는 `--color-brand-50` #EFF6FB |
| 성공 배너 배경 | `--color-success-50` | #ecfdf5 |
| 성공 배너 테두리 | `--color-success-200` | #a7f3d0 |
| 성공 배너 텍스트 | `--color-success-700` | #047857 |
| focus ring | `--line-focus` | #3B82F6 |
| 창고 에러 텍스트 | `--color-danger-600` | #DC2626 |

### 3.2 타이포그래피 토큰

| 역할 | 토큰 | 실값 |
|---|---|---|
| 본문 / 라인 표 | `--font-size-sm` | 13px |
| 라벨 / 컬럼 헤더 | `--font-size-sm` + `fontWeight: 600` | 13px semibold |
| 모달 타이틀 | `Modal` 컴포넌트 내장 | 16px semibold |
| 그룹 헤더 주문번호 | `--font-size-sm` + `fontWeight: 600` | 13px semibold |
| 보조 텍스트(거래처명) | `--font-size-sm` + neutral-500 | 13px regular |
| 오류 배너 | `--font-size-sm` | 13px |
| 경고 배너 | `--font-size-sm` | 13px |

### 3.3 스페이싱 토큰

| 역할 | 토큰 | 실값 |
|---|---|---|
| 경고 배너 padding | `--space-3 --space-4` | 12px 16px |
| 경고 배너 margin-bottom | `--space-4` | 16px |
| 창고 선택 margin-bottom | `--space-3` | 12px |
| 라인 표 셀 padding | `8px 10px` | (InboundInspectionDialog 패턴) |
| 충돌 섹션 padding | `--space-4` | 16px |
| 충돌 섹션 margin-bottom | `--space-4` | 16px |

### 3.4 사용 컴포넌트 목록

| 컴포넌트 | import 경로 | 용도 |
|---|---|---|
| `Modal` | `@samhan/design-system` | 모달 wrapper (size="xl") |
| `Button` | `@samhan/design-system` | 취소(secondary) / 병합발행(primary) |
| `Input` | `@samhan/design-system` | 전환수량 number input + 직접입력 text input |
| `Badge` | `@samhan/design-system` | 주문 상태 (warning/neutral variant) |
| `Spinner` | `@samhan/design-system` | (선택사항) 로딩 시 버튼 내부 또는 본문 |
| `WarehouseAutocomplete` | 앱 내부 공유 컴포넌트 | 창고 필수 선택 (SlipFormPage 패턴) |

---

## 4. 헤더 충돌 UX 패턴 결정 로그

### D-UI-01: 충돌 표시 방식

**배경:** 설계 §4.4에서 "헤더 충돌 필드 표시 → 사용자가 값 선택 또는 `/` 병기 텍스트 입력"으로 명시. 구현 방식이 결정되지 않은 상태.

**후보 검토:**

| 후보 | 방식 | 단점 |
|---|---|---|
| A. 단순 텍스트 인풋 | 충돌 값을 placeholder로만 보여주고 직접 타이핑 | 주문별 원본 값 확인 불가. 오타 위험 |
| B. 라디오 + 직접 입력 | 각 주문 값을 라디오로, 마지막 옵션을 직접 입력 | 구현 복잡도 중간. UX 명확 |
| C. 드롭다운 선택 | Select 컴포넌트로 값 선택 | 직접 입력(/ 병기) 동시 지원 어려움 |

**결정: 후보 B 채택**

근거:
1. 이카운트 참조 화면(캡처 20260509_091636)에서 판매입력 헤더(배송주소/인수자번호) 필드가 개별 행으로 구성되고, 값 확인 후 직접 수정하는 패턴.
2. 설계 D-MRG-03: FE 확정 전송 책임. 사용자가 어떤 값을 선택했는지 명확히 드러나야 한다.
3. 라디오 선택은 키보드 Tab + 방향키 탐색이 완전하므로 ERP 업무 사용자(키보드 중심)에 적합.
4. 직접 입력 인풋을 세 번째 옵션으로 분리하면 "서울/부산" 병기 형식 사용 여부가 사용자 재량이 되어, 업무 맥락(실제 배송 다건 병기)에 자연스럽게 대응 가능.

**미결:** 충돌 필드가 5개 이상일 때 레이아웃 붕괴 가능성 → 충돌 섹션에 `max-height: 280px` + 내부 스크롤 적용 (현재 FE 구현 시 고려).

### D-UI-02: 비가역 경고 수준

단일주문 전환 모달(Phase 2.6a)은 `warning` 토큰(오렌지) 사용. 병합 전환은 N개 주문 재고 동시 예약이라 더 강한 경고가 필요하므로 `danger` 토큰(빨강)으로 격상.

### D-UI-03: 그룹 헤더 배경

`--color-brand-50` (#EFF6FB) 사용 검토 → 최종 `--color-neutral-50` (#F7F8FA) 채택. 이유: brand 색상은 선택/활성 상태 표현에 쓰이므로, 정보성 그룹 구분에는 neutral 이 더 적합. 이카운트 참조 화면에서 섹션 구분선은 항상 회색 계열.

### D-UI-04: UUID 비공개 원칙 적용 범위

`feedback_uuid_no_user_visibility` 메모리 규칙 준수:
- 노출 O: 주문번호(`orderNo`), 거래처명(`partnerName`), 품목명(`productName`), 모델명(`modelName`)
- 노출 X: `partnerOrderId`(UUID), `orderLineId`(UUID), `slipId`(UUID)
- `data-testid`에도 UUID 미포함. 주문번호 또는 배열 인덱스 사용.

---

## 5. 접근성 (Accessibility) 메모

### 5.1 포커스 관리

| 시점 | 포커스 이동 대상 |
|---|---|
| 모달 오픈 | `WarehouseAutocomplete` 인풋 (autoFocus) |
| 창고 미선택 후 "병합 발행" 클릭 | `WarehouseAutocomplete` 인풋 (scrollIntoView + focus) |
| 충돌 필드 미선택 후 "병합 발행" 클릭 | 첫 번째 미선택 충돌 필드의 라디오 그룹 |
| API 오류 수신 | 오류 배너 (`role="alert"` 자동 스크린리더 알림) |
| 모달 닫기 (취소 / ESC) | 모달 오픈 트리거 버튼 (목록 페이지의 "출고전표로 병합 전환" 버튼) |

### 5.2 ARIA 속성

| 요소 | ARIA |
|---|---|
| 모달 루트 | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="merge-convert-dialog-title"` |
| 비가역 경고 배너 | `role="note"` |
| 오류 배너 | `role="alert"` |
| 창고 선택 | `aria-required="true"` (WarehouseAutocomplete 내부 전달) |
| 충돌 필드 라디오 그룹 | `role="radiogroup"`, `aria-labelledby="{필드명}-label"` |
| 라디오 버튼 개별 | `aria-label="{주문번호} 값 선택"` |
| 직접 입력 인풋 | `aria-label="{필드명} 직접 입력"`, `aria-disabled={직접입력미선택}` |
| 전환수량 인풋 | `aria-label="{품목명} 전환수량"` |
| 병합 발행 버튼 | `aria-disabled={disabled}` (disabled 상태에서도 이유 인지 가능하도록) |

### 5.3 키보드 인터랙션

| 키 | 동작 |
|---|---|
| `Tab` | 모달 내 포커스 순환 (창고 → 충돌 필드 라디오 그룹들 → 라인 표 인풋들 → 취소 버튼 → 병합 발행 버튼) |
| `↑↓` | 라디오 그룹 내 옵션 이동 |
| `Space` | 라디오 선택 / 버튼 클릭 |
| `ESC` | 모달 닫기 (isBusy=true 일 때 무시) |
| `Enter` | 포커스된 버튼 실행 |

### 5.4 Focus Ring

모든 상호작용 요소에 `outline: 2px solid var(--line-focus)` (#3B82F6) 적용. `outline-offset: 2px`. 기존 global.css의 `:focus-visible` 규칙을 상속하므로 별도 override 불필요.

---

## 6. 상태 머신 요약

```
초기 진입
  └─ 창고: null, 전환수량: 잔여 전량, 충돌 필드: 미선택
       │
       ▼
창고 선택 완료
충돌 필드 선택 완료 (충돌 없으면 자동)
전환수량 조정 (선택사항)
       │
       ▼
[병합 발행] 클릭 (disabled 해제 조건 모두 충족)
       │
       ├─ 409 재고 부족 → 오류 배너 노출, 모달 유지
       ├─ 409 partnerCode 불일치 → 오류 배너 노출, 모달 유지
       ├─ 5xx / 네트워크 오류 → 오류 배너 노출, 모달 유지
       └─ 200/201 성공
             ├─ 모달 닫기
             ├─ react-query invalidate ['partner-orders']
             └─ 성공 토스트/배너 표시 (4초)
```

---

## 7. data-testid 목록 (QA / Playwright 자동화)

| 요소 | testid |
|---|---|
| 모달 루트 | `merge-convert-dialog` |
| 비가역 경고 배너 | `merge-convert-irreversible-warning` |
| 창고 선택 래퍼 | `merge-convert-warehouse` |
| 충돌 섹션 래퍼 | `merge-convert-conflict-section` |
| 충돌 필드 행 | `merge-convert-conflict-{fieldKey}` (예: `merge-convert-conflict-shippingAddress`) |
| 라디오: 주문N 선택 | `merge-convert-conflict-{fieldKey}-radio-{orderNo}` |
| 라디오: 직접 입력 | `merge-convert-conflict-{fieldKey}-radio-custom` |
| 직접 입력 인풋 | `merge-convert-conflict-{fieldKey}-input-custom` |
| 주문 그룹 헤더 | `merge-convert-order-group-{orderNo}` |
| 라인 전환수량 인풋 | `merge-convert-qty-{orderNo}-{lineIndex}` |
| 요약 합계 행 | `merge-convert-summary` |
| 오류 배너 | `merge-convert-error` |
| 취소 버튼 | `merge-convert-cancel` |
| 병합 발행 버튼 | `merge-convert-submit` |

**원칙:** UUID는 testid에 사용하지 않음. 주문번호(`orderNo`) 또는 배열 인덱스(`lineIndex`) 사용.

---

## 8. 주문 목록 페이지 트리거 UX

`SalesPartnerOrderListPage.tsx` 에서 모달을 열기 위한 진입점 명세.

### 8.1 체크박스 다중 선택

- DataGrid `checkboxSelection={true}`, `isRowSelectable={(params) => ['DRAFT', 'ON_HOLD'].includes(params.row.status)}`
- DRAFT/ON_HOLD 외 상태(CONFIRMED/CANCELED/CONVERTED 등)는 선택 불가 (체크박스 disable)
- 선택 개수 표시: `{N}개 선택됨` (선택 > 0 일 때만 노출, 헤더 툴바 영역)

### 8.2 "출고전표로 병합 전환" 버튼

| 조건 | 버튼 상태 | tooltip |
|---|---|---|
| 선택 0개 | hidden (표시 안 함) | — |
| 선택 1개 | disabled | "2개 이상 선택하세요." |
| 선택 2개+ 같은 거래처 | active (primary) | — |
| 선택 2개+ 다른 거래처 | disabled | "같은 거래처 주문만 병합 가능합니다." |

- `variant="primary"` 버튼
- disabled 상태에서 tooltip(`title` 속성으로 최소 구현, Tooltip 컴포넌트 available 시 교체)

---

## 9. 미결 항목 (FE 구현 시 결정 필요)

| 항목 | 현황 | 권고 |
|---|---|---|
| 충돌 섹션 max-height | 충돌 필드 5개+ 시 레이아웃 붕괴 가능 | `max-height: 280px` + `overflow-y: auto` 적용 |
| 성공 메시지 컴포넌트 | Toast 컴포넌트 design-system 미등록 | 단일주문 전환 모달과 동일하게 페이지 레벨 state 배너로 구현 |
| 라인 표 가상화 | 주문당 50+ 라인 극단 케이스 | 현재 미적용. 실운영 데이터 기준 최대 20라인 예상 → 가상화 불필요 |
| 직접 입력 인풋 placeholder | "예: 서울/부산" 고정 | 필드별 맥락에 맞는 placeholder 적용 (납기일이면 "예: 2026-06-30 / 2026-07-15") |
