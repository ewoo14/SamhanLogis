# 모바일 리스트 카드 폴리시 — 설계 spec

작성일: 2026-06-26
작성자: Design agent (UI/UX)
대상: Codex 구현 + Frontend agent 검증

---

## 1. 문제 정의

### 현황 (실 캡처 기반)

`docs/qa/mobile-other/mobile-partner-list.png` 를 보면 768px 이하에서 DataTable 이
`<thead>` 를 숨기고 각 `<td>` 를 `display:block` 으로 전환한다. 현재 CSS 는 **모든 `<td>`
에 동일한 라벨-값(justify-content: space-between) 레이아웃**을 부여한다. 결과:

- 거래처 목록: 거래처코드 / 상호 / 사업자번호 / 전화 / 상태 / 신용한도 / 미수금 — 7행 나열
- 견적 목록: 견적번호 / 거래처코드 / 거래처 / 작성일 / 유효기간 / 합계 / 상태 — 7행 나열
- 전표 목록: 전표번호 / 구분 / 상태 / 거래처 / 배송태그 / (검수버튼) — 6행 나열

카드 1개 높이가 모바일 화면 1/3~절반을 점유하고, 사용자는 핵심 정보를 찾기 위해 시선을
상하로 길게 스캔해야 한다.

### 목표

1. primary 1개 — 카드 제목으로 prominent 표시
2. secondary 2~3개 — 작은 라벨-값 또는 배지. 가로 2열 그리드 가능
3. hidden — 기본 생략. 필요 시 접기/펼치기(optional, 1단계는 생략)
4. 기존 DataTable 사용처 56+ 개 **완전 하위호환** — `mobilePriority` 미지정 시 현행
   동작(전부 표시) 유지
5. 데스크톱(>768px) 무회귀 — API 변경이 `<td>` 의 data-attribute 이외 데스크톱 렌더에
   영향 없음

---

## 2. DataTable API 최소 변경안

### 2-A. `DataTableColumn<T>` 에 선택 필드 추가 (하위호환)

```ts
// DataTable.tsx — DataTableColumn 인터페이스만 변경
export interface DataTableColumn<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
  headerAlign?: 'left' | 'right' | 'center'

  /**
   * 모바일 카드(≤768px) 에서의 표시 역할.
   *
   * - 'primary'   : 카드 제목 영역. 굵고 크게. 컬럼 1개만 지정 권장.
   *                 미지정 시 첫 번째 컬럼을 자동 primary 로 취급.
   * - 'secondary' : 라벨-값 행. 최대 3개 권장. 2열 그리드 가능.
   * - 'hidden'    : 모바일 카드에서 완전 숨김.
   * - undefined   : 기존 동작(전부 표시, secondary 처럼 나열). 하위호환.
   */
  mobilePriority?: 'primary' | 'secondary' | 'hidden'
}
```

**하위호환 규칙 (구현 필수)**

| `mobilePriority` 지정 여부 | 모바일 동작 |
|---|---|
| 모든 컬럼 미지정 (기존 사용처) | 현행 전부 나열 (변경 없음) |
| 1개 이상 지정 | primary/secondary/hidden 분류 적용 |
| primary 미지정, secondary/hidden 만 지정 | 첫 컬럼 자동 primary 처리 |

결정 근거: "미지정=현행" 원칙으로 기존 61개 사용처가 자동으로 현행 동작을 유지한다.
신규 또는 수정 화면에서만 opt-in 하여 점진적으로 카드 폴리시를 적용한다.

### 2-B. data-attribute 추가 (CSS 전용 분기)

렌더러에서 각 `<td>` 에 `data-mobile-priority` 속성을 내려 CSS 가 선택자로 처리한다.
JS 분기 없이 CSS만으로 레이아웃을 바꾸므로 재렌더 비용 0, SSR 친화.

```tsx
// DataTable.tsx — td 에 속성 추가 (기존 data-label 과 병행)
<td
  key={String(col.key)}
  className={tdClasses}
  data-label={col.header}
  data-mobile-priority={col.mobilePriority ?? undefined}
>
  {col.render ? col.render(row) : defaultCell(row, col.key)}
</td>
```

데스크톱에서 `data-mobile-priority` 는 CSS `@media (max-width:768px)` 블록 외부에 어떤
스타일도 적용되지 않으므로 데스크톱 무회귀.

---

## 3. 카드 렌더 구조 (CSS 설계)

### 3-A. 카드 컨테이너 (`.tr` 모바일 — 현행 유지)

현행 `.tr` 모바일 스타일(border/border-radius/padding/box-shadow)은 그대로 유지한다.
하위 구조만 재배치한다.

