# P1-5 arologis 배차 UI 디자인 가이드

## D-AX-11 Extraction Note (2026-05-15)

This file originally described the older `/arologis/*` IA. For
`clients/arologis-desktop`, D-AX-11 now implements the extracted dispatch IA
under `/dispatches/*`:

| Page | Current route | Current file |
|---|---|---|
| Manual | `/dispatches/manual` | `ManualDispatchPage.tsx` |
| Pre-classify | `/dispatches/pre-classify` | `PreClassifyPage.tsx` |
| Unassigned | `/dispatches/unassigned` | `UnassignedPage.tsx` |
| Reconcile | `/dispatches/reconcile` | `DispatchReconcilePage.tsx` |

Runtime desktop roles are `AROLOGIS_MASTER` and `AROLOGIS_MANAGER`. The legacy
`MASTER` / `MANAGER` / `DISPATCH` values below remain historical notes for the
Samhan Public source pages and must not be used in Arologis desktop guards.

> branch: `feature/p1-5-arologis-dispatch-ui`
> 작성일: 2026-05-11
> 담당: Designer (SamhanLogis 디자인 시스템 기준)
> 관련 PR: #134 ~ #144 회고 반영

---

## 0. 원칙

| 항목 | 규칙 |
|---|---|
| raw hex | **전면 금지** — 모든 색상은 `var(--color-*)` / `var(--state-*)` / `var(--surface-*)` / `var(--ink-*)` CSS 변수 토큰만 사용 |
| UUID 비공개 | 화면 어디에도 UUID / dispatchId 노출 금지. 사용자 노출 식별자 = 슬립번호 / 거래처명 / 거래처코드 / 차량번호 / 기사 코드 / 주소만 허용 (`feedback_uuid_no_user_visibility.md`) |
| Role 풀네임 | `MASTER` / `MANAGER` / `DISPATCH` — M/M/D 약어 금지 (`feedback_role_naming_full.md`) |
| data-testid | **0건** — `data-testid` 속성 없는 요소는 존재 불가. 모든 인터랙티브 요소 / 주요 표시 영역에 필수 부여 |
| Pretendard | `body { font-family: var(--font-family-sans) }` 선언으로 Pretendard 9 weight 자동 상속 |
| 한국어 타이포 | 본문 `var(--font-size-base)` (14px) Regular / 헤더 `var(--font-size-xl)` (18px) SemiBold / 서브헤더 `var(--font-size-lg)` (16px) Medium |
| 이카운트 참조 | `docs/migration/ecount-reference/` 16 캡처 — 거래처/배차 입력 화면 필드 구성 준용 |
| 인쇄 반복 가드 | 본 화면은 인쇄 산출물 없음. 단 iteration 가드 — FE mock → Edge 캡처 → 3~5회 조정 후 개발책임자 승인 (`feedback_print_design_iteration.md`) |

---

## 1. 3 페이지 구성 개요

| 페이지 | 경로 | 파일 | 설명 |
|---|---|---|---|
| **Auto** (자동 배차) | `/arologis/auto` | `ArologisAutoDispatchPage.tsx` | 자동 매칭 실행 + 결과 시각화 |
| **Manual** (수동 배차) | `/arologis/manual` | `ArologisManualDispatchPage.tsx` | 기존 구현 — 본 spec 으로 확장 |
| **DriverAssignment** (기사 배정) | `/arologis/driver-assignment` | `ArologisDriverAssignmentPage.tsx` | 가용 기사 목록 + 배정 UI |

---

## 2. 공통 컬러 토큰 — 배차 status badge

배차 상태는 `Badge` 컴포넌트를 사용하고, 내부 색상은 design-system 토큰만 인용한다.

### 2.1 배차 Status Badge 정의

