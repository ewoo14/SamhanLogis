# M-dept : 잔여 부서게이트 22건 → `@RequireDepartment` — 설계 (Spec)

- 작성일: 2026-06-04
- 슬라이스: @PreAuthorize 완전제거 마이그레이션 **M-dept**. M1(#382) `@RequireDepartment` 인프라 재사용.
- 성격: behavior-preserving 전환. M1 패턴 순수 복제(4 서비스).
- 근거: [[feedback_preauth_migration_lessons]] / [[feedback_enforcement_real_http_test]]

---

## 1. 대상 (verify, 2026-06-04, 22건 / 4서비스)

| 서비스 | 컨트롤러 | 부서게이트 | @RequirePermission 병행 | 비고 |
|---|---|---|---|---|
| user | AdminUserController | 9 | 9/9 | 전부 순수 `@hr.isExecutiveOffice()` |
| partner | PartnerAdminController | 6 | (11 RP 중 6) | 순수 |
| inventory | WarehouseController | 6 | (11 RP 중 6) | 순수 |
| dc-config | DcConfigImportController | 1 | 1/1 | **복합** `@hr.isExecutiveOffice() and hasRole('MASTER')` |

- **21 순수** → `@RequireDepartment(EXECUTIVE_OFFICE)` 직행(권한 @RequirePermission 유지).
- **1 복합(dc-config import)** → `@RequireDepartment(EXECUTIVE_OFFICE)` + **`hasRole('MASTER')` 보존 검증**: dc-config.import page-code 가 auth seed 에서 MASTER-only 면 기존 `@RequirePermission(dc-config.import, CREATE)` 가 이미 MASTER 강제 → @RequireDepartment+@RequirePermission 로 behavior-preserving. **만약 dc-config.import 가 비-MASTER 에도 grant 되면 widening** → 그 경우 별도 처리(보고).

## 2. 변경 (서비스별, M1 groupware 패턴 동일)

각 서비스:
1. 컨트롤러: `@PreAuthorize("@hr.isExecutiveOffice()")` → `@RequireDepartment(Department.EXECUTIVE_OFFICE)`. (dc-config: 복합→@RequireDepartment + 권한 MASTER 보존 확인.) 미사용 `@PreAuthorize` import 제거.
2. main `application.yml`: `samhan.security.department.enabled: true` (M1 opt-in 필수 — 미설정 시 부서게이트 무동작 + [[feedback_preauth_migration_lessons]] §2 빈격리).
3. `*PermissionControllerIT`(기존, `@Bean("hr")` 패턴): 부서게이트 endpoint 에 **실 HTTP 매트릭스 추가** — 대표실+권한→2xx / **비대표실+권한→403(부서 deny)** / 대표실+무권한→403(권한 deny). IT `@WebMvcTest(properties)` 또는 @SpringBootTest config 에 `enabled=true` 추가. 권한 차원은 기존 IT 방식 유지(계약 불변 → @MockBean 적절, [[feedback_preauth_migration_lessons]] §3).

## 3. behavior-preserving

`@RequireDepartment` = `HrAuthorizationHelper` 동일 빈(M1) → `@hr.isExecutiveOffice()` 와 판정 동일. 전환 전 `(대표실 AND 권한[AND MASTER for dc-config])` = 전환 후 동일. widening 0.

## 4. 워크플로우 & 검증

- Codex 구현 / Claude commit. dual N=2(behavior-preserving·dc-config MASTER 보존·opt-in 정확성 집중). **로컬 실 실행 검증 의무**(정적 리뷰 APPROVE ≠ 통과 — M1 교훈). CI green + (가능시) Docker 실 QA.
- 각 서비스 IT 로컬 Docker 실행 green 확인.

## 5. 완료 기준

1. 22 부서게이트 `@RequireDepartment` 전환, `@PreAuthorize` 0(4 컨트롤러).
2. 4 서비스 opt-in `enabled: true`.
3. 4 IT 부서게이트 실 HTTP 매트릭스(비대표실 403 실증) green.
4. dc-config MASTER 보존 확인(seed 교차).
5. behavior-preserving PR 명시 + CI green. dev-report + DECISIONS.

## 6. 위험 & 완화

| 위험 | 완화 |
|---|---|
| opt-in 누락 → 부서게이트 무동작/빈격리 회귀 | 4 서비스 모두 enabled=true + IT 매트릭스로 실증([[feedback_preauth_migration_lessons]]) |
| dc-config hasRole('MASTER') 소실 widening | seed 교차(dc-config.import MASTER-only 확인), 아니면 별도 처리 |
| IT 미실행 false-green | 로컬 Docker 4 IT 실 실행 green 확인(M1 교훈) |