### 3-B. 레이어 구조

```
.tr  (카드 컨테이너, padding 14px 16px, flex-direction: column, gap: 0)
  ├── [primary zone]  td[data-mobile-priority="primary"]
  │     제목 prominent + 선택적 배지를 우측에
  ├── [divider]  ::after 또는 hr.mobile-card-divider
  └── [secondary zone]  td[data-mobile-priority="secondary"] 들
        2열 grid (grid-template-columns: 1fr 1fr)
        각 셀: label(위) + value(아래) 세로 스택
```

`mobilePriority` 미지정 시(하위호환 경로)는 현행 `justify-content: space-between` 라벨-값
행 나열을 그대로 유지한다. 미지정 컬럼이 하나라도 있으면 primary/secondary 분리 레이아웃을
적용하지 않는다.

### 3-C. 신규 CSS 블록 (`DataTable.module.css` `@media (max-width:768px)` 추가)

```css
/* ── 모바일 카드 폴리시 적용 경로 ──────────────────────────────────────
   조건: tr 하위에 [data-mobile-priority] 를 가진 td 가 1개 이상 존재.
   CSS :has() 선택자 사용 (Chrome 105+, Safari 15.4+, Firefox 121+).
   미지원 브라우저는 현행 나열 그대로 fallback.
   ────────────────────────────────────────────────────────────────────── */

@media (max-width: 768px) {

  /* ── 1. primary td ── */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="primary"] {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: 0 0 10px 0;
    border-bottom: 1px solid var(--color-neutral-100, #F3F4F6);
    margin-bottom: 10px;
  }

  /* primary 라벨 숨김 (data-label::before 억제) */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="primary"]::before {
    content: none;
  }

  /* primary 값 스타일 */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="primary"] > * {
    color: var(--color-neutral-800, #1F2937);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  }

  /* primary 직접 텍스트 노드 (render 없이 문자열만) */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="primary"] {
    color: var(--color-neutral-800, #1F2937);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    text-align: left;
  }

  /* ── 2. secondary zone 래퍼 ── */
  /*
    secondary td 들을 2열 그리드로 묶으려면 공통 부모가 필요하다.
    순수 CSS 로는 형제 td 를 grid 컨테이너로 묶기 어렵다.
    해법: .tr 를 subgrid 로 전환하는 대신,
    secondary td 를 grid-item 으로 처리하기 위해 .tr 에
    "display: grid" 모드를 조건부 적용한다.
    단, primary/hidden 은 grid-column: 1 / -1(full-width) 로 처리.
  */

  .tr:has(td[data-mobile-priority]) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    padding: 14px 16px;
  }

  /* primary → full width */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="primary"] {
    grid-column: 1 / -1;
  }

  /* hidden → DOM 에 존재하나 화면에서 제거 */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="hidden"] {
    display: none;
  }

  /* secondary → 세로 스택(라벨 위 / 값 아래) */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="secondary"] {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 4px;
    border: none;
    text-align: left;
    justify-content: flex-start;
    align-items: flex-start;
    overflow: hidden;
  }

  /* secondary 라벨 (::before) */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="secondary"]::before {
    content: attr(data-label);
    color: var(--color-neutral-400, #9CA3AF);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: none;  /* 한국어는 uppercase 효과 없음 */
    flex-shrink: 0;
    text-align: left;
  }

  /* secondary 값 */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="secondary"] > * {
    color: var(--color-neutral-700, #374151);
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  /* secondary 직접 텍스트 노드 */
  .tr:has(td[data-mobile-priority]) td[data-mobile-priority="secondary"] {
    color: var(--color-neutral-700, #374151);
    font-size: 13px;
    font-weight: 500;
  }

  /* ── 3. 미지정 컬럼(하위호환 경로) ── */
  /* :has() 분기 밖이므로 현행 규칙(.td::before 라벨-값 나열)이 그대로 적용됨. 추가 규칙 불요. */

  /* ── 4. 클릭 가능 행 hover/focus ── */
  .tr:has(td[data-mobile-priority]).clickable:active {
    background-color: var(--color-brand-50, #EFF6FF);
  }
}
```

### 3-D. `:has()` 브라우저 지원 & fallback

| 브라우저 | `:has()` 지원 | 동작 |
|---|---|---|
| Chrome 105+ | O | 카드 폴리시 적용 |
| Safari 15.4+ | O | 카드 폴리시 적용 |
| Firefox 121+ | O | 카드 폴리시 적용 |
| 구형 브라우저 | X | 현행 나열 fallback (열화 없음) |

