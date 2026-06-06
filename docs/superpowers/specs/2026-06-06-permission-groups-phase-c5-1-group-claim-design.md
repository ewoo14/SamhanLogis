# 동적 권한그룹 Phase C5-1 — 그룹 집합 전파 인프라 (additive)

> 2026-06-06. 개발책임자 "123 순서" ③ + 다중그룹 정책 결정(**JWT/헤더 그룹 집합 전파**). PM 전권.
> 상위 계획: `plans/2026-06-06-...-c4-c5-execution-plan.md` §7. C4(#407) 후.

## 1. 결정 (개발책임자, 2026-06-06)
C5 다중그룹 표현 = **JWT 클레임 + X-User-Groups 헤더로 그룹 집합 전파**(PermissionAspect/FE 가 그룹 집합으로 재계산). 본 슬라이스(C5-1)는 그 **인프라를 additive 로 부설**(아무도 소비 안 함 = behavior-preserving). 실제 소비/X-User-Role 제거 = C5-2(개발책임자 입회 cutover).

## 2. scope (additive, C4-1 패턴)
1. **auth-service `AuthService.login`**: 계정의 활성 그룹 ID 집합 조회(account_groups, soft-delete 제외) → JWT 전달. (`AccountGroupRepository.findByAccountIdAndIsDeletedFalse` 재사용 → groupId 목록.)
2. **shared/common `JwtTokenProvider`**: `groups` 클레임(List<String> 또는 comma-join) + 7-arg generate 오버로드(기존 2/5/6-arg **보존**, backward compat) + getter.
3. **api-gateway `JwtAuthenticationGatewayFilterFactory`**: `groups` 클레임 → `X-User-Groups` 헤더 주입(comma-join). `HttpHeaderConstants.USER_GROUPS_HEADER`.
4. **소비처 0**: 전 서비스 필터/PermissionAspect 미변경(unknown 헤더 무시). behavior 변화 0.

## 3. 안전
- 순수 additive(클레임/헤더 추가만). X-User-Role/role 클레임 **유지**(C5-2 까지). 락아웃 0.
- 롤백 = 클레임/헤더 추가 revert(미소비라 영향 0).
- backward compat: 기존 generate 시그니처 보존. 구토큰 groups 클레임 부재 → null/empty 안전.

## 4. 비목표 (= C5-2, 개발책임자 입회)
- PermissionAspect/HeaderAuthenticationFilter/@PreAuthorize 가 그룹 소비.
- X-User-Role / accounts.role / JWT role 클레임 제거.
- FE session.ts role 헬퍼·~86파일 그룹 기반 재설계.

## 5. 검증
- BE: JwtTokenProviderTest(groups 클레임 왕복+구토큰 compat), AuthServiceTest(login 그룹 집합 산출), gateway 필터 테스트(X-User-Groups 주입). 전 14서비스 compile+test.
- Docker 실QA: MASTER/비-MASTER 로그인 JWT 에 groups 클레임 + 게이트웨이 X-User-Groups 헤더 전파 확인(소비 없음 = 기존 동작 불변 동시 확인).
- dual review(Claude TM·Codex TM 각각)+PM 종합. CI green. DECISIONS D-PGC-11.
