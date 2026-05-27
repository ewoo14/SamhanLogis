# SP-D7 — 잔여 `@PreAuthorize` → `@RequirePermission` 마이그레이션 (구현 계획)

> spec: `docs/superpowers/specs/2026-05-27-sp-d7-remaining-preauthorize-migration-design.md`. 구현 = Codex. 단일 통합 PR (`feat/sp-d7-remaining-preauthorize-migration`).

## 결정: 단일 PR
40개 변경이 거의 기계적(annotation swap + redundant 삭제) + 신규 PageCode 1개뿐이라 2 슬라이스 분할 불필요. SP-D6 시리즈 finale 로 단일 SP-D7 PR.

## Task 1 — 유형 A: isAuthenticated → @RequirePermission(page, VIEW) (25건)
spec §4 표의 각 endpoint:
- `@PreAuthorize("isAuthenticated()")` → `@RequirePermission(page="<표의 page>", action="VIEW")` 교체.
- import 정리 (`@RequirePermission` import 추가, 불필요해진 `@PreAuthorize` import 제거 — 해당 파일에 다른 @PreAuthorize 없을 때만).
- 각 컨트롤러의 X-User-Role 헤더 파라미터/추출 경로가 PermissionAspect 와 호환되는지 확인 (SP-D6 패턴: @RequestHeader("X-User-Role") 또는 HttpServletRequest).

## Task 2 — 신규 PageCode `notifications.center` (D-D7-02)
- auth-service `PageCode.java` enum 상수 추가 (`NOTIFICATIONS_CENTER("notifications.center", ...)` — 기존 네이밍 규약 확인).
- NotificationCenterController 3건이 이 page 사용.

## Task 3 — Flyway V## seed (auth-service) + behavior-preserving VIEW grant (D-D7-01 최우선)
- 신규 V## (현재 최고 버전 +1, `ls .../db/migration/` 확인) seed:
  - `notifications.center` page row + VIEW grant = 모든 활성 비즈니스 role.
  - **유형 A 재사용 page(slip.comments, slip.audit-overlay, slip.attachments.upload, slip.delivery-attachments.upload, slip.publish.from-estimate, slip.edit-requests, estimates.list, sales.partner-order.history, sales.partner-order.edit-requests, products.list, products.edit-requests, partners.detail, inventory.stock-balance) 의 VIEW grant 를 마이그레이션 전 isAuthenticated 접근 집합(모든 활성 role)로 확장** — 기존 grant 가 좁으면 보강 (회귀 0).
  - sibling SP-D6-3 V33/`notifications.admin` seed 패턴 + V37 CROSS JOIN + COALESCE FALSE + `ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING` 미러. audit 필드(modified_at/modified_by) 포함.
- **회귀 검증**: 각 page 의 최종 VIEW grant 가 기존보다 축소되지 않음을 BE 가 확인.

## Task 4 — 유형 B: redundant @PreAuthorize 삭제 (15건, D-D7-03)
spec §5: inventory(DpsCompare 1, InboundInspection 4, DpsSaveHistory 4, InspectionAttachment upload/delete 2), user(Employee create/update/updateRole/terminate 4). 공존 `@RequirePermission` 유지, `@PreAuthorize` 라인만 삭제. import 정리.

## Task 5 — IT (D-D7-05, PR #310 see-saw 교훈 필수)
- 변경 endpoint 의 IT: allow-all 기본 stub + **deny-case 요청 직전 명시 deny stub** (page/action-aware, slip-service 패턴).
- 유형 A: 모든 활성 role VIEW 200 검증 + (해당 시) deny role 403 명시 stub.
- 유형 B: 삭제 후에도 @RequirePermission 가 동일 allow/deny 강제함을 IT 로 확인 (회귀 0).
- auth-service: PageCodeTest 에 notifications.center 추가.

## Task 6 — 문서 동기화
dev-report (docs/dev-reports/sp-d7-remaining-preauthorize-migration.md) + 영향 service README + samhan-public-overview.html progress 갱신 + DECISIONS D-D7-01~06.

## 검증
- service 별 compileJava + compileTestJava.
- auth-service test (PageCodeTest + V## Flyway).
- CI Linux Testcontainers (로컬 Windows npipe skip).

## 리뷰
dual 5-agent (Claude + Codex) — BE 가 D-D7-01 회귀 0 (VIEW grant 보강) 최우선 검증. CI green → PM 머지.

## 동반 커밋 (foundation)
본 PR 에 spec + plan + CLAUDE.md(Codex 권한 정정) + CURRENT-WORK.md handoff 포함 ([[continuous-docs-sync]]).