| 상태 코드 | 한국어 라벨 | Badge variant | 배경 토큰 | 텍스트 토큰 |
|---|---|---|---|---|
| `PENDING` | 대기중 | `neutral` | `var(--color-neutral-100)` | `var(--color-neutral-700)` |
| `AUTO_MATCHED` | 자동 매칭됨 | `info` | `var(--state-info-bg)` | `var(--state-info)` |
| `MANUALLY_ASSIGNED` | 수동 배정됨 | `success` | `var(--state-success-bg)` | `var(--state-success)` |
| `DRIVER_ASSIGNED` | 기사 배정됨 | `success` | `var(--state-success-bg)` | `var(--state-success)` |
| `IN_TRANSIT` | 운송중 | `warning` | `var(--state-warning-bg)` | `var(--state-warning)` |
| `DELIVERED` | 배달완료 | `success` | `var(--state-success-bg)` | `var(--state-success)` |
| `CANCELLED` | 취소됨 | `danger` | `var(--state-danger-bg)` | `var(--state-danger)` |
| `FAILED` | 매칭실패 | `danger` | `var(--state-danger-bg)` | `var(--state-danger)` |

Badge 컴포넌트 사용 예:
```tsx
<Badge variant="success">기사 배정됨</Badge>
<Badge variant="warning">운송중</Badge>
<Badge variant="danger">매칭실패</Badge>
```

> raw hex 직접 사용 절대 금지. inline style `color: #...` / `background: #...` 형태 PR 리젝트.

### 2.2 기사 가용 상태 토큰

| 상태 | 라벨 | 토큰 |
|---|---|---|
| `AVAILABLE` | 가용 | `var(--state-success)` |
| `ON_ROUTE` | 운행중 | `var(--state-warning)` |
| `OFF_DUTY` | 비가용 | `var(--color-neutral-400)` |
| `BREAK` | 휴식중 | `var(--state-info)` |

---

## 3. Page 1 — Auto (자동 배차)

### 3.1 전체 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  arologis 자동 배차                        실시간 자동 갱신 · 30초  [새로고침]    │
│  ────────────────────────────────────────────────────────────────────────────    │
│  배차 일자 [YYYY-MM-DD]   [자동 매칭 실행]                                       │
│  ────────────────────────────────────────────────────────────────────────────    │
│                                                                                  │
│  ┌── 매칭 요약 ─────────────────────────────────────────────────────────────┐   │
│  │  [chip: 자동 매칭됨  N]  [chip: 매칭실패  N]  [chip: 대기중  N]           │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  [필터: 전체 ▼]  [상태: 전체 ▼]                                                  │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │ 전표번호   │ 거래처명     │ 주소              │ 배차 기사  │ 상태          │   │
│  ├──────────────────────────────────────────────────────────────────────────┤   │
│  │ W26-1001  │ (주)현대공조 │ 서울 강남구 역삼동  │ 홍길동     │ ● 자동 매칭됨 │   │
│  │ W26-1002  │ 삼성냉동     │ 경기 성남시 분당구  │ —          │ ● 매칭실패   │   │
│  │ W26-1003  │ LG에어컨     │ 부산 해운대구 우동  │ 이순신     │ ● 자동 매칭됨 │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                              총 N건  [CSV 다운로드]               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 매칭 요약 Summary Chip

```
┌────────────────────────────────────────────────────────────┐
│  [자동 매칭됨  12]  [매칭실패  3]  [대기중  5]              │
│   (success tone)    (danger tone) (neutral tone)            │
└────────────────────────────────────────────────────────────┘
```

- Summary Chip 구조:
  - 배경: 상태별 `--state-{tone}-bg` 토큰
  - 텍스트: 상태별 `--state-{tone}` 토큰
  - radius: `var(--radius-full)` (9999px)
  - padding: `6px 12px`
  - font: `var(--font-size-sm)` (13px) / weight 600

### 3.3 자동 매칭 결과 표 spec

| 컬럼 | 너비 | 정렬 | 비고 |
|---|---|---|---|
| 전표번호 | 110px | left | 슬립번호 (사용자 노출 비즈니스 키) |
| 거래처명 | flex-1 | left | |
| 주소 | flex-2 | left | 줄임표 처리 (ellipsis 1줄) |
| 배차 기사 | 100px | center | 기사 코드 아님 — 기사 이름(코드) 형식. 미배정 = `—` |
| 상태 | 130px | center | Status Badge (§2.1) |

```
tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--font-size-sm)',
}

thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--color-neutral-700)',
  borderBottom: '2px solid var(--color-neutral-200)',
  background: 'var(--color-neutral-50)',
}

tdStyle = {
  padding: '10px 12px',
  color: 'var(--color-neutral-800)',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--color-neutral-100)',
}
```

### 3.4 매칭실패 행 강조 처리