Samhan Public 데스크톱 클라이언트(Electron)는 Chromium 기반이므로 지원 보장.
모바일 웹뷰(iOS Safari/Android Chrome)도 현재 버전에서 지원.
구형 미지원 시 현행 나열이 그대로 표시되므로 기능 손실 없음.

---

## 4. 화면별 적용 예시

### 4-A. 거래처 목록 (`PartnersPage.tsx`)

현재 컬럼 7개. 모바일에서 핵심: 상호(누구) + 상태(거래중인가) + 미수금(재무 리스크).

```ts
const columns: DataTableColumn<PartnerSummary>[] = [
  {
    key: 'partnerCode',
    header: '거래처 코드',
    width: '140px',
    mobilePriority: 'secondary',          // 코드: 보조 표시
  },
  {
    key: 'name',
    header: '상호',
    mobilePriority: 'primary',            // ★ 카드 제목
    render: (p) => (
      <span data-testid={`admin-partners-row-${p.partnerCode}`}>
        {p.name}
      </span>
    ),
  },
  {
    key: 'bizNo',
    header: '사업자번호',
    width: '140px',
    mobilePriority: 'hidden',             // 모바일 생략
  },
  {
    key: 'phone',
    header: '전화',
    width: '140px',
    mobilePriority: 'hidden',             // 모바일 생략
    render: (p) => p.phone ?? '—',
  },
  {
    key: 'status',
    header: '상태',
    width: '110px',
    mobilePriority: 'secondary',          // 보조: 배지
    render: (p) => (
      <Badge variant={STATUS_VARIANT[p.status]}>
        {PARTNER_STATUS_LABEL[p.status]}
      </Badge>
    ),
  },
  {
    key: 'creditLimit',
    header: '신용한도',
    width: '140px',
    align: 'right',
    mobilePriority: 'hidden',             // 모바일 생략 (상세에서 확인)
    render: (p) => formatKrw(p.creditLimit),
  },
  {
    key: 'outstandingBalance',
    header: '미수금',
    width: '140px',
    align: 'right',
    mobilePriority: 'secondary',          // 보조: 숫자 강조
    render: (p) => formatKrw(p.outstandingBalance),
  },
]
```

모바일 카드 결과:

```
┌─────────────────────────────────┐
│ 삼한물산㈜                        │  ← primary (15px SemiBold)
├─────────────────────────────────┤
│ 거래처 코드       상태            │  ← secondary 2열 그리드
│ SC-001           거래중          │
│ 미수금                           │
│ ₩1,234,000                      │
└─────────────────────────────────┘
```

(사업자번호·전화·신용한도 — 모바일 hidden. 상세 클릭으로 확인.)

### 4-B. 전표 목록 (`SlipListPage.tsx`)

핵심: 전표번호(언제/순번) + 거래처(누구) + 상태(결과). 구분·배송태그는 보조.

```ts
const columns: DataTableColumn<SlipSummary>[] = [
  {
    key: 'slipNo',
    header: '전표번호',
    width: '180px',
    mobilePriority: 'primary',            // ★ 카드 제목
    render: (row) => (
      <SlipNumberDisplay slipDate={row.slipDate} seqNo={row.seqNo} size="sm" />
    ),
  },
  {
    key: 'slipType',
    header: '구분',
    width: '90px',
    mobilePriority: 'hidden',             // 모드 고정이라 모바일 생략
    render: (row) => (
      <Badge variant={row.slipType === 'OUTBOUND' ? 'brand' : 'success'}>
        {row.slipType === 'OUTBOUND' ? '출고' : '입고'}
      </Badge>
    ),
  },
  {
    key: 'status',
    header: '상태',
    width: '120px',
    mobilePriority: 'secondary',
    render: (row) => <SlipStatusBadge status={row.status} />,
  },
  {
    key: 'partnerName',
    header: '거래처',
    mobilePriority: 'secondary',
  },
  {
    key: 'deliveryTag',
    header: '배송태그',
    width: '110px',
    mobilePriority: 'secondary',
    render: (row) => {
      if (!row.deliveryTag) return null
      return <Badge variant="neutral">{DELIVERY_TAG_LABEL_MAP[row.deliveryTag] ?? row.deliveryTag}</Badge>
    },
  },
  // INBOUND 검수 버튼: 모바일에서도 노출 (primary 하단에 full-width 로)
  ...(!isOutbound ? ([{
    key: 'id',
    header: '',
    width: '80px',
    mobilePriority: 'secondary',          // 버튼: 보조 셀에 배치
    render: (row) =>
      INSPECTABLE_STATUSES.includes(row.status) ? (
        <Button variant="secondary" size="sm"
          onClick={(e) => { e.stopPropagation(); setInspectionSlipId(row.id) }}>
          검수
        </Button>
      ) : null,
  }] as DataTableColumn<SlipSummary>[]) : []),
]
```

