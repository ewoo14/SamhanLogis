# Codex 5-agent cross-check 리뷰 — PR #316 (사이클 1 후반)

> 리뷰어: Codex (gpt-5.5, BE/QA/DevOps/FE/Designer 5 병렬)
> 대상 head: `fbc0b7da` (사이클 1 fix 4라운드 수렴, CI 28/28 green)
> 성격: Claude 5-agent 리뷰 + Codex 4라운드 fix 후 **적대적 교차검증** — CI green 의 false-green 영역 적발
> 종합 판정: **CHANGES REQUESTED** (5/5 agent). P0(CRITICAL) 1 + P1 2 + P2 다수.

---

## 🔴 P0 / CRITICAL — 아로로지스 전 엔드포인트 lockout (BE·DevOps 독립 수렴)

- **위치**: `shared/security/.../PermissionAspect.java:110,114,121,133`, `services/arologis-service/.../config/DynamicPermissionClientConfig.java:45`, `services/auth-service/.../db/migration/V39__account_page_permissions_overhaul.sql:206-213`
- **내용**: PermissionAspect 는 literal `"MASTER"` 만 bypass, 그 외는 `X-User-Id`(UUID)로 auth-service `account_page_permissions` 를 `check(accountId,page,action)` 조회. 그러나 arologis 는 독립 auth(자체 `auth_admin_user`/Driver + `AROLOGIS_MASTER/MANAGER/DRIVER` role)이고 V39 materialize 는 auth-service `accounts` 만 대상 → arologis 계정 권한 row 0 → 운영 arologis 전 `@RequirePermission` 엔드포인트 403. `ArologisRoleNormalizingPermissionClient.check` 는 정규화 없이 위임(canView/canEdit 만 AROLOGIS_*→MASTER 정규화).
- **false-green**: `ArologisAdminAuthIT` 등이 `check→true` mock + 요청 role 헤더를 MANAGER 로 swap 해 실 경로 미검증.
- **개발책임자 결정**: **아로로지스 descope** — `enforcement-mode` opt-in(default account, arologis=role), arologis 는 role-based canView/canEdit 유지. → 사이클 2 해소.

## 🟠 P1 — PARTNER self-service 광범위 회귀 (BE·DevOps)

- **위치**: `PermissionAspect.java:114-118`, V30 grant(`V30__seed_sp_d6_2_page_codes.sql:42,53,55`), PartnerOrderDraft/Confirm/History/Tutorial/EditRequest Controller.
- **내용**: V30 이 PARTNER 에 grant 한 draft/confirm/history/tutorial/edit-requests/list 가 blanket PARTNER deny 로 회귀(print 만 carve-out 됨). 단순 flag 부여는 self-scope 불충분 endpoint 에서 over-permit 위험.
- **개발책임자 결정**: **self-scope 검증 후 carve-out 확대** — service 계층 PARTNER_CODE_HEADER 자기범위 검증 확인·보강 후 flag. → 사이클 2 해소.

## 🟠 P1 — FE PageCode 170 vs BE 173 (FE·Designer)

- `ecount.mig2.product/warehouse`, `ecount.mig5.stock-transfer` 가 FE 매트릭스/bulk 미노출. → 사이클 2: Flyway seed 존재로 BE 유지 + FE 173 노출.

## 🟠 P1 — PermissionGuard 로딩중 fail-open (FE)

- `PermissionGuard.tsx:41` isLoading 중 children 렌더 → bulk route flash. → 사이클 2: Spinner fail-closed.

## 🟡 P2 — 테스트 검증갭 (QA·DevOps)

- V39 IT 가 template parity 만 검증, 실 `account_page_permissions` materialize + `AccountPermissionService.check` 실 DB grant 미검증. → 사이클 2: `V39AccountPermissionMaterializeIT` 신설.
- `V39PartnerExclusionIT` PARTNER seed 부재로 vacuous pass. → 사이클 2: PARTNER seed.
- `AuthPermissionMigrationIT` local profile 잔존. → 사이클 2: 제거.
- CI green 이 Testcontainers skip-green 을 구조적으로 배제 못 함(DockerAvailableCondition + require_tests:false). → 후속: skipped-count sentinel 검토.

## ✅ 정상 확인 (Codex)

- deny override 패턴 대표 slice 에서 eq(page)+eq(action) AOP 정합, metric counter 동일 page/action 검증.
- X-User-Id non-MASTER/PARTNER 경로 UUID 파싱 후 check 진입(단순 403 회피 아님).
- V39 보존표 DOWNLOAD/PRINT/RESTORE role set + SALES tax-invoice.list can_print=FALSE 촘촘히 검증.
- PermissionAspectTest PARTNER 기본 deny + partnerSelfService opt-in proceed 검증.
- UUID 비공개, edit→update shim, V39 forward-only/멱등성/배포순서 정합. gradlew exec bit / Node20 / secrets 정상.
