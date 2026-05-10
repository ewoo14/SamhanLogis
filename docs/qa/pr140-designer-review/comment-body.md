## Designer Review — PR #140 P0-5 사용자/권한 관리 UI

검토 기준: `USER-MANAGEMENT-DESIGN.md` vs `UsersPage.tsx` (Modal 5종 포함) + design-system 토큰 (`tokens.css`)

---

### 1. design-system 토큰 (raw hex 0건 원칙 — PR #139 회고)

**[P1 결함] raw hex fallback 이 실질적 hard-code 로 동작**

`selectStyle` / `textareaStyle` 공통 상수에서 다음 패턴이 전량 발견됩니다.

```tsx
border: '1px solid var(--color-neutral-300, #D1D5DB)',
background: 'var(--color-surface, #fff)',
color: 'var(--color-text-primary, #111827)',
```

`var(--color-surface, #fff)` 는 `tokens.css` 에 `--color-surface` 가 정의되어 있지 않으므로 fallback `#fff` 가 **항상** 적용됩니다. 즉 외견상 토큰처럼 보이지만 실제로는 raw hex 입니다. 올바른 토큰은 `--color-bg` (= `var(--color-neutral-0)`) 또는 `--surface-card` 입니다.

마찬가지로 `--color-primary-700` (CreateUserModal 임시 비밀번호 박스) 도 `tokens.css` 에 없는 토큰이어서 fallback `#1D4ED8` 로 항상 동작합니다. 스펙은 `var(--surface-subtle)` 배경 + `monospace` 폰트이므로 내용 전체 교체가 필요합니다.

수정 대상:

| 현재 (fallback 무효) | 올바른 토큰 |
|---|---|
| `var(--color-neutral-300, #D1D5DB)` | `var(--line-default)` |
| `var(--color-surface, #fff)` | `var(--surface-card)` |
| `var(--color-text-primary, #111827)` | `var(--ink-primary)` |
| `var(--color-danger-50, #FEF2F2)` | `var(--state-danger-bg)` |
| `var(--color-danger-700, #B91C1C)` | `var(--state-danger)` |
| `var(--color-primary-700, #1D4ED8)` | (삭제 — 스펙 미일치, 아래 §4 참조) |
| `var(--color-neutral-100, #F3F4F6)` | `var(--surface-subtle)` |

---

### 2. Status Badge (3종)

**[P1 결함] DISABLED 상태 미구현 + badge variant 불일치**

스펙 (`USER-MANAGEMENT-DESIGN.md §2.1`):
- `ACTIVE` → `variant="success"` ✅ 구현됨
- `LOCKED` → `variant="warning"` ❌ 현재 `variant="danger"` 로 구현됨
- `DISABLED` → `variant="neutral"` ❌ 미구현

현재 코드는 `terminationDate` 유무로 잠금/활성 이진 판단만 합니다. `AdminUser` 타입에 `status: 'ACTIVE' | 'LOCKED' | 'DISABLED'` 필드가 추가되었음에도 (`adminApi.ts` 주석 기준) `UsersPage.tsx` 의 `isLocked()` 함수가 여전히 `terminationDate` 만 확인하고 있습니다. DISABLED 상태는 아예 렌더링되지 않습니다.

```tsx
// 현재 (수정 필요)
render: (u) =>
  isLocked(u) ? (
    <Badge variant="danger">잠금</Badge>   // variant 오류: warning 이어야 함
  ) : (
    <Badge variant="success">활성</Badge>
  ),

// 스펙 준수 코드
render: (u) => {
  const v = STATUS_BADGE_VARIANT[u.status]
  const l = STATUS_LABEL[u.status]
  return <Badge variant={v}>{l}</Badge>
}
```

---

### 3. Role Badge (7종)

**[P2 미구현] 권한 컬럼이 텍스트만 표시 — Badge 미적용**

스펙 (`§2.2`): 권한 컬럼은 `<RoleBadge>` 또는 `ROLE_BADGE_VARIANT` 기반 `<Badge>` 렌더링 필수입니다.

현재 구현:
```tsx
render: (u) => ADMIN_ROLE_LABEL[u.role],   // 순수 텍스트 반환
```

MASTER(danger) / DEVELOPER(warning) / MANAGER(brand) 구분이 전혀 시각화되지 않습니다. 수정 필요:
```tsx
render: (u) => (
  <Badge variant={ROLE_BADGE_VARIANT[u.role]}>
    {ADMIN_ROLE_LABEL[u.role]}
  </Badge>
),
```

`Badge.module.css` 확인 결과 `variant-brand` 는 정의되어 있습니다. `MANAGER` 에 `'brand'` variant 를 사용하면 됩니다.

---

### 4. 임시 비밀번호 (monospace + 복사 + 보안 안내)

**[P1 결함] 스펙 3항목 모두 미구현**

