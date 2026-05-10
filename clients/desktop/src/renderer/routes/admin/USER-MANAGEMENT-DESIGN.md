# P0-5 사용자/권한 관리 UI 디자인 가이드

> branch: `feature/p0-5-user-role-management`
> 작성일: 2026-05-11
> 담당: Designer (SamhanLogis 디자인 시스템 기준)

---

## 0. 원칙

- **raw hex 금지**: 모든 색상은 design-system CSS 변수 토큰만 사용 (PR #139 회고).
- **UUID 비공개**: 화면 어디에도 UUID 노출 금지. 식별자는 `loginId` / `fullName` / `email` 등 비즈니스 키만 사용.
- **Role 풀네임**: `MASTER` / `DEVELOPER` / `MANAGER` / `SALES` / `ACCOUNTANT` / `WAREHOUSE` / `INVENTORY` — 약어(M/M/D) 금지.
- **Pretendard 9 weight 자동 상속**: `body { font-family: var(--font-family-sans) }` 선언으로 전체 화면 자동 적용.
- **한국어 타이포**: 본문 14px Regular / 헤더 18px SemiBold / 서브헤더 16px Medium.

---

## 1. UsersPage 레이아웃 보강

### 1.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [h2] 사용자 관리       실시간 자동 갱신 · 30초 ↺           [+ 신규 등록] │
├─────────────────────────────────────────────────────────────────────────────┤
│ [검색: 로그인ID / 이름 / 이메일]  [권한 전체 ▼]  [상태 전체 ▼]           │
├──────────┬──────────┬────────────────────┬───────────┬──────────┬──────────┬──────────────────────────────┤
│ 로그인ID │  이름    │       이메일        │   권한    │   상태   │ 마지막   │            액션              │
│          │          │                    │  Badge    │  Badge   │ 로그인   │  수정 / Role변경 / 잠금해제 / 탈퇴 │
├──────────┴──────────┴────────────────────┴───────────┴──────────┴──────────┴──────────────────────────────┤
│ ... rows ...                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                          ← 이전   1 / N   다음 →                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 헤더 영역 (PageHeader 컴포넌트 패턴 — sales-polish-2 답습)

| 요소 | 토큰 | 값 |
|---|---|---|
| 높이 | `--page-header-h` | 56px |
| 배경 | `--page-header-bg` | `var(--surface-card)` |
| 하단 선 | `--page-header-border` | `1px solid var(--line-default)` |
| 화면명 폰트 | `--page-title-size` / `--page-title-weight` | 20px / 600 |
| 화면명 색상 | `--page-title-color` | `var(--ink-primary)` |
| 갱신 안내 | `var(--color-neutral-500)` | 12px / 400 |

**신규 등록 버튼** (`data-testid="admin-user-create-button"`):
- `<Button variant="primary" size="md">`
- 레이블: `+ 신규 등록`
- 위치: 헤더 우측 (justify-content: space-between)

### 1.3 필터 영역

```
┌────────────────────────────────────────────┐
│ 🔍 로그인ID / 이름 / 이메일 검색           │  data-testid="admin-user-search-input"
└────────────────────────────────────────────┘
┌──────────────┐  ┌──────────────┐
│ 권한 전체 ▼ │  │ 상태 전체 ▼ │  data-testid="admin-user-role-filter" / "admin-user-status-filter"
└──────────────┘  └──────────────┘
```

| 요소 | 스타일 |
|---|---|
| 검색 input | `height: 32px; padding: 0 var(--space-3); border: 1px solid var(--line-default); border-radius: var(--radius-md); font-size: var(--font-size-sm)` |
| select | 동일 크기 / 스타일 |
| gap | `var(--space-3)` (12px) |
| 하단 margin | `var(--space-4)` (16px) |

### 1.4 표 컬럼 정의

| key | header | width | 비고 |
|---|---|---|---|
| `loginId` | 로그인ID | 140px | 텍스트, mono font |
| `fullName` | 이름 | 120px | 텍스트 |
| `email` | 이메일 | 200px | 텍스트, `var(--ink-secondary)` |
| `role` | 권한 | 120px | `<RoleBadge>` |
| `status` | 상태 | 90px | `<StatusBadge>` |
| `lastLogin` | 마지막 로그인 | 150px | `YYYY-MM-DD HH:mm` 포맷, `var(--ink-secondary)` |
| `actions` | 액션 | auto | 버튼 4종 |

`data-testid="admin-users-table"` — DataTable 래퍼 div.

### 1.5 행 액션 버튼 4종

```tsx
// 액션 셀 내부 — flex row, gap: var(--space-2)
<Button variant="ghost" size="sm" onClick={() => openEditModal(u)}>수정</Button>
<Button variant="ghost" size="sm" onClick={() => openRoleChangeModal(u)}>Role 변경</Button>
{u.status === 'LOCKED' && (
  <Button
    variant="ghost"
    size="sm"
    data-testid={`admin-user-unlock-button-${u.loginId}`}
    onClick={() => handleUnlock(u.id)}
  >
    잠금 해제
  </Button>
)}
{u.status !== 'DISABLED' && (
  <Button variant="ghost" size="sm" colorScheme="danger" onClick={() => openDisableModal(u)}>탈퇴</Button>
)}
```

- **수정**: `variant="ghost"`, 모든 상태에서 표시
- **Role 변경**: `variant="ghost"`, DISABLED 상태는 비활성(`disabled`)
- **잠금 해제**: `variant="ghost"`, 상태가 `LOCKED`인 경우만 표시 — `data-testid="admin-user-unlock-button-{loginId}"`
- **탈퇴**: `variant="ghost"`, `color: var(--state-danger)` — DISABLED 이미 된 행은 숨김

---

## 2. Badge 컬러 토큰

### 2.1 Status Badge (3종)

| 상태 | 표시 라벨 | Badge variant | 토큰 |
|---|---|---|---|
| `ACTIVE` | 활성 | `success` | `--state-success` / `--state-success-bg` |
| `LOCKED` | 잠금 | `warning` | `--state-warning` / `--state-warning-bg` |
| `DISABLED` | 탈퇴 | `neutral` | `--ink-tertiary` / `--color-bg-muted` |

```tsx
const STATUS_BADGE_VARIANT = {
  ACTIVE:   'success',
  LOCKED:   'warning',
  DISABLED: 'neutral',
} as const satisfies Record<UserStatus, BadgeVariant>

const STATUS_LABEL = {
  ACTIVE:   '활성',
  LOCKED:   '잠금',
  DISABLED: '탈퇴',
} as const
```

### 2.2 Role Badge (7종)

| Role | 표시 라벨 | Badge variant | 근거 |
|---|---|---|---|
| `MASTER` | 마스터 | `danger` | 최상위 권한 — 경고색으로 시각 강조 |
| `DEVELOPER` | 개발자 | `warning` | 시스템 접근 — 주의색 |
| `MANAGER` | 매니저 | `info` (= brand) | 관리직 — 브랜드 컬러 |
| `SALES` | 영업원 | `neutral` | 일반 업무 |
| `ACCOUNTANT` | 회계원 | `neutral` | 일반 업무 |
| `WAREHOUSE` | 창고원 | `neutral` | 일반 업무 |
| `INVENTORY` | 재고원 | `neutral` | 일반 업무 |

```tsx
const ROLE_BADGE_VARIANT = {
  MASTER:     'danger',
  DEVELOPER:  'warning',
  MANAGER:    'brand',    // design-system Badge의 info/brand 별칭 확인 후 적용
  SALES:      'neutral',
  ACCOUNTANT: 'neutral',
  WAREHOUSE:  'neutral',
  INVENTORY:  'neutral',
} as const

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  MASTER:     '마스터',
  DEVELOPER:  '개발자',
  MANAGER:    '매니저',
  SALES:      '영업원',
  ACCOUNTANT: '회계원',
  WAREHOUSE:  '창고원',
  INVENTORY:  '재고원',
}
```

### 2.3 Badge 공통 스타일

```
padding:       2px var(--space-2)      /* 2px 8px */
border-radius: var(--radius-full)
font-size:     var(--font-size-xs)     /* 12px */
font-weight:   var(--font-weight-medium) /* 500 */
```

---

## 3. Modal 디자인 (4종)

### 3.1 공통 Modal 규격

| 속성 | 값 |
|---|---|
| 최대 너비 | `480px` |
| 배경 오버레이 | `rgba(0,0,0,0.4)` |
| 모서리 | `var(--radius-lg)` |
| 패딩 | `var(--space-6)` (24px) |
| 헤더 폰트 | 18px SemiBold `var(--ink-primary)` |
| 헤더 하단 선 | `1px solid var(--line-default)` |
| footer gap | `var(--space-3)` — 취소 좌 / 확인 우 |

---

### 3.2 CreateUserModal (신규 등록)

`data-testid="admin-user-create-modal"`

```
┌──────────────────────────────────────────────┐
│ 신규 사용자 등록                          ✕  │
├──────────────────────────────────────────────┤
│                                              │
│  로그인 ID *          [__________________]   │
│                                              │
│  이름 *               [__________________]   │
│                                              │
│  이메일               [__________________]   │
│                                              │
│  부서 *               [부서 선택        ▼]   │
│                                              │
│  권한 *               [MASTER          ▼]   │
│                       ┌─────────────────┐    │
│                       │ ⚠ 마스터 권한은 │    │
│                       │ 신중하게 부여   │    │
│                       └─────────────────┘    │
│                                              │
│  전화번호             [__________________]   │
│                                              │
├──────────────────────────────────────────────┤
│                [취소]         [등록하기]      │
└──────────────────────────────────────────────┘
```

**필드 정의**

| 필드 | 필수 | 검증 | 비고 |
|---|---|---|---|
| `loginId` | Y | 영문 소문자 + 숫자, 4-20자 | 중복 시 BE 409 에러 표시 |
| `fullName` | Y | 2-20자 | |
| `email` | N | 이메일 형식 | |
| `departmentId` | Y | `<select>` — 부서 목록 API | |
| `role` | Y | `<select>` — ROLE 7종 | MASTER 선택 시 경고 hint 표시 |
| `phone` | N | 숫자/하이픈 | |

**MASTER 선택 경고 hint**:
- 배경: `var(--state-warning-bg)`
- 테두리: `var(--state-warning)`
- 텍스트: `var(--state-warning)` 12px
- 아이콘: `⚠` Unicode

**등록 성공 후 임시 비밀번호 표시** → 3.5절 참조.

---

### 3.3 EditUserModal (정보 수정)

`data-testid="admin-user-edit-modal"`

```
┌──────────────────────────────────────────────┐
│ 사용자 정보 수정 — 홍길동 (hong)          ✕  │
├──────────────────────────────────────────────┤
│                                              │
│  이름 *               [홍길동____________]   │
│                                              │
│  이메일               [hong@example.com__]   │
│                                              │
│  전화번호             [010-1234-5678_____]   │
│                                              │
│  부서 *               [영업부            ▼]  │
│                                              │
│  직위                 [과장______________]   │
│                                              │
│  팀장 여부            [ ] 팀장           │
│                                              │
├──────────────────────────────────────────────┤
│                [취소]         [저장하기]      │
└──────────────────────────────────────────────┘
```

**필드 정의**

| 필드 | 필수 | 비고 |
|---|---|---|
| `fullName` | Y | 2-20자 |
| `email` | N | 이메일 형식 |
| `phone` | N | 숫자/하이픈 |
| `departmentId` | Y | `<select>` |
| `position` | N | 직위 자유 텍스트 |
| `teamLead` | N | checkbox |

- `loginId` 는 수정 불가 — 읽기 전용 텍스트로 표시 (`var(--ink-secondary)`)
- `role` 은 EditUserModal 에서 수정 불가 — 별도 RoleChangeModal 경유

---

### 3.4 RoleChangeModal (Role 변경 + 사유)

`data-testid="admin-user-role-change-modal"`

```
┌──────────────────────────────────────────────┐
│ 권한 변경 — 홍길동 (hong)                 ✕  │
├──────────────────────────────────────────────┤
│                                              │
│  현재 권한            [영업원 Badge]          │
│                                              │
│  신규 권한 *          [매니저          ▼]    │
│                                              │
│  변경 사유 *          [________________]     │
│                       [________________]     │
│                       [________________]     │
│                       최소 5자 이상          │
│                                              │
├──────────────────────────────────────────────┤
│                [취소]         [적용]          │
└──────────────────────────────────────────────┘
```

**검증 규칙**

| 항목 | 규칙 |
|---|---|
| 신규 권한 | 현재 권한과 동일하면 `적용` 버튼 `disabled` |
| 변경 사유 | 5자 이상 필수. 미달 시 `border-color: var(--state-danger); outline: var(--state-danger)` |
| MASTER 지정 | 경고 inline hint 표시 (CreateUserModal 동일 스타일) |

**에러 배너**

```
┌────────────────────────────────────┐
│ ⚠ 권한 변경에 실패했습니다.        │  배경: var(--state-danger-bg)
│   (BE 에러 메시지 표시)            │  텍스트: var(--state-danger)
└────────────────────────────────────┘
```

**사이드 Drawer — 변경 이력 (옵션 — Phase 이후 구현)**

- 트리거: `이력 보기` 링크 (Modal 하단 좌측)
- 위치: 화면 우측 320px 고정 Drawer
- 내용: `RoleHistoryModal` DataTable 동일
- 토큰: `--surface-card`, `var(--line-default)` 좌측 border

---

### 3.5 DisableUserModal (탈퇴 + 사유)

`data-testid="admin-user-disable-modal"`

```
┌──────────────────────────────────────────────┐
│ 사용자 탈퇴 처리                          ✕  │
├──────────────────────────────────────────────┤
│                                              │
│  ⚠  홍길동 (hong) 사용자를 탈퇴 처리합니다. │
│     탈퇴 후 복구가 불가능합니다.            │
│                                              │
│  탈퇴 사유 *          [________________]    │
│                       [________________]    │
│                       최소 5자 이상 필수     │
│                                              │
├──────────────────────────────────────────────┤
│                [취소]    [탈퇴 처리하기]      │
└──────────────────────────────────────────────┘
```

**경고 블록 스타일**:
- 배경: `var(--state-danger-bg)`
- 테두리: `1px solid var(--state-danger)`
- 아이콘: `⚠` / 텍스트: `var(--state-danger)` 14px Medium

**탈퇴 버튼**:
- `<Button variant="danger">` 또는 `variant="primary" style="background: var(--state-danger)"`
- 사유 5자 미달 시 `disabled`

**검증**:
- 탈퇴 사유 5자 이상 필수
- 미달 시 textarea `border-color: var(--state-danger)`; 하단 `font-size: var(--font-size-xs); color: var(--state-danger)` 메시지

---

## 4. 임시 비밀번호 표시 패턴

CreateUserModal 제출 성공 후, Modal 내부가 결과 뷰로 전환됩니다.

`data-testid="admin-user-temp-password-display"`

```
┌──────────────────────────────────────────────┐
│ 사용자 등록 완료                          ✕  │
├──────────────────────────────────────────────┤
│                                              │
│  ✓ 홍길동 (hong) 사용자가 등록되었습니다.   │
│                                              │
│  임시 비밀번호                              │
│  ┌────────────────────────────────────────┐  │
│  │  Abc@12345!                  [복사] │  │  ← mono font, var(--surface-subtle)
│  └────────────────────────────────────────┘  │
│                                              │
│  ⚠ 보안 안내                               │
│     임시 비밀번호를 사용자에게 직접 전달하고 │
│     즉시 이 창을 닫아 주세요.              │
│     로그인 후 비밀번호 변경이 필요합니다.   │
│                                              │
├──────────────────────────────────────────────┤
│                        [닫기]                │
└──────────────────────────────────────────────┘
```

**임시 비밀번호 박스 스타일**:

| 속성 | 토큰 |
|---|---|
| 배경 | `var(--surface-subtle)` |
| 테두리 | `1px solid var(--line-default)` |
| 모서리 | `var(--radius-md)` |
| 패딩 | `var(--space-3) var(--space-4)` |
| 폰트 | `font-family: monospace; font-size: var(--font-size-base); font-weight: var(--font-weight-semibold)` |
| 복사 버튼 | `<Button variant="ghost" size="sm">복사</Button>` |

**복사 버튼 동작**:
- `navigator.clipboard.writeText(tempPassword)` 호출
- 성공 시 버튼 텍스트 1초간 `복사됨 ✓` 로 변경 후 원복
- 실패 시 `var(--state-danger)` 색상 텍스트 에러 메시지

**보안 안내 박스 스타일**:
- 배경: `var(--state-warning-bg)`
- 테두리: `1px solid var(--state-warning)`
- 텍스트: `var(--font-size-sm)` / `var(--ink-secondary)`

---

## 5. data-testid 전체 목록

| data-testid | 컴포넌트 | 조건 |
|---|---|---|
| `admin-users-table` | 테이블 래퍼 `<div>` | 항상 |
| `admin-user-create-button` | 신규 등록 버튼 | 항상 |
| `admin-user-create-modal` | CreateUserModal 래퍼 | 모달 열림 시 |
| `admin-user-edit-modal` | EditUserModal 래퍼 | 모달 열림 시 |
| `admin-user-role-change-modal` | RoleChangeModal 래퍼 | 모달 열림 시 |
| `admin-user-unlock-button-{loginId}` | 잠금 해제 버튼 | 상태 LOCKED 행만 |
| `admin-user-disable-modal` | DisableUserModal 래퍼 | 모달 열림 시 |
| `admin-user-temp-password-display` | 임시 비밀번호 표시 박스 | 등록 성공 후 |
| `admin-user-search-input` | 검색 input | 항상 |
| `admin-user-role-filter` | 권한 필터 select | 항상 |
| `admin-user-status-filter` | 상태 필터 select | 항상 |
| `admin-user-role-change` | Role 변경 버튼 (행) | DISABLED 아닌 행 |
| `admin-user-role-history` | 이력 버튼 (행) | 항상 |
| `admin-users-realtime-indicator` | 갱신 주기 안내 span | 항상 |

---

## 6. UX 흐름 정의

### 6.1 신규 등록 흐름

```
[+ 신규 등록] 클릭
  → CreateUserModal 열림
    → 폼 작성 → [등록하기] 클릭
      → (성공) Modal 내부 → 임시 비밀번호 결과 뷰
               → [복사] → clipboard → 1초 후 원복
               → [닫기] → Modal 닫힘 → 테이블 invalidate & refetch
      → (실패) 에러 배너 표시 (Modal 유지)
    → [취소] → Modal 닫힘
```

### 6.2 Role 변경 흐름

```
[Role 변경] 클릭 (행)
  → RoleChangeModal 열림 (현재 사용자 정보 pre-fill)
    → 신규 권한 선택 + 사유 입력 (5자 이상)
      → [적용] 클릭
        → (성공) Modal 닫힘 → invalidate & refetch
        → (실패) 에러 배너 (Modal 유지)
    → [취소] → Modal 닫힘
```

### 6.3 잠금 해제 흐름

```
[잠금 해제] 클릭 (행, LOCKED 상태만 표시)
  → window.confirm "홍길동 사용자의 잠금을 해제합니다." (브라우저 기본)
    → 확인 → PATCH /admin/users/{id}/unlock → invalidate & refetch
    → 취소 → 아무 동작 없음
```

### 6.4 탈퇴 처리 흐름

```
[탈퇴] 클릭 (행)
  → DisableUserModal 열림
    → 탈퇴 사유 입력 (5자 이상)
      → [탈퇴 처리하기] 클릭
        → (성공) Modal 닫힘 → invalidate & refetch
        → (실패) 에러 배너 (Modal 유지)
    → [취소] → Modal 닫힘
```

### 6.5 정보 수정 흐름

```
[수정] 클릭 (행)
  → EditUserModal 열림 (현재 정보 pre-fill)
    → 필드 수정 → [저장하기]
      → (성공) Modal 닫힘 → invalidate & refetch
      → (실패) 에러 배너
    → [취소] → Modal 닫힘
```

---

## 7. 타이포그래피 적용 규칙

| 용도 | 토큰 | 값 |
|---|---|---|
| 페이지 헤더 | `var(--page-title-size)` / `var(--page-title-weight)` | 20px / 600 |
| 모달 제목 | `var(--font-size-lg)` / `var(--font-weight-semibold)` | 18px / 600 |
| 본문 레이블 | `var(--font-size-sm)` / `var(--font-weight-medium)` | 14px / 500 |
| 본문 값 | `var(--font-size-sm)` / `var(--font-weight-regular)` | 14px / 400 |
| 테이블 헤더 | `var(--font-size-xs)` / `var(--font-weight-semibold)` | 12px / 600 |
| 배지 | `var(--font-size-xs)` / `var(--font-weight-medium)` | 12px / 500 |
| 힌트/경고 | `var(--font-size-xs)` / `var(--font-weight-regular)` | 12px / 400 |
| 임시 비밀번호 | `monospace` / `var(--font-weight-semibold)` | 14px / 600 |

---

## 8. 스페이싱 규칙

| 요소 | 토큰 | 값 |
|---|---|---|
| 필터 행 gap | `var(--space-3)` | 12px |
| 필터 → 테이블 간격 | `var(--space-4)` | 16px |
| 모달 내부 필드 gap | `var(--space-3)` | 12px |
| 모달 패딩 | `var(--space-6)` | 24px |
| 행 액션 버튼 gap | `var(--space-2)` | 8px |
| 모달 footer 버튼 gap | `var(--space-3)` | 12px |

---

## 9. 접근성 (A11y) 체크리스트

- [ ] 모든 `<input>` / `<select>` / `<textarea>` 에 연관 `<label>` 또는 `aria-label` 부여
- [ ] 에러 배너 `role="alert"` 부여
- [ ] Modal `role="dialog"` + `aria-modal="true"` + `aria-labelledby` 연결
- [ ] 임시 비밀번호 박스 `aria-live="polite"` (복사 성공 알림)
- [ ] 복사 버튼 `aria-label="임시 비밀번호 복사"` 부여
- [ ] MASTER 경고 hint `role="alert"` 또는 `aria-describedby` 연결
- [ ] 테이블 `<caption>` 또는 `aria-label="사용자 목록 테이블"` 부여
- [ ] 잠금 해제 버튼 `aria-label="홍길동 잠금 해제"` (사용자명 포함)

---

## 10. 기존 UsersPage 대비 변경 사항 요약

| 항목 | 기존 | 변경 |
|---|---|---|
| 신규 등록 버튼 | 없음 | `+ 신규 등록` 버튼 + CreateUserModal 추가 |
| 테이블 컬럼 | loginId / fullName / 부서 / 권한 / 상태 / 관리 | email + lastLogin 컬럼 추가 |
| 상태 표현 | `terminationDate` 유무로 ACTIVE/잠금 | `ACTIVE` / `LOCKED` / `DISABLED` 3종 |
| 행 액션 | 비활성화/재활성화 / 권한 변경 / 이력 | 수정 / Role 변경 / 잠금 해제 / 탈퇴 4종 재편 |
| 상태 필터 | 없음 | 상태 전체 / ACTIVE / LOCKED / DISABLED |
| 모달 종류 | RoleChangeModal / RoleHistoryModal | 4종 신규 (Create / Edit / RoleChange / Disable) |
| 임시 비밀번호 | 없음 | 등록 성공 후 Modal 내 결과 뷰로 표시 |

---

## 11. FE 구현 가이드 (Frontend agent 전달)

1. **`adminApi.ts` 확장**: `createAdminUser` / `editAdminUser` / `unlockAdminUser` 함수 추가. BE endpoint 확정 후 path 연동.
2. **`AdminUser` 타입 확장**: `email`, `lastLogin`, `status: 'ACTIVE' | 'LOCKED' | 'DISABLED'` 필드 추가 (현재 `terminationDate` 기반 판단 로직은 `status` 필드로 대체).
3. **Badge 변형**: `STATUS_BADGE_VARIANT` / `ROLE_BADGE_VARIANT` 상수는 `adminApi.ts` 또는 별도 `constants/userManagement.ts` 로 분리 관리.
4. **raw hex 금지 가드**: `border: '1px solid #D1D5DB'` 등 기존 inline style 을 `var(--line-default)` 토큰으로 전량 교체 (PR #139 회고).
5. **`data-testid` 완전 구현**: 위 5절 목록 누락 없이 모두 부여.
6. **임시 비밀번호 보안**: BE 응답 `tempPassword` 필드는 메모리에서만 사용 — localStorage / sessionStorage 저장 금지.
7. **폼 상태 초기화**: Modal 닫힐 때 `useState` 초기값으로 완전 리셋.
