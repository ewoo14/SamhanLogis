# D1 — Samhan Public 배차 메뉴 desktop mock

> 화면: `clients/desktop/src/renderer/routes/dispatch-board/DispatchBoardPage.tsx`
> 라우트: `/dispatch-board` (배차담당자 / `ROLE_MASTER` / `ROLE_MANAGER`)
> 사용자: Samhan Public 배차담당자 (사무실 PC, 1440 x 900 기준)
> 데이터:
>   - 좌 panel: slip-service `GET /admin/slips?dispatchStatus=UNDISPATCHED&dateFrom=...&dateTo=...&page=...&size=50`
>   - 우 panel: slip-service `GET /admin/dispatch-tasks/{id}` (DRAFT 단일 작업 컨테이너)
>   - 배차 완료: slip-service `POST /admin/dispatch-tasks/{id}/dispatch`

---

## 1. 디자인 의도

- **좌(미배차) / 우(차량 그룹)** 2-pane 레이아웃 — drag source 좌 → drop target 우 흐름이 시각적으로 자연스러움.
- `@dnd-kit/core` PointerSensor 활성, 좌 row 의 좌측 grip handle (☰) hover 시 cursor: grab.
- 우 panel 은 vertical scroll 가능 (그룹 수 무제한), 좌 panel 은 50/회 페이지네이션 footer 고정.
- 배차 완료 버튼은 우 panel 하단 sticky, 그룹 1개 이상 + 그룹 안 slip 1개 이상일 때만 enable.
- arologis 발송 진행 중 (`DISPATCHING`) 시 전체 우 panel disabled + spinner overlay.
- brand: Samhan Public `--color-brand-500` (`#2D77A8`, 사이드바 active) + arologis 발송 액션은 arologis-teal `#2A9D8F` (semantic.success 와 동일).

---

## 2. ASCII 화면 mock (1440 x 900 desktop, 사이드바 240px + main 1200px)

```
┌─ 사이드바 240px ──────┬─ 배차 메뉴 main 1200px ─────────────────────────────────────────┐
│                       │                                                                  │
│  ◆ Samhan Public      │  배차 메뉴                                            2026-05-14 │
│                       │  ──────────────────────────────────────────────────────────────  │
│   견적                │                                                                  │
│   주문                │  ┌─ 미배차 출고전표 (좌 560px) ──┐ ┌─ 차량 그룹 (우 620px) ─────┐│
│   창고                │  │                              │ │                            ││
│ ▶ 배차 메뉴          │  │ ┌─ 필터 ─────────────────┐  │ │  작업 코드  DT-20260514-001 ││
│   회계                │  │ │ 배차일                  │  │ │  상태       DRAFT (작성 중)││
│   거래처              │  │ │ [2026-05-13]~[2026-05-15]│ │ │                            ││
│   설정                │  │ │ 상태  ☑ 미배차 ☐ 발송중│  │ │  ┌─ + 차량 추가 ────────┐  ││
│                       │  │ │       ☐ 배차완료        │  │ │  └─────────────────────┘  ││
│                       │  │ └────────────────────────┘  │ │                            ││
│                       │  │                              │ │  ┌─ 1톤 #1  [×]   ───────┐││
│                       │  │ ┌─ 12 건 / 580 총 ───────┐  │ │  │ ① SL-2026-0521        │││
│                       │  │ │                         │  │ │  │   대구공조           [×]│││
│                       │  │ │ ☰ SL-2026-0521 대구공조│ │ │  │   인천 남동구 ...      │││
│                       │  │ │   인천 남동구           │  │ │  │                        │││
│                       │  │ │   ───────────────────  │  │ │  │ ② SL-2026-0525        │││
│                       │  │ │ ☰ SL-2026-0522 한진산업│ │ │  │   영진통상           [×]│││
│                       │  │ │   부산 사상구           │  │ │  │   서울 강서구 ...      │││
│                       │  │ │   ───────────────────  │  │ │  │                        │││
│                       │  │ │ ☰ SL-2026-0523 영진통상│ │ │  └────────────────────────┘││
│                       │  │ │   서울 강서구           │  │ │                            ││
│                       │  │ │   ───────────────────  │  │ │  ┌─ 다마스 #2  [×]  ─────┐││
│                       │  │ │ ☰ SL-2026-0524 마트로닉│ │ │  │ ① SL-2026-0527        │││
│                       │  │ │   대전 서구             │  │ │  │   마트로닉          [×] │││
│                       │  │ │   ───────────────────  │  │ │  └────────────────────────┘││
│                       │  │ │ ☰ SL-2026-0526 일진정밀│ │ │                            ││
│                       │  │ │   광주 광산구           │  │ │  ┌─ 5톤 #3  [×]  ───────┐││
│                       │  │ │   ...                   │  │ │  │                        │││
│                       │  │ │                         │  │ │  │   ⬇ 여기로 슬립을      │││
│                       │  │ │                         │  │ │  │     끌어다 놓으세요     │││
│                       │  │ │                         │  │ │  │                        │││
│                       │  │ └────────────────────────┘  │ │  └────────────────────────┘││
│                       │  │                              │ │                            ││
│                       │  │ ┌─ pagination ───────────┐  │ │  ────────────────────────  ││
│                       │  │ │  ◀ 1 / 12  ▶  50/회    │  │ │  ┌─ ✓ 배차 완료 ────────┐  ││
│                       │  │ └────────────────────────┘  │ │  └─────────────────────┘  ││
│                       │  │                              │ │   ↑ arologis-teal #2A9D8F  ││
│                       │  └──────────────────────────────┘ └────────────────────────────┘│
│                       │                                                                  │
└───────────────────────┴────────────────────────────────────────────────────────────────────┘
```