모바일 카드 결과:

```
┌─────────────────────────────────┐
│ 2026/06/26-001                   │  ← primary
├─────────────────────────────────┤
│ 상태             거래처           │  ← secondary 2열
│ [출고완료]       삼한물산㈜        │
│ 배송태그                          │
│ [당일]                           │
└─────────────────────────────────┘
```

### 4-C. 견적 목록 (`EstimateListPage.tsx`)

핵심: 견적번호(식별) + 거래처(누구) + 합계(금액) + 상태(진행).

```ts
const columns: DataTableColumn<EstimateSummary>[] = [
  {
    key: 'estimateNo',
    header: '견적번호',
    width: '180px',
    mobilePriority: 'primary',            // ★ 카드 제목
    render: (row) => (
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
        {row.estimateNo}
      </span>
    ),
  },
  {
    key: 'partnerBusinessNo',
    header: '거래처 코드',
    width: '140px',
    mobilePriority: 'hidden',
    render: (row) => (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {row.partnerBusinessNo ? row.partnerBusinessNo.replace(/\D/g, '') : '—'}
      </span>
    ),
  },
  {
    key: 'partnerName',
    header: '거래처',
    mobilePriority: 'secondary',
    render: (row) => row.partnerName,
  },
  {
    key: 'estimateDate',
    header: '작성일',
    width: '110px',
    mobilePriority: 'hidden',             // 견적번호에 날짜 내포. 모바일 생략.
  },
  {
    key: 'validUntil',
    header: '유효기간',
    width: '120px',
    mobilePriority: 'secondary',
    render: (row) =>
      row.validUntil ? (
        <span>{row.validUntil}</span>
      ) : (
        <span style={{ color: '#9CA3AF' }}>—</span>
      ),
  },
  {
    key: 'totalAmount',
    header: '합계',
    width: '160px',
    align: 'right',
    mobilePriority: 'secondary',
    render: (row) => (
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
        {fmtKrw(row.totalAmount)}
      </strong>
    ),
  },
  {
    key: 'status',
    header: '상태',
    width: '120px',
    mobilePriority: 'secondary',
    render: (row) => (
      <Badge variant={STATUS_VARIANT[row.status]}>
        {ESTIMATE_STATUS_LABEL[row.status]}
      </Badge>
    ),
  },
]
```

모바일 카드 결과:

```
┌─────────────────────────────────┐
│ EST-2026-001                    │  ← primary
├─────────────────────────────────┤
│ 거래처           유효기간          │  ← secondary 2열
│ 삼한물산㈜        2026-07-10      │
│ 합계             상태             │
│ ₩2,340,000      [수주완료]        │
└─────────────────────────────────┘
```

---

## 5. 타이포그래피 & 컬러 토큰 정리

### primary 영역

