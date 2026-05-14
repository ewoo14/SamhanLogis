# D2 — arologis-desktop DriverManagementPage mock

> 화면: `clients/arologis-desktop/src/renderer/routes/drivers/DriverManagementPage.tsx`
> 라우트: `/drivers`
> 사용자: 아로로지스 관리자 (`AROLOGIS_MANAGER` 이상)
> API: `GET /admin/arologis/drivers` (list), `POST /admin/arologis/drivers` (create), `DELETE /admin/arologis/drivers/{id}` (soft delete)
> 핵심 가드: **phoneNumber 사전 등록** — 등록되지 않은 휴대번호로는 arologis-mobile 로그인 불가 (D-AX-09).

---

## 1. 디자인 의도

- 1 화면 = (좌) 등록 목록 + (우 또는 상단) 신규 등록 폼 + 행 별 soft delete 버튼.
- **UUID 비공개 가드** ([[feedback_uuid_no_user_visibility]]) — `id` 컬럼 표기 X, `driverCode` (`D-001` 형식) 만 사용자 노출.
- 휴대번호 **마스킹 향후 옵션** note 추가 (PII). 본 PR 에서는 평문 노출 (관리자 작업 효율 우선) 하되, 추후 토글로 `010-****-1234` 제공 계획 기록.
- 신규 기사 등록 후 `POST /admin/arologis/drivers/{id}/invite-sms` 로 어플 invite SMS 발송 — 별도 버튼 (`SMS 안내` ).

---

## 2. ASCII 화면 mock (1440 x 900 desktop, 사이드바 240px 제외)

```
┌─[ Sidebar 240px ]──┬─────────────────────────────────────────────────────────────┐
│                    │  ◆ 기사 관리                                                  │
│  ◆ 아로로지스 ▼    │  ──────────────────────────────────────────────────────      │
│                    │  사전 등록된 휴대번호만 어플 로그인 가능합니다.                  │
│  ▸ 배차 관리       │                                                              │
│  ▸ 자동 매칭       │  ┌─[ 신규 등록 ]──────────────────────────────────────┐       │
│  ▶ 기사 관리       │  │ 기사명     [김운송           ]                    │       │
│  ▸ 지역 관리       │  │ 휴대번호   [010-1234-5678   ]   *국내 010-만 허용 │       │
│  ▸ 감사 로그       │  │ 차량 종류  [▼ 1톤 카고      ]                    │       │
│                    │  │ 영업소     [▼ 서울 (강남)    ]                    │       │
│  ─────────────     │  │                                                  │       │
│  김관리 (MASTER)   │  │             [ 취소 ]  [ 등록 + SMS 발송 ]         │       │
│  ⏻ 로그아웃        │  └────────────────────────────────────────────────────┘       │
│                    │                                                              │
│                    │  ┌─[ 검색 / 필터 ]────────────────────────────────────┐       │
│                    │  │ 🔍 [기사명 또는 휴대번호 ]    차량종류 [▼ 전체]   │       │
│                    │  │                              상태     [▼ 활성]   │       │
│                    │  └────────────────────────────────────────────────────┘       │
│                    │                                                              │
│                    │  ┌─[ 등록된 기사 (총 47 명, 활성 42 / 정지 5) ]─────┐         │
│                    │  │                                                  │         │
│                    │  │ 코드  ┊ 기사명 ┊ 휴대번호       ┊ 차량  ┊ 상태 ┊ 액션 │         │
│                    │  │ ──── ┊ ──── ┊ ─────────── ┊ ──── ┊ ─── ┊ ──── │         │
│                    │  │ D001 ┊ 김운송 ┊ 010-1234-5678 ┊ 1톤  ┊ 🟢   ┊ ✎ 🗑  │         │
│                    │  │ D002 ┊ 박배송 ┊ 010-2345-6789 ┊ 1톤  ┊ 🟢   ┊ ✎ 🗑  │         │
│                    │  │ D003 ┊ 이수송 ┊ 010-3456-7890 ┊ 2.5톤┊ 🟢   ┊ ✎ 🗑  │         │
│                    │  │ D004 ┊ 최운반 ┊ 010-4567-8901 ┊ 1톤  ┊ ⚫   ┊ ↩ 복구│         │
│                    │  │ D005 ┊ 한택배 ┊ 010-5678-9012 ┊ 1.4톤┊ 🟢   ┊ ✎ 🗑  │         │
│                    │  │ ...                                              │         │
│                    │  │                                                  │         │
│                    │  │              ◀  1  2  3  4  5  ▶                  │         │
│                    │  │                                                  │         │
│                    │  └──────────────────────────────────────────────────┘         │
│                    │                                                              │
└────────────────────┴─────────────────────────────────────────────────────────────┘

범례: 🟢 활성 (어플 로그인 가능)    ⚫ 정지 (soft-deleted, isDeleted=true)
      ✎ 편집   🗑 정지 (soft delete)   ↩ 복구 (soft delete undo)
```