`status === 'FAILED'` 행:
- 배경: `var(--state-danger-bg)`
- 좌측 border: `3px solid var(--state-danger)`

```tsx
// 행 조건부 스타일 예시
style={{
  background: row.status === 'FAILED' ? 'var(--state-danger-bg)' : undefined,
  borderLeft: row.status === 'FAILED' ? '3px solid var(--state-danger)' : undefined,
}}
```

### 3.5 data-testid 목록 (Auto 페이지)

| 요소 | data-testid |
|---|---|
| 배차 일자 input | `arologis-auto-date` |
| 자동 매칭 실행 버튼 | `arologis-auto-run-btn` |
| 상태 필터 select | `arologis-auto-status-filter` |
| 결과 표 wrapper | `arologis-auto-result-table` |
| 각 결과 행 (slipNo 기반) | `arologis-auto-row-{slipNo}` |
| Summary Chip — 자동 매칭됨 | `arologis-auto-chip-matched` |
| Summary Chip — 매칭실패 | `arologis-auto-chip-failed` |
| Summary Chip — 대기중 | `arologis-auto-chip-pending` |
| CSV 다운로드 버튼 | `arologis-auto-csv-btn` |
| 새로고침 버튼 | `arologis-auto-refresh-btn` |
| 실시간 갱신 안내 span | `arologis-auto-realtime-indicator` |

### 3.6 자동 매칭 실행 흐름

```
[자동 매칭 실행] 클릭
  → loading spinner (Button loading prop)
  → POST /admin/arologis/dispatches/auto-match?date={date}
  → 성공 시: 결과 표 갱신 + Summary Chip 갱신
  → 실패 시: error-banner role="alert" 노출

error-banner 스타일:
  padding: '8px 12px'
  border: '1px solid var(--state-danger)'
  background: 'var(--state-danger-bg)'
  color: 'var(--state-danger)'
  borderRadius: 'var(--radius-md)'
  fontSize: 'var(--font-size-sm)'
```

---

## 4. Page 2 — Manual (수동 배차)

기존 `ArologisManualDispatchPage.tsx` (commit 현재 구현) 를 기반으로 아래 사항을 추가 / 보강한다.

### 4.1 레이아웃 (기존 2-컬럼 유지)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  arologis 수동 배차       저장 후 변경 이력 자동 추적 (PR-H4c)     [취소]        │
│  ────────────────────────────────────────────────────────────────────────────    │
│  ┌────────────────────────────┐  ┌──────────────────────────────────────────┐   │
│  │  카톡 텍스트 (참고)          │  │  배차 입력                               │   │
│  │  ─────────────────────     │  │  ──────────────────────────────────────  │   │
│  │  [textarea — 카톡 형식]     │  │  도착일 [____]   유형 [▼]               │   │
│  │                             │  │  기사 코드 [____]  ⓘ 비워두면 자동 매칭  │   │
│  │  [미리보기 (BE 검증)]        │  │                                          │   │
│  │                             │  │  차량 목록                               │   │
│  │  ┌── 미리보기 결과 ──────┐  │  │  ┌── 차량 1 (1톤) ─────────────────┐   │   │
│  │  │  도착일: 2026-05-11   │  │  │  │  순번 [1] 톤수 [▼] 별명 [_____] │   │   │
│  │  │  차량 2대 / 정차 5건  │  │  │  │  ┌─ 정차 목록 ─────────────────┐│   │   │
│  │  │  기사: 홍길동         │  │  │  │  │ 1. 현대공조 · 서울 강남구... ││   │   │
│  │  └──────────────────────┘  │  │  │  └─────────────────────────────┘│   │   │
│  └────────────────────────────┘  │  │  [+ 정차 추가]   [차량 삭제]      │   │   │
│                                   │  └──────────────────────────────────┘   │   │
│                                   │  [+ 차량 추가]                           │   │
│                                   │                    [취소]  [저장]        │   │
│                                   └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 기사 코드 입력 필드 보강

기존 텍스트 input 에 아래 UX를 추가한다.

```
기사 코드 필드 (optionall):
  - placeholder: "비워두면 자동 매칭 (예: DRV-001)"
  - 우측: ⓘ 아이콘 tooltip — "기사 미지정 시 시스템이 가용 기사를 자동 배정합니다."
  - 입력값이 있으면: 우측에 [기사 조회] 링크 → /arologis/driver-assignment 로 이동
```

