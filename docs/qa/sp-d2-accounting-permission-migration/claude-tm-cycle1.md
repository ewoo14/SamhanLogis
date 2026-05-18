# SP-D2 TM 종합 결정안 — Claude (Cycle 1)

브랜치: `feat/sp-d2-accounting-permission-migration` (commit `8090c109`)
리뷰 일시: 2026-05-18
작성: Claude TM (5-section 리뷰 종합)

---

## TM 최종 결정: CYCLE 2 권고

5-section 리뷰 결과를 종합하면 **CRITICAL 6건 / HIGH 8건**이 확인되어 현 상태로 APPROVE 불가. Cycle 2 fix 완료 후 재검토 필요.

---

## 1. 전체 결함 요약

### CRITICAL (6건)

| ID | Section | 결함 내용 |
|---|---|---|
| BE-C1 | BE | JournalController `PAGE_CODE = "accounting.general-ledger"` — 분개장은 `accounting.journals` 사용 필요. ACCOUNTANT 분개 편집 시 403 발생 |
| BE-C2 | BE | TaxInvoiceController 세금계산서 목록 VIEW canView 가드 미구현 — 정적 @PreAuthorize 만 존재 |
| BE-C3 | BE/QA | IT C2 `200 || 403` 이중 허용 — VIEW 차단 구현 미완료를 숨기는 false green |
| FE-C1 | FE/QA | Playwright ACCOUNTING_ROUTES pageCode 7개 오매핑 — routes/index.tsx 실제 PermissionGuard 코드와 불일치. T3/T4/T5 시나리오 전제 붕괴 |
| FE-C2 | FE/QA | `buildAccountantFullPermissions()` SP-D2 신규 7개 PageCode 누락 — T1 "12페이지 모두 접근" 실제로는 5개만 mock |
| QA-C3 | QA | T2 사이드바 assertion `if (sidebarVisible)` 분기 — false green 가능 |

### HIGH (8건)

| ID | Section | 결함 내용 |
|---|---|---|
| BE-H1 | BE | AccountingReportController 이중 PAGE_CODE 관리 (web + report 패키지 동시) |
| BE-H2 | BE | V8 migration ACCOUNTANT 주석 "전체 edit 허용"과 실제 seed(balances/reports/partner-ledger edit=FALSE) 불일치 |
| BE-H3 | BE | LedgerService / ReportPermissionGuard checkViewPermission 실질 미동작 — VIEW 차단 없음 (TODO 미기록) |
| FE-H3 | FE | PermissionMatrixPage 주석 "12 → 19" 미갱신 |
| FE-H4 | FE | mock.ts ACCOUNTANT edit 목록 V8 seed 정책 주석 미반영 |
| QA-H2 | QA | T1 SP-D2 신규 7개 라우트 접근 미검증 |
| QA-H3 | QA | T4 직접 URL 차단 범위 2개만 검증 (6개 누락) |
| DevOps-M2 | DevOps | 기존 IT 22개 lenient stub (canView=true default) 선언 확인 필요 |

---

## 2. 섹션별 판정 요약

| Section | CRITICAL | HIGH | MEDIUM | LOW | 판정 |
|---|---|---|---|---|---|
| BE | 4 | 3 | 2 | 2 | FAIL |
| FE | 2 | 3 | 3 | 2 | FAIL |
| Designer | 0 | 2 | 3 | 3 | WARN |
| QA | 3 | 4 | 2 | 3 | FAIL |
| DevOps | 0 | 1(해소) | 2 | 4 | WARN |

---

## 3. Cycle 2 Fix 필수 목록

### BE (담당: BE agent)
1. `JournalController.JOURNAL_PAGE_CODE` → `"accounting.journals"` 수정
2. `TaxInvoiceController` GET `/accounting/tax-invoices` 에 `canView` 동적 가드 추가
3. `AccountingDynamicPermissionIT` C2: `status().isForbidden()` 단일 assert
4. `AccountingDynamicPermissionIT` C8: `404` 허용 제거 → `status == 201 || status == 409`
5. V8 migration 주석 ACCOUNTANT 정책 불일치 수정 (또는 seed 수정)
6. LedgerService/ReportPermissionGuard VIEW 미동작 TODO 마커 dev-report 반영

### FE (담당: FE agent)
1. `ACCOUNTING_ROUTES` pageCode 7개 오매핑 전면 수정
2. `buildAccountantFullPermissions()` SP-D2 7개 PageCode 추가
3. T2 `if (sidebarVisible)` → `expect(sidebarVisible).toBe(true)` + 조건 제거
4. PermissionMatrixPage 주석 "12 페이지" → "19 페이지" 수정
5. mock.ts ACCOUNTANT edit 목록 정책 주석 보강

### 재검토 생략 가능 항목 (LOW — APPROVE 후 별도 처리)
- V8 UUID 네이밍 컨벤션 문서화
- PermissionMatrixPage PAGE_LABEL `NTS 발행` / `원장` 라벨 PM 확인 후 결정
- canAccess() 캐시 미로딩 trade-off 보안 주석

---

## 4. 특이사항

### 이중 가드 설계 일관성

"canEdit=false + canView=true → 403" 정책은 DailyClosingService, DepositMatchService, JournalController, MonthEndCloseController, SupplierProfileController 에서 일관되게 구현됨. 이중 가드 핵심 정책은 PASS.

"canEdit=false + canView=false → fallback 통과" 정책도 동일하게 구현됨. PASS.

### VIEW-only 가드 미완료 설계 선택

LedgerService, ReportPermissionGuard 의 `checkViewPermission` 이 canView=false 일 때 예외를 발생시키지 않는 것은 "점진 마이그레이션 정책"으로 의도된 것으로 보임. 단, 이 설계 선택이 코드/문서 양쪽에 명확히 기록되어야 한다. 현재 log.debug 만 남기고 있어 이후 완전 구현 시 변경 지점을 추적하기 어렵다. dev-report 미완 구현 항목 기록 권고.

### Playwright vs IT 시나리오 불일치

IT 는 BE 서비스 레이어에서 canEdit=false + canView=true → 403을 직접 검증. Playwright 는 FE PermissionGuard + mock 서버 응답으로 검증. 두 레이어가 독립적으로 검증되는 것이 올바른 설계이나, Playwright spec 의 ACCOUNTING_ROUTES pageCode 오매핑으로 FE 레이어 검증이 실질적으로 무효화된 상태.

---

## 5. TM 결정

**CYCLE 2 권고**

CRITICAL 6건 / HIGH 8건 수정 완료 후 5-section cycle 2 리뷰 실시.
Cycle 3 진입 금지 원칙에 따라 cycle 2 에서 완료 의무.
Cycle 2 에서 CRITICAL 0건 / HIGH 0건 달성 시 APPROVE.
