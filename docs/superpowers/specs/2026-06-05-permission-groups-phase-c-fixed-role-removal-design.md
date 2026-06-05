# 동적 권한그룹 Phase C — 고정역할 완전제거 설계 (최고위험, 다중 슬라이스)

> 2026-06-05. 개발책임자 "고정역할은 없어" 완성 단계. PM 전권([[feedback_pm_permission_autonomy]]).
> Phase A(그룹 코어 #396) + Phase B(위임 #398) 완료 후. **본 단계는 전 서비스·인증·DB 에 걸친 최고위험 → 원자적 불가, 슬라이스 순차 + 슬라이스마다 독립 머지/실QA**.

## 1. 현황 (Phase A/B 후 enum 잔존 지점)
`shared/common/.../security/Role.java`(enum 10) 가 아직:
- `accounts.role`(컬럼, 모든 계정) + JWT 클레임 → `X-User-Role` 헤더(전 서비스)
- `PermissionAspect.isMasterBypass()` = roleCode=="MASTER" (시스템 안전장치)
- 잔여 `@PreAuthorize("hasRole(...)")`: INTERNAL 컨트롤러(서비스간, 사용자 JWT 없음 — **유지 대상**) + 비-INTERNAL(dc-config DcConfigImportController, arologis 비-Internal, slip SlipSalesQueryController 등 — 전환 대상)
- FE RoleGuard(admin-hr 대표실, accounting ROLES 등)
- user EmployeeController.updateRole(역할 부여 = 그룹 배속으로 대체 필요), role_snapshot, findByRole

## 2. 목표 / 비목표
- **목표**: 고정 9역할(MASTER 제외)을 코드/JWT 의존에서 제거 → 권한그룹 멤버십이 단일 신원. 사용자 권한 = 그룹(이미 Phase A/B 동작).
- **MASTER 는 빌트인 유지**(D-PG-01) — bypass 키. 단 role 문자열 의존 → "system_master 그룹 멤버십" 또는 전용 클레임으로 전환 검토.
- **비목표(YAGNI)**: INTERNAL 컨트롤러 hasRole(서비스간 토큰, 사용자 role 아님)은 유지.

## 3. 🚨 위험 = 전 서비스 인증 락아웃
- `X-User-Role` 제거/변경은 모든 서비스의 HeaderAuthenticationFilter + @PreAuthorize + PermissionAspect 에 영향. 한 번에 바꾸면 전 서비스 401/403.
- `accounts.role` 제거는 로그인·JWT 발급·계정조회 전반.
- isMasterBypass 키 변경은 모든 권한검사.
→ **반드시 슬라이스별 + behavior-preserving + 실 HTTP 회귀 + Docker 실QA + 슬라이스마다 독립 머지**.

## 4. 슬라이스 분해 (순서 = 저위험→고위험)
- **C1 — 잔여 비-INTERNAL hasRole → @RequirePermission**(서비스별): dc-config·slip SlipSalesQuery·arologis 비-Internal 등. 각 서비스 = page-code 추가 + seed(그룹) + @RequirePermission 전환 + 하드게이트 제거. (umbrella "@RequirePermission 미병행 서비스" 흡수.) 독립 슬라이스 각각. **저위험**(서비스 국소).
- **C2 — FE RoleGuard → PermissionGuard**(화면별): admin-hr 대표실 가드는 부서(@RequireDepartment) 기반 유지 검토. accounting/기타 ROLES RoleGuard → 권한 기반. 화면별 슬라이스.
- **C3 — 역할부여 UX → 그룹배속 일원화**: EmployeeController.updateRole(단일 role 변경) → 계정 그룹 배속/해제로 대체. 직원 생성 시 그룹 선택. role_snapshot → 그룹 스냅샷. **중위험**(인사 흐름).
- **C4 — MASTER bypass 키 전환**: isMasterBypass(role=="MASTER") → is_system_master 그룹 멤버십(또는 전용 토큰 클레임). 전 서비스 PermissionAspect 영향. **고위험** — 단독 슬라이스 + 전 서비스 실QA.
- **C5 — accounts.role / X-User-Role 제거**: JWT 클레임을 그룹 기반으로, accounts.role 컬럼 deprecate→제거, HeaderAuthenticationFilter 정리. **최고위험** — 최종, 전 서비스 동시 실QA + 롤백 플랜.

## 5. 슬라이스 공통 규칙
- behavior-preserving + 실 HTTP 회귀([[feedback_enforcement_real_http_test]]) + Docker 실QA([[feedback_qa_docker_real_test]]) + dual review + N=2.
- 각 슬라이스 독립 머지(전 서비스 동시 변경 금지, C4/C5 제외).
- seed 선배포(D-PAM-04). MASTER lockout 가드.
- 롤백 가능성 확보(특히 C4/C5).

## 6. 권고 (PM 판단)
C1~C2 는 저위험 점진 가능. **C3~C5 는 전 서비스 인증 핵심**이라 집중 세션 + 단계별 실QA 필수. 한 세션에 C 전체 강행 금지(락아웃 리스크). 기능 목표(동적 그룹/위임)는 Phase A/B 로 이미 달성 — C 는 "코드 정리/enum 물리제거"로, 업무 기능 추가 아님. 우선순위는 개발책임자/PM 협의로 조절.
