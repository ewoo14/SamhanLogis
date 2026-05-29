# Claude BE 리뷰 — PR #316 권한 재편 Phase 1 (cycle 1)

> 브랜치 `feat/phase-1-permission-overhaul-framework` / base main
> 리뷰 관점: 백엔드(BE). spec D-PO-01~09 / V39 §6 행동보존 규칙 기준.
> 종합 판정: **사이클 필요 (CHANGES REQUESTED)** — P1 행동보존 회귀 3건 (narrowing 2 + widening 1).

---

## 종합 판정

shared/security 프레임워크(7-action enum, aspect MASTER bypass / PARTNER deny / accountId 누락 deny,
DefaultDynamicPermissionClient fail-closed)와 auth-service 엔티티/서비스/internal·admin API 는 설계대로
구현되어 견고하다. dead guard 3개 삭제·EstimateGuard account 전환도 정확하다.

그러나 **V39 행동보존 자동전개가 spec D-PO-03 / §6-3 (narrowing/widening 회피, deliberate-FALSE 미덮어씀)을
3건 위반**한다. V39 의 RESTORE/DOWNLOAD/PRINT 보존표가 (a) 일부 export endpoint 의 page 를 누락했고
(b) 후속 보정 migration(V8) 을 반영하지 않은 원본 seed 기준으로 산출되어, 권한 축소 2건 + 확대 1건이
발생한다. 이는 SP-D6/D7 narrowing/widening 회귀 교훈([[no-backlog-strict]] / [[cycle-n2-mandatory]])의
직접 재발이므로 머지 전 수정 필요.

---

## P0 (머지 차단, 즉시) — 없음

---

## P1 (행동보존 회귀 — 머지 전 수정 필수)

### P1-1. `inventory.dps` DOWNLOAD narrowing (권한 축소)
- 위치: `services/inventory-service/.../web/DpsCompareController.java:92` (`downloadTemplate`),
  `services/auth-service/.../db/migration/V39__account_page_permissions_overhaul.sql:129-146` (download 보존표)
- 내용: 기존 `@RequirePermission(inventory.dps, "VIEW")` → 신규 `DOWNLOAD`. V10 seed 의 `inventory.dps`
  VIEW=TRUE role = MASTER/MANAGER/WAREHOUSE/INVENTORY. 그러나 V39 download 보존표에 `inventory.dps` 가
  **누락** → 전 role `can_download=FALSE`. 결과: MANAGER/WAREHOUSE/INVENTORY 가 기존에 받던 DPS 양식
  다운로드를 잃음(403). MASTER 만 bypass 로 동작.
- 권고: V39 download UPDATE 에 `('MASTER'|'MANAGER'|'WAREHOUSE'|'INVENTORY', 'inventory.dps')` 추가
  (원본 VIEW=TRUE role 보존).

### P1-2. `inventory.stock-balance` DOWNLOAD narrowing (권한 축소)
- 위치: `services/inventory-service/.../web/StockController.java:301` (`/stocks/export.xlsx`),
  V39 SQL:129-146 (download 보존표)
- 내용: 기존 `@RequirePermission(inventory.stock-balance, "EDIT")` → 신규 `DOWNLOAD`. V35 seed 의
  `inventory.stock-balance` EDIT=TRUE role = MASTER/MANAGER/WAREHOUSE/INVENTORY. V39 download 보존표에
  `inventory.stock-balance` **누락** → V39 가 그 role 들에 create/update/delete 만 부여하고
  `can_download=FALSE`. 결과: MANAGER/WAREHOUSE/INVENTORY 의 재고잔액 export 상실(403).
- 권고: V39 download UPDATE 에 `('MASTER'|'MANAGER'|'WAREHOUSE'|'INVENTORY', 'inventory.stock-balance')`
  추가.

### P1-3. `accounting.tax-invoice.list` PRINT widening (deliberate-FALSE 덮어씀, 권한 확대)
- 위치: `services/accounting-service/.../web/TaxInvoiceController.java:218-219` (`/{id}/print`,
  `@PreAuthorize` 없음 → `can_print` 단독 게이트), V39 SQL:155-158 (print 보존표 SALES row)