### 4.3 미리보기 결과 배차 Status Badge

미리보기 결과 영역에 `dispatchStatus` 표시를 추가한다.

```
미리보기 결과 카드:
  ┌─────────────────────────────────────────────┐
  │  도착일: 2026-05-11                         │
  │  유형: 야상 (DAY)                           │
  │  기사: 홍길동 (DRV-001)     ● 자동 매칭됨  │   ← Status Badge
  │  차량 2대 / 정차 5건                        │
  │                                             │
  │  1. 차량 1 (1톤)                            │
  │     1. (주)현대공조 · 서울 강남구 역삼동    │
  │     2. LG에어컨 · 서울 서초구 서초동        │
  └─────────────────────────────────────────────┘
```

### 4.4 수동 배차 data-testid (기존 유지 + 신규)

| 요소 | data-testid | 비고 |
|---|---|---|
| 카톡 textarea | `arologis-manual-kakao-input` | 기존 |
| 미리보기 버튼 | `arologis-manual-preview-button` | 기존 |
| 차량 순번 input | `arologis-manual-vehicle-input` | 기존 |
| 정차 추가 버튼 | `arologis-manual-stop-add` | 기존 |
| 품목(메모) 추가 | `arologis-manual-item-add` | 기존 — backlog placeholder |
| 저장 버튼 | `arologis-manual-submit-button` | 기존 |
| 기사 코드 input | `arologis-manual-driver-code` | 신규 |
| 기사 조회 링크 | `arologis-manual-driver-lookup` | 신규 |
| 실시간 갱신 안내 | `arologis-manual-realtime-notice` | 기존 |
| 미리보기 결과 영역 | `arologis-manual-preview-result` | 신규 |
| 미리보기 Status Badge | `arologis-manual-preview-status` | 신규 |

### 4.5 스타일 일관 (기존 inline → 토큰 참조)

기존 구현의 `'#6B7280'` / `'#fff'` 등 raw hex 는 토큰으로 교체해야 한다.

| 현재 (raw hex) | 교체 토큰 |
|---|---|
| `color: '#6B7280'` | `color: 'var(--color-neutral-500)'` |
| `color: '#fff'` | `color: 'var(--color-neutral-0)'` |
| `background: '#fff'` | `background: 'var(--surface-card)'` |
| `border: '1px solid var(--color-neutral-300)'` | `border: '1px solid var(--line-default)'` |
| `background: 'var(--color-neutral-50)'` | `background: 'var(--surface-subtle)'` |

---

## 5. Page 3 — DriverAssignment (기사 배정)

### 5.1 전체 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  arologis 기사 배정                       실시간 자동 갱신 · 30초               │
│  ────────────────────────────────────────────────────────────────────────────    │
│  배차 일자 [YYYY-MM-DD]   가용 상태 [전체 ▼]   [조회]                           │
│  ────────────────────────────────────────────────────────────────────────────    │
│                                                                                  │
│  ┌── 가용 기사 목록 ────────────────────────────────────────────────────────┐   │
│  │                                                                          │   │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │   │
│  │  │ 기사명    │ 차량번호   │ 차량 종류  │ 현재 위치      │ 가용시간 │ 상태 │  │   │
│  │  ├───────────────────────────────────────────────────────────────────┤  │   │
│  │  │ 홍길동   │ 12가 3456  │ 1톤 냉동차  │ 서울 강남구    │ 09~18시  │ ● 가용 │  │   │
│  │  │ 이순신   │ 34나 7890  │ 2.5톤 탑차  │ 경기 성남시    │ 10~19시  │ ● 운행중│  │   │
│  │  │ 강감찬   │ 56다 1234  │ 5톤 냉장차  │ 부산 해운대구  │ 08~17시  │ ● 가용 │  │   │
│  │  └───────────────────────────────────────────────────────────────────┘  │   │
│  │  총 N명                                                                  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌── 배정 대상 슬립 ────────────────────────────────────────────────────────┐   │
│  │  전표번호 [____]  또는 자동 배차 결과에서 선택된 슬립                     │   │
│  │                                                                          │   │
│  │  전표번호   │ 거래처명     │ 주소               │ 현재 상태              │   │
│  │  W26-1002  │ 삼성냉동     │ 경기 성남시 분당구   │ ● 매칭실패            │   │
│  │                                                                          │   │
│  │  배정 기사 선택 → 위 목록에서 행 클릭                                     │   │
│  │  선택된 기사: [홍길동 (12가 3456)]            [배정 실행]                 │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 가용 기사 목록 상세 spec

