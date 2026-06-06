# dev-report — Phase C5-4: Samhan Public 인가 와이어에서 role 완전 제거

> 2026-06-06. PR-2 (feat/permission-groups-c5-4-role-wire-removal). C5-3(#414, 그룹 OR 병행) 위에서 작업.
> 계획서: `docs/superpowers/plans/2026-06-06-permission-groups-c5-cutover-execution-plan.md`

## 1. 무엇을 했나

### A. PARTNER 식별 additive (partner-auth partnerCode claim)

- **`JwtTokenProvider.generateForPartner()`** 신규: partner-auth 전용 발급 — `partnerCode` claim 포함, `role` claim 없음.
- **`JwtTokenProvider.CLAIM_PARTNER_CODE`** 상수 + **`getPartnerCode()`** 추가.
- **`HttpHeaderConstants.IS_PARTNER_HEADER = "X-Is-Partner"`** 상수 추가.
- **`partner-auth-service PartnerAuthService.tryLogin()`**: `generate("PARTNER", ...)` → `generateForPartner(auth.getPartnerCode(), ...)` 전환.
- **`api-gateway JwtAuthenticationGatewayFilterFactory`**: `partnerCode` claim 존재 시 `X-Is-Partner: true` 헤더 주입.

### B. Role 와이어 제거

- **`JwtTokenProvider.generate()` 7-arg**: `role` 파라미터 시그니처 유지, JWT payload에서 `.claim("role", role)` 제거.
  `getRole()` → `@Deprecated` (arologis `roleBasedEnforcement` 전용).
- **`api-gateway`**: `X-User-Role` 헤더 주입 완전 제거.
  `allowedRoles` null-safe 처리 추가: `roleName == null` → 403 (C5-4 이후 Samhan JWT role 소멸 대응).
- **`api-gateway application.yml`**: logging-service 라우트 `allowedRoles: [MASTER, MANAGER]` → `allowedGroups: [MASTER UUID, MANAGER UUID]` 전환.
- **`PermissionAspect`**:
  - PARTNER 거절: `role=="PARTNER"` 폴백 제거 → `X-Is-Partner=true` 헤더 기반 판정.
  - `isMasterBypass()`: `role=="MASTER"` 폴백 제거 → `X-Is-System-Master=true` 단독 판정.
    (arologis `roleBasedEnforcement` 모드에서 `AROLOGIS_MASTER` bypass는 유지.)
- **`HeaderAuthenticationFilter`** (user-service, accounting-service): `userId 없이 role만 있으면 401` 분기 제거 (C5-4 이후 role 헤더 미전달로 의미 상실).
- **서비스 간 RestClient X-User-Role 제거**:
  - `slip-service InventoryClient`
  - `partner-order-service InventoryClient`, `SlipServiceClient`
  - `accounting-service EcountRemoteImportClient`
- **`SlipPurchaseAccessGuard`**: 그룹 UUID 기반 OR 경로 추가.
  `INBOUND_ALLOWED_GROUP_IDS = {MASTER, MANAGER, WAREHOUSE UUID}`.
  `SlipController`, `SlipQueryController` → 3-arg 오버로드 호출.

### C. 테스트 갱신

- **`JwtTokenProviderTest`**: `@SuppressWarnings("deprecation")`, role claim null 검증 전면 갱신, `generateForPartner` 왕복 검증 추가.
- **`JwtAuthenticationGatewayFilterFactoryTest`**: `X-User-Role` 미전파 검증, `X-Is-Partner` 주입 검증, allowedGroups 단독 통과 검증.
- **`PermissionAspectTest`**: C5-4 기반 전면 갱신 — `X-Is-Partner`, `X-Is-System-Master` 헤더 경로 검증, `role=MASTER` 폴백 제거 검증.
- **`PartnerAuthServiceTest`**: `generateForPartner` C5-4 검증 추가 — `partnerCode` claim 포함, `role` claim 없음.
- **`auth-service IT` 5개 파일**: MASTER bypass 테스트에 `X-Is-System-Master: true` 헤더 추가 (C5-4 폴백 제거 대응).

## 2. 설계 결정

### PARTNER 식별 설계 (A 단계 실측 근거)

partner-auth JWT와 Samhan JWT가 동일 HS256 시크릿(`SAMHAN_JWT_SECRET`)을 사용하므로 시크릿으로 구별 불가. 두 가지 옵션 검토:
1. `partnerCode` claim 추가 → gateway가 claim 유무로 `X-Is-Partner: true` 주입
2. partner-auth 별도 시크릿 분리

**선택: 옵션 1** — 단일 시크릿 유지로 운영 복잡도 0 증가. `partnerCode` claim 자체가 partner 신원 증거. gateway JWT 서명 검증 후 claim 유무 판정 → 신뢰 경계 확실.

### role=MASTER 폴백 제거 안전성

C5-4 이전: Samhan JWT `role` claim 존재 → gateway가 `X-User-Role: MASTER` 전파 → `isMasterBypass` role 폴백 통과.
C5-4 이후: JWT `role` claim 소멸 → `X-User-Role` 헤더 미전달 → `isMasterBypass` role 폴백이 임의 헤더 주입 bypass 위험만 남음.
락아웃 방지: `X-Is-System-Master: true` (gateway가 JWT `isSystemMaster` claim 기반 주입, C4부터 존재) → 신뢰 가능 경로로 충분.

## 3. 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `shared/common/.../http/HttpHeaderConstants.java` | `IS_PARTNER_HEADER` 상수 추가 |
| `shared/common/.../security/JwtTokenProvider.java` | `generateForPartner()`, `getPartnerCode()`, `getRole()` @Deprecated, role claim 제거 |
| `shared/common/.../security/JwtTokenProviderTest.java` | role null 검증, generateForPartner 왕복 검증 |
| `shared/security/.../permission/PermissionAspect.java` | X-Is-Partner 기반 PARTNER 거절, role=MASTER 폴백 제거 |
| `shared/security/.../permission/PermissionAspectTest.java` | C5-4 기반 전면 갱신 |
| `services/api-gateway/.../filter/JwtAuthenticationGatewayFilterFactory.java` | X-User-Role 제거, X-Is-Partner 주입, allowedRoles null-safe |
| `services/api-gateway/.../resources/application.yml` | logging-service allowedGroups 전환 |
| `services/api-gateway/.../filter/JwtAuthenticationGatewayFilterFactoryTest.java` | C5-4 갱신 |
| `services/partner-auth-service/.../service/PartnerAuthService.java` | generateForPartner 전환 |
| `services/partner-auth-service/.../service/PartnerAuthServiceTest.java` | C5-4 검증 추가 |
| `services/slip-service/.../client/InventoryClient.java` | X-User-Role 제거 |
| `services/slip-service/.../web/SlipPurchaseAccessGuard.java` | 그룹 OR 경로 추가 |
| `services/slip-service/.../web/SlipController.java` | 3-arg 가드 호출 |
| `services/slip-service/.../web/SlipQueryController.java` | 3-arg 가드 호출 |
| `services/partner-order-service/.../client/InventoryClient.java` | X-User-Role 제거 |
| `services/partner-order-service/.../client/SlipServiceClient.java` | X-User-Role 제거 |
| `services/accounting-service/.../client/EcountRemoteImportClient.java` | X-User-Role 제거 |
| `services/accounting-service/.../config/HeaderAuthenticationFilter.java` | userId-without-role 401 분기 제거 |
| `services/user-service/.../config/HeaderAuthenticationFilter.java` | 동일 |
| `services/auth-service/.../it/Auth*IT.java` × 5 | MASTER bypass X-Is-System-Master 추가 |

## 4. 검증 결과

| 모듈 | 결과 |
|------|------|
| `shared:common:test` | BUILD SUCCESSFUL |
| `shared:security:test` | BUILD SUCCESSFUL |
| `services:api-gateway:test` | BUILD SUCCESSFUL (17 tests) |
| `services:auth-service:test` | BUILD SUCCESSFUL (212 tests) |
| `services:partner-auth-service:test` | BUILD SUCCESSFUL |
| `services:slip-service:test` | BUILD SUCCESSFUL |
| `services:inventory-service:test` | BUILD SUCCESSFUL |
| `services:accounting-service:test (보고서 단위)` | BUILD SUCCESSFUL (IT는 Docker Testcontainers 환경 문제 — C5-4 무관) |
| `전체 compileJava + compileTestJava` | BUILD SUCCESSFUL (69 tasks) |

## 5. 커밋 해시

```
4ca64f65 feat: [C5-4] JWT role 클레임 제거 + partnerCode claim 신규
9945c99c feat: [C5-4] PermissionAspect PARTNER/MASTER bypass 전환
28c7083b feat: [C5-4] api-gateway X-User-Role 제거 + X-Is-Partner + logging-service
98a2d6ce feat: [C5-4] partner-auth-service generateForPartner 전환
419de224 feat: [C5-4] 서비스 간 RestClient X-User-Role 제거
de865275 feat: [C5-4] HeaderAuthenticationFilter 401 분기 제거
ddf18fee feat: [C5-4] SlipPurchaseAccessGuard 그룹 OR 경로 추가
562441a0 test: [C5-4] auth-service IT MASTER bypass X-Is-System-Master 추가
```
