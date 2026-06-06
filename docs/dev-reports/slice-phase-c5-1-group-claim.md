# dev-report — Phase C5-1: 그룹 집합 전파 인프라 (additive)

> 2026-06-06. 개발책임자 "123 순서" ③ + 다중그룹 정책 결정(JWT/헤더 그룹 전파). PM 전권. C4(#407) 후.
> spec: `docs/superpowers/specs/2026-06-06-permission-groups-phase-c5-1-group-claim-design.md`

## 1. 무엇을 했나 (순수 additive, C4-1 패턴)
계정의 활성 그룹 집합을 JWT `groups` 클레임 + 게이트웨이 `X-User-Groups` 헤더로 전파. **소비처 0**(X-User-Role/role 클레임 유지) = behavior-preserving, 락아웃 0.
- **shared/common `JwtTokenProvider`**: `groups` 클레임(`CLAIM_GROUPS`) + 7-arg generate 오버로드(기존 2/5/6-arg 보존, backward compat) + `getGroups`(null→empty).
- **shared/common `HttpHeaderConstants`**: `USER_GROUPS_HEADER="X-User-Groups"`.
- **auth-service `AuthService.login`**: `accountGroupRepository.findByAccountIdAndIsDeletedFalse` → groupId comma-join → generate.
- **api-gateway**: `groups` 클레임 → `X-User-Groups` 헤더(빈 문자열도 주입, 일관).

## 2. 형식 / 안전
- claim `groups` = 그룹 UUID comma-join(빈값 시 미포함). 헤더 항상 전송.
- 소비처 0 — PermissionAspect/HeaderAuthenticationFilter/@PreAuthorize 미변경. X-User-Role 유지.
- backward compat: 기존 generate 시그니처 보존, 구토큰 getGroups empty 안전.
- 롤백 = 클레임/헤더 추가 revert(미소비 영향 0).

## 3. 검증
- JwtTokenProviderTest(groups 왕복+빈값+구토큰 compat+전클레임 동시), AuthServiceTest(login 그룹 comma-join generate 전달 verify), GatewayFilterTest(X-User-Groups 주입+기존 헤더 불변). **전부 0 fail**.
- **전 14서비스 compileJava+compileTestJava BUILD SUCCESSFUL**(shared 변경 무파괴).
- Docker 스팟체크: 로그인 JWT groups 클레임 + X-User-Groups 헤더 전파 + 기존 동작 불변.

## 4. 잔여 = C5-2 (개발책임자 입회 cutover, 폴백 없음 = 총 락아웃 위험)
- PermissionAspect/HeaderAuthenticationFilter/@PreAuthorize 가 그룹 집합 소비.
- X-User-Role / accounts.role / JWT role 클레임 제거.
- FE session.ts role 헬퍼·~86파일 그룹 기반 재설계.
- 전 서비스 동시 cutover(blue-green/feature flag) + DB 백업 + 롤백 + 개발책임자 입회. 계획서 §7.