#### 5.2.1 컬럼 정의

| 컬럼 | 너비 | 정렬 | 필드 | 비고 |
|---|---|---|---|---|
| 기사명 | 90px | left | `driverName` | UUID 아님 — 이름만 노출 |
| 차량번호 | 110px | left | `vehicleNumber` | 예: `12가 3456` |
| 차량 종류 | 120px | left | `vehicleType` | 예: `1톤 냉동차` |
| 현재 위치 | flex-1 | left | `currentLocation` | 시/구 단위 표시. 상세 GPS 좌표 노출 금지 |
| 가용시간 | 110px | left | `availableFrom` ~ `availableTo` | `HH:mm ~ HH:mm` 형식 |
| 상태 | 90px | center | `availabilityStatus` | 상태 Badge (§2.2) |
| 배정 | 80px | center | — | [배정] 버튼 (AVAILABLE 상태만 활성) |

#### 5.2.2 행 선택 UX

- 행 클릭 시 선택 상태 토글.
- 선택 행 배경: `var(--surface-selected)` (`#EFF6FF`)
- 선택 행 hover: `var(--surface-selected-hover)` (`#E0EAFB`)
- 미선택 행 hover: `var(--surface-hover)` (`#F4F6F8`)

```tsx
// 행 선택 스타일 예시
style={{
  background: selectedDriverCode === row.driverCode
    ? 'var(--surface-selected)'
    : undefined,
  cursor: 'pointer',
  transition: 'background var(--duration-fast)',
}}
```

#### 5.2.3 기사 가용 상태 Badge 스타일

```
● 가용     : var(--state-success)  — 배경 var(--state-success-bg)
● 운행중   : var(--state-warning)  — 배경 var(--state-warning-bg)
● 비가용   : var(--color-neutral-400) — 배경 var(--color-neutral-100)
● 휴식중   : var(--state-info)     — 배경 var(--state-info-bg)

Badge dot (●) 는 10px × 10px circle, margin-right 6px, background = 텍스트 토큰 동일.
```

#### 5.2.4 위치 정보 보호 원칙

- `currentLocation` 필드는 시/구 단위까지만 노출 (예: `서울 강남구`).
- GPS 좌표 (위경도 숫자) / 정확 주소 (동/로/번지) 화면 노출 금지.
- BE 응답에 포함된 경우 FE 에서 파싱하여 `시도 + 구` 만 추출하여 표시.

### 5.3 배정 대상 슬립 섹션

```
배정 대상 슬립 필드:
  - 전표번호 input: placeholder "전표번호를 입력하거나 위 자동 배차 결과에서 선택"
  - 조회 버튼: [슬립 조회]
  - 조회 결과: 단일 행 표시 (slipNo / partnerName / address / currentStatus)
  - currentStatus = Status Badge (§2.1)

선택 기사 표시:
  ┌──────────────────────────────────────────────────────┐
  │  배정 기사: [홍길동 (12가 3456 · 1톤 냉동차)]  [변경] │
  │                                    [배정 실행]       │
  └──────────────────────────────────────────────────────┘
  - 배정 기사 미선택 시: "기사를 목록에서 선택하세요" (var(--color-neutral-500) 색)
  - [배정 실행] 버튼: 기사 선택 + 슬립 조회 완료 시만 활성 (disabled 가드 필수)
  - 배정 완료 시: success toast (초록 배너) + 목록 자동 갱신
```

### 5.4 기사 배정 data-testid 목록

| 요소 | data-testid |
|---|---|
| 배차 일자 input | `arologis-driver-date` |
| 가용 상태 필터 select | `arologis-driver-status-filter` |
| 조회 버튼 | `arologis-driver-search-btn` |
| 기사 목록 테이블 wrapper | `arologis-driver-list-table` |
| 기사 목록 각 행 | `arologis-driver-row-{driverCode}` |
| 기사 행 배정 버튼 | `arologis-driver-assign-btn-{driverCode}` |
| 슬립 전표번호 input | `arologis-driver-slip-input` |
| 슬립 조회 버튼 | `arologis-driver-slip-search-btn` |
| 슬립 조회 결과 영역 | `arologis-driver-slip-result` |
| 선택된 기사 표시 영역 | `arologis-driver-selected-display` |
| 배정 실행 버튼 | `arologis-driver-assign-submit-btn` |
| 실시간 갱신 안내 | `arologis-driver-realtime-indicator` |