- 내용: V8(`V8__sp_d2_accounting_page_permissions.sql:35-48`)은 SALES `accounting.tax-invoice.list`
  `can_view=FALSE, can_edit=FALSE` 로 **의도적 차단**("SALES 회계 메뉴 전면 hidden"). 기존 print 는
  VIEW-gated 라 SALES 접근 불가. 그러나 V39 print 보존표는 **V7 원본 seed(SALES view=TRUE) 기준**으로
  산출되어 `('SALES','accounting.tax-invoice.list') can_print=TRUE` 부여. tax-invoice print endpoint 는
  `@PreAuthorize` 없이 `@RequirePermission(PRINT)` 단독 게이트 → **SALES 가 세금계산서 인쇄 가능**(신규
  capability). spec §6-3 "force-UPDATE 금지 / deliberate FALSE 미덮어씀" 위반.
- 권고: V39 print 보존표에서 `('SALES','accounting.tax-invoice.list')` 제거. 보존표는 V7 원본이 아니라
  **현재 효과적(post-V8) role_page_permissions 상태** 기준으로 재산출할 것(아래 P1-4 와 동일 근본원인).

### P1-4. (근본원인) V39 보존표 산출 기준 결함 + 보고서 GET 의 PRINT 오매핑
- 위치: V39 SQL 전반(116-175), `services/accounting-service/.../report/*Controller.java`
  (BalanceSheet/CashFlow/CorporateTax/DailySummary/EquityChanges/IncomeStatement/MonthlySummary/
  PartnerAging/TrialBalanceReport/Vat — 11개 GET 이 `accounting.reports` × **PRINT**)
- 내용:
  (a) **보존표 산출 기준**: RESTORE/DOWNLOAD/PRINT 보존표가 원본 seed migration(V7 등) 기준으로 작성되어
      후속 보정(V8 SALES FALSE)·신규 page(inventory.dps/stock-balance) 를 놓침 → P1-1/2/3 의 공통 원인.
      보존표는 **migration 시점의 실 `role_page_permissions` 효과**(모든 후속 UPDATE 반영) 기준으로
      재도출해야 함.
  (b) **보고서 데이터 GET 의 PRINT 오매핑**: 11개 재무보고서 GET 은 JSON 데이터 조회(인쇄 view 아님,
      Phase 1 에 print-view endpoint 미존재 — PRINT 구현은 D-PO-06 Phase 2 이월)인데 `VIEW` 가 아닌
      `PRINT` 로 재주석화됨. spec §5 "GET 조회 → VIEW" 위반. 현재는 V39 가 reports PRINT 를
      MASTER/MANAGER/ACCOUNTANT(=view role)에 부여하여 즉시 회귀는 없으나, **MASTER 매트릭스에서
      reports 의 print 를 OFF 하면 보고서 데이터 조회 자체가 막히는** 잠재 결함 + 의미 왜곡. PartnerAging /
      TrialBalanceReport 의 Javadoc 도 "ReportPermissionGuard VIEW 검증"이라 주석과 불일치.
- 권고: (a) 보존표를 현재 효과 기준 재산출. (b) 11개 보고서 데이터 GET 을 `PRINT` → `VIEW` 로 정정
  (실 print-view 신설은 Phase 2). 동일 패턴으로 `TaxInvoiceController#print`(GET 데이터)도 VIEW 가 의미상
  옳음 — 단 P1-3 의 widening 우선 제거 필수.

---

## P2 (개선 권고)

### P2-1. JournalController 레거시 role-based 가드 잔존 (Phase 2 drop 시 전면 차단 위험)
- 위치: `services/accounting-service/.../web/JournalController.java:86,130,146,203-217`
  (`checkEditPermission(roleHeader)`)
- 내용: create/post/reverse 가 신규 `@RequirePermission(account, CREATE/UPDATE)` + 레거시 role-based
  `checkEditPermission` → `dynamicPermissionClient.canEdit(role, page)`(deprecated role 경로,
  `role_page_permissions` 조회)를 **이중 게이트**. 두 enforcement 모델(role/account) 혼용. 현재는 무해하나
  Phase 2 에서 `role_page_permissions` drop 시 `canEdit` 이 false → **전 사용자 분개 mutation 403**.
  plan Task 9 "dead/mis-annotation 정정" 대상이나 미정리.
- 권고: `checkEditPermission` + `dynamicPermissionClient` 필드 제거(account 게이트로 일원화). report 패키지의
  `ReportPermissionGuard.checkView`(현 호출 0, log-only)도 동일 정리.

