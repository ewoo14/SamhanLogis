# slice — @PreAuthorize 완전제거 M1: @RequireDepartment 인프라 + groupware 결재선 전환

> PR #382 (squash `6dd534ba`, 2026-06-04 머지). umbrella: `docs/superpowers/specs/2026-06-04-preauthorize-full-migration-umbrella-design.md`, M1 설계: `2026-06-04-preauth-m1-require-department-design.md`. 본 dev-report 는 머지 시점 미작성 채무를 2026-06-07 PR #419 에서 보충 (CURRENT-WORK 2026-06-04 §M1 "dev-report 없음(미작성 — 후속)" 해소).

## 1. 개요

정적 `@PreAuthorize("@hr.isExecutiveOffice(...)")` 부서 게이트를 동적 인프라 어노테이션 `@RequireDepartment(EXECUTIVE_OFFICE)` 로 **behavior-preserving 전환**하는 M-시리즈의 인프라 슬라이스. scope = 인프라 부설 + groupware 결재선 3 endpoint 선행 전환 (잔여 20건은 M-dept #384).

## 2. 산출

- **shared:security** — `@RequireDepartment` 어노테이션 + `DepartmentAspect`: 판정은 기존 `HrAuthorizationHelper` **동일 빈 재사용** (판정 로직 동일 = behavior-preserving 근거), fail-closed (헬퍼 부재/판정 실패 시 deny).
- **groupware-service** — 결재선 3 endpoint `@PreAuthorize("@hr.isExecutiveOffice(...)")` → `@RequireDepartment(EXECUTIVE_OFFICE)` 전환 + `samhan.security.department.enabled=true` opt-in (main yml + IT properties).

## 3. 🚨 핵심 교훈 (메모리 [[feedback_preauth_migration_lessons]] 박제)

1. **DepartmentAspect 는 opt-in 필수** — `@ConditionalOnProperty(samhan.security.department.enabled=true, matchIfMissing=false)`. 어노테이션을 쓰는 서비스만 활성. **빈 존재만으로 무관 서비스(accounting) CI 회귀** 발생 (로컬 무재현·CI 결정적) — shared 공유 모듈에 aspect 를 넣을 때의 전염성 함정.
2. pointcut 은 `@annotation` 단독 (`@within` 금지 — 클래스 레벨 오적용 방지).
3. **실행 검증이 정적 dual 리뷰를 이긴다**: 정적 리뷰 APPROVE 후 CI 디버깅이 실 결함 3건 적발 — hr 빈 중복 / @WebMvcTest 실 HTTP 0-request / 빈 격리 회귀.

## 4. 검증

- `GroupwarePermissionControllerIT` 실 HTTP 매트릭스: 대표실+권한 → 200 / 비대표실 → 403 (부서 deny) / 무권한 → 403.
- 전 서비스 compile + CI green (accounting 회귀는 opt-in 교정으로 해소).

## 5. 후속 연결

- **M-dept #384** (`824c0478`): 순수 부서게이트 20건 전환 (user 8·partner 6·inventory 6), 4서비스 opt-in.
- **dc-config import 1건 descope** (Codex P1): 복합 `isExecutiveOffice AND hasRole('MASTER')` — role 전환 트랙에서 page-code 정책 명시 후 처리.
- role 전환 ~35건: C-시리즈(C5-2a 정찰)에서 사용자 경로 hasRole 0 확인 — INTERNAL(26)/arologis(7) 유지로 종결.
