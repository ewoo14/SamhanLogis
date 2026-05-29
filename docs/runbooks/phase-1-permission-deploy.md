# 배포 런북 — 권한 재편 Phase 1 (계정×page×7action)

> PR #316(`80f4c00e`) 적용 배포 시 의무 절차. dual cross-check(DevOps) 권고 반영.

## 핵심 위험: 배포 순서

신규 enforcement 는 소비 service 가 `DynamicPermissionClient` 로 auth-service `/auth/internal/permissions/check` 를 호출해 권한을 판정한다. **auth-service 가 V39(권한 materialize) + 신 `/check`(account/role 양식 분기) 를 먼저 적용하지 않으면**, 소비 service 의 account-form 호출(`accountId+action`)이 구버전 auth(role-form 필수)에 도달 → 400 → client fallback `false`(보수적 deny) → **일시 전면 권한 차단(outage)**.

> client fallback 은 fail-closed(deny)라 보안 사고는 아니나, 순서 위반 시 정상 사용자도 차단되는 가용성 outage 가 발생한다.

## 배포 순서 (의무)

1. **auth-service 선행 배포**
   - Flyway V39 적용(`role_page_permissions` → `role_page_permission_templates` → `account_page_permissions` materialize). forward-only·멱등(`ON CONFLICT DO NOTHING`).
   - 적용 후 readiness/health green 확인.
   - 검증: 비-MASTER 계정으로 `GET /auth/internal/permissions/check?accountId=…&pageCode=…&action=VIEW`(내부 토큰) 200 + `data.allowed` 정상.
2. **소비 14 service 동시/직후 rolling 배포** (auth health green 게이트 후).
3. **arologis-service**: `samhan.security.permission.enforcement-mode=role` 설정 확인(role-based 유지, D-PO-10 descope). 나머지 13 service 는 미설정(default `account`).

## 검증 (배포 후)

- MASTER 로그인 → 전 메뉴/매트릭스 접근(aspect bypass).
- 비-MASTER 계정 → 매트릭스 grant 대로 allow/deny.
- arologis AROLOGIS_MANAGER/DRIVER → role-based 권한 동작(role_page_permissions 기준).
- PARTNER → 내부 page deny, self-service(주문 print/draft/confirm 등) 자기 거래처만 허용.

## 롤백

- forward-only(Flyway). 잘못된 materialize 시 보상 마이그레이션(V40 revoke) 또는 `account_page_permissions` soft-delete + `enforcement-mode` 일괄 `role` 전환(레거시 `role_page_permissions` 존속 — V39 가 DROP 안 함).
- staging 에서 materialize row 수(비-MASTER·비-PARTNER 계정 × 템플릿 page) + 권한 parity 스냅샷 사전 검증 권고.

## 전제

- `role_page_permissions` 는 V39 가 DROP 하지 않고 DEPRECATED COMMENT 만 — arologis role-mode + role-form `/check` 가 의존하므로 **존속 필수**(Phase 2 까지 유지).