### P2-2. V39 account materialize 의 `enabled = TRUE` 필터 (spec 미규정, 재활성 계정 narrowing)
- 위치: V39 SQL:202 (`AND a.enabled = TRUE`)
- 내용: spec §6-2 step3 은 `is_deleted=FALSE AND role NOT IN (MASTER,PARTNER)` 만 규정. `enabled=TRUE`
  추가로 비활성(미삭제) 계정은 권한 row 0건 materialize → 추후 재활성 시 무권한(MASTER 수동 설정 전까지).
  비활성 계정은 로그인 불가라 즉시 영향은 작으나 행동보존 의도와 어긋남.
- 권고: `enabled` 필터 제거(soft-delete 만으로 충분) 또는 spec 에 명시 + 재활성 절차 문서화.

### P2-3. V39 보존표 검증 IT 가 불완전 (회귀를 못 잡음)
- 위치: `services/auth-service/.../it/V39GuardGatedPageIT.java:21-37`,
  `V39MigrationParityIT.java`
- 내용: GuardGatedPageIT 는 estimates.list / products.list.view / sales.partner-order.history.view 3 page 만
  검증. 전 DOWNLOAD/PRINT/RESTORE annotated page 의 보존 완전성·deliberate-FALSE(SALES tax-invoice.list)
  보존을 검증하지 않아 P1-1/2/3 을 통과시킴.
- 권고: "모든 `@RequirePermission(DOWNLOAD|PRINT|RESTORE)` page 의 보존 role 집합 = 원본 효과 role 집합"을
  exhaustively 검증하는 parity IT 보강. SALES tax-invoice.list can_print=FALSE assertion 추가.

---

## Minor

- `PermissionAspect.java:121-126` — `client == null → proceed()`(fail-OPEN). 본 PR 신규 아님(기존 동작
  유지, diff 확인). auth/dashboard/dc-config/groupware 등 DPC bean 미등록 service 에서 `@RequirePermission`
  부착 시 enforcement skip 가능. 본 PR scope 밖이나 차기 hardening 후보(bean 없으면 deny 로 전환 검토).
- `services/auth-service/.../service/AccountPermissionService.java:11,15` — `import java.util.Arrays`,
  `EnumSet` 등 미사용 import 가능성(컴파일 경고). 정리 권고.
- `AccountPermissionService.updateAccountMatrix` 등은 단일 `@Transactional` 경계로 부분실패 시 전체 롤백
  보장 — 양호. bulkApply 도 동일 트랜잭션 — 양호.
- DefaultDynamicPermissionClient.check / bulkLoad fail-closed(예외·4xx·파싱실패 → false/empty) — 양호.
- DirectDynamicPermissionClient(auth 내부) try/catch fail-closed — 양호.
- PermissionAspect MASTER bypass 가 `client.check` 미호출로 단락 — 정확. PARTNER 무조건 deny — 정확.
  accountId null/parse 실패 → deny — 정확(현행 skip→deny 강화).
- `/auth/admin/permissions/my` MASTER all-true / PARTNER deny / accountId 누락·parse 실패 빈 map —
  정확(D-PO-08).
- RESTORE 보존(warehouse.admin / slip.audit-revert = MASTER/MANAGER) 및 DOWNLOAD(journals/hometax-export/
  slip.print.export/partners.edit) · PRINT(reports/statement-batch/partner-ledger/partner-order.print/
  slip.print.next-day) 의 나머지 매핑은 원본 효과와 일치 확인.

---

## 검증 근거 (조사 경로)

- V39 보존표: V39 SQL:116-175.
- 원본 seed 효과: V7:67-151, V8:35-48(SALES FALSE 보정), V10:22-148, V31/V32(DEVELOPER/PARTNER/STAFF/
  DRIVER = all FALSE), V34:50-80, V35:37-72, V36:90-128, V37:63-74.
- 신규 annotation 전수: diff `^\+.*PermissionAction\.(DOWNLOAD|PRINT|RESTORE)` →
  DOWNLOAD 6 page(2 누락 확인), PRINT 6 page, RESTORE 2 page.
- old→new annotation 대조: DPS template VIEW→DOWNLOAD(diff:10066-10067), stock export EDIT→DOWNLOAD
  (10464-10465), tax-invoice print VIEW→PRINT(6448-6449), 11 report GET VIEW→PRINT.
