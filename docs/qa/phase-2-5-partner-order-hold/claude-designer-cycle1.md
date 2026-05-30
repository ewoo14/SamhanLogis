# Designer Review — Phase 2.5 주문 보류+필터
## Cycle 1 / 2026-05-30

리뷰 대상 파일:
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`
- `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`
- `clients/desktop/src/renderer/api/sales.ts`

---

## 점검 결과

### 1. 라벨 업무용어 [P1/P2/Minor]

**DRAFT = '진행중'** [Minor]
- 업무 맥락상 DRAFT 는 "거래처가 주문을 제출한 상태 + 아직 내부 확정 전" 이다. "진행중"은 업무 흐름상 중간 처리 단계를 연상시켜 의미가 약간 불명확하다. 다만 이카운트 ERP 표준(진행중 vs 완료)에 부합하는 선택이며, 내부 팀이 이 관례를 이미 채택한 것이므로 Minor 수준으로 처리한다. 이 결정을 decisions log 에 명시 권장.

**CONFIRMING = '확정 처리중'** [P2]
- 이 값은 사용자(내부 영업·관리자)에게 목록 뱃지로 노출된다. "확정 처리중"은 시스템 내부 상태명을 그대로 번역한 느낌이고, 거래처 담당자는 이 상태가 무엇을 의미하는지 직관적으로 알기 어렵다.
- 이카운트 참조 화면 기준 중간 진행 상태 라벨은 보통 "처리중" 단독을 쓰거나, 업무 흐름을 담아 "확인중"으로 표기한다.
- 권장: "확인중" 으로 변경하거나, "확정 처리중" 유지 시 tooltip 또는 하단 범례 제공 검토.

**라벨 순서 일관성** [Minor]
- `PARTNER_ORDER_STATUS_LABEL` 객체 선언 순서: DRAFT → ON_HOLD → CONFIRMING → CONFIRMED → CANCELED.
- 필터 드롭다운은 `Object.keys(PARTNER_ORDER_STATUS_LABEL)` 를 그대로 순회하므로 선언 순서가 곧 옵션 순서. 현재 순서는 업무 흐름 순(진행 → 보류 → 확인중 → 완료 → 취소)으로 자연스러움. 유지 가능.

---

### 2. status 뱃지 색상 [P1]

**CONFIRMED = '완료' — `statusConfirmed`** [P1]
- CSS: `background: var(--state-info-bg, #dbeafe); color: var(--state-info, #1e40af)` — 파란 계열(info).
- "완료"는 최종 긍정 상태이므로 design-system 원칙상 **success(초록)** 를 사용해야 한다. info(파란색)는 정보성·중립 상태에 쓰는 색이다.
- `statusSent`(CONFIRMING) 가 이미 `--state-success-bg / --state-success` (초록 계열)를 사용하고 있어 **CONFIRMED 완료(초록 계열)와 CONFIRMING 확인중(초록 계열)이 같은 색으로 표현**된다. 두 상태가 시각적으로 구분되지 않는다.
- 수정 방안:
  - `CONFIRMED` = success(초록) 계열.
  - `CONFIRMING` = info(파란) 계열 또는 warning(주황) 경계 상태 표현.
  - 두 상태가 동시에 목록에 나타날 경우 색 충돌 없이 구분 가능해야 한다.

**ON_HOLD = '보류' — `statusOnHold`** [P2]
- CSS: `background: #ffedd5; color: #9a3412` — 주황-갈색 계열. 이는 design-system `--color-warning-*` 팔레트와 시각적으로 일치하는 선택이다.
- 다만 하드코딩 hex(`#ffedd5`, `#9a3412`) 를 사용하고 있고, 토큰 참조가 없다. `--color-warning-50` / `--color-insung-text` 등 기존 토큰으로 대체 가능. 수정 권장(아래 5번에서 상세 기술).

**CANCELED = '취소' — `statusCanceled`** [OK]
- `--state-danger-bg / --state-danger` 토큰 사용. 의미색 적절.

**DRAFT = '진행중' — `statusDraft`** [OK]
- `--state-neutral-bg / --state-neutral` 토큰 사용. 중립 회색 적절.

---

### 3. 보류/해제 버튼 [P2]

**`보류` 버튼 — `variant="secondary"`** [P2]
- 현재 secondary(중립 테두리) variant 사용. 보류는 주문의 진행을 의도적으로 멈추는 주의 행위이므로, design-system 에 `variant="warning"` 이 존재(Button.tsx 확인 완료: `'primary' | 'secondary' | 'ghost' | 'danger' | 'warning'`)함에도 불구하고 중립 secondary 를 사용한 것은 의미 표현 미흡이다.
- 권장: `variant="warning"` 으로 변경하여 "이 버튼을 누르면 주의가 필요한 상태 전환이 발생한다"는 시각 신호 제공.

**`보류 해제` 버튼 — `variant="secondary"`** [P2]
- 보류 해제는 정상 흐름으로 복귀하는 행위이므로 secondary 유지가 적절. 단, "보류" 버튼이 warning 으로 바뀔 경우 두 버튼의 시각 무게 차이가 의미를 명확히 전달하게 된다.

**버튼 배치 순서** [Minor]
- 현재 순서: 인쇄 → 보류(or 보류해제) → 수정 → 삭제 → ← 목록.
- 수정(primary, 파란)이 보류(secondary) 보다 시각 무게가 강해 자연스럽게 주 CTA 로 안내되나, 보류 버튼이 warning 색으로 바뀌면 수정보다 눈에 띄게 된다.
- 배치 재검토 권장: 인쇄 → 수정(primary) → 보류/해제(warning) → 삭제(danger) → ← 목록.
  - 이유: 주요 작업(수정) → 보조 주의 작업(보류) → 파괴적 작업(삭제) 순의 자연스러운 위험도 스케일.

---

### 4. 필터 드롭다운 [Minor]

**기본값 'DRAFT'(진행중)** [Minor]
- `useState<PartnerOrderStatus | ''>('DRAFT')` — 초기 로드 시 "진행중" 만 표시.
- 내부 영업 담당자가 매일 처리할 주문을 보는 화면에서 "진행중" 이 기본 필터가 되는 것은 업무 흐름상 합리적이다. 다만 사용자가 처음 화면에 진입했을 때 드롭다운이 "전체 상태" 가 아닌 "진행중"으로 표시되어 있어, 다른 상태 주문이 누락됐다고 오해할 여지가 있다.
- 개선 권장: 드롭다운 선택 옵션에 "(기본: 진행중)" 같은 힌트를 추가하거나, 필터 초기화 버튼 제공 검토.

**옵션 순서/라벨** [OK]
- `Object.keys(PARTNER_ORDER_STATUS_LABEL)` 순회로 선언 순서(DRAFT→ON_HOLD→CONFIRMING→CONFIRMED→CANCELED) 그대로 반영. 업무 흐름 순으로 적절.

---

### 5. 하드코딩 색상/spacing — 토큰 사용 여부 [P2]

**ListPage — audience-banner 인라인 스타일** [P2]
```
style={{
  background: '#EFF6FF',
  border: '1px solid #BFDBFE',
  color: '#1E3A8A',
  borderRadius: 6,
  padding: '8px 12px',
  marginBottom: 12,
  fontSize: 12,
  lineHeight: 1.5,
}}
```
- 7개 CSS 속성 전체 하드코딩. design-system 토큰(`--state-info-bg`, `--state-info-border`, `--state-info`, `--radius-md`, `--space-2`/`--space-3`, `--font-size-xs`) 로 대체 가능한 값이 전부 hard-coded.
- 특히 `#EFF6FF / #BFDBFE / #1E3A8A` 는 Tailwind blue-50/blue-200/blue-900 값으로, design-system `--state-info-bg / --state-info-border / --state-info` 와 근사하지만 동일하지 않아 테마 전환 시 깨질 수 있다.
- P2 수정 권장: CSS Module 또는 인라인에 토큰 변수 참조로 교체.

**sales.module.css — statusOnHold 하드코딩** [P2]
```css
.statusOnHold {
  background: #ffedd5;
  color: #9a3412;
}
```
- `#ffedd5` = Tailwind orange-100 ≈ `--color-warning-50`(`#FEF6E7`) 와 유사하나 동일하지 않다.
- `#9a3412` = Tailwind orange-800 ≈ `--color-insung-700`(`#92400E`) 와 근사.
- 수정 권장: `background: var(--state-warning-bg, #FEF3C7); color: var(--color-warning-800, #8C5C13)` 또는 `--color-warning-50 / --color-warning-800` 토큰 사용.

**statusSent / statusConverted — 부분 하드코딩** [Minor]
- `statusConverted`: `background: #ede9fe; color: #5b21b6` 전부 하드코딩. design-system 에 purple 토큰이 없어 fallback hex 유지는 이해되나, CSS 주석으로 "DS 토큰 없음 → hex fallback" 명시 권장.
- `statusLongPending`: `background: #fef3c7; color: #92400e` 하드코딩. `--state-warning-bg / --color-warning-800` 토큰으로 대체 가능.

**spacing/radius 하드코딩** [Minor]
- `borderRadius: 6` (audience-banner 인라인) — `--radius-lg(8px)` 또는 `--radius-md(4px)` 와 맞지 않는 임의값. `var(--radius-md)` 로 통일 권장.

---

### 6. 빈 상태 UX [Minor]

**보류 0건 빈 상태** [Minor]
- statusFilter = 'ON_HOLD' 로 필터하여 결과 0건일 경우 현재 메시지:
  `"등록된 주문이 없습니다" / "거래처가 주문서를 발송하면 본 목록에 표시됩니다."`
- 이 메시지는 필터 적용과 무관하게 항상 동일한 텍스트를 보여주므로, 보류 필터가 걸린 상태에서 0건일 때는 "현재 보류된 주문이 없습니다" 처럼 맥락 반영 메시지가 더 적합하다. 단, 이는 FE 구현 영역에 가깝고 디자인 결함 수준은 Minor.

**에러 상태 emptyState** [OK]
- 조회 실패 시: `"주문 목록을 불러오지 못했습니다"` + 안내 문구. 적절.

---

## 결함 요약

| 번호 | 심각도 | 항목 | 내용 |
|------|--------|------|------|
| D-01 | P1 | 뱃지 색상 의미 오류 | CONFIRMED(완료)가 info(파란)로 표시 — success(초록)이어야 함. CONFIRMING(확인중)과 CONFIRMED(완료)가 같은 초록 계열로 충돌 |
| D-02 | P2 | 보류 버튼 variant 오류 | `variant="secondary"` → `variant="warning"` 으로 변경 필요 |
| D-03 | P2 | CONFIRMING 라벨 직관성 | "확정 처리중" → "확인중" 으로 변경 또는 tooltip 보완 |
| D-04 | P2 | audience-banner 전면 하드코딩 | 7개 인라인 스타일 값 모두 토큰 미참조 |
| D-05 | P2 | statusOnHold 하드코딩 | `#ffedd5 / #9a3412` → 토큰 참조로 교체 |
| D-06 | Minor | 보류 버튼 배치 순서 | warning 변경 후 버튼 순서 재조정 권장(수정 → 보류 → 삭제) |
| D-07 | Minor | 필터 기본값 사용자 안내 | 'DRAFT' 기본 선택 시 범례 또는 초기화 버튼 제공 |
| D-08 | Minor | 빈 상태 메시지 맥락 미반영 | 필터 ON_HOLD 0건 시 맥락 메시지 부재 |
| D-09 | Minor | statusConverted / statusLongPending hex fallback 주석 없음 | DS 토큰 부재 사유 주석 권장 |
| D-10 | Minor | borderRadius: 6 임의값 | `var(--radius-md)` 또는 `var(--radius-lg)` 통일 필요 |

---

## 결론

P1 결함 1건, P2 결함 4건이 존재하여 **Designer BLOCK** (APPROVE 불가).

- **P1 D-01** (완료 뱃지 색상 오류 + 확인중/완료 색 충돌)은 사용자가 주문 상태를 잘못 읽을 수 있어 즉시 수정 필요.
- **P2 D-02** (보류 버튼 variant)는 design-system 에 `warning` variant 가 이미 존재함에도 사용하지 않아 의미 표현이 누락된 케이스.
- **P2 D-03 ~ D-05** 는 UX 명확성 및 토큰 일관성 결함.

Minor 10건은 다음 cycle 또는 별도 cleanup PR 에서 처리 가능.

**Cycle 2 재리뷰 조건**: D-01 ~ D-05 수정 후 재제출.
