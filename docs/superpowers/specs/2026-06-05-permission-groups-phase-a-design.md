# 동적 권한그룹(Permission Groups) — Phase A 설계

> 2026-06-05. 개발책임자 결정 = 고정역할(enum) 폐기 → 사용자정의 **권한그룹** 체계.
> MASTER + 위임계정이 그룹을 생성·삭제하고 권한 매트릭스로 그룹별 권한 설정.
> 본 문서 = **Phase A(코어)**. 위임=Phase B, 고정역할 완전제거 마무리=Phase C(별도 spec).
> 관련: [[feedback_pm_permission_autonomy]], @PreAuthorize 마이그레이션 umbrella(D-PAM), [[feedback_preauth_migration_lessons]].

## 1. 목적 / 배경

현행: 권한이 **고정 역할 enum 10개**(`shared/common/.../Role.java`)에 종속. `role_page_permission_templates`(역할×페이지×7액션)→`account_page_permissions`(계정×페이지×7액션, 실 enforcement) 로 materialize. 권한 매트릭스 UI 는 **계정 단위** 편집만 가능, 그룹/역할 단위 편집 UI 없음, 새 역할 추가 불가.

목표: MASTER(및 위임계정)가 **권한그룹을 자유 생성/삭제**하고 **그룹 단위로 권한을 매트릭스 편집**, 계정을 그룹에 **다중 배속**. 기존 9개 역할은 시드 기본 그룹으로 이관해 무중단.

## 2. 확정된 설계 결정 (브레인스토밍 2026-06-05)

- **D-PG-01**: 고정역할 폐기, 동적 권한그룹으로 전환. **MASTER 만 빌트인**(삭제불가 시스템 슈퍼관리자, 전권 bypass, 그룹/위임 설정 주체). 나머지 9역할은 일반 그룹으로 이관(이후 수정/삭제 가능).
- **D-PG-02**: 계정 ↔ 그룹 = **M:N**. 계정 실권한 = 속한 그룹들의 **합집합**.
- **D-PG-03**: **개별 계정 override 가 그룹보다 우선**(최우선). 페이지 단위 — 개별 override 행이 있으면 그 페이지의 7액션을 완전 결정, 없으면 그룹 합집합. override 는 grant 뿐 아니라 **명시적 deny(그룹보다 더 제한)도 표현**.
- **D-PG-04**: **enforcement 경로 무변경(저위험)**. `account_page_permissions`(기존)를 **effective 캐시**로 유지하고, 그룹/배속/override 변경 시 `override(page) ?? union(groups)` 로 재materialize. `@RequirePermission`/`PermissionAspect`/`DynamicPermissionClient` 무수정.
- **D-PG-05**: Phase A 는 **위임(Phase B)·하드 @PreAuthorize(MASTER) 제거(Phase C)** 미포함. Phase A 동안 그룹/직원 관리 권한은 기존대로 MASTER(+ system.permission-admin) 가드 유지.

## 3. 데이터 모델 (auth-service, 신규)

```
permission_groups
  id UUID PK
  name VARCHAR(100)         -- 표시명(영업사원/창고사원/...). UNIQUE(active)
  description VARCHAR(255)
  is_builtin BOOLEAN        -- MASTER 만 true (삭제/이름변경 금지 가드)
  is_system_master BOOLEAN  -- MASTER 그룹 식별(bypass 연계)
  + BaseEntity 7 audit + soft delete

group_page_permissions
  id UUID PK
  group_id UUID FK -> permission_groups
  page_code VARCHAR(100)    -- PageCode enum
  can_view/can_create/can_update/can_delete/can_restore/can_download/can_print BOOLEAN
  UNIQUE(group_id, page_code) WHERE is_deleted=false
  + audit

account_groups            -- M:N 배속
  id UUID PK
  account_id UUID FK -> accounts
  group_id UUID FK -> permission_groups
  UNIQUE(account_id, group_id) WHERE is_deleted=false
  + audit

account_permission_overrides  -- 개별 계정 우선 층(현행 계정 매트릭스를 override 로 재정의)
  id UUID PK
  account_id UUID FK
  page_code VARCHAR(100)
  can_view/.../can_print BOOLEAN
  UNIQUE(account_id, page_code) WHERE is_deleted=false
  + audit
```

**기존 유지**: `account_page_permissions`(effective 캐시, enforcement read 대상) · `accounts.role`(과도기 호환 — 4. 참조) · `PageCode` enum(173).

**폐기 예정(과도기 보존)**: `role_page_permission_templates`(그룹 시드 후 read-only history).

## 4. 마이그레이션 (Flyway, auth-service)

1. **V42: 신규 4테이블 생성.** (현재 최대 = V41)
2. **V43: 9역할 → 기본 그룹 시드.** `role_page_permission_templates` 의 9 역할(MASTER 제외) 행을 `permission_groups`(name=Role enum 한글명: 매니저/영업원/창고원/회계원/재고원/배차담당자/기사/사원/개발자, is_builtin=false) + `group_page_permissions`(7액션 그대로) 로 복사. MASTER 그룹 1건(is_builtin=true, is_system_master=true, group_page_permissions 없음=bypass).
3. **V44: 기존 계정 → account_groups 배속.** 각 account 를 자기 `accounts.role` 에 대응하는 시드 그룹에 1건 배속(MASTER 계정 → MASTER 그룹).
4. **account_page_permissions 재계산**: 기존 행 유지(이미 role template 에서 materialize 된 상태와 동일) — 무중단. 이후 그룹/배속 변경 시에만 재materialize.
5. `accounts.role` 은 **과도기 보존**(JWT/X-User-Role/hasRole 잔존 호환). Phase C 에서 정리. **신규 계정/배속도 accounts.role 은 "대표 그룹" 1건으로 best-effort 유지**(다중그룹의 첫/주 그룹) — Phase C 까지 hasRole 호환.

