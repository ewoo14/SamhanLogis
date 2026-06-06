# dev-report — Phase C4: MASTER bypass 키 전환 (is_system_master, OR 폴백)

> 2026-06-06. 개발책임자 "123 순서" ②. PM 전권. C3(#405/#406) 후. 전 서비스 인증 핵심.
> spec: `docs/superpowers/specs/2026-06-06-permission-groups-phase-c4-system-master-claim-design.md`

## 1. 무엇을 했나 (additive + OR 폴백, 락아웃 0)
MASTER bypass 판정에 **is_system_master 그룹 멤버십 경로를 추가**. 기존 role 폴백 유지(교체 아님).
`isMasterBypass = (X-Is-System-Master=="true") OR (role=="MASTER") [OR roleBasedEnforcement AROLOGIS_MASTER]`.

- **shared/common `JwtTokenProvider`**: `isSystemMaster` 클레임(`CLAIM_IS_SYSTEM_MASTER`) + 6-arg generate 오버로드(기존 2/5-arg 보존, backward compat) + getter. `HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER="X-Is-System-Master"`.
- **auth-service `AuthService.login`**: `PermissionGroupRepository.existsByAccountIdAndSystemMasterTrue`(account_groups JOIN permission_groups, 양쪽 soft-delete) EXISTS 1쿼리 → generate 전달.
- **api-gateway `JwtAuthenticationGatewayFilterFactory`**: 클레임 → `X-Is-System-Master` 헤더 주입("true"/"false").
- **shared/security `PermissionAspect`**: `isMasterBypass(roleCode, isSystemMasterHeader)` — "true" OR 조건 + role 폴백 유지. extractHeader 재사용.

## 2. 안전 (락아웃 0)
- 헤더 파이프(JWT→게이트웨이→서비스) 깨져도 **role 폴백이 MASTER 보존**. 비-MASTER 는 systemMaster 그룹(100) 수동배속 가드 + C3a 불변식으로 isSystemMaster=true 불가.
- 롤백 = PermissionAspect OR 조건 revert(나머지는 미소비 클레임/헤더).
- backward compat: 기존 generate 시그니처 보존, isMasterBypass private(외부 영향 0).

## 3. 검증
- **단위/IT**: JwtTokenProviderTest 5(클레임 왕복+구토큰 compat), PermissionAspectTest 13(신규 4: isSystemMaster bypass·role 폴백·둘다없음 403), AuthServiceTest 8(신규 2: MASTER true/비-MASTER false), GatewayFilterFactoryTest 5(헤더 주입). **전부 0 fail**.
- **전 14서비스 `compileJava+compileTestJava` BUILD SUCCESSFUL**(shared 변경 광범위 영향 무파괴).
- 🔴 **Docker 풀스택 실QA**(전 서비스 인증 — 본 PR 진행): 게이트웨이 MASTER JWT → X-Is-System-Master=true 헤더 + bypass 200(헤더 경로) + 비-MASTER 403 + role 폴백 실증.

## 4. 잔여
- **C4-3**: role=="MASTER" 폴백 제거(헤더 경로 안정 실증 후).
- **C5**: accounts.role / X-User-Role 제거, JWT role 클레임 제거.