### 삭제 확인 모달 (행 액션 `🗑` 클릭 시)

```
┌──────────────────────────────────────┐
│  기사 정지                            │
│  ──────────────                       │
│                                       │
│  D003 이수송 (010-3456-7890) 기사를    │
│  정지하시겠습니까?                     │
│                                       │
│  정지 후 해당 휴대번호로는 어플 로그인   │
│  할 수 없습니다. (복구 가능)            │
│                                       │
│  사유 [▼ 퇴사 / 차량 매각 / 기타  ]    │
│  메모 [                            ]   │
│                                       │
│         [ 취소 ]  [ 정지 ]              │
└──────────────────────────────────────┘
        ↑ Modal (DS), max-width 480px
```

### 빈 상태 (등록 0 명)

```
┌──────────────────────────────────────┐
│         🚚                            │
│                                       │
│   등록된 기사가 없습니다.               │
│   상단의 [신규 등록] 폼에서 기사를       │
│   추가하세요.                          │
│                                       │
└──────────────────────────────────────┘
```

---

## 3. 디자인 토큰

> 아로로지스 brand color (teal 계열) 는 [01-desktop-login.md §3.1](./01-desktop-login.md) 참조. 본 화면은 brand 액센트 사용 최소화 (행 hover / 활성 토글 정도).

### 3.1 컴포넌트별 토큰

| 요소 | Token / Class | 값 |
|---|---|---|
| 페이지 padding | `px-8 py-6` | 32px / 24px |
| 헤더 (◆ 기사 관리) | `text-2xl font-bold text-neutral-900` | `typography.fontSize.2xl` = 22px |
| 안내 텍스트 | `text-sm text-neutral-600 mt-1 mb-6` | 13px |
| 신규 등록 카드 | `Card` (DS) + `mb-6` | bordered, `bg-white`, `shadow-sm` |
| 카드 헤더 | `text-base font-semibold text-arologis-700` | 14px, teal-700 |
| FormField | DS 기본 (label 위, input 아래) | — |
| Input 휴대번호 | `PhoneInput` (DS) — 자동 hyphen 삽입 (`010-####-####`) | — |
| 차량 종류 / 영업소 Select | DS Select, height 40px | — |
| `[ 등록 + SMS 발송 ]` 버튼 | `Button` variant=primary, `bg-arologis-500` | 36px h |
| `[ 취소 ]` 버튼 | `Button` variant=ghost, `text-neutral-600` | — |
| 검색 / 필터 카드 | `bg-neutral-50 border border-neutral-200 rounded-lg p-4` | — |
| 검색 Input | DS Input + 🔍 icon left | h=36px |
| 테이블 (DataGrid) | `@samhan/design-system` `DataGrid` 컴포넌트 | — |
| 테이블 헤더 | `bg-neutral-100 text-xs font-semibold text-neutral-700 uppercase` | 12px |
| 테이블 row | `text-sm text-neutral-800 border-b border-neutral-100` | 14px |
| 행 hover | `hover:bg-arologis-50` | `#EFFAF8` |
| 상태 배지 (활성) | `Badge variant="success"` (DS), 작은 dot `bg-green-500` | `semantic.success` |
| 상태 배지 (정지) | `Badge variant="neutral"`, dot `bg-neutral-400` | — |
| 코드 셀 (D001) | `font-mono text-sm text-neutral-700` | `font.mono` |
| 휴대번호 셀 | `font-mono text-sm text-neutral-800` (자동 hyphen 포맷) | — |
| 액션 icon 버튼 | `IconButton` (DS), 32px square, `text-neutral-500 hover:text-arologis-600` | — |
| 페이지네이션 | DS `Pagination`, brand color = `arologis-500` 활성 | — |
| 모달 | DS `Modal`, max-width 480px, `shadow-modal` | `shadows.modal` |
| 모달 confirm 버튼 (정지) | `Button` variant=danger, `bg-red-500 hover:bg-red-600` | `semantic.danger` |

### 3.2 Spacing 명세

```
페이지 좌우 padding:        32px (px-8)
페이지 상하 padding:        24px (py-6)
헤더 ↔ 안내 텍스트:         4px  (mt-1)
안내 텍스트 ↔ 신규 등록 카드: 24px (mb-6)
신규 등록 카드 ↔ 필터:       24px (gap-6 in flex-col)
필터 ↔ 테이블:               16px (mt-4)
테이블 row height:            48px (h-12) — 14px 폰트 + 17px line-height 기준
테이블 cell padding:          12px 좌우 (px-3)
```