| 속성 | 값 |
|---|---|
| font-size | 15px (`--font-size-base` + 1step) |
| font-weight | 600 (SemiBold) |
| color | `--color-neutral-800` (#1F2937) |
| line-height | 1.4 |
| max-lines | 2 (`-webkit-line-clamp: 2` 필요 시 추가) |

참조: global.css `.mobile-item-name` 과 동일 톤.

### secondary 라벨 (::before)

| 속성 | 값 |
|---|---|
| font-size | 11px |
| font-weight | 600 |
| color | `--color-neutral-400` (#9CA3AF) |
| letter-spacing | 0.4px |

참조: global.css `.mobile-item-metric-label` 과 동일.

### secondary 값

| 속성 | 값 |
|---|---|
| font-size | 13px |
| font-weight | 500 |
| color | `--color-neutral-700` (#374151) |
| font-variant-numeric | tabular-nums |

참조: global.css `.mobile-item-metric-value` 와 동일.

### 카드 컨테이너 (.tr 모바일)

현행 유지:

| 속성 | 값 |
|---|---|
| border | 1px solid `--color-neutral-200` |
| border-radius | `--radius-md` (8px) |
| padding | 14px 16px (grid 전환 후 동일 유지) |
| box-shadow | `--shadow-sm` (0 1px 2px rgba(0,0,0,0.06)) |
| background | `--color-bg` (#fff) |

primary/secondary 구분선:

| 속성 | 값 |
|---|---|
| border-bottom on primary td | 1px solid `--color-neutral-100` (#F3F4F6) |
| margin-bottom on primary td | 10px |

---

## 6. 데스크톱 무회귀·기존 사용처 영향 분석

### 6-A. 데스크톱 무회귀

- `data-mobile-priority` 속성은 DOM 에 추가되나 데스크톱 CSS 어디에도 이 선택자를 사용하지
  않는다. 데스크톱 스타일(`@media (max-width:768px)` 밖)은 전혀 영향 없음.
- `DataTableColumn.mobilePriority` 는 선택 필드(optional)이므로 TypeScript 타입 오류 없음.
- 기존 61개 사용처 파일에서 컬럼 정의를 수정하지 않는 한 `mobilePriority` 는 `undefined`.

### 6-B. 기존 사용처 모바일 동작

- `mobilePriority` 전부 `undefined` → `data-mobile-priority` 속성 없음 → `:has(td[data-mobile-priority])` 선택자 미매칭 → 현행 나열 레이아웃 그대로.
- 즉 기존 61개 사용처는 본 변경 후에도 현행과 동일하게 동작한다. **모바일 회귀 없음**.

### 6-C. 점진적 opt-in 경로

| 단계 | 내용 |
|---|---|
| 1단계 (이번 구현) | DataTable API + CSS 신규 블록 추가. 기존 사용처 무변경. |
| 2단계 | 3대 리스트(거래처/전표/견적)에 `mobilePriority` 지정 적용. |
| 3단계 (후속) | 나머지 사용처 점진 적용. 우선순위는 모바일 실사용 빈도 기준. |

### 6-D. 테스트 포인트

1. **데스크톱(>768px)**: `PartnersPage` 기존 7열 테이블 완전 동일 → 회귀 없음
2. **모바일 미지정 경로**: `mobilePriority` 없는 임의 DataTable → 현행 나열 유지
3. **모바일 적용 경로**:
   - primary 1개 제목 영역 표시 (15px/600)
   - secondary 2열 그리드 라벨-값 스택
   - hidden 컬럼 DOM 에서 `display:none`
4. **:has() 미지원 폴백**: 구형 환경에서 현행 나열 동작 확인

---

## 7. 구현 체크리스트 (Codex 전달용)

### 파일 1: `clients/web/design-system/src/components/DataTable/DataTable.tsx`

- [ ] `DataTableColumn<T>` 에 `mobilePriority?: 'primary' | 'secondary' | 'hidden'` 추가
- [ ] `<td>` 에 `data-mobile-priority={col.mobilePriority ?? undefined}` 속성 추가
- [ ] 기존 `data-label` 속성 유지 (제거 금지)
- [ ] `DataTableProps` 변경 없음

### 파일 2: `clients/web/design-system/src/components/DataTable/DataTable.module.css`

- [ ] `@media (max-width: 768px)` 블록 내 신규 CSS 추가 (섹션 3-C 전체)
- [ ] 기존 `.td`, `.td::before`, `.tr` 모바일 규칙 유지 (삭제 금지)
- [ ] `:has()` 선택자로 분기하므로 기존 규칙은 `mobilePriority` 없는 경로에 계속 적용

### 파일 3: `clients/desktop/src/renderer/routes/admin/PartnersPage.tsx`

- [ ] 섹션 4-A 의 `mobilePriority` 지정 7컬럼으로 교체

### 파일 4: `clients/desktop/src/renderer/routes/SlipListPage.tsx`

- [ ] 섹션 4-B 의 `mobilePriority` 지정으로 교체

### 파일 5: `clients/desktop/src/renderer/routes/EstimateListPage.tsx`

- [ ] 섹션 4-C 의 `mobilePriority` 지정으로 교체

### 검증

- [ ] `npm run typecheck` (desktop) — TypeScript 오류 0
- [ ] design-system DataTable.stories.tsx 에 `mobilePriority` 스토리 1개 추가
- [ ] 브라우저 768px 이하 실 캡처 → `docs/qa/mobile-other/` 신규 PNG 첨부

---

## 8. 미결 결정 (개발책임자 확인 필요)

| ID | 질문 | 현재 기본값 |
|---|---|---|
| D-MLC-01 | hidden 컬럼 "더 보기" 접기/펼치기 토글 필요 여부 | 1단계 생략(상세 이동으로 대체) |
| D-MLC-02 | secondary 컬럼 2열 고정 vs 1열(소형 화면 <375px) | 2열 고정 (min-width 미설정) |
| D-MLC-03 | 검수 버튼 등 액션 컬럼을 카드 하단 full-width 버튼으로 별도 처리 여부 | secondary 2열 그리드 내 배치 |
| D-MLC-04 | mobilePriority 미지정 화면에 대한 자동 우선순위 추론(첫컬럼=primary 자동화) 전면 적용 여부 | 미지정=현행 나열 유지(opt-in만) |
