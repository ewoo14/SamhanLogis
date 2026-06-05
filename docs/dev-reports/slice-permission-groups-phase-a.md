# slice: 동적 권한그룹(Permission Groups) Phase A

> PR #396. 고정역할(enum) → 사용자정의 권한그룹 체계 코어. 개발책임자 전권 위임([[feedback_pm_permission_autonomy]]).
> spec `2026-06-05-permission-groups-phase-a-design.md`(D-PG-01~05), plan 동일자, QA `docs/qa/permission-groups-phase-a/real-qa-evidence.md`.

## 1. 목적
MASTER(+위임계정, Phase B)가 권한그룹을 생성·삭제하고 권한 매트릭스로 그룹별 권한을 설정, 계정을 그룹에 다중 배속. 기존 9역할은 시드 기본 그룹 이관(무중단). MASTER 만 빌트인 슈퍼관리자.

## 2. 모델
- **신규 4테이블**(auth-service): `permission_groups`, `group_page_permissions`, `account_groups`(M:N), `account_permission_overrides`(개별 우선층).
- **실권한** = 개별 override(페이지 단위 우선, deny 표현 가능) ?? 그룹 합집합(OR).
- **enforcement 무변경**: `account_page_permissions`(기존 캐시)를 `override ?? union` 으로 재materialize. `@RequirePermission`/`PermissionAspect`/`DynamicPermissionClient` 무수정(저위험).
- **MASTER bypass** = role 헤더 기반 유지(그룹 멤버십 무관) → MASTER 그룹 배속으로 권한탈취 불가(보안 리뷰 확정).

## 3. 마이그레이션 V42~44
- V42 4테이블 DDL(BaseEntity 7 audit, soft-delete partial unique).
- V43 MASTER 그룹(builtin/systemMaster, group_page_permissions 없음=bypass) + 9역할→기본그룹(role template 7액션 복사). 결정적 UUID('…0100~0109').
- V44 기존 active 계정→대응 역할그룹 배속. 무중단(그룹권한==template → account_page_permissions 동치).

## 4. BE/FE
- 서비스: PermissionGroupService(CRUD, 빌트인/배속존재/이름중복 가드), GroupPermissionService(매트릭스→materializeForGroup), AccountGroupService(배속→materializeForAccount, 시스템그룹 배속 409), EffectivePermissionMaterializer.
- 컨트롤러 PermissionGroupController 9 endpoint(@RequirePermission system.permission-admin). 계정 매트릭스→account_permission_overrides 전환.
- FE: PermissionGroupMatrixPage(group-select 매트릭스), PermissionGroupManagePage(CRUD+다중배속, 빌트인 후보 제외), api(중첩 actions 계약), mock(실 계약 정합), 사이드바/라우트.

## 5. dual review + CI 적발 결함 (정적리뷰 false-green 을 실행이 연속 차단)
- materializer IT `@Transactional` flush 가시성(EmptyResultDataAccessException) → 전용 계정 격리.
- 컨트롤러 IT 한글 ISO-8859-1 → UTF-8.
- sp-08-2 stale `@PreAuthorize` 단언(#387 잔재, Playwright 가 backend-only PR 미트리거로 잠복) → 정정.
- 시스템그룹 배속/매트릭스 가드(Phase B 시한폭탄) 추가(Claude 보안+BE).
- **그룹 매트릭스 저장 FE↔BE 계약 불일치(평면 vs 중첩 actions) + mock false-green** ← Codex 5-섹션 cross-check 적발.
- P1 백필 우려 → 운영 DB customized_accounts=0 실측 해소.

## 6. QA (실서버·실데이터)
실 auth-service 재배포 후 그룹 생성→매트릭스(중첩 actions)→SALES 배속→account_page_permissions t/t materialize→cleanup f/f 원복 전 사이클 + 시스템그룹 배속 409 실증. 상세 real-qa-evidence.md. CI 24 green(GitGuardian false-positive 제외).

## 7. 범위 밖 (후속)
- **Phase B(위임)**: 그룹/HR 관리권한 페이지화 + 하드 @PreAuthorize(MASTER) 제거(D-PAM-06 위임 허용 갱신) + 위임 부여/회수 UI.
- **Phase C**: 잔여 hasRole/X-User-Role/accounts.role 정리(다중그룹 토큰 반영). 시스템그룹 가드가 Phase B/C 안전 전제.
