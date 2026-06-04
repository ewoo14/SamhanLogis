# M1 : `@RequireDepartment` 인프라 + groupware 파일럿 — 설계 (Spec)

- 작성일: 2026-06-04
- 슬라이스: @PreAuthorize 완전제거 마이그레이션 **M1**(인프라 + 파일럿). umbrella: `2026-06-04-preauthorize-full-migration-umbrella-design.md`(#381).
- 성격: shared:security 신규 어노테이션+AOP + groupware 파일럿 적용. behavior-preserving.

---

## 0. umbrella scope 정정 (verify-first 결과, 2026-06-04)

umbrella 의 "129/131"은 javadoc 멘션 포함 부정확. **실제 @PreAuthorize 어노테이션 = 94건**:

| 분류 | 수 | 처리 |
|---|---|---|
| **Internal 컨트롤러** (`*InternalController`, 서비스간 X-Internal-Token, 사용자 JWT 없음) | ~34 | **유지** — @RequirePermission 불가(사용자 컨텍스트 부재). 별도 선택적 정리(hasRole('MASTER')→INTERNAL) |
| **`@hr.isExecutiveOffice()` 부서 게이트** (대부분 @RequirePermission 병행) | ~25 | **`@RequireDepartment` 로 전환**(본 M1 인프라) |
| **순수 role guard** (user-facing hasRole/hasAnyRole/isAuthenticated) | ~35 | @RequirePermission 전환 / 중복 @PreAuthorize 제거 (M2~) |
| INTERNAL(hasRole('INTERNAL')) | 2 | 유지 |

→ 진짜 전환 대상 ≈ 60(부서 25 + role 35). M1 은 그중 **부서 게이트 인프라**를 먼저 세운다(25건이 의존).

## 1. 결정 (개발책임자 2026-06-04)

`@hr.isExecutiveOffice()` 부서 게이트 보존 = **전용 어노테이션 `@RequireDepartment` 신설**. `@PreAuthorize` 완전제거 + 부서제약 명시 보존(behavior-preserving).

## 2. 인프라 설계 (shared:security)

기존 `permission/{RequirePermission, PermissionAspect}` 미러:

- **`@RequireDepartment(Department.EXECUTIVE_OFFICE)`** 어노테이션 (`shared/security/.../department/RequireDepartment.java`). `Department` enum(EXECUTIVE_OFFICE 우선, 확장 여지).
- **`DepartmentAspect`** (`@Around` on `@RequireDepartment`) — `HrAuthorizationHelper.isExecutiveOffice()` 호출, 위반 시 403(기존 @PreAuthorize 거부와 동일 의미). `PermissionAspect` 와 동일 빈 주입·예외 규약.
  - `HrAuthorizationHelper`(`@Bean("hr")`, InternalSecurityAutoConfiguration)는 기존 `@hr.isExecutiveOffice()` SpEL 이 호출하던 그 빈 → **동일 판정 로직 재사용**(behavior 동일 보장).
- AutoConfiguration 등록(`InternalSecurityAutoConfiguration` 또는 동등) — 기존 PermissionAspect 와 같은 방식으로 빈 노출.
- **AOP 순서**: `@RequireDepartment` + `@RequirePermission` 공존 endpoint 다수 → 두 aspect 모두 발동(AND 의미, 기존 @PreAuthorize AND @RequirePermission 와 동일). order 충돌 없도록 정합.

## 3. groupware 파일럿 적용

`GroupwareAdminController` 3건(`/approvals` POST·`/approvals/{id}/approve` PUT·`/approvals/{id}/reject` PUT): 현재 `@PreAuthorize("@hr.isExecutiveOffice()") + @RequirePermission(messenger.admin, ...)` 이중.
→ `@PreAuthorize` 제거 + `@RequireDepartment(EXECUTIVE_OFFICE)` 추가. `@RequirePermission` 유지. **role/부서 판정 동일 유지**.

## 4. 🚨 실 HTTP 회귀 테스트 (의무 — [[feedback_enforcement_real_http_test]])

기존 `GroupwarePermissionControllerIT`(`@Bean("hr")` override 패턴) 확장:
- **대표실 계정** + messenger.admin 권한 → 200.
- **비-대표실 계정** + messenger.admin 권한 → **403**(부서 게이트 동작 실증 — `@RequireDepartment` 가 @PreAuthorize 와 동일 차단).
- **대표실** + messenger.admin **무권한** → 403(@RequirePermission 동작).
- `@MockBean` 으로 우회 금지 — `@Bean("hr")` 실 판정 + 권한은 MockRestServiceServer/실 DynamicPermissionClient 경로.
- shared:security 단위 테스트: `DepartmentAspectTest`(PermissionAspectTest 미러) — 대표실/비-대표실 분기.

## 5. behavior-preserving 검증

- 전환 전후 동일: (대표실 AND messenger.admin) → 허용 / 그 외 → 403. `@RequireDepartment` 가 `@hr.isExecutiveOffice()` 와 **동일 빈·동일 판정**이므로 보장. PR 본문에 "전환 전 @PreAuthorize 의미 = 전환 후 @RequireDepartment 의미" 1:1 명시.

## 6. 워크플로우 & 검증

- Codex 구현([[feedback_codex_implements_claude_reviews]]) / Claude commit 대행. dual 5-agent N=2([[feedback_cycle_n2_mandatory]]) — **aspect 버그 = 25 endpoint widening** 이므로 BE/QA cross-check 집중.
- CI green(skipped=0) + **Docker 실 QA**([[feedback_qa_docker_real_test]]): 실 게이트웨이+JWT — 대표실/비-대표실 계정으로 groupware approvals 200/403 실 적중.
- 조기 PR([[feedback_open_pr_early]]).

## 7. 완료 기준

1. `@RequireDepartment`+`DepartmentAspect`+AutoConfig+단위테스트 shared:security 신설.
2. groupware 3 endpoint `@PreAuthorize("@hr.isExecutiveOffice()")` → `@RequireDepartment(EXECUTIVE_OFFICE)`, `@RequirePermission` 유지.
3. 실 HTTP 회귀: 대표실/비-대표실 × 권한유무 매트릭스 200/403 실증(@MockBean 금지).
4. behavior-preserving(전후 동일 판정) PR 본문 명시.
5. CI green + Docker 실 QA. dev-report + DECISIONS(D-PAM-05 @RequireDepartment 인프라).

## 8. 위험 & 완화

| 위험 | 완화 |
|---|---|
| DepartmentAspect 버그 → 25 endpoint widening | dual N=2 BE/QA cross-check + 실 HTTP 비-대표실 403 단언 + 단위테스트 |
| 두 aspect(권한+부서) 순서/공존 오류 | 기존 PermissionAspect 와 동일 규약·order 정합, 공존 endpoint IT |
| HrAuthorizationHelper 판정 차이 | **동일 빈 재사용**(SpEL `@hr` 가 쓰던 그 빈) → 판정 동일 보장 |
| 후속 24건 일괄 적용 시 누락 | M1 = groupware 파일럿만, 나머지 부서게이트는 M-dept 후속(인프라 검증 후) |
