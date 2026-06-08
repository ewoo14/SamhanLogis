# arologis 백오피스 Phase B — 인사(HR) BE 개발 보고

> PR #426. spec: `docs/superpowers/specs/2026-06-08-arologis-desktop-backoffice-spec.md`. arologis-desktop = 아로로지스 행정직원 전용 백오피스(Samhan Public 축소판). 본 phase = **인사 BE** (FE 후속).

## 1. 범위
arologis-service 에 행정직원 인사 시스템 BE + auth-service 권한 grant 시드. 직원·부서·롤변경이력 + AdminUser 1:1 provisioning.

## 2. 설계 결정 (개발책임자 2026-06-08)
| # | 결정 |
|---|---|
| 직원↔계정 | **1:1 통합** — 직원 생성 시 AdminUser(로그인) 자동 provisioning, 퇴직 시 양쪽 비활성 |
| 롤 | **page-code 권한만** — 기존 `AROLOGIS_MASTER/MANAGER` 2롤 유지, 인사 접근은 `arologis.hr.*` 통제 |
| 이력 | **RoleChangeHistory MVP 포함** |
| 권한 grant | **중앙 auth-service 공유** + `arologis.*` 네임스페이스 (arologis.admin V10 컨벤션, `role_page_permissions` 시드, 중앙 로직 무변경) |

## 3. 구현
### 도메인 (arologis-service)
- `ArologisDepartment`(code/name/displayOrder) · `ArologisEmployee`(adminUserId 1:1, loginId, fullName, position, department FK, hireDate, terminationDate, email, phone) · `ArologisRoleChangeHistory`(previousRole→newRole, reason, **changedByLoginId**) — 전부 BaseEntity 7 audit + soft-delete.
### 서비스
- `ArologisEmployeeService`: 생성=AdminUser provisioning(BCrypt 임시pw, 평문 1회반환) + 1:1 연결(단일 @Transactional) / 수정 / 롤변경(이력 append, 동일롤 멱등, **AROLOGIS_MASTER 부여는 마스터 actor 한정**) / 퇴직(terminationDate+양쪽 soft-delete, 입사일 이전 차단) / 목록(부서 필터, 현직만). `ArologisDepartmentService`(목록/관리, 삭제 시 현직 배속자 가드 409).
### API
- `ArologisHrController` `/admin/arologis/hr/**` — page-code `arologis.hr.employees`/`arologis.hr.departments`. 응답 DTO UUID 비노출(loginId·부서명·changedByLoginId 만).
### Flyway
- arologis `V14`: 3 테이블 + partial unique(code/login_id/admin_user_id active) + FK + 인덱스 + 부서 seed(행정/배차/회계/운영).
- auth `V50`: arologis.hr.* → `role_page_permissions`(MASTER/MANAGER=V/E, 비HR 5롤 deny) + PageCode 카탈로그 2종.

## 4. 보안/정합
- **권한 해석 체인**: AROLOGIS_MASTER=Aspect bypass / AROLOGIS_MANAGER→MASTER/MANAGER 정규화 → V50 grant 매칭. 중앙 DynamicPermissionService 무변경(blast radius 0, `AuthFlywayV50SeedIT` 가 중앙 fallback·AROLOGIS_* seed 부재 단언).
- **권한 상승 차단**: AROLOGIS_MASTER 생성/승격은 actor=AROLOGIS_MASTER 한정(self-escalation 방지).
- **UUID 비공개**: 모든 HR 응답 비즈니스 식별자만. 임시 password BCrypt 해시 저장, 평문 생성응답 1회.

## 5. 검증
- `:services:arologis-service:test` + `:services:auth-service:test` BUILD SUCCESSFUL (로컬 Postgres IT). CI: arologis-ci.yml(전체 arologis test) + ci.yml(auth) green.
- dual review N=2: Claude 5-agent(UUID유출/부서가드/409/퇴직일/롤백) + Codex 5-section(권한상승 P1) cross-check → 통합 fix.
- ⏳ FE(EmployeesPage/DepartmentsPage) + Docker 실 QA = 후속.

## 6. 후속 (Phase C/A)
- Phase C: 간이 회계(수입/지출). Phase A: 권한 관리 UI. 잔여 seed: 실 부서명·간이 계정과목(개발책임자 제공).