### 2.1 drag 진행 중 (mouse hold + move)

```
좌 panel ─ source row 반투명 (opacity 0.5) ┐    우 panel ─ drop zone 강조 ┐
                                            │                              │
┌───────────────────────┐                   │   ┌─ 1톤 #1 ──────────────┐ │
│ ☰ SL-2026-0521  ░░░░  │ ←── 0.5 opacity   │   │ ① SL-2026-0521        │ │
└───────────────────────┘                   │   │ ─────────────────────  │ │
                                            │   │   ▼ 여기에 놓기          │ │ ← outline 2 dashed
[cursor 옆 floating preview]                │   └────────────────────────┘ │  arologis-300 #6BC9B5
┌─────────────────┐                         │                              │
│ SL-2026-0521    │   ← shadow-lg          │                              │
│ 대구공조        │   ← rotate(-2deg)      │                              │
└─────────────────┘                         │                              │
```

### 2.2 배차 완료 진행 중 (DISPATCHING)

```
┌─ 차량 그룹 ───────────────────────────────┐
│  작업 코드  DT-20260514-001               │
│  상태  [발송 중, 매칭 대기]  ← brand-500  │
│                                            │
│  ┌────────────────────────────────────┐   │
│  │     ◌ 아로로지스에 발송 중...      │   │ ← spinner + 회색 overlay
│  │       (예상 1~3초)                  │   │   pointer-events: none
│  └────────────────────────────────────┘   │
│                                            │
│  [✓ 배차 완료]  ← disabled                │
└────────────────────────────────────────────┘
```

### 2.3 매칭 완료 회신 후 (DISPATCHED)

```
┌─ 차량 그룹 ───────────────────────────────┐
│  작업 코드  DT-20260514-001               │
│  상태  [배차 완료]  ← arologis-teal-600   │
│                                            │
│  ┌─ 1톤 #1 ────────────────────────────┐  │
│  │ 기사: D-001  홍길동                  │  │
│  │ 연락처: 010-1234-5678                │  │
│  │ ─────────────────────────────────── │  │
│  │ ① SL-2026-0521 대구공조             │  │
│  │ ② SL-2026-0525 영진통상             │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ✓ 배차담당자에게 알림 발송 완료          │
└────────────────────────────────────────────┘
```

### 2.4 매칭 불가 (FAILED)

```
┌─ 차량 그룹 ───────────────────────────────┐
│  상태  [배차 불가]  ← danger #D6504A      │
│                                            │
│  ┌────────────────────────────────────┐   │
│  │ ⚠ 1톤 차량 가용 기사 0명           │   │ ← danger-50 배경
│  │   (인성데이타 응답)                 │   │   danger-700 텍스트
│  └────────────────────────────────────┘   │
│                                            │
│  ┌─ 1톤 #1 (재배차 필요) ─────────────┐   │
│  │ ① SL-2026-0521 대구공조  ← 미배차 │   │
│  │ ② SL-2026-0525 영진통상  복귀     │   │
│  └─────────────────────────────────────┘  │
│                                            │
│  ┌─ ↻ 재배차 시도 ──────────────────┐    │
│  └──────────────────────────────────┘    │
└────────────────────────────────────────────┘
```

---