---

## 6. 공통 레이아웃 토큰 — 3 페이지 공유

### 6.1 페이지 헤더 구조

```tsx
// 모든 arologis 페이지 헤더 통일 패턴
<div style={{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 'var(--space-4)',
}}>
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
    <h3 style={{
      margin: 0,
      fontSize: 'var(--font-size-xl)',       // 18px
      fontWeight: 'var(--font-weight-semibold)', // 600
      color: 'var(--color-neutral-900)',
    }}>
      arologis {페이지명}
    </h3>
    <span
      data-testid="arologis-{slug}-realtime-indicator"
      style={{
        fontSize: 'var(--font-size-xs)',     // 12px
        color: 'var(--color-neutral-500)',
      }}
    >
      실시간 자동 갱신 · 30초
    </span>
  </div>
  {/* 우측 액션 영역 */}
</div>
```

### 6.2 필터 바 공통 스타일

```tsx
const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  marginBottom: 'var(--space-4)',
}

const filterInputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 var(--space-3)',
  border: '1px solid var(--line-default)',
  borderRadius: 'var(--radius-input)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--ink-primary)',
  background: 'var(--surface-card)',
}
```

### 6.3 표 공통 스타일 (3 페이지 공유)

```tsx
const tableWrapperStyle: React.CSSProperties = {
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  background: 'var(--surface-card)',
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 'var(--font-size-xs)',   // 12px
  fontWeight: 'var(--font-weight-semibold)', // 600
  color: 'var(--color-neutral-700)',
  borderBottom: '2px solid var(--color-neutral-200)',
  background: 'var(--color-neutral-50)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
  color: 'var(--color-neutral-800)',
  borderBottom: '1px solid var(--color-neutral-100)',
}
```

### 6.4 에러 배너 공통 스타일

```tsx
// className="error-banner" 대신 토큰 명시 (3 페이지 일관)
const errorBannerStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  border: '1px solid var(--state-danger)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--state-danger-bg)',
  color: 'var(--state-danger)',
  fontSize: 'var(--font-size-sm)',
  marginTop: 'var(--space-4)',
}
```

---

## 7. BE API 연결 명세 (FE → BE 인터페이스)

> 아래는 디자인 spec 에서 정의하는 FE 기대 인터페이스다. BE 구현 시 DTO 명과 필드명 일치 필요.
> UUID 는 API 레벨에서도 응답에 포함하지 않는 것을 원칙으로 한다.

### 7.1 Auto 페이지 API

```typescript
// POST /admin/arologis/dispatches/auto-match?date={date}
interface AutoMatchRequest {
  date: string  // YYYY-MM-DD (query param)
}

interface AutoMatchResult {
  date: string
  totalSlips: number
  matchedCount: number
  failedCount: number
  pendingCount: number
  results: AutoMatchEntry[]
}

interface AutoMatchEntry {
  slipNo: string           // 전표번호 (사용자 노출 비즈니스 키)
  partnerName: string      // 거래처명
  address: string          // 배송 주소
  assignedDriverName: string | null   // 기사 이름 (미배정 = null)
  assignedDriverCode: string | null   // 기사 코드 (미배정 = null, 화면 노출 주의)
  status: DispatchStatus   // PENDING | AUTO_MATCHED | FAILED
}

type DispatchStatus =
  | 'PENDING'
  | 'AUTO_MATCHED'
  | 'MANUALLY_ASSIGNED'
  | 'DRIVER_ASSIGNED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'
```

### 7.2 DriverAssignment 페이지 API