> 🚨 정합성 가드(materialize): 시드 직후 `account_page_permissions` 가 `override ?? union(groups)` 결과와 동일해야 함(시드 검증 쿼리로 회귀 박제).

## 5. 백엔드 (auth-service)

- **도메인**: `PermissionGroup`, `GroupPagePermission`, `AccountGroup`, `AccountPermissionOverride` 엔티티 + repository.
- **서비스**:
  - `PermissionGroupService`: 그룹 CRUD(빌트인 삭제/개명 금지 가드, 이름 UNIQUE). **삭제 정책 = 배속 계정이 1건이라도 있으면 409 차단**(먼저 모든 계정을 재배속/해제해야 삭제 가능 — 고아 계정 방지). 빈 그룹만 soft delete.
  - `GroupPermissionService`: 그룹 매트릭스 조회/일괄 갱신 → 변경 시 **영향 계정 재materialize** 트리거.
  - `AccountGroupService`: 계정 배속 추가/제거(다중) → 재materialize.
  - `EffectivePermissionMaterializer`: `account_page_permissions` = 각 page 에 대해 `override(page)` 존재 시 그것, 없으면 `OR(group_page_permissions of account's groups)`. 단일 계정 / 그룹 영향 전체 계정 재계산 메서드.
  - 기존 `account_permission_overrides` 편집 = 현 계정 매트릭스 API 재사용(override 테이블로 타겟 변경).
- **컨트롤러**(PermissionAdminController 확장 또는 신규 `PermissionGroupController`), `@RequirePermission(page="system.permission-admin")` 가드(Phase A 는 MASTER+permission-admin):
  - `GET/POST/PUT/DELETE /auth/admin/permission-groups` (목록/생성/개명/삭제)
  - `GET/PUT /auth/admin/permission-groups/{id}/permissions` (그룹 매트릭스 조회/갱신)
  - `GET/POST/DELETE /auth/admin/accounts/{accountId}/groups` (계정 배속 조회/추가/제거)
  - 기존 계정 override 매트릭스 API 유지(`account_permission_overrides` 로 backend 전환)
- **신규 PageCode**: `admin.permission-groups`(그룹 관리 화면; Phase B 위임 대상). Phase A 는 MASTER+system.permission-admin 으로도 접근.

## 6. 프런트(desktop)

- **그룹 매트릭스 화면**: 현 account-select 매트릭스를 group-select 로 확장(그룹 드롭다운 → 그룹×페이지×7액션 편집, 저장 시 영향 안내). 기존 매트릭스 컴포넌트/액션 재사용([[feedback_inprocess_mock_principles]] 준수).
- **그룹 관리 화면 신규**: 그룹 목록 + 추가/개명/삭제(빌트인 잠금 표시) + 계정 배속(다중 선택) UI. UUID 비노출([[feedback_uuid_no_user_visibility]]) — 그룹명/계정 표시명만.
- **개별 계정 매트릭스(현행)**: "개별 권한(그룹보다 우선)" 화면으로 라벨/문구 정리, override 테이블 대상.
- 라우트/사이드바: "권한설정" 하위에 "권한그룹" 추가. PermissionGuard.

## 7. 테스트 (실 HTTP/실 데이터 의무)

- **BE IT(Testcontainers)**: 그룹 CRUD · 매트릭스 갱신→재materialize 검증 · M:N 합집합 · override 우선(deny 포함) · 빌트인 삭제 차단 · 시드 정합(account_page_permissions == override??union). false-green 방지 = 실 DB 상태 단언.
- **enforcement 회귀**: 그룹 권한 변경이 `@RequirePermission` 경로로 실제 200/403 반영(MockRestServiceServer/실HTTP, [[feedback_enforcement_real_http_test]]).
- **FE**: 그룹 매트릭스/관리/배속 Playwright(VITE_MOCK_MODE in-process mock, [[feedback_inprocess_mock_principles]]).
- **Docker 실 QA**([[feedback_qa_docker_real_test]], [[feedback_no_fake_data_ever]]): 실 스택에서 그룹 생성→권한부여→계정배속→해당 계정 실 gateway 200/403 + psql 그룹/배속/effective 실측.

## 8. 범위 밖 (후속 Phase)

- **Phase B(위임)**: `admin.permission-groups`/`admin.employees`/`system.permission-admin` 페이지권한을 MASTER 가 그룹/계정에 부여=위임, 회수 가능. 하드 `@PreAuthorize("hasRole('MASTER')")`(EmployeeController 등) 제거(D-PAM-06 위임 허용으로 갱신).
- **Phase C(고정역할 완전제거)**: 잔여 `hasRole`/`X-User-Role`/`accounts.role` 정리. 다중그룹을 헤더/토큰에 반영. @PreAuthorize 완전제거 마이그레이션 꼬리 흡수.

## 9. 리스크 / 완화

- **enforcement 회귀**: materialize 결과가 기존과 달라지면 운영 lockout. → 시드 직후 effective==기존 동치 검증 + 실HTTP 회귀.
- **그룹 삭제로 고아 계정**: 배속 존재 그룹 삭제 차단(재배속 강제).
- **다중그룹 합집합 성능**: 그룹/배속 변경 시에만 재계산(런타임 조회 아님) → enforcement read 는 단일 테이블 유지.
- **accounts.role 과도기**: 다중그룹인데 단일 role 컬럼 → "대표 그룹" best-effort + Phase C 까지 hasRole 잔존 호환. 신규 hasRole 추가 금지.
