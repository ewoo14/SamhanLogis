# 동적 권한그룹 Phase B — 인사/권한 관리 위임 설계

> 2026-06-05. 개발책임자 요청 "해당 인사권한도 마스터가 다른 사람에게 위임할지 선택" + "마스터의 인사권한을 받은 계정이 (그룹/권한) 설정". PM 자율진행([[feedback_pm_permission_autonomy]]).
> Phase A(권한그룹 코어, #396) 후속. Phase C(고정역할 완전제거)는 별도.

## 1. 목적
MASTER 가 **관리 권한(권한설정·권한그룹·인사 역할관리)을 다른 그룹/계정에 위임**(부여/회수 선택)할 수 있게 한다. 위임받은 계정은 MASTER 없이도 해당 관리 작업 수행.

## 2. 핵심 결정 (D-PB)
- **D-PB-01 위임 메커니즘 = 페이지 권한 부여** (별도 위임 엔티티 없음). MASTER 가 "관리 page-code" 를 그룹/계정에 grant = 위임, revoke = 회수. Phase A 의 매트릭스/그룹 인프라 재사용. "위임 선택" = 부여 토글.
- **D-PB-02 관리 page-code (위임 대상 권위)**:
  - `system.permission-admin` (권한설정 + 권한그룹 관리) — 이미 존재, MASTER-only seed, 하드게이트 없음 → **즉시 위임 가능**.
  - `admin.permission-groups` (Phase A 추가) — 권한그룹 화면.
  - **신규 `hr.role-management`** (인사 고위험: 역할변경/퇴사) — `admin.employees` 에서 **분리**. 이유: 기존 `admin.employees UPDATE` 는 일반 직원정보 수정(MANAGER 사용)과 공유되어, 분리 없이 하드게이트만 풀면 MANAGER 가 역할변경까지 widening. 분리하면 일반 직원관리(MANAGER)와 역할변경(MASTER/위임자) 독립 제어.
- **D-PB-03 하드 게이트 제거**: `EmployeeController.updateRole/terminate` 의 `@PreAuthorize("hasRole('MASTER')")` 제거 → `@RequirePermission(page="hr.role-management", action=UPDATE/DELETE)` 단일 가드. D-PAM-06(유지) → **위임 허용으로 갱신**.
- **D-PB-04 seed**: `hr.role-management` = **MASTER-only**(기본). 위임 전엔 MASTER 만. `admin.employees` 는 불변(MANAGER 일반 직원관리 유지). behavior-preserving(현재 updateRole 은 MASTER-only 와 동일).
- **D-PB-05 위임 화면**: **MASTER 전용** "권한 위임" 화면. 그룹/계정 선택 → 위임할 관리 권위(권한설정 / 인사 역할관리 / 권한그룹) 토글(grant/revoke) + 확인. 한국어 라벨. 내부 = 해당 page-code grant/revoke.

## 3. ✅ 정책 결정 (개발책임자 2026-06-05) = 옵션 A: 위임은 MASTER 전용
위임받은 계정이 `system.permission-admin`(권한 매트릭스 편집)을 가지면 **임의 계정의 임의 권한을 편집** 가능 = 자기 자신에게 전권 부여(self-escalation) 또는 새 위임 생성 가능. 봉쇄 수준 결정:
- (A) **위임 부여 자체는 MASTER 전용**(권장): "권한 위임" 화면 + 관리 page-code(`system.permission-admin`/`hr.role-management`/`admin.permission-groups`) 를 **매트릭스에서 grant 하는 행위**는 MASTER bypass 로만. 위임자는 위임받은 범위 내 운영만(타인에게 재위임/관리권위 부여 불가). → 위임 화면 및 "관리 page-code 를 부여하는 매트릭스 편집"에 별도 가드(`isMasterBypass`).
- (B) 위임자도 재위임 가능(신뢰 완전 이양) — 단순하나 권한 확산 위험.
→ **확정 = (A)** (개발책임자). 위임은 MASTER 의 명시 행위로만 발생, 위임자는 자기 상승/재위임 불가.

**구현**: 매트릭스 갱신 서비스(updateGroupMatrix / updateAccountMatrix / bulk)에서 행의 page_code 가 **관리 page-code 집합**(`system.permission-admin`, `hr.role-management`, `admin.permission-groups`)에 속하면 **caller 가 MASTER(isMasterBypass)일 때만 허용, 아니면 403**. caller MASTER 여부 = X-User-Role 헤더/SecurityContext. "권한 위임" 화면/엔드포인트도 MASTER 전용. → 위임자는 일반 운영 page 만 편집 가능, 관리 권위 부여 불가.

## 4. 구현 범위
- **BE(auth/user)**: PageCode `hr.role-management` 추가 + seed(MASTER-only). EmployeeController updateRole/terminate → @RequirePermission(hr.role-management) + 하드게이트 제거. 위임 부여/회수 API(또는 기존 그룹/계정 매트릭스 재사용 + 관리 page-code grant 가드). D-PB-03 §3(A) 가드: 관리 page-code 를 grant 하는 경로는 MASTER bypass 전용.
- **FE(desktop)**: "권한 위임" 화면(MASTER 전용) — 그룹/계정 선택 + 관리권위 토글. 위임 현황 표시.
- **마이그레이션**: V45 hr.role-management page + MASTER-only seed (role_page_permission_templates + group_page_permissions(MASTER 그룹) + 필요시 account materialize). 단 MASTER 는 bypass 라 account materialize 불필요 — page-code 등록 + 위임 시 grant.
- **IT/QA**: 위임 전 비-MASTER 403, MASTER 가 위임 후 위임자 200(실 HTTP), 위임 회수 후 403, 위임자 자기상승 차단(§3A), hr.role-management 분리로 MANAGER 일반 직원관리 유지/역할변경 차단. Docker 실서버 위임 사이클 실증.

## 5. 범위 밖
- Phase C(고정역할 완전제거): enum/accounts.role/X-User-Role/hasRole 잔여 정리, 다중그룹 토큰 반영.
- 시간제한 위임(만료)·위임 감사로그: 후속(YAGNI — 현재 grant/revoke 로 충분).
