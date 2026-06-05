# slice: @PreAuthorize 완전제거 — inventory-service role 전환 (Option A)

> PR #387. @PreAuthorize 완전제거 마이그레이션의 **role 전환 첫 슬라이스**.
> 개발책임자 결정 = Option A(INVENTORY 접근 정식 수용). 머지 2026-06-05.
> 관련: [[feedback_preauth_migration_lessons]], umbrella D-PAM-05, QA `docs/qa/preauth-role-inventory/real-qa-evidence.md`.

## 1. 목적

inventory-service web 컨트롤러의 redundant role-only `@PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")` 10건을 제거하여 동적 권한 `@RequirePermission`(+ seed)을 **single source of truth** 로 전환한다.

## 2. 변경

### 제거 (10건, 동일 메서드에 @RequirePermission 병행 → 무가드화 0)
- `DpsSaveHistoryController`: save / list / detail / latest (inventory.dps)
- `DpsCompareController`: analyzeByProduct (inventory.dps)
- `InboundInspectionController`: getInspection / saveResult / listInspections / completeInspection (inventory.stock-balance)
- `InspectionAttachmentController`: upload (inventory.stock-balance)

### 유지 (widening guard)
- `InspectionAttachmentController.delete`: `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` 유지. INVENTORY/WAREHOUSE 의 stock-balance `can_delete=TRUE`(실 DB 실측)이므로 제거 시 삭제 widening 발생 → 의도적 보존.

### Javadoc (4 컨트롤러)
stale "WAREHOUSE/MANAGER/MASTER 제한" 문구 → `@RequirePermission + seed grant 단일소스`(MASTER/MANAGER/WAREHOUSE/INVENTORY) + Option A 맥락으로 갱신. ROLE 풀네임.

### IT (`InventoryPermissionControllerIT` + `InboundInspectionControllerIT`)
- `migratedEndpoint_inventoryRoleWithGrant_isAllowed` + `inventoryGrantEndpoints()`: 제거된 10 endpoint + downloadTemplate(DOWNLOAD) × INVENTORY + grant(check→true) → **정확 status**(GET/POST 200, upload 201) + `verify(check)` 권한경로 입증.
- 단언 강화: `not(403)` → `status().is(expectedStatus)`(EndpointCase.expectedStatus, false-green 잔여 차단).
- 기존 widening-guard(attachment delete, verify check never) + withoutGrant→403 보존.
- stale deny 테스트 정정: `inventoryRole_returns403` → `inventoryAccountWithoutGrant_returns403`, "V35 seed INVENTORY 없음" 오기 제거(실제 grant 존재).

## 3. 핵심 결정 — Option A (widening 수용)

제거 대상 @PreAuthorize 는 INVENTORY 를 배제했으나 seed(role + account materialized)는 INVENTORY 에 두 page V/E grant. 제거 시 access 확대 = behavior-preserving 아님 → 개발책임자 sign-off 필요(보안 변경).
**A 선택 근거**: 동적 권한(seed) 단일소스 모델 일관, 재고원(INVENTORY)의 inventory 도메인 접근 업무상 합리, 같은 페이지의 compare/template 은 이미 INVENTORY 접근 가능했어 page 내부 일관성 회복. 실 seed grant 실측으로 의도적 정책임 확인.

## 4. dual review (Claude 5-team + Codex 5-section)

- **Claude BE/QA/DevOps 3/3 APPROVE** (FE/Designer N/A — BE-only). P0/P1 0.
  - QA 발견: attachment upload IT stub 부재 시 `from(null)` NPE→500 인데 not(403) 으로 거짓통과하던 **선존 false-green** → upload stub 보강으로 치유. P2 단언 강화 권고.
  - BE: page/action·seed·delete 가드 전부 검증 PASS. P2 DOWNLOAD action 미커버.
- **Codex 5-section**: 4 APPROVE + P2(stale deny 테스트 명명/주석). 전건 fix.
- 사이클 수렴: Claude review → 강화 fix → Codex review → 명명 fix → 양측 cross-check 완결.

## 5. QA (실 데이터)

실 seed DB(account_page_permissions = account 모드 실 enforcement 소스) 직접 실측으로 INVENTORY × 두 page all-grant 확인 → Option A 전제 + delete 가드 load-bearing 실증. live gateway HTTP 는 inventory-service 미가동 + INVENTORY 계정 비번 블로커로 미수행(P2 후속). 상세 `docs/qa/preauth-role-inventory/real-qa-evidence.md`.

## 6. CI

GitGuardian(false-positive) 외 전체 PASS. inventory IT 포함 `user+product+inventory+logging` green.

## 7. 잔여 role 전환 맵 (다음)

- user `EmployeeController.updateRole/delete`: Javadoc "MASTER 보존" = 의도적 MASTER-only(seed admin.employees 는 MANAGER 등 grant → 제거 시 widening) → **유지 또는 개발책임자 결정**.
- @RequirePermission 미병행 서비스(slip ~11·partner 6·notification 3·dashboard 1·arologis Internal 7): @RequirePermission 선추가 필요(더 큰 작업).
- clean 슬라이스 공식: @PreAuthorize role-set == seed grant role-set. 착수 전 V*.sql 교차표 대조 의무.
