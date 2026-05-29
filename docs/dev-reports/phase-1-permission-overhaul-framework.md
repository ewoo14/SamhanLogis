# Phase 1 권한 프레임워크 — 계정 × page × 7-action 전환

> 작성일: 2026-05-28
> 브랜치: `feat/phase-1-permission-overhaul-framework`
> spec: `docs/superpowers/specs/2026-05-28-permission-overhaul-phase-1-framework-design.md` (D-PO-01~09)
> plan: `docs/superpowers/plans/2026-05-28-permission-overhaul-phase-1-framework.md` (Task 0~15)
> 인벤토리: `docs/permission-overhaul/menu-inventory.md` (173 PageCode × 7 action)

## 1. 변경 요약

role 기반(영업원/회계원 등) 2-action(VIEW/EDIT) 동적 RBAC을 **계정(account) 단위 × page × 7-action**
(VIEW/CREATE/UPDATE/DELETE/RESTORE/DOWNLOAD/PRINT) enforcement로 전환했다. role은 enforcement에서
분리되어 비강제 템플릿(`role_page_permission_templates`)으로만 잔존하고, 실제 권한 검사는 전부
`account_page_permissions`(계정 UUID × page × 7 boolean) 기준이다. MASTER는 `PermissionAspect`에서
short-circuit bypass하고, MASTER 전용 매트릭스 UI(개별/일괄)로 계정별 권한을 편집한다.

기존 role grant는 Flyway V39가 **행동보존 자동전개**(VIEW→VIEW, EDIT→CREATE+UPDATE+DELETE,
RESTORE/DOWNLOAD/PRINT는 보존 매핑표)로 각 계정에 materialize하여 회귀 0을 보장한다. 외부 role
`PARTNER`는 내부 page 권한에서 제외한다(내부 Role enum에 PARTNER 없음 — partner-auth-service 전용).

## 2. 단일 PR / 4 Stage 실행 구조

`@RequirePermission.action()`을 String→enum으로 바꾸는 Task 2 이후 전 service 컴파일이 깨지므로,
9.x 재주석화가 모두 완료된 뒤에야 feat 브랜치 CI가 의미를 가진다. 따라서 단일 PR을 4 Stage로 나눠 실행했다.

| Stage | 범위 | Task |
|---|---|---|
| 1 | shared 7-action 기반 + auth-service 엔티티/서비스/API + V39 + auth 재주석화 | 1~8 |
| 2a | accounting / inventory / slip / arologis 재주석화 (검증완료) | 9.1~9.4 |
| 2b | partner / partner-auth / partner-order / dc-config / product / user / dashboard / notification / groupware 재주석화 + Task 10 | 9.5~9.8, 10 |
| 3 | FE — permissionsApi/usePermissions 7-action, 평탄 매트릭스, 다계정 wizard, AppLayout, Playwright | 11~14 |
| 4 | 문서 동기화 | 15 |

## 3. Stage 1 — shared + auth-service 토대

| 산출 | 위치 |
|---|---|
| `PermissionAction` 7-action enum (`from`/`fromOrNull`/`column`) | `shared/security/.../permission/PermissionAction.java` |
| `@RequirePermission.action()` String→`PermissionAction` enum | `shared/security/.../permission/RequirePermission.java` |
| `PermissionAspect` — `X-User-Id`(account UUID) + MASTER bypass + PARTNER deny + 7-action, account-id 누락 시 deny(현행 skip→deny) | `shared/security/.../permission/PermissionAspect.java` |
| `DynamicPermissionClient.check(accountId,page,action)` + `bulkLoad(accountId)` | `shared/security/.../permission/DynamicPermissionClient.java`, `DefaultDynamicPermissionClient.java` |
| `RolePagePermissionTemplate` / `AccountPagePermission` 엔티티 + 리포지토리 (`allows`/`grant`/`revoke`) | `services/auth-service/.../domain/`, `.../repository/` |
| `AccountPermissionService` (check/bulkLoad/matrix/applyTemplate/copyAccount/bulk) | `services/auth-service/.../service/AccountPermissionService.java` |
| internal API account check + `GET /auth/internal/permissions/account/{accountId}` map | `services/auth-service/.../web/PermissionInternalController.java` |
| admin API — accounts / account matrix / template / copy-from / bulk | `services/auth-service/.../web/PermissionAdminController.java` |
| Flyway V39 행동보존 자동전개 + parity/PARTNER/guard IT | `services/auth-service/.../db/migration/V39__account_page_permissions_overhaul.sql` |