## 3. 디자인 토큰

### 3.1 색상 (Samhan Public design system `@samhan/design-system/tokens.css`)

| 사용처 | 토큰 | HEX |
|---|---|---|
| 사이드바 active text | `--color-brand-600` | `#235F88` |
| 사이드바 active bg | `--color-brand-50` | `#EFF6FB` |
| 좌 panel row hover bg | `--color-neutral-50` | `#F7F8FA` |
| 좌 panel row border | `--color-border` (`neutral-200`) | `#D6DCE3` |
| drag overlay border | `arologis-300` | `#6BC9B5` (신규 — D-AX-03 brand color 일관) |
| drag overlay bg | `arologis-50` | `#EFFAF8` |
| 그룹 카드 border | `--color-border-strong` (`neutral-300`) | `#B8C0CB` |
| 그룹 카드 header bg | `--color-bg-muted` (`neutral-100`) | `#EDF0F4` |
| [+ 차량 추가] 버튼 bg | `--color-brand-500` | `#2D77A8` |
| [+ 차량 추가] hover bg | `--color-brand-600` | `#235F88` |
| [✓ 배차 완료] 버튼 bg | `arologis-500` | `#2A9D8F` (= `--color-success`) |
| [✓ 배차 완료] hover bg | `arologis-600` | `#218074` |
| DISPATCHING 배지 bg | `--color-info` | `#3F7DB8` |
| DISPATCHED 배지 bg | `arologis-500` | `#2A9D8F` |
| FAILED 배지 bg | `--color-danger` | `#D6504A` |
| FAILED 배너 bg | `danger-50` (alpha mix) | `#FBEEEE` |
| FAILED 배너 text | `danger-700` | `#8E2F2B` |
| [↻ 재배차] 버튼 border | `--color-danger` | `#D6504A` |

### 3.2 spacing / size

| 영역 | 값 | 비고 |
|---|---|---|
| 사이드바 width | `240px` | 고정 |
| 좌 panel width | `560px` | flex 부여, min 480px |
| 우 panel width | `620px` (flex 1) | min 540px |
| panel padding | `--space-5` (`20px`) | |
| 좌 row padding | `--space-3` `--space-4` (12/16px) | |
| 좌 row gap | `--space-2` (8px) | row 간 간격 |
| 그룹 카드 padding | `--space-4` (16px) | |
| 그룹 카드 gap | `--space-3` (12px) | 그룹 간 간격 |
| 그룹 안 slip gap | `--space-2` (8px) | |
| 배차 완료 버튼 height | `48px` | tap target |
| pagination height | `40px` | sticky footer |

### 3.3 typography

| 영역 | 토큰 | px |
|---|---|---|
| 페이지 타이틀 ("배차 메뉴") | `--font-size-2xl` | `22px` weight `semibold` |
| panel 타이틀 ("미배차 출고전표") | `--font-size-lg` | `16px` weight `semibold` |
| 그룹 카드 타이틀 ("1톤 #1") | `--font-size-md` | `15px` weight `semibold` |
| slip number (SL-...) | `--font-size-base` | `14px` weight `medium` |
| 거래처명 (`partnerName`) | `--font-size-base` | `14px` weight `regular` |
| 주소 / 보조 정보 | `--font-size-sm` | `13px` text-muted |
| 상태 배지 | `--font-size-xs` | `12px` weight `semibold` |
| 버튼 | `--font-size-md` | `15px` weight `semibold` |

### 3.4 shape

- `--radius-md` (`8px`) — 카드, 버튼, row
- `--radius-sm` (`6px`) — 배지, input
- `--shadow-sm` — 그룹 카드 default
- `--shadow-md` — 그룹 카드 hover, drag preview

---

## 4. 컴포넌트 매핑

| 영역 | 컴포넌트 | 신규 / 재사용 |
|---|---|---|
| 페이지 컨테이너 | `DispatchBoardPage` | 신규 |
| 좌 panel | `UndispatchedSlipList` | 신규 |
| 좌 row | `UndispatchedSlipRow` (drag source) | 신규 |
| 필터 영역 | `DispatchBoardFilters` (date range + status checkbox) | 신규 |
| pagination | `@samhan/design-system` `Pagination` | 재사용 |
| 우 panel | `DispatchTaskPanel` | 신규 |
| 차량 그룹 카드 | `VehicleGroupCard` (drop target + sortable) | 신규 |
| 차량 그룹 헤더 | `VehicleGroupHeader` (제목 + [×]) | 신규 |
| 그룹 안 slip 카드 | `AssignedSlipCard` (sortable handle + [×]) | 신규 |
| [+ 차량 추가] 모달 | `AddVehicleModal` (D3 참조) | 신규 |
| 배차 완료 다이얼로그 | `DispatchCompleteDialog` | 신규 |
| 상태 배지 | `DispatchStatusBadge` (D5 참조) | 신규 |
| Spinner overlay | `@samhan/design-system` `Spinner` | 재사용 |

