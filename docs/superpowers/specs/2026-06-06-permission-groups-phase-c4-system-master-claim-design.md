# 동적 권한그룹 Phase C4 — MASTER bypass 키 전환 (is_system_master, OR 폴백 안전)

> 2026-06-06. 개발책임자 "123 순서" ②. PM 전권. C3(역할↔그룹 #405/#406) 후.
> 상위 계획: `plans/2026-06-06-permission-groups-phase-c4-c5-execution-plan.md`.

## 1. 목표
MASTER bypass 판정을 `role=="MASTER"` → **is_system_master 그룹 멤버십** 기반으로 전환. 단 **락아웃 0** 위해 기존 role 폴백을 **병행 유지**(OR) — 새 경로 추가일 뿐 교체 아님. role 폴백 제거는 C4-3(후속, 검증 후).

## 2. 안전 설계 (락아웃 0)
`isMasterBypass = (X-Is-System-Master 헤더 == "true") OR (X-User-Role == "MASTER")`.
- 헤더 파이프(JWT 클레임→게이트웨이 헤더)가 깨져도 **role 폴백이 MASTER 접근 보존** → 전 서비스 락아웃 불가.
- 비-MASTER 가 isSystemMaster=true 받을 수 없음: systemMaster 그룹(group 100)은 `rejectSystemGroupAssignment` 가드로 수동 배속 차단 + C3a 가 role==MASTER 일 때만 동기화. 불변식 `is_system_master 그룹 멤버십 ⟺ role==MASTER`(C3a).

## 3. scope (additive)
1. **shared/common `JwtTokenProvider`**: `generate(...)` 에 `isSystemMaster` boolean 추가 오버로드 + `CLAIM_IS_SYSTEM_MASTER="isSystemMaster"` + getter. 기존 오버로드 보존(backward compat).
2. **auth-service `AuthService.login`**: account 의 systemMaster 그룹 멤버십 산출(`PermissionGroupRepository.existsByAccountIdAndSystemMasterTrue` 신규 쿼리) → generate 에 전달.
3. **api-gateway `JwtAuthenticationGatewayFilterFactory`**: 클레임 → `X-Is-System-Master` 헤더 주입.
4. **shared/security `PermissionAspect.isMasterBypass`**: `X-Is-System-Master=="true"` OR 조건 추가(기존 role=="MASTER" 폴백 유지).
   - PermissionAspect 가 요청 헤더에서 X-Is-System-Master 추출(기존 X-User-Role 추출 패턴 재사용).
5. **PermissionGroupRepository**: `existsByAccountIdAndSystemMasterTrue(UUID accountId)`(account_groups JOIN permission_groups is_system_master, soft-delete 고려).

## 4. 비목표
- role=="MASTER" 폴백 제거 = C4-3(검증 후). accounts.role/X-User-Role 제거 = C5.
- 서비스별 HeaderAuthenticationFilter 변경 불필요(PermissionAspect 가 헤더 직접 읽음).

## 5. 위험 / 롤백
- additive + OR 폴백이라 behavior-preserving(락아웃 0). 최악(파이프 깨짐)에도 role 폴백.
- 롤백: PermissionAspect OR 조건 revert 만으로 원복(나머지는 미소비 클레임/헤더).
- isSystemMaster 산출 = 로그인 시 1쿼리(EXISTS, 저비용).

## 6. 검증 (전 서비스 인증 = 강화)
- BE: JwtTokenProviderTest(클레임), AuthServiceTest(login 산출), gateway 필터 테스트(헤더 주입), PermissionAspect 테스트(isSystemMaster OR bypass + role 폴백 양쪽). 전 14서비스 빌드+JUnit.
- 🔴 **Docker 풀스택 실QA 필수**([[feedback_qa_docker_real_test]], [[feedback_no_fake_data_ever]]): 게이트웨이 통해 MASTER JWT → X-Is-System-Master=true 헤더 주입 확인 + MASTER bypass 200(헤더 경로) + 비-MASTER 403 + (role 폴백 동작) 전 서비스 표본.
- dual review(Claude TM·Codex TM 각각)+PM 종합. CI green. DECISIONS D-PGC-10.
