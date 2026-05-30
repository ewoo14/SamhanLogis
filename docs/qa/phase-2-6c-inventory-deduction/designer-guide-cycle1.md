# Phase 2.6c — 재고 부족(409) 에러 UX 디자인 가이드 (Cycle 1)

작성자: Designer agent  
작성일: 2026-05-31  
대상 화면: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` — 출고전표 전환 모달  
참조 설계: `docs/superpowers/specs/2026-05-30-inventory-deduction-on-convert-2-6c-design.md`

---

## 1. 표시 위치/방식 — 인라인 배너 (전환 모달 내부)

### 결정: 전환 모달 내 인라인 에러 배너

재고 부족 409 에러는 **전환 모달(`convertOpen`) 안에 인라인 배너**로 표시한다.  
모달 바깥(페이지 상단) 토스트 단독 표시는 사용하지 않는다.

#### 근거

1. **맥락 보존**: 사용자는 모달 안에서 전환수량을 직접 입력한 뒤 "출고전표로 전환" 버튼을 누른다. 오류 원인(어느 품목, 몇 개)이 모달 내 라인 테이블과 가장 가까운 위치에 표시되어야 수정 행동으로 연결된다. 모달 밖 토스트는 레이어 분리로 연관성이 끊긴다.

2. **기존 패턴 일관**: 현재 전환 모달은 이미 `convertErrorMessage`를 모달 내 `errorBanner`(`styles['errorBanner']`)로 렌더링하는 구조를 갖추고 있다(`data-testid="partner-order-convert-modal-error"`). 409 재고 부족도 동일 슬롯을 사용해 패턴 통일.

3. **비가역 경고와 공존**: 전환 모달 상단에는 `convertWarningBanner`(비가역 경고)가 항상 표시된다. 에러 배너는 그 위, 즉 **모달 바디 최상단**에 렌더링해 경고보다 에러가 먼저 눈에 들어오게 한다(현행 DOM 순서 유지).

4. **수정 재시도 용이**: 사용자가 전환수량을 줄여 재시도할 때 모달을 닫지 않아도 된다. 인라인 배너는 버튼 클릭 즉시 교체되므로 상태 전환이 자연스럽다.

#### 토스트 보조 사용

모달 닫힘 후 페이지 상단 `convertErrorMessage`(현행 `errorBanner`) 위치에 에러가 남는 현재 동작은 유지한다.  
단, 재고 부족 409는 "모달 안에서 해결하는 오류"이므로 모달 닫힘 시 자동 소거(`setConvertErrorMessage(null)`)해 페이지 레벨 배너 잔류를 막는다. (현행 onClose 에서 이미 `setConvertErrorMessage(null)` 호출 중 — 동작 일치.)

---

## 2. 컬러 토큰 / 타이포 / 아이콘

### 2.1 에러 배너 (재고 부족 409)

| 속성 | 토큰 | 실제 값 |
|---|---|---|
| 배경 | `colors.danger[50]` | `#FFF1F1` |
| 테두리 | `colors.danger[500]` (= `colors.semantic.danger`) | `#D6504A` |
| 본문 텍스트 | `colors.danger[700]` | `#991B1B` |
| 강조 수량 텍스트 | `colors.danger[800]` | `#7F1D1D` |

CSS 구현은 기존 `styles['errorBanner']`가 `--state-danger-bg` / `--state-danger` CSS 변수를 이미 참조하므로 신규 클래스 추가 불필요. 해당 변수값이 위 토큰과 대응하면 된다.

### 2.2 타이포 스케일

| 요소 | fontSize | fontWeight | 설명 |
|---|---|---|---|
| 에러 배너 전체 텍스트 | `typography.fontSize.sm` = `13px` | `semibold` (600) | 기존 `errorBanner` 스펙 유지 |
| 품목명 강조 | 동일 13px | `bold` (700) | `<strong>` 태그로 마크업 |
| 가용수량 숫자 강조 | 동일 13px | `bold` (700) | 숫자 단위(`개`) 포함 |
| 배너 부제(복수 품목 시) | `typography.fontSize.xs` = `12px` | `regular` (400) | 추가 라인으로 표시 |

### 2.3 아이콘

design-system에 전용 아이콘 컴포넌트가 없으므로 유니코드 기호 + CSS로 처리한다.