```typescript
// GET /admin/arologis/drivers?date={date}&status={status}
interface DriverListRequest {
  date: string             // YYYY-MM-DD (query param)
  status?: DriverAvailabilityStatus  // 필터 (optional)
}

interface DriverListResponse {
  date: string
  totalCount: number
  drivers: DriverEntry[]
}

interface DriverEntry {
  driverCode: string           // 기사 코드 (비즈니스 키 — UUID 아님)
  driverName: string           // 기사 이름 (사용자 노출)
  vehicleNumber: string        // 차량번호 (예: 12가3456)
  vehicleType: string          // 차량 종류 (예: 1톤 냉동차)
  currentLocation: string      // 현재 위치 — 시/구 단위 (예: 서울 강남구)
  availableFrom: string        // 가용 시작 시각 (HH:mm)
  availableTo: string          // 가용 종료 시각 (HH:mm)
  availabilityStatus: DriverAvailabilityStatus
}

type DriverAvailabilityStatus = 'AVAILABLE' | 'ON_ROUTE' | 'OFF_DUTY' | 'BREAK'

// POST /admin/arologis/dispatches/assign-driver
interface AssignDriverRequest {
  slipNo: string         // 전표번호 (비즈니스 키)
  driverCode: string     // 기사 코드 (비즈니스 키)
  assignDate: string     // YYYY-MM-DD
}

interface AssignDriverResponse {
  slipNo: string
  driverCode: string
  driverName: string
  status: DispatchStatus
  assignedAt: string     // ISO 8601
}
```

---

## 8. 접근 권한 (ROLE 가드)

| 페이지 | 허용 Role |
|---|---|
| Auto (자동 배차) | `MASTER` / `MANAGER` / `DISPATCH` |
| Manual (수동 배차) | `MASTER` / `MANAGER` / `DISPATCH` |
| DriverAssignment (기사 배정) | `MASTER` / `MANAGER` / `DISPATCH` |

- 모든 Role 표기는 풀네임 필수 (`feedback_role_naming_full.md`).
- RoleGuard 미적용 시 `403 Forbidden` 리다이렉트 — `/` 로 이동.

---

## 9. Iteration 계획

| 회차 | 내용 | 담당 |
|---|---|---|
| 1차 | 본 spec 작성 (현재) | Designer |
| 2차 | FE mock 구현 (3 페이지 skeleton + Status Badge) | Frontend |
| 3차 | Edge 캡처 → 개발책임자 검토 → raw hex / testid 누락 수정 | Designer + QA |
| 4차 | BE API 연결 후 실데이터 렌더 검증 | Frontend + QA |
| 5차 | 개발책임자 최종 승인 + QA 캡처 docs/qa/p1-5-dispatch/ 저장 | QA + PM |

---

## 10. 참조 파일

| 파일 | 용도 |
|---|---|
| `clients/desktop/src/renderer/routes/ArologisManualDispatchPage.tsx` | Manual 페이지 기존 구현 — 토큰 교체 및 확장 베이스 |
| `clients/desktop/src/renderer/routes/ArologisUnassignedPage.tsx` | 미배차 리스트 — 표 스타일 참조 |
| `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx` | 탭 / 그룹 섹션 패턴 참조 |
| `clients/desktop/src/renderer/api/arologisDispatchApi.ts` | 기존 API 클라이언트 — 신규 endpoint 추가 베이스 |
| `clients/web/design-system/src/tokens/tokens.css` | CSS 변수 토큰 전체 목록 |
| `docs/migration/ecount-reference/` | 이카운트 ERP UX 캡처 16장 — 배차 화면 필드 참조 |

---

## 11. PR #134~#144 회고 반영 가드

| 회고 항목 | 본 spec 대응 |
|---|---|
| raw hex 직접 사용 (반복 리젝트) | §0 원칙 + §6 공통 토큰 에 토큰만 사용하도록 명시. `color: '#6B7280'` 형태 PR 리젝트 경고 |
| data-testid 누락 | §3.5 / §4.4 / §5.4 에서 모든 인터랙티브 요소 data-testid 전수 정의. "0건" 원칙 명시 |
| UUID 화면 노출 | `assignedDriverCode` 등 코드 필드는 사용자 향 표시 시 이름과 조합 (`이름 (코드)`) 또는 이름만 노출 |
| 단편 PR 금지 | 3 페이지를 단일 통합 PR 로 묶어 발행. QA 스크린샷 docs/qa/p1-5-dispatch/ 필수 |
| 인쇄 양식 단번 완성 금지 | 본 화면은 인쇄 없음. 단 iteration 5회 계획 (§9) 명시 |