### 3.3 컬럼 width (총 좌측 사이드바 제외 가용 1200px)

| 컬럼 | width | 정렬 |
|---|---|---|
| 코드 (driverCode) | 80px | center |
| 기사명 | 120px | left |
| 휴대번호 | 160px | left |
| 차량 종류 | 100px | center |
| 영업소 | 140px | left |
| 상태 | 80px  | center |
| 등록일 | 120px | center |
| 마지막 로그인 | 140px | center |
| 액션 | 100px | center |
| (남은 여백) | flex-1 | — |

---

## 4. 상호작용 / 상태

| 시나리오 | 동작 |
|---|---|
| 신규 등록 (등록 + SMS 발송 클릭) | `POST /admin/arologis/drivers` → 200 → 모달 닫힘 + 테이블 자동 갱신 + Toast "기사 등록 완료. 안내 SMS 발송됨." |
| 휴대번호 중복 | BE 409 → 폼 상단 빨간 배너 "이미 등록된 휴대번호입니다." |
| 정지 (🗑) | 모달 → 사유 선택 → `DELETE /admin/arologis/drivers/{id}` → soft delete + 행 상태 ⚫ + 액션 `↩ 복구` 로 전환 |
| 복구 (↩) | 직접 호출 또는 확인 모달 → `POST /admin/arologis/drivers/{id}/restore` (BE 합의 시) → 상태 🟢 |
| 검색 (휴대번호 일부) | client-side filter (47 명 규모 OK) — `010-12` 입력 시 매치 row 만 |
| 빈 상태 | 위 mock 의 빈 상태 카드 노출 |
| 어플 미설치 알림 | `appInstalled === false` 이면 휴대번호 셀 옆에 작은 배지 `📱 미설치` (`text-amber-600`) |

### data-testid

| testid | 위치 |
|---|---|
| `driver-mgmt-page` | 페이지 루트 |
| `driver-create-form` | 신규 등록 카드 |
| `driver-create-name-input` | 기사명 Input |
| `driver-create-phone-input` | 휴대번호 Input |
| `driver-create-submit-button` | 등록 + SMS 발송 |
| `driver-list-table` | 테이블 |
| `driver-row-{driverCode}` | 행 (e.g. `driver-row-D001`) |
| `driver-delete-button-{driverCode}` | 정지 아이콘 |
| `driver-delete-confirm-modal` | 정지 확인 모달 |
| `driver-restore-button-{driverCode}` | 복구 아이콘 |

---

## 5. UUID / PII 가드

- 테이블 / 폼 / 모달 어디에도 `id` (UUID) 노출 X.
- `driverCode` (사용자 노출 비즈니스 식별자) 만 표기.
- 휴대번호 — **본 PR scope 평문 노출** (관리자 작업 효율 우선). 향후 옵션 (toggle "휴대번호 마스킹" `010-****-5678`) 추가 검토.
- `phoneNumber` PII 마스킹 토글은 별도 슬라이스 — DriverManagementPage 우측 상단에 토글 자리만 미리 두기 (`[ 마스킹 OFF ]` placeholder).
- 어플 사용자 식별은 `driverCode` + `name` 만으로 충분 (휴대번호는 클립보드 복사 액션 등에 한정).

---

## 6. 접근성

- 테이블 `<table role="table">` + 헤더 `<th scope="col">` + 정렬 `aria-sort`
- 행 액션 버튼 `aria-label="기사 정지 (D001 김운송)"` 형식
- 모달 `role="dialog"` + `aria-modal="true"` + focus trap (DS `Modal` 기본)
- 신규 등록 폼 submit 후 toast 는 `role="status"` + `aria-live="polite"`

---

## 7. 반응형

- Electron 최소 1024 보장 — 좌측 사이드바 240px + 메인 784px 까지 OK.
- 메인 < 900px 시 신규 등록 카드의 grid (4 컬럼 → 2 컬럼) 자동 변경 (`md:grid-cols-4 grid-cols-2`).
- 테이블 — width < 800px 시 (영업소 / 마지막 로그인) 컬럼 우선 숨김 (DS DataGrid `responsive` prop).

---

## 8. 참고 / 다음 단계

- BE D-AX-07 의 `Driver` entity 와 매핑 (`driverCode` / `phoneNumber` / `vehicleType` / `appInstalled`).
- 신규 등록 SMS 본문 — notification-service `arologis-driver-invite` 템플릿 (BE/DevOps 합의).
- 정지 시 active session 처리 — refresh token revoke + 진행 중 dispatch 가 있으면 BE 가 409 반환 (FE 는 "진행 중 배차가 있어 정지할 수 없습니다." 모달).
- 마스킹 토글 향후 슬라이스 — 본 PR 에서는 placeholder 만, 실제 구현은 Phase 11 이후.
