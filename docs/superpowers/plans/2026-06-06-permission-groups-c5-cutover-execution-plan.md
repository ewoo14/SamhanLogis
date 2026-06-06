# 권한그룹 C5 최종 cutover 실행계획 (개발책임자 입회 세션, 2026-06-06)

> 개발책임자 결정(2026-06-06 원격 입회): **끝까지(제거+drop)** / FE 수신=**LoginResponse body 확장** / **accounts.role 이번 drop** / **C4-3 포함**.
> 게이트 방식: 각 PR 머지 전 Docker 풀스택 실QA 통과 필수, 실패 시 즉시 중단·롤백.
> DB 백업 확보: `backups/c5-cutover-pre-20260606-180731.sql` (pg_dumpall, 5.4MB, ASCII 검증).

## 0. 정찰 종합 (3-agent 전수, 2026-06-06)

### X-User-Role/JWT role 소비처 (제거 대상)
| 지점 | 위치 | 대체 |
|---|---|---|
| PermissionAspect isMasterBypass role 폴백 | shared/security PermissionAspect:264-274 | X-Is-System-Master 단독 (C4-3) |
| PermissionAspect PARTNER 거절 | PermissionAspect:145-150 | partnerCode 식별 기반 (X-Partner-Code/클레임) |
| PermissionAspect roleBasedEnforcement | PermissionAspect:233-245 | **유지** — arologis 전용(자체 JWT 가 X-User-Role 자가 주입, AROLOGIS_*) |
| HeaderAuthenticationFilter ×16 (서비스별 복붙) | 각 서비스 config | X-User-Id 단독 인증 + X-User-Groups authority |
| 게이트웨이 X-User-Role 주입 + getRole | JwtAuthenticationGatewayFilterFactory:120,147 | 제거 |
| 게이트웨이 logging-service allowedRoles [MASTER,MANAGER] | application.yml:123-127 | allowedGroups (빌트인 100,101) |
| 서비스간 RestClient X-User-Role: MASTER 주입 | InventoryClient:279-281 등 | 제거 (X-Internal-Token 이 /internal/ 인증 전담 — InternalTokenFilter 독립 확인됨) |
| SlipSalesAccessGuard canReadOutboundSales(role) | slip-service:68-72 | 빌트인 그룹 {100,101,102} ∩ X-User-Groups |
| arologis ArologisJwtFilter/JwtIssuer role | arologis 자체 JWT | **유지** (독립 운영 단위, AROLOGIS_* 비대상) |

### accounts.role 의존 (drop 대상)
- Account entity(@Enumerated role)·changeRole / AuthService.login(role 산출)·updateAccountRole(oldRole) / V1 컬럼+ix_accounts_role_active / V5 seed.
- provisioning 계약(RegisterRequest·CreateAccountInternalRequest·UpdateRoleInternalRequest·AuthClient)은 **Role 파라미터 유지** — HR 직무 의미. 수신 측이 컬럼 대신 빌트인 그룹 배속으로 처리.
- user-service role_snapshot = **유지(Option A)** — HR 직무 표현은 별도 도메인, 이번 비대상. RoleChangeHistory 유지.
- AdminUserController searchAdmin role 필터 → account_groups(빌트인) join 재작성.

### FE 잔존 (정찰)
- RoleGuard 사용 0(정의만) → 삭제. 표시 칩(AppLayout:1286)·UsersPage 라벨. 사이드바 role 배열 15 + AppLayout .includes 7 + client.ts PARTNER 1. mock(_resolveMockRole) + spec ~30 파일.

## 1. 아키텍처 결정 (이번 세션 컷라인)
- **인가 신원 = 그룹 UUID 집합(X-User-Groups/JWT groups) + X-Is-System-Master**. 인가 경로에서 role 완전 소멸.
- **직무(HR) 표현은 잔존**: role_snapshot·RoleChangeHistory·provisioning Role 파라미터 = 직무 개념(인가 아님). enum 물리제거는 후속 이니셔티브.
- **LoginResponse.role = 빌트인 그룹 역매핑 파생 라벨로 유지**(FE 3 클라이언트 호환·사이드바 배열 무중단) + `groups[{id,name,builtin}]` 추가. `BuiltinRoleGroupIds.fromGroupId` 역매핑 신설.
- **PARTNER 식별 = partnerCode 기반** (role 문자열 의존 제거). partner-auth JWT 클레임/게이트웨이 주입 경로는 구현 슬라이스에서 실측 후 정합.
- UUID 사용자 비공개: FE 는 그룹 **이름**만 렌더, UUID 렌더 금지([[feedback_uuid_no_user_visibility]]).

## 2. 슬라이스/게이트
| PR | 내용 | 게이트 |
|---|---|---|
| **PR-1 (C5-3)** | 소비처 그룹 기반 전환(role 폴백 병행=behavior-preserving): PermissionAspect PARTNER/슬립가드/게이트웨이 allowedGroups/필터 X-User-Id 단독 인증 + LoginResponse groups 추가 + FE AuthSnapshot.groups 수신 | Docker 실QA: 역할 매트릭스 기존 동등 + groups 수신 실증 |
| **PR-2 (C5-4)** | 제거: JWT role 클레임·게이트웨이 X-User-Role 주입·필터 role 의존·C4-3 폴백·RestClient role 주입 제거. LoginResponse.role=파생 전환. FE 사이드바/표시 그룹 파생 검증 | **전 서비스 재배포 + 전 역할 매트릭스 실QA** (MASTER/MANAGER/SALES/WAREHOUSE/ACCOUNTANT/PARTNER/INTERNAL/arologis) |
| **PR-3 (C5-5)** | accounts.role DROP(V마이그레이션: 인덱스→컬럼) + Account entity 정리 + login/updateAccountRole 그룹 파생 + searchAdmin join 재작성 + V5 seed 정리 | Docker 실QA: 로그인/직원관리/역할변경/신규계정 전 흐름 |
| 롤백 | PR 단위 revert + DB 백업 복원(`backups/`). PR-2 실패 시 직전 이미지 재배포 | — |

## 3. 검증 의무
각 PR: 전 14서비스 빌드+JUnit / dual review(Claude 5-team+Codex) 코멘트 게시 / Docker 풀스택 실QA 실 캡처([[feedback_no_fake_data_ever]]) / CI green. INTERNAL 경로(서비스간)·PARTNER 주문 흐름·arologis 로그인 必 포함.
