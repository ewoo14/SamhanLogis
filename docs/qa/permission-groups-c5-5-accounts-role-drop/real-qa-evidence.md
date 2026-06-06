# C5-5 (PR-3) accounts.role 컬럼 DROP — 게이트 3 실 Docker QA 증빙

> 2026-06-06 개발책임자 입회 cutover 세션 **최종 게이트**. auth-service 재빌드/재배포(V46 DROP 마이그레이션 실적용, healthy) 후 실 캡처만. 목업 0 ([[feedback_no_fake_data_ever]]).
> DROP 직전 백업 `backups/c5-5-pre-drop-*.sql` 확보.

## 1. QA-1 — V46 DROP 실적용 ✅
실 DB 스키마 조회:
```
accounts.role 컬럼      → 부재 ✅ (ALTER TABLE DROP COLUMN 적용)
ix_accounts_role_active → 부재 ✅ (DROP INDEX 적용)
```

## 2. QA-2 — LoginResponse.role 빌트인 그룹 역매핑 파생 (컬럼 없이) ✅
accounts.role 컬럼 제거 후에도 5 역할 실 로그인 200 + role 필드가 **활성 빌트인 그룹에서 정확 파생**:
```
dev_master     → role="MASTER"     | groups=마스터
dev_manager    → role="MANAGER"    | groups=매니저
dev_sales      → role="SALES"      | groups=영업원
dev_warehouse  → role="WAREHOUSE"  | groups=창고원
dev_accountant → role="ACCOUNTANT" | groups=회계원
```
→ `BuiltinRoleGroupIds.fromGroupId` 역매핑으로 FE 표시 호환 유지. role 은 표시용, 인가는 groups/isSystemMaster 전담.

## 3. QA-3 — 인가 정상 (그룹 기반, role 컬럼 무관) ✅
| 계정 | 요청 | 실측 | 기대 |
|---|---|---|---|
| master | 권한그룹 관리 | **200** | 200 (isSystemMaster) |
| sales | 권한그룹 관리 | **403** | 403 |
| master | permissions/my | **200** | 200 |

## 4. QA-4/5 — 역할변경·그룹 동기화 (C3a 무결성) ✅
- 전 역할 그룹 파생 정확(QA-2) = `updateAccountRole`/`syncBuiltinRoleGroup`(C3a) 경로가 accounts.role 쓰기 없이 그룹 배속만으로 동작함을 간접 실증.
- **RoleGuard 동기화 = Testcontainers IT 213 green** (RoleGroupSyncIT: 역할변경 시 빌트인 그룹 swap·신규계정 초기 배속·수동그룹 보존 — 실 DB + V46 DROP 마이그레이션 적용 상태로 박제).

## 5. 락아웃 불변식 확인 ✅
login role 파생이 그룹 미매칭으로 빈 문자열을 반환해도 인증(X-User-Id)·인가(X-User-Groups/X-Is-System-Master)는 무영향 — role 은 순수 표시용. MASTER(group100) 로그인·인가 정상(QA-2/3).

## 6. 유지 항목 (인가 아님 — 본 PR 비대상)
- Role enum(common): provisioning Role 파라미터·BuiltinRoleGroupIds 매핑·arologis 자체 role.
- user-service role_snapshot·RoleChangeHistory: HR 직무 도메인.
- DynamicPermissionService role-mode "MASTER": 데이터 시맨틱(arologis roleBasedEnforcement).

## 6.5 dual review 적발·교정 (`f6f70244`)
- **P1 (Codex) updateAccountRole 다중 빌트인 그룹 stale**: `syncBuiltinRoleGroup` 이 oldRole 역산 단일 그룹 대신 **활성 빌트인 그룹 전부 ∩ BuiltinRoleGroupIds soft-delete 후 newRole 단일 배속**으로 강화. 신규 IT `updateAccountRole_multipleBuiltinGroups_allOldBuiltinGroupsCleaned`(MANAGER+SALES→WAREHOUSE, 잔존 빌트인 정확히 1개) + 정상 단일 그룹 behavior-preserving IT.
- **P1 (Claude) AuthController 레이어 위반**: Repository 직접 주입 제거 → `AuthService.getMeResponse(UUID)` 위임(@Transactional readOnly).
- **P2**: role 파생 3곳 → `BuiltinRoleGroupIds.deriveRoleName` 공통화(미배속 시 log.warn 추적, QA P1-c). listAccounts N+1 → `findByAccountIdInAndIsDeletedFalse` 일괄(1+1). seedAccount Javadoc.

## 6.6 정직 고지 (스크린샷·실 endpoint)
- 본 PR 은 **백엔드 전용**(DB 컬럼 DROP + 서비스 파생) — GUI 화면 변화 0. PR 본문 스크린샷은 #411·#413·#414·#415 와 동일하게 텍스트 원문 증빙으로 갈음(전례 일관, [[feedback_no_fake_data_ever]] "불가 시 정직 보고").
- registerWithId(신규계정)·updateAccountRole(역할변경) 실 흐름은 user-service EmployeeController 경유 internal 계약 — 본 게이트는 **RoleGroupSyncIT 실 Testcontainers IT**(신규 SALES/MASTER 등록 + 역할변경 + 다중 빌트인 정리)로 실 DB 검증. 게이트웨이 경유 E2E 는 PR-2 게이트 2 매트릭스(전 역할 로그인/인가)로 이미 실증.

## 7. 검증 요약
- 전 모듈 compileJava+compileTestJava + auth/user test green. auth-service IT 213 passed(실 Testcontainers).
- 롤백: PR revert + DB 백업 복원(`backups/c5-5-pre-drop-*.sql`).
