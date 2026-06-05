---
name: preauth-migration-lessons
description: @PreAuthorize 완전제거 마이그레이션 — 실 scope 94건(Internal 34 유지)·@RequireDepartment opt-in 필수·CI 실행이 정적리뷰 false-green 차단 (M1 #382 회고)
metadata:
  type: feedback
---

# @PreAuthorize 완전제거 마이그레이션 교훈 (M1 #382 회고, 2026-06-04)

> umbrella: `docs/superpowers/specs/2026-06-04-preauthorize-full-migration-umbrella-design.md`. 개발책임자 결정: 전부 전환(D-PAM-01), INTERNAL 2 유지.

**Why:** M1(인프라 파일럿)에서 scope·설계·검증의 함정 3가지가 드러남. M2~M5 fan-out 에 직결.

**How to apply:**

## 1. 실 scope = 어노테이션 94건 (131 아님)
- `grep -rE "@PreAuthorize"` 는 **javadoc 멘션(`{@code @PreAuthorize}`) 포함** → 부풀려짐. 실 카운트는 `grep -rnE "^\s*@PreAuthorize\("`.
- 94 = **Internal 컨트롤러 ~34(유지)** + 부서게이트 `@hr.isExecutiveOffice()` ~25 + 순수 role ~35.
- **`*InternalController`(서비스간 X-Internal-Token, 사용자 JWT 없음)는 @RequirePermission 전환 불가**(사용자 컨텍스트 부재) → 유지. accounting/partner-order/product 는 실 어노 0(전부 javadoc).

## 2. 부서게이트 = `@RequireDepartment` 전용 어노테이션 (개발책임자 결정)
- `@PreAuthorize("@hr.isExecutiveOffice()")` 단순 삭제 시 **보안 widening**(부서제약 소실). → `@RequireDepartment(EXECUTIVE_OFFICE)` + `DepartmentAspect`(shared:security). `HrAuthorizationHelper` **동일 빈 재사용** → 판정 byte-identical(behavior-preserving 보장).
- **🚨 DepartmentAspect 는 반드시 opt-in**: `@ConditionalOnProperty(samhan.security.department.enabled=true)` 로 gate. @RequireDepartment 쓰는 서비스만 main `application.yml` + IT properties 에 `enabled: true` 설정. **미적용 시 빈 존재만으로 무관 서비스(accounting) CI 회귀**(250행 분할 excel 500 — Spring 컨텍스트 부작용, 로컬 무재현·CI 결정적). PermissionAspect 와 동일하게 **pointcut 은 `@annotation` 단독**(@within type-level 금지 — 프록시 범위 확대).

## 3. 🚨 CI/로컬 실행이 정적 dual 리뷰의 false-green 을 차단
- M1 IT 가 **컨텍스트 로드 실패(`BeanDefinitionOverrideException`)로 한 번도 실행된 적 없는데** 정적 dual 리뷰(Claude+Codex)는 "real HTTP 검증"이라 APPROVE. CI/로컬 실행이 비로소 실 결함 3건 적발(hr 빈 중복 / `@WebMvcTest` 에서 실-HTTP 권한 0-request / 빈 격리 회귀).
- 교훈([[feedback_qa_docker_real_test]] 강화): **권한·보안 IT 는 반드시 실제 실행(로컬 Docker + CI) 확인**. 정적 리뷰 APPROVE ≠ 통과. `gh pr checks --watch` exit code 신뢰 말고 `gh pr checks` 명시 확인.
- 권한 차원 검증 정책: **계약이 바뀐 차원만 실-HTTP 의무**(#316). M1 은 부서게이트가 신규 계약 → 실 HrAuthorizationHelper+헤더로 실 테스트. 권한(messenger.admin) 불변 → `@MockBean DynamicPermissionClient` 적절(과도한 실-HTTP 재배선이 `@WebMvcTest` 깨뜨림).

## 4. 🚨 role 전환 behavior-preserving = @PreAuthorize role-set 과 seed grant role-set **완전 일치** 확인 (PR #387 회고)
- 순수 role `@PreAuthorize` 제거 시 "병행 @RequirePermission 이 있으면 안전"은 **불충분**. @PreAuthorize 의 role 집합과 @RequirePermission page 의 **seed default grant role 집합이 완전 일치**해야 behavior-preserving.
- **#387 inventory 사례**: 제거 대상 `@PreAuthorize(hasAnyRole 'WAREHOUSE','MANAGER','MASTER')` 가 INVENTORY 배제했으나 seed(role_page_permissions: inventory.dps/inventory.stock-balance)는 **INVENTORY 에도 grant** → 제거 시 INVENTORY widening(seed 가 @PreAuthorize 보다 넓음). Explore 의 "100% 안전(병행 존재)" 판정이 이 차원을 놓침.
- **반대 방향도 위험**: @PreAuthorize 가 seed 보다 넓으면(예 InspectionAttachment.delete = MANAGER/MASTER 인데 seed 가 WAREHOUSE 도 can_delete) 제거 시 WAREHOUSE 삭제 widening → @PreAuthorize 유지(의도적 descope) + widening-guard IT(`verify(check, never())` 로 @PreAuthorize 선차단 실증).
- **절차**: 슬라이스 착수 전 각 page-code 의 seed grant(`services/auth-service/.../V*.sql` role_page_permissions)를 @PreAuthorize role-set 과 교차표로 대조. 불일치 시 (A) widening 수용+Javadoc/IT 갱신 / (B) seed 정렬 migration / (C) descope 중 **개발책임자 결정**(보안 변경은 자율 머지 금지, [[feedback-user-merge-authority]]). MASTER 는 isMasterBypass 로 동적 우회 → MASTER-only @PreAuthorize+@RequirePermission(seed MASTER-only) 조합이 가장 깨끗.

관련: [[codex-implements-claude-reviews]], [[cycle-n2-mandatory]], [[enforcement-real-http-test]], [[qa-docker-real-test]], [[agent-origin-main-sync]], [[feedback-desktop-typecheck-command]]