---

## 5. data-testid + 접근성

| 영역 | data-testid | aria-label |
|---|---|---|
| 페이지 root | `dispatch-board-page` | — |
| 미배차 panel | `undispatched-panel` | "미배차 출고전표 목록" |
| 미배차 row | `undispatched-row-{slipNumber}` | "출고전표 {slipNumber}, 거래처 {partnerName}, 드래그하여 차량에 배정" |
| 필터 date from | `filter-date-from` | "배차일 시작" |
| 필터 date to | `filter-date-to` | "배차일 종료" |
| 필터 상태 checkbox | `filter-status-{value}` | "{미배차/발송중/배차완료} 표시" |
| pagination prev | `pagination-prev` | "이전 페이지" |
| pagination next | `pagination-next` | "다음 페이지" |
| 차량 그룹 panel | `dispatch-task-panel` | "차량 그룹 영역" |
| 차량 추가 버튼 | `add-vehicle-btn` | "차량 그룹 추가" |
| 차량 그룹 카드 | `vehicle-group-card-{sequence}` | "{vehicleType} 그룹 {sequence}" |
| 그룹 삭제 [×] | `remove-vehicle-group-{sequence}` | "{vehicleType} 그룹 삭제" |
| 배정 slip 카드 | `assigned-slip-{slipNumber}` | "배정 슬립 {slipNumber}, {partnerName}" |
| slip 제거 [×] | `remove-assigned-slip-{slipNumber}` | "{slipNumber} 그룹에서 제거" |
| 배차 완료 버튼 | `dispatch-complete-btn` | "배차 완료 및 아로로지스 발송" |
| DISPATCHING overlay | `dispatching-overlay` | "아로로지스에 발송 중" + `aria-live="polite"` |
| FAILED 재배차 버튼 | `retry-dispatch-btn` | "재배차 시도" |

### 5.1 키보드 접근성

- `@dnd-kit/core` `KeyboardSensor` 활성 → `Space` grab / `↑↓` 이동 / `Enter` drop / `Esc` 취소.
- 모든 [×] 버튼 `tabindex="0"` + `Enter`/`Space` 활성.
- 사이드바 → 좌 panel → 필터 → 미배차 row 1번 → ... → 우 panel → 차량 추가 → 그룹 1번 슬립 → ... → 배차 완료 순으로 tab order.
- `aria-live="polite"` 영역 = DISPATCHING / DISPATCHED / FAILED 상태 변화 + drag drop 결과 ("SL-2026-0521 1톤 #1 그룹에 배정되었습니다").

---

## 6. 상태별 우 panel 표시 매트릭스

| DispatchTask.status | 우 panel 모드 | 차량 추가 | drag drop | 배차 완료 |
|---|---|---|---|---|
| DRAFT | 편집 가능 | ✓ | ✓ | enable (조건 충족 시) |
| DISPATCHING | 읽기 전용 + overlay | ✗ | ✗ | disabled (spinner) |
| DISPATCHED | 읽기 전용 + 기사 정보 표시 | ✗ | ✗ | hidden (대신 "신규 작업" 버튼) |
| FAILED | 읽기 전용 + 재배차 가능 | ✗ | ✗ | hidden (대신 [↻ 재배차] 버튼) |

---

## 7. 비고

- UUID 비공개 ([feedback_uuid_no_user_visibility]) — slip `id` 는 노출 X, `slipNumber` (예: `SL-2026-0521`) + `partnerName` 만 표시. `taskCode` (`DT-20260514-001`) 동일.
- D-DB-02 `@dnd-kit/core` PointerSensor — desktop 마우스 활성, KeyboardSensor 보조.
- 좌 panel default = `dispatchStatus=UNDISPATCHED only` (D-DB-04). 멀티 select 가능 (필터 checkbox).
- 좌 panel 페이지네이션 = spec § 5.4 default 50/회, ◀ ▶ 클릭 또는 `←/→` 화살표.
- 한국어 폰트 = `Pretendard Variable` (디자인 시스템 default).