## 4. Stage 2 — 14 service 재주석화 + guard 정리

~380 `@RequirePermission`을 의미 기준 7-action으로 재분류했다(GET=VIEW, POST=CREATE, PUT/PATCH=UPDATE,
DELETE=DELETE, export=DOWNLOAD, 인쇄 view=PRINT, revert/warehouse restore=RESTORE). 도메인별 8 commit.

- **Task 10**: `EstimatePermissionGuard`를 role→account(`DynamicPermissionClient.check(accountId, "estimates.list", ...)`)로
  전환하고, `EstimateController`가 `X-User-Id`를 전달한다. call site 0인 dead guard 3개
  (`ProductPermissionGuard` / `PartnerOrderPermissionGuard` / `PartnerPermissionGuard`)를 삭제했다.
- 도메인 권한 IT는 `DynamicPermissionClient @MockBean`을 account+action-aware stub으로 일괄 보강
  (PR #310 see-saw 교훈 — deny case 명시 `false`).

## 5. Stage 3 — FE (clients/desktop)

| Task | 산출 |
|---|---|
| 11 | `permissionsApi.ts` 7-action(`PERMISSION_ACTIONS`/`PermissionActionMatrix`) + account API(`fetchAccounts`/`fetchAccountMatrix`/`updateAccountMatrix`/`applyTemplate`/`copyFromAccount`/`bulkApply`). `usePermissions`/`PermissionGuard` 7-action `canAccess`. `fetchMyPermissions`를 `/auth/admin/permissions/my`로 전환. |
| 12 | `PermissionMatrixPage.tsx` 전면 재작성 — 계정 selector + account×page×7action 평탄 매트릭스(도메인 섹션 sticky thead) + 행/열/도메인 토글 + 검색 + 템플릿 적용/복사 + dirty 카운트 저장. |
| 13 | `PermissionMatrixBulkPage.tsx` 4-step 다계정 wizard(계정 다중선택 → mode(template/grants) → 미리보기 → bulkApply) + route `/admin/permission-matrix/bulk` (MASTER guard). |
| 14 | `AppLayout.tsx` 7-action `canAccess` 게이트(미로드 fail-closed, flash 0). 권한 관리 메뉴 = MASTER + `canAccess('system.permission-admin','view')` 동시 충족 시만 노출. |

### 5-1. 세션 중 발견·수정 (D-PO-08)

Task 11 초기 구현은 `fetchMyPermissions`가 `hasRole('INTERNAL')` 전용 internal account endpoint를 호출하여
데스크톱 사용자 토큰으로는 403이 나는 구조였다. 근본 원인은 사용자 본인 권한 조회용
`GET /auth/admin/permissions/my`(`isAuthenticated()`)가 아직 레거시 2-action(role 기반)이었던 점이다.
→ `/my`를 account 기반 7-action map(MASTER 전 page all-true / PARTNER deny / X-User-Id 누락·parse 실패
fail-closed)으로 전환하고 FE를 `/my`로 되돌렸다. `PermissionAdminControllerTest`로 검증.

### 5-2. 과도기 shim (D-PO-09)

기존 라우트의 `action="edit"` 호환을 위해 `PermissionLookupAction = PermissionAction | 'edit'` +
`normalizePermissionAction(edit→update)`을 둔다. 라우트 prop의 명시 7-action 정리는 후속.
`clients/desktop`에 unit test runner(vitest/jest)가 없어 Task 11 단계의 `usePermissions.test.ts`는 제거하고,
FE 검증은 Playwright(`playwright/permission-overhaul/{matrix,bulk,applayout}.spec.ts`) + BE 테스트로 대체했다.

## 6. 검증 (2026-05-28 세션, `GRADLE_USER_HOME=.gradle\codex-home`)

| 대상 | 명령 | 결과 |
|---|---|---|
| Stage 2b 컴파일 | 9 service + slip `compileJava`/`compileTestJava` | BUILD SUCCESSFUL |
| Task 10 단위 | `:services:slip-service:test --tests *EstimatePermissionGuardTest` | PASS |
| Stage 1 `/my` | `:services:auth-service:compileJava :…:compileTestJava :…:test --tests *PermissionAdminControllerTest` | PASS |
| FE | `clients/desktop` `npm run typecheck` / `lint`(0 error) / `build` | PASS |
| Playwright | `playwright/permission-overhaul` (Vite:5174 + `PLAYWRIGHT_SKIP_WEB_SERVER=1`) | 3 passed |

V39 parity/PARTNER/guard IT 및 도메인 권한 IT의 실 Testcontainers 검증은 Linux CI(`./gradlew ... test`)에서 확정한다
([[qa-docker-real-test]]). Windows 로컬 Playwright는 기본 webServer lifecycle이 hang하여 별도 Vite 포트 + skip 옵션으로 실행했다.

## 7. Phase 2 이월 (비포함 명시)

- RESTORE 메커니즘(전표 버전이력 + 롤백 `YYYY/MM/DD-{전표번호}`) 도메인별 구현 (D-PO-06).
- DOWNLOAD 포맷 분기(PDF/PNG 생성) — Phase 1은 `can_download` 단일 bit (D-PO-02).
- 라우트 `action="edit"` → 명시 7-action prop 정리 (D-PO-09 shim 제거).

## 8. 리뷰 사이클 + 머지 (2026-05-29, PR #316 squash `80f4c00e`)

dual 5-agent 리뷰 3사이클로 수렴. **CI green 이 일부 false-green 이었음을 dual cross-check 가 적발**한 것이 핵심.

| 사이클 | 발견 → 해소 |
|---|---|
| 1 (Claude 리뷰 → Codex fix 4R) | P0 V39 IT `@TestPropertySource(local)` H2+flyway-off context 실패 / `AuthPermissionMigrationIT` MASTER bypass stale + **권한 IT see-saw 60종**(7-action `check(UUID,page,action)` stub + `X-User-Id` 헤더 + deny 명시 false 일괄) + **V39 보존표 재산출**(`inventory.dps`/`inventory.stock-balance` DOWNLOAD narrowing 복구, `SALES accounting.tax-invoice.list` PRINT widening 제거, 재무보고서 11 GET `PRINT`→`VIEW`) + PARTNER print carve-out → CI green |
| 1후반 (Codex 5-agent cross-check) | 🔴 CRITICAL 아로로지스 lockout(D-PO-10) + PARTNER self-service 회귀(D-PO-11) 적발 |
| 2 | 아로로지스 descope + PARTNER carve-out 확대(self-scope 보강) + FE PageCode 173 + PermissionGuard Spinner fail-closed + 실DB `V39AccountPermissionMaterializeIT` + `V39PartnerExclusionIT` PARTNER seed → CI green |
| N=2 (Claude 5-agent 재리뷰) | 🔴 P0 role-form endpoint 운영 파손(D-PO-12) 적발 — IT @MockBean 으로 CI false-green, BE cross-check 단독 |
| 3 | role-form `/check` 양식 분기 복구 + 실 HTTP 회귀 IT 3종 + 매트릭스 위험 action 시각화 → CI green → 양쪽 APPROVE → PM 머지 |

### follow-up (cross-check 정리, 별도 PR)
- BE: role-form `type`·`action` 동시 누락 → 400 계약 가드 회귀 테스트(standalone `PermissionInternalControllerTest`).
- FE/Designer: 단일 DELETE/RESTORE 셀 시각 가드, 일괄 toggle `aria-label`, boxShadow 토큰화, bulk grants "대체(replace)" 경고, 예상건수 "최대 N건" 보수화, `/my` mock 대문자 정합.
- Docs: DECISIONS D-PO-10~12, 본 절, 배포 런북.

### 관찰 (범위 외, 후속 검토)
- **`ResponseStatusException` → 500 변환**: `AuthExceptionHandler` 의 catch-all `@ExceptionHandler(Exception.class)→500` 에 `ResponseStatusException` 전용 핸들러가 없어, full-stack 에서 컨트롤러의 `ResponseStatusException(BAD_REQUEST)` 가 500 으로 뭉개진다. role-form 400 계약 테스트를 standalone(advice 미로드)에 둔 이유. 실 영향 낮음(운영 role-form 호출은 항상 `type` 포함, 내부 client 는 4xx/5xx 모두 deny 처리)이나 auth-service 전 endpoint 의 4xx 오류 응답 정합성 차원의 별개 hardening 후보.
- **배포 순서 의무**: auth-service(V39 materialize + `/check` 양식 분기) 를 소비 14 service 보다 **선행 배포**해야 한다. 역순 시 소비 service 가 account-form 을 구버전 auth 에 보내 fallback deny → 일시 전면 차단. 코드 fallback 은 안전(보수적 deny)하나 outage 회피 위해 런북 명시 — `docs/runbooks/phase-1-permission-deploy.md`.
- CI 필수 job 에 `skipped=0` 게이트 추가 권고(Testcontainers silent-skip 위장 green 방지).