- 에러 배너 선행 기호: `⊘` (U+2298) 또는 `✕` — `colors.danger[500]` (#D6504A), font-size 14px, vertical-align middle.
- 대안: SVG inline `<svg>` (16×16, `currentColor` fill) — FE agent가 구현 시 선택.

기호 삽입 위치: 배너 텍스트 좌측, `gap: 8px`으로 텍스트와 분리.

### 2.4 경고 배너 (비가역 경고 — 기존 convertWarningBanner)

| 속성 | 토큰 | 실제 값 |
|---|---|---|
| 배경 | `colors.warning[50]` | `#FEF6E7` |
| 테두리 | `colors.warning[700]` | `#B47A1F` |
| 텍스트 | `colors.warning[800]` | `#8C5C13` |

현행 `convertWarningBanner` CSS 변수(`--state-warning-bg: #fef3c7`, `--state-warning: #92400e`)는 위 토큰과 유사하므로 변경 없음.

---

## 3. 문구 가이드 (한국어, 업무용어)

### 3.1 원칙

- UUID 비공개: 품목 식별자는 `productName`(품목명) + `modelCode`(모델명)만 노출. `productId`(UUID), `lineId`(UUID) 화면 노출 금지.
- 가용수량: BE `GET /inventory/balances` 응답의 `availableQty` 값. 단위 "개"로 표기.
- 전환 요청수량: 모달 입력 `convertQtyMap` 값.
- 품목 복수: 2개 이상이면 대표 1건 + "외 N건" 축약.

### 3.2 단일 품목 재고 부족

```
재고 부족으로 전환할 수 없습니다.
[품목명] ([모델명]) — 요청 N개 / 가용 M개
수량을 줄이거나 담당자에게 재고 보충을 요청해 주세요.
```

예시 A — 가용수량 0개:
> 재고 부족으로 전환할 수 없습니다.  
> **삼성 에어컨 실내기 (AR09TXHZAWK)** — 요청 3개 / 가용 0개  
> 수량을 줄이거나 담당자에게 재고 보충을 요청해 주세요.

예시 B — 가용수량 일부 있음:
> 재고 부족으로 전환할 수 없습니다.  
> **LG 냉난방 실외기 (MU3R19** ) — 요청 5개 / 가용 2개  
> 전환수량을 2개 이하로 조정하거나 나누어 전환해 주세요.

### 3.3 복수 품목 재고 부족

```
재고 부족 품목이 있어 전환할 수 없습니다.
[품목명1] ([모델명1]) — 요청 N개 / 가용 M개
외 N건 재고 부족 — 품목별 수량을 조정해 주세요.
```

예시 C — 2건 이상:
> 재고 부족 품목이 있어 전환할 수 없습니다.  
> **삼성 에어컨 실내기 (AR09TXHZAWK)** — 요청 3개 / 가용 0개  
> 외 1건 재고 부족 — 품목별 수량을 조정해 주세요.

### 3.4 문구 선택 기준

| 상황 | 사용 문구 |
|---|---|
| BE `409` + `message` 필드 있음 | BE 메시지를 그대로 노출 (현행 `error.response.data?.message ?? fallback` 패턴 유지) |
| BE `409` + `message` 없음 (fallback) | 예시 A/B/C 형식으로 FE가 조합 |
| 가용수량 정보 없음(BE가 미전달) | "재고 부족으로 전환할 수 없습니다. 수량을 줄이거나 담당자에게 확인해 주세요." |

BE가 409 응답 body에 `insufficientLines: [{productName, modelCode, requestedQty, availableQty}]` 배열을 포함할 경우 FE는 위 형식으로 자동 조합. 설계 §6 QA 항목 "재고 부족 → 409 + slip 미발행"과 연계.

---

## 4. 정상 전환 성공 피드백과의 시각적 구분

### 4.1 성공 피드백 (현행 successBanner)

| 속성 | 토큰 | 실제 값 |
|---|---|---|
| 배경 | `colors.success[50]` = `#ecfdf5` | `#ecfdf5` |
| 테두리 | `colors.success[500]` = `#10b981` | `#10b981` |
| 텍스트 | `colors.success[700]` = `#047857` | `#047857` |

표시 위치: 모달 닫힘 후 **페이지 상단** `convertSuccessMessage` 슬롯 (`data-testid="partner-order-convert-toast"`). 4초 후 자동 소거 (현행 유지).

### 4.2 에러 vs 성공 대비표

| 구분 | 에러 (재고 부족 409) | 성공 (전환 완료) |
|---|---|---|
| 위치 | 전환 모달 내 최상단 | 페이지 상단 (모달 닫힘 후) |
| 배경색 | `#FFF1F1` (연한 빨강) | `#ecfdf5` (연한 초록) |
| 테두리 | `#D6504A` (danger red) | `#10b981` (success green) |
| 텍스트 색 | `#991B1B` (dark red) | `#047857` (dark green) |
| 선행 기호 | `⊘` 또는 X 아이콘 (빨강) | `✓` (초록) |
| 지속시간 | 수동 소거 또는 재시도 시 교체 | 4초 자동 소거 |
| CTA | 수량 조정 안내 텍스트 (버튼 없음) | 없음 (자동 소거) |
| 모달 상태 | 모달 열린 채로 유지 | 모달 닫힘 |

색조 차이(빨강 vs 초록)와 위치 차이(모달 내 vs 페이지 상단)가 이중으로 구분 신호를 제공한다.

---

## 5. 기존 에러/경고 패턴과의 일관성

### 5.1 현행 패턴 인벤토리

| 패턴 | CSS 클래스 | 위치 | 사용 사례 |
|---|---|---|---|
| `errorBanner` | `styles['errorBanner']` | 페이지 상단 또는 모달 내 | 인쇄 오류, 보류 409, 삭제 422, 전환 에러(현행) |
| `successBanner` | `styles['successBanner']` | 페이지 상단 | 전환 성공, 수정 reload 성공 |
| `convertWarningBanner` | `styles['convertWarningBanner']` | 전환 모달 내 | 비가역 경고 (항상 표시) |

### 5.2 주문 보류 409와의 일관성

`holdMutation.onError` 409: "진행중(DRAFT) 상태인 주문서만 보류할 수 있습니다." → `holdErrorMessage` → 페이지 상단 `errorBanner`.  
재고 부족 409: 전환 모달 내 `errorBanner`.

**두 경우 모두 동일 `errorBanner` CSS 클래스**를 사용한다. 위치만 다름(페이지 vs 모달 내). 이 차이는 맥락 차이(모달 유무)를 반영한 의도적 구분이며 패턴 위반이 아니다.

### 5.3 비가역 경고 모달(convertWarningBanner)과의 배치 관계

전환 모달 내 DOM 순서 (위→아래):

```
[errorBanner]           ← 재고 부족 에러 (조건부, danger 빨강)
[convertWarningBanner]  ← 비가역 경고 (항상, warning 주황)
[라인 테이블]            ← 전환수량 입력
```

에러가 경고 위에 위치해 시선이 에러에 먼저 고정된다. 사용자는 수량을 수정하면서 아래 경고("이 작업은 되돌릴 수 없습니다")를 다시 확인하는 흐름이 된다. 이 순서는 현행 코드의 DOM 구조(`convertErrorMessage` → `convertWarningBanner` 순)와 일치하므로 구현 변경 불필요.

### 5.4 전환 비가역 경고와 에러의 색 충돌 방지

| 배너 | 배경 | 테두리 |
|---|---|---|
| 에러 (danger) | `#FFF1F1` | `#D6504A` (빨강) |
| 경고 (warning) | `#FEF6E7` | `#B47A1F` (황금 갈색) |

두 배너가 동시에 보일 때 색조(빨강 vs 주황) + 명도 차이로 명확하게 구분된다. WCAG AA 대비비 기준: 각 배너 내 텍스트 색 vs 배경색 비율은 설계 시스템 토큰 기준 7:1 이상.

---

## 6. FE agent 구현 지침 요약

1. 기존 `convertErrorMessage` 상태 슬롯과 `onError` 409 핸들러를 그대로 사용한다. 신규 상태 불필요.
2. BE 409 응답 body에 `insufficientLines` 배열이 포함되면 §3.2/3.3 형식으로 문구를 FE에서 조합해 `setConvertErrorMessage`에 할당한다.
3. BE가 `message` 문자열만 전달하는 경우 현행 `error.response.data?.message ?? fallback` 패턴 유지.
4. 모달 닫힘 시(`onClose`) `setConvertErrorMessage(null)` 호출 — 현행 동작 확인 완료.
5. 선행 아이콘은 SVG inline 또는 `⊘` 유니코드, 색 `colors.danger[500]` (`#D6504A`).
6. `data-testid="partner-order-convert-modal-error"` 유지 — Playwright QA 시나리오 §6 대응.

---

## 7. Playwright QA 시나리오 연계

설계 §6 "Playwright: 재고 부족 전환 시도 → 409 에러 메시지 표시" 대응 선택자:

```
data-testid="partner-order-convert-modal-error"
```

QA 확인 포인트:
- 전환 모달 열림 상태에서 배너 가시(`toBeVisible`)
- 배너 텍스트에 품목명 포함 (`toContainText`)
- 모달 닫힘 후 배너 미노출 (`not.toBeVisible` 또는 DOM 제거)
- 성공 배너(`partner-order-convert-toast`)와 동시 표시되지 않음

---

*이 가이드는 Cycle 1 draft 입니다. QA 실화면 캡처 후 Cycle 2에서 보완합니다.*
