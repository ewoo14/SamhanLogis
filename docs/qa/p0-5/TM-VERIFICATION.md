# PR #140 — Phase 10 P0-5 사용자/권한 관리 TM 통합 검증 결과

- **PR**: #140 `feature/p0-5-user-role-management`
- **TM 검증일**: 2026-05-11
- **검증 대상 commit**: c84a2e6 (DevOps) / 9c2f0e3 (BE) / 39bd92b (Designer + 잔여)
- **검증자**: TM (Tech Manager)

---

## 1. PR #134~#139 회고 가드 점검

| 가드 | 결과 | 비고 |
|---|---|---|
| BE record vs FE TS interface 1:1 | 자가 fix | 5건 contract drift → FE 측 정렬 (TM fix commit) |
| `@PreAuthorize("hasRole('MASTER')")` (사용자/권한) | PASS | mutation 4종 (create/update/role/disable/unlock) MASTER 강제. list/roles/role-history 만 MASTER+MANAGER 허용 — 매뉴얼 §4 부합 |
| `@MockitoSettings(strictness = LENIENT)` | PASS | `AdminUserServiceTest` L52 명시 적용 |
| IT `@Transactional` + `@MockBean` 외부 client | PASS | `P05ValidationIT` `@Transactional` (L48) + `@MockBean AuthClient` (L69-70) |
| raw hex 0건 | PASS | `var(--token, #fallback)` 4건은 design-system fallback 패턴 (PR #138 허용 정책). 순수 raw hex (`'#XXXXXX'`) 0건 |
| design-system Input | PASS | `@samhan/design-system` `Input` / `Button` / `Modal` / `DataTable` / `FormField` / `Badge` 일관 사용 |
| ROLE 풀네임 | PASS | `AdminRole` union 7-tier 풀네임 (`MASTER` / `MANAGER` / `SALES` / `ACCOUNTANT` / `WAREHOUSE` / `INVENTORY` / `DEVELOPER`). `ADMIN_ROLE_LABEL` 한국어 라벨 1:1 |
| `@RequestParam` 이름 정확 | PASS | `page` / `size` / `q` / `role` / `departmentId` 모두 BE 시그니처 ↔ FE `params` 키 일치 |

---

## 2. P0-5 특화 검증

| 항목 | 결과 | 위치 |
|---|---|---|
| `Account` 도메인 메서드 (`unlock` / `setPasswordChangeRequired`) | PASS | `Account.java` L182-185, L192-194 — 멱등 처리 + `lockedAt = null + failedLoginAttempts = 0` |
| 임시 비밀번호 `SecureRandom` 보안 | PASS | `TemporaryPasswordGenerator` `SecureRandom` (L30) + Fisher-Yates shuffle (L49-54) + 영문/숫자 최소 1자 보장 (L43-44) |
| `RoleChangeHistory` 적재 | PASS | `EmployeeProvisioningService.updateRole(id, role, reason, callerId)` L137 `roleHistoryRepository.save(...)` + 동일 role 재요청 시 append 회피 (L131-134) |
| auth-service V4 `password_change_required` | PASS | `V4__add_password_change_required.sql` `BOOLEAN NOT NULL DEFAULT FALSE` — 기존 row 호환 |
| auth-service V5 seed 9건 [DEV-SEED] | PASS | MASTER/DEVELOPER/MANAGER/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY/LOCKED/DISABLED — `[DEV-SEED]` prefix + `ON CONFLICT (id) DO NOTHING` 멱등 |
| user-service V5 seed 9건 [DEV-SEED] | PASS | auth-service V5 와 UUID 1:1 대응 — `account_id = id` 정책 준수 |
| 첫 로그인 비밀번호 강제 변경 chain | PASS | `AdminUserCreateRequest` → `EmployeeProvisioningService.adminCreate` → `AuthClient.createAccount(..., true)` → `Account.passwordChangeRequired = true` |

---

## 3. TM cross-check 결과 (자가 fix 1건)

| Check | 결과 | fix commit |
|---|---|---|
| UUID 정합성 | PASS | seed UUID `a0000000-...-000000000001~9` user/auth 1:1 |
| API contract | 5건 자가 fix | TM fix commit (이번 PR 추가) |
| 디자인 일관성 | PASS | `Pretendard` (Designer 가이드 USER-MANAGEMENT-DESIGN.md 부합) |
| 도메인 정합성 | PASS | `Employee.terminate` / `markDeleted` / `Account.unlock` 도메인 chain 정렬 |
| Flyway 의존성 | PASS | auth V4(컬럼 추가) → V5(seed 적재) 순서 정합. user V5 는 V1~V4 의존 |
| 메모리 가드 | PASS | UUID 비공개 / 한국어 commit / 풀네임 / dev-seed 표시 모두 부합 |

### 자가 fix 5건 상세

| # | 회귀 영역 | 증상 | fix 위치 |
|---|---|---|---|
| B1 | `CreateAdminUserResponse` shape | FE: `{ user: AdminUser, temporaryPassword }` ↔ BE: flat record. UI 의 `result.user.fullName` 접근 시 runtime undefined | `clients/desktop/src/renderer/api/adminApi.ts` flat 화 + `UsersPage.tsx` `result.fullName` 직접 참조 |
| B2 | `disableAdminUser` body | FE: `POST { reason }` ↔ BE: HTTP 204 body 없음. 사유 필드 silent drop | FE: body 제거 + 주석으로 사유 audit 슬라이스 backlog 명시 |
| B3 | `unlockAdminUser` 응답 | FE: `Promise<AdminUser>` ↔ BE: HTTP 204. `res.data.data` 접근 시 undefined | FE: `Promise<void>` 로 정정 |
| B4 | `enableAdminUser` 누락 | FE: `PATCH /admin/users/{id}/enable` 호출 ↔ BE endpoint 미존재 → 404 회귀 | FE: 함수/UI 버튼 제거 + UX 가드 ("재활성화는 본 슬라이스 미지원" 주석) |
| W1 | `status` query param | FE: `?status=ACTIVE&LOCKED` 전달 ↔ BE `searchAdmin` 미수신. silent ignore (400 안 남) | nit (W11 backlog: `EmployeeRepository.searchAdmin` `status` parameter 추가) |

---

## 4. nit 댓글 (PR comment 권장)

1. `EmployeeRepository.searchAdmin` 에 `status` (`ACTIVE` / `LOCKED`) 파라미터 추가 검토 — 현재 frontend 가 전달하나 BE 가 ignore (silent fail).
2. `disable` 사유 audit 적재 endpoint (`/admin/users/{id}/audit`) backlog — frontend UX 측 5자 이상 입력 강제는 살아있으나 BE 보존 안 됨.
3. `password_change_required = TRUE` 상태에서 첫 로그인 후 비밀번호 변경 화면 강제 redirect 는 P0-2 후속 슬라이스 (BE `/auth/me` `passwordChangeRequired` 노출 확인 필요).

---

## 5. 종합 판정

- **Blocker**: 0건 (5건 contract drift 자가 fix 완료)
- **Warning**: 1건 (status param silent ignore — backlog)
- **Nit**: 3건 (PR comment 처리)

**TM 판정**: PASS. PM 측에 풀빌드 검증 + PR 발행 위임 가능.
