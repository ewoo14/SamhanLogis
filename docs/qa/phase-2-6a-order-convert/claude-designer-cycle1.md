# Designer Review — Phase 2.6a 부분전환 FE
**Branch**: feat/phase-2-6a-order-to-slip-conversion (HEAD 0c79ef4d)
**Cycle**: 1
**Reviewer**: Claude Designer Agent
**Date**: 2026-05-30

---

## 리뷰 대상

- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`
- `clients/desktop/src/renderer/components/sales/sales.module.css`
- `clients/desktop/src/renderer/api/sales.ts`

---

## 점검 결과 요약

| # | 항목 | 등급 | 판정 |
|---|------|------|------|
| 1 | 전환 모달 UX (라인 목록 직관성 / 잔여 0 비활성) | P2 | 결함 |
| 2 | CONVERTED 뱃지 색 (목록 페이지 STATUS_CLASS 오매핑) | P1 | 결함 |
| 3 | 전환 버튼 variant / 위계 | Minor | 결함 |
| 4 | 토스트 / 에러 피드백 시각 | Pass | 양호 |
| 5 | design-system 토큰 사용 / 하드코딩 | P2 | 결함 |
| 6 | 부분전환 잔여 안내 명확성 | P1 | 결함 |

---

## 1. 전환 모달 UX [P2]

### 관찰
- 모달 컬럼 순서: 품목명 / 모델명 / 주문수량 / 전환됨 / 잔여 / 전환수량 — 논리 흐름은 적절함.
- `opacity: 0.45` 로 잔여=0 라인 비활성 표시. 0.45는 WCAG 비활성 기준(0.38)보다 높아 읽기 가능하지만, disabled 상태임을 색 변화 없이 opacity만으로 전달한다. 보조 큐(텍스트 색조, 배경색 변화) 없이 opacity만 사용하면 저시력 환경에서 인지 한계.
- 잔여=0 라인의 `Input` 에 `disabled` prop이 전달되나, `value={disabled ? 0 : currentQty}` 로 항상 0을 표시. 이미 전환됨(converted) 상태라는 텍스트 설명이 없어 "왜 0인가"를 즉시 파악하기 어려움.
- 전환수량 `Input`의 `type="number"` 사용 — number input은 스핀 버튼을 포함하므로 수량이 큰 경우 UX 파편. `inputMode="numeric"` + `type="text"` + 클램핑 패턴이 더 적합하나, 이는 이 슬라이스 내에서 추가 개선 필요 수준(P2).

### 판정
- **P2**: 잔여=0 행에 opacity 외 보조 큐(배경 tint 또는 "전환완료" 텍스트 셀) 추가 권장.

---

## 2. CONVERTED 뱃지 색 — STATUS_CLASS 오매핑 [P1]

### 관찰
`SalesPartnerOrderListPage.tsx` line 28:
```
CONVERTED: styles['statusConfirmed']!,
```
`statusConfirmed` 는 `.statusConfirmed { background: var(--state-success-bg, #d1fae5); color: var(--state-success, #065f46); }` 로 **초록 계열(success)**이다.

반면 `sales.module.css` 에는 `.statusConverted { background: #ede9fe; color: #5b21b6; }` 라는 **보라 계열(violet)** 클래스가 명시적으로 선언되어 있다.

목록 페이지는 `statusConverted` 를 사용하지 않고 `statusConfirmed`(초록)를 재사용하고 있다. 결과적으로:
- 목록에서 CONVERTED 주문 → 초록 뱃지 ("완료"처럼 보임)
- CONFIRMED 주문도 → 초록 뱃지
- 두 상태의 시각 구분이 완전히 사라짐

이것은 의미색(semantic color) 충돌 결함이다. `CONVERTED: styles['statusConverted']!` 로 수정해야 한다.

### 판정
- **P1 (Critical)**: 목록에서 CONFIRMED(완료)와 CONVERTED(전환완료)가 동일한 초록 뱃지로 표시되어 상태 구분 불가. `statusConverted` 클래스는 이미 존재하므로 오매핑만 수정.

---

## 3. 전환 버튼 variant / 위계 [Minor]

### 관찰
topActions 버튼 배열:
- 인쇄: `secondary`
- 수정: `primary`
- 보류: `warning`
- 보류 해제: `secondary`
- **출고전표 전환: `primary`**
- 삭제: `danger`

"수정"과 "출고전표 전환" 둘 다 `primary` variant를 사용한다. 출고전표 전환은 비가역적 금전 액션(전표 발행)으로 단순 데이터 수정보다 중요도가 높음에도 동일 variant를 쓴다. 이상적으로는 전환 버튼을 `variant="primary"` 유지하되 아이콘 추가 또는 순서 재배치를 통해 위계를 명확히 해야 한다. 그러나 design-system Button의 variant 스펙 범위 내에서 `primary`가 가장 강한 CTA이고, 현재 다른 variant 선택지가 없다면 순서(수정 → ... → 전환 → 삭제) 자체가 액션 우선순위를 내포.

현재 배치 문제: 수정 바로 뒤에 보류/보류해제가 오고 전환이 그 다음인데, 출고전표 전환이 가장 중요한 CTA라면 수정 이전 또는 가장 우선 위치에 배치해야 한다. 현재는 4번째 위치로 묻힘.

### 판정
- **Minor**: 버튼 순서 재배치 권장 (전환 → 수정 → 보류 → 삭제 순이 중요도 순). 현 `primary` variant 사용 자체는 허용 범위 내.

---

## 4. 토스트 / 에러 피드백 시각 [Pass]

### 관찰
- **에러**: `errorBanner` 클래스 — `border: 1px solid var(--state-danger)` + `background: var(--state-danger-bg)` + `color: var(--state-danger)`. design-system state 토큰 정상 참조.
- **성공 토스트**: `successBanner` 클래스 — `border: 1px solid var(--state-success, #10b981)` + `background: var(--state-success-bg, #d1fae5)` + `color: var(--state-success-text, #065f46)`. 토큰 fallback 포함.
- 토스트 자동 소멸: 4000ms setTimeout. 적절.
- 성공 메시지: `출고전표 ${result.slipNo} 발행` — 슬립번호를 포함해 명확.
- 에러 메시지: 409/403/기타 케이스별 구체적 안내. 적절.
- `role="alert"` / `role="status"` 접근성 속성 정상 부여.

### 판정
- **Pass**: 토스트/에러 피드백 구조, 색상, 접근성 속성 모두 적절.

---

## 5. design-system 토큰 사용 / 하드코딩 [P2]

### 관찰
`sales.module.css` 내 하드코딩 색상 목록 (신규 전환 관련 영역 포함):

**전환 모달 행 비활성 처리** (`SalesPartnerOrderDetailPage.tsx` line 898):
```tsx
style={{ opacity: disabled ? 0.45 : 1 }}
```
인라인 스타일로 opacity를 직접 지정. design-system 토큰이나 CSS 모듈 클래스가 아닌 JS 인라인 스타일 사용. `--opacity-disabled` 등 토큰이 없더라도 CSS 모듈에 `.convertLineDisabled { opacity: 0.45; }` 클래스로 분리해야 한다.

**전환 모달 테이블 헤더 th 정렬** (lines 884-887):
```tsx
<th style={{ textAlign: 'right' }}>주문수량</th>
<th style={{ textAlign: 'right' }}>전환됨</th>
<th style={{ textAlign: 'right' }}>잔여</th>
<th style={{ textAlign: 'right', minWidth: '100px' }}>전환수량</th>
```
4개 `th`에 인라인 `style` 직접 사용. 기존 `.numericCol` 은 `td`에만 적용되고 `th`에는 미적용 상태. `estTable th.numericCol` 셀렉터 확장 또는 `.numericTh` 클래스 추가가 필요하다.

**statusConverted 의 하드코딩 hex**:
```css
.statusConverted {
  background: #ede9fe;
  color: #5b21b6;
}
```
violet 계열에 대응하는 design-system 토큰이 없다 (`--color-brand-*` 는 blue 계열). 이 경우 fallback hex는 허용되나, 주석에 의도 기술이 필요. 현재 주석 "brand-violet 계열 — info(blue) 와 의미상 분리. fallback 보라 hex 유지." 는 작성되어 있어 양호.

**`.salesScope` 내 `--c-accent: #2563eb`**: `--color-brand-500` (#2D77A8) 과 불일치. legacy 보존 의도는 이해되나 brand token과 diverge된 상태. 현 슬라이스 범위에서는 지적만.

### 판정
- **P2**: 전환 모달 내 인라인 `style` 2건(opacity / th textAlign) → CSS 모듈 클래스로 추출 필요.

---

## 6. 부분전환 잔여 안내 명확성 [P1]

### 관찰
전환 모달에서 부분전환 후 재진입 시나리오:
- 라인별 `convertedQuantity` 가 일부 채워진 상태에서 모달 재오픈 시, 잔여 수량이 "잔여" 컬럼에 수치로만 표시됨.
- "이 주문의 N개 라인 중 M개가 이미 전환됨" 또는 "전체 주문의 잔여 합계 N개 남음" 같은 요약 안내가 없음.
- 특히 `fullyConverted: false` 상태(부분전환 완료, 재전환 가능)와 `linkedSlipNo != null` 상태(전환완료, 버튼 숨김) 구분에서, 버튼 표시 조건이 `linkedSlipNo == null` 이므로 부분전환 후에도 버튼이 보인다 — 이는 의도된 동작이나 사용자에게 "부분전환이 됐고 잔여분이 있음"을 알리는 시각 단서가 상세 화면에 없음.

**상세 라인 테이블** (모달 외부, 조회 화면의 라인 카드): 현재 컬럼이 품목명 / 모델명 / 수량 / 납품가 / 소계 / 묶음처리 / 구성품 펼침으로 구성되어 있고, `convertedQuantity` 컬럼이 없다. 부분전환된 주문의 상세 화면에서 각 라인별 전환 진행상태(전환됨/잔여)를 상세 테이블에서 확인할 방법이 없음. 모달을 열어야만 확인 가능하다.

### 판정
- **P1**: 상세 라인 테이블에 `전환됨` / `잔여` 컬럼 미노출. 부분전환 상태인 주문에서 현황 파악을 위해 매번 모달을 열어야 하는 추가 스텝 발생. 최소한 `convertedQuantity > 0` 인 라인에 시각 표시(뱃지 또는 수량 표시)가 필요.

---

## 결함 목록

| ID | 파일 | 위치 | 등급 | 내용 |
|----|------|------|------|------|
| D-01 | `SalesPartnerOrderListPage.tsx` | line 28 | P1 | `CONVERTED: styles['statusConfirmed']!` → `styles['statusConverted']!` 오매핑 |
| D-02 | `SalesPartnerOrderDetailPage.tsx` | line 534~578 (조회 라인 테이블) | P1 | 부분전환 진행 컬럼(전환됨/잔여) 조회 화면 미노출 |
| D-03 | `SalesPartnerOrderDetailPage.tsx` | line 898 | P2 | `style={{ opacity: disabled ? 0.45 : 1 }}` 인라인 → CSS 모듈 클래스 추출 |
| D-04 | `SalesPartnerOrderDetailPage.tsx` | lines 884-887 | P2 | `th style={{ textAlign: 'right' }}` 인라인 × 4 → CSS 모듈로 추출 |
| D-05 | `SalesPartnerOrderDetailPage.tsx` | 전환 모달 | P2 | 잔여=0 행에 opacity만으로 비활성 표현 — 보조 큐(배경 tint 또는 "전환완료" 표시) 부재 |
| D-06 | `SalesPartnerOrderDetailPage.tsx` | topActions | Minor | 전환 버튼 위치가 수정/보류/보류해제 뒤 4번째 — 중요 CTA임에도 묻힘 |

---

## 총평

전환 모달의 전반적인 정보 구조(품목명/주문수량/전환됨/잔여/전환수량 컬럼)는 직관적이며, 에러/성공 피드백의 토큰 사용과 접근성 속성 부여는 적절하다. 그러나 두 건의 P1 결함이 존재하여 현 상태 APPROVE 불가.

- **D-01(P1)**: 목록 페이지 STATUS_CLASS 오매핑 — CSS 클래스는 이미 존재하므로 1줄 수정으로 해결 가능.
- **D-02(P1)**: 조회 화면 라인 테이블에 전환 진행 정보 부재 — 사용자가 부분전환 현황을 파악하려면 모달을 열어야 하는 추가 UX 장벽.

P1 결함 2건 해소 후 Cycle 2 재검토 요청.

**판정: Designer REQUEST_CHANGES (P1 × 2, P2 × 3, Minor × 1)**