스펙 (`§4`):
1. 비밀번호 박스 배경 `var(--surface-subtle)`, 폰트 `monospace`, 복사 버튼 포함
2. 복사 버튼 — `navigator.clipboard.writeText()` + 1초 `복사됨 ✓` 전환
3. 보안 안내 박스 — `var(--state-warning-bg)` 배경, `var(--state-warning)` 테두리
4. `data-testid="admin-user-temp-password-display"` 부여

현재 구현:
- 배경 `var(--color-neutral-100, #F3F4F6)` (fallback 무효 raw hex)
- 복사 버튼 없음
- 보안 안내 박스 없음 (단순 `<p>` 태그)
- `data-testid="admin-user-temp-password-display"` 없음
- `<code>` 컬러 `var(--color-primary-700, #1D4ED8)` — 스펙에 없는 스타일

---

### 5. data-testid 13종 일치 검증

스펙(`§5`)은 14종, 코드 상단 JSDoc 은 16종(일부 상이한 이름)입니다.

| data-testid (스펙) | 구현 여부 | 비고 |
|---|---|---|
| `admin-users-table` | ✅ | |
| `admin-user-create-button` | ❌ | 코드에 `admin-users-create-button` (복수형) 으로 구현됨 — 불일치 |
| `admin-user-create-modal` | ✅ | |
| `admin-user-edit-modal` | ✅ | |
| `admin-user-role-change-modal` | ✅ | |
| `admin-user-unlock-button-{loginId}` | ❌ | 코드에 `admin-user-unlock-button` (loginId 없음) — 스펙 불일치 |
| `admin-user-disable-modal` | ✅ | |
| `admin-user-temp-password-display` | ❌ | 미구현 |
| `admin-user-search-input` | ✅ | |
| `admin-user-role-filter` | ✅ | |
| `admin-user-status-filter` | ✅ | |
| `admin-user-role-change` | ✅ | |
| `admin-user-role-history` | ✅ | |
| `admin-users-realtime-indicator` | ✅ | |

**불일치 3건**: `admin-user-create-button` (단수) / `admin-user-unlock-button-{loginId}` (loginId suffix) / `admin-user-temp-password-display` (미구현)

---

### 6. 사유 5자 이상 클라이언트 검증

**DisableUserModal**: `reasonValid = reasonTrimmed.length >= 5` 구현 ✅, `disabled={!reasonValid}` ✅, 에러 메시지 ✅

**RoleChangeModal**: `reason` 은 `placeholder="변경 사유 (선택)"` 으로 선택 처리되어 있고 `disabled={newRole === user.role}` 만 있음 ❌

스펙 (`§3.4`): "변경 사유 5자 이상 필수. 미달 시 `border-color: var(--state-danger)`". 즉 RoleChangeModal 에서도 사유 5자 검증이 필수이며, `적용` 버튼은 `!reasonValid` 일 때도 `disabled` 여야 합니다.

---

### 7. 기타 구조 검토

**[P3 개선 권고]**

1. **헤더 `<h3>` → `<h2>`**: 스펙(`§1.1`)은 `[h2] 사용자 관리`. 현재 `<h3>` 사용 중.
2. **상태 필터 DISABLED 없음**: `<option value="DISABLED">탈퇴</option>` 미포함. status 필터가 `'ACTIVE' | 'LOCKED' | ''` 만 처리하고 `DISABLED` 를 받지 않음.
3. **EditUserModal `position` / `teamLead` 미구현**: 스펙(`§3.3`) 필드에 `position`, `teamLead` 포함. 현재 미구현.
4. **행 액션 순서 스펙 불일치**: 스펙은 `수정 / Role변경 / 잠금해제 / 탈퇴`. 현재는 `잠금해제 / 수정 / Role변경 / 이력 / 탈퇴/재활성화` 순으로 다름.
5. **`재활성화` 버튼**: 스펙에 없는 액션. DISABLED 상태 행은 `탈퇴` 버튼 숨김만 정의됨. 재활성화는 스펙 외 기능이므로 별도 검토 요망.

---

### 8. 결함 분류 요약

| 분류 | 항목 수 | 내용 |
|---|---|---|
| P1 (차단) | 5 | raw hex fallback 전량, LOCKED badge variant, DISABLED 상태 미구현, 임시비밀번호 3종 미구현, RoleChangeModal 사유 검증 누락 |
| P2 (스펙 미달) | 2 | Role Badge 미적용, data-testid 3건 불일치 |
| P3 (권고) | 5 | h2, DISABLED 상태필터, position/teamLead, 행 순서, 재활성화 |

---

**결론**: P1 결함 5건(raw hex fallback 다수 · LOCKED badge variant 오류 · DISABLED 상태 미구현 · 임시비밀번호 스펙 전항목 누락 · RoleChangeModal 사유 검증 누락) 과 P2 2건(Role Badge 미시각화 · testid 3종 불일치) 수정 전까지 디자인 승인 보류.
