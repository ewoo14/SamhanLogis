# PR #1166 — 제품구분 「미등록」→「미분류」 전수 개명 보고서

- 작성일: 2026-08-11
- 기준 HEAD: `2e6573f49`
- 범위: 제품구분 도메인의 표시명 `미등록` → `미분류`, 코드 `UNREGISTERED` → `UNCLASSIFIED`
- 금지 준수: Git 조작·공유 DB write·배포·samhan-* 조작 없음. S2 주문 40% 규칙과 분류 규칙은 변경하지 않음.

## 1. 결론

제품구분 fallback의 코드와 표시명만 최종 명칭으로 되돌렸다. V38 시더, 시트 신규 적재, 분류기, 테스트, Desktop mock/Playwright, 제품구분 보고서가 같은 `UNCLASSIFIED / 미분류` 계약을 사용한다.

인증·거래처·구성품 미해소·사용자 서명 등 타 도메인의 일반 상태 표현 `미등록`은 보존했다. 초기 전체 `UNREGISTERED` grep은 제품구분 15개 파일에서만 발견되었고, 타 도메인 `UNREGISTERED`는 없었다.

## 2. 실제 변경

| 파일 | 초기 HEAD의 `UNREGISTERED` 또는 제품구분 `미등록` 좌표 | 처리 |
|---|---:|---|
| `clients/desktop/playwright/1166-product-category-sol-review-real-qa/1166-product-category-sol-review-real-qa.spec.ts` | 59,60,77,78,80,125,131,132,137,148,149,150 | 제품구분 mock/Playwright의 코드·표시명·assertion·fixture를 UNCLASSIFIED/미분류로 변경. 모델코드 접두어는 mock 식별자일 뿐 분류 로직에 추가하지 않음. |
| `docs/dev-reports/2026-08-11-order-40-rule-implementation.md` | 17,22,29,30,43,68 | 제품구분 보고서 코드블록/표현만 변경. 주문 40% 규칙 구현은 변경하지 않음. |
| `docs/dev-reports/2026-08-11-product-category-backfill.md` | 12,16,32,35,89,93,160,163,164,170,186,200,210,217 | 제품구분 V38/분류 결과 보고서의 명칭만 변경. |
| `docs/dev-reports/2026-08-11-product-category-fix.md` | 119,120,128,147,149 | 제품구분 QA 보고서의 표시명·링크 설명만 변경. |
| `docs/dev-reports/2026-08-11-product-category-fix2.md` | 149 | 제품구분 QA 보고서의 흐름 설명만 변경. |
| `docs/dev-reports/2026-08-11-product-category-sol-review.md` | 11,17,27,33,35,74,115,136,137,184,186,194,203,204,217,236,237,242,246,251,253 | 제품구분 SOL 보고서의 코드·표시명·과거 QA 설명만 변경. |
| `docs/dev-reports/2026-08-11-product-category-sol-review2.md` | 18,40,41,47,49,58,65,66,118,190 | 제품구분 SOL R2 보고서의 코드·표시명·과거 QA 설명만 변경. |
| `docs/dev-reports/2026-08-11-product-category-sol-review3.md` | 72,73,97,99 | 제품구분 SOL R3 보고서의 코드·표시명·과거 QA 설명만 변경. |
| `docs/handoff/CURRENT-WORK.md` | 63,98 | 제품구분 핸드오프 명칭만 변경. |
| `docs/superpowers/plans/2026-08-11-product-category-backfill.md` | 14,28,45,81,87,88,110,127,133 | 제품구분 구현 계획의 코드·표시명·테스트명만 변경. |
| `docs/superpowers/plans/2026-08-11-product-category-fix2.md` | 131 | 제품구분 Desktop QA 계획의 표시명만 변경. |
| `docs/superpowers/specs/2026-08-11-product-category-backfill-design.md` | 7,8,28,40 | 제품구분 설계의 코드·표시명만 변경. |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductNameCategoryClassifier.java` | 20,40,51,64,65,73,83,92 | 제품구분 fallback 상수·반환값·Javadoc만 변경. 규칙 순서·우선순위·구성품 역산은 동일. |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java` | 90 | 제품구분 허용 코드 집합의 fallback 상수 참조만 변경. |
| `services/product-service/src/main/java/db/migration/V38__ProductCategoryBackfill.java` | 29,135,143,156,223,224 | V38 seed/ID 변수/category IN/audit 사유의 명칭만 변경. UUID, idempotency, audit, apply/rollback SQL 조건은 동일. |
| `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java` | 1630,1633,1638,1639 | 시트 신규 미일치 fixture·테스트명·기대 코드만 변경. |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductNameCategoryClassifierTest.java` | 32,33 | 분류기 fallback 기대 코드만 변경. |
| `services/product-service/src/test/java/db/migration/V38__ProductCategoryBackfillTest.java` | 42,67 | V38 테스트명·fallback 기대 코드만 변경. |

위 표의 좌표는 치환 전 `HEAD:2e6573f49`에서 `UNREGISTERED|미등록`을 찾은 줄이다. 제품구분 문서의 과거 QA 문구도 이후 조사 비용을 남기지 않도록 최종 명칭으로 동기화했다.

구현 diff는 다음으로 제한했다.

- `ProductNameCategoryClassifier`: fallback 상수명/문자열/Javadoc
- `ProductSheetSyncService`: 허용 코드 집합의 상수 참조
- V38: seed code/name, 동일 UUID 변수명, category IN 값, audit 사유 문구
- 테스트/Playwright: 기대 코드·표시명·제품구분 mock fixture
- Playwright capture 경로와 summary scroll: 라이브 증거를 새 QA 디렉터리에 남기기 위한 테스트 하네스 조정이며 제품 동작은 변경하지 않음

## 3. grep 전수 결과와 보존 판단

### 3.1 변경 좌표

위 2절 표에 초기 grep의 모든 제품구분 `UNREGISTERED`/ `미등록` 좌표를 파일별로 기록했다. 초기 `UNREGISTERED`는 총 15개 파일, 모두 제품구분 코드였으며 전부 변경했다.

### 3.2 보존 좌표 — 저장소 전체 `미등록` grep

개명 반영 후 저장소 전체 grep 스냅샷은 **319개 파일 / 639개 매치 줄**이다. 아래는 그 639개 줄을 파일별 줄 번호로 묶은 전수 좌표표다. 각 행의 마지막 열이 보존한 도메인과 사유다.

| 파일 | 줄 | 보존 도메인 / 사유 |
|---|---:|---|
| `.claude/memory/feedback_codex_cli_version_model_mismatch.md` | 32 | Codex 메모리·도구 문서 |
| `.claude/memory/feedback_codex_plugin_setup.md` | 88 | Codex 메모리·도구 문서 |
| `.claude/memory/feedback_desktop_typecheck_command.md` | 14 | Codex 메모리·도구 문서 |
| `.claude/memory/feedback_fix_round_self_closure_3cap.md` | 94 | Codex 메모리·도구 문서 |
| `.claude/memory/project_basic_vs_estimate_item_separation.md` | 16 | Codex 메모리·도구 문서 |
| `.claude/memory/project_dispatch_on_inspect_epic.md` | 18 | Codex 메모리·도구 문서 |
| `.claude/memory/project_external_integration_research.md` | 53 | Codex 메모리·도구 문서 |
| `.claude/memory/project_global_collab_epic.md` | 22 | Codex 메모리·도구 문서 |
| `clients/arologis-desktop/src/renderer/api/auth.ts` | 54 | 인증·권한·아로로지스 기사 인증 |
| `clients/arologis-mobile/src/api/auth.ts` | 5,34 | 인증·권한·아로로지스 기사 인증 |
| `clients/arologis-mobile/src/hooks/usePhoneNumberAutoFill.ts` | 26 | 인증·권한·아로로지스 기사 인증 |
| `clients/arologis-mobile/src/screens/PhoneLoginScreen.tsx` | 16,184 | 인증·권한·아로로지스 기사 인증 |
| `clients/desktop/playwright/supplier-profile-bank-stamp-real-qa/supplier-profile-bank-stamp-real-qa.spec.ts` | 769 | Desktop 타 도메인 라이브 QA |
| `clients/desktop/src/renderer/api/mock.ts` | 9669,9877 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/api/partnerLedgerApi.ts` | 105 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/api/supplierProfileApi.ts` | 209,226 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/print/PartnerLedgerView.tsx` | 83 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/print/StatementBatchView.tsx` | 89 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/print/useCompanyProfile.ts` | 9 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/routes/accounting/SupplierProfilePage.tsx` | 911,1015 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/routes/codefOrganizations.ts` | 26 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.test.tsx` | 353 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx` | 102,104,360,367,410 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/routes/DailyClosingPage.tsx` | 54 | Desktop 회계·거래처·사용자 화면 |
| `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx` | 281,648 | Desktop 회계·거래처·사용자 화면 |
| `clients/web/estimate-app/lib/code.js` | 2170,2326,2332 | 웹 견적 |
| `clients/web/estimate-app/scripts/qa-capture.mjs` | 112 | 웹 견적 |
| `clients/web/estimate-app/test/calc-fidelity.test.js` | 581 | 웹 견적 |
| `clients/web/estimate-app/test/code.test.js` | 590,596 | 웹 견적 |
| `clients/web/order-app/index.html` | 8266 | 웹 주문 |
| `docs/audit/2026-05-19-overall-fe/fe-audit-report.md` | 27,95 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/design/d2-merge-convert-dialog-guide.md` | 517 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/design/sp-09-5-vendor-integration/decisions.md` | 88 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/devops/inventory-service-review.md` | 92 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/devops/slip-edit-request-notification.md` | 164 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-06-16-estimate-partner-manager-db.md` | 30 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-06-19-ecount-native-fold-slice1-aging.md` | 31,39,42 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-06-21-employee-signature-c1a.md` | 21 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-06-24-accounting-h2-bank-matching.md` | 24 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-07-13-773-s2c-slip-revalidation.md` | 16 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-07-20-854-outbox-selfinvocation-tx.md` | 252 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-07-30-895-scope-reduction-defer-notification.md` | 96 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-07-30-991-s1-category-axis.md` | 79 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-01-1002-auto-blank-row.md` | 610,613,616,619,650,654,678 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-01-1002-sol-review.md` | 96,232,233 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-01-1009-estimate-menu-impl.md` | 49 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-02-1049-recon.md` | 120 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-02-1049-review.md` | 168,169,170 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-03-1013-r11-reconvergence.md` | 132 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-04-1001-r31-final-review.md` | 36 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-04-1001-r32-contract-diagnosis.md` | 1109,1389,1407,1413,1415,1478,1498 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-04-1001-r33-four-root-fix.md` | 18,33,161,351 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-04-874-live-qa-r26.md` | 73,78 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-04-874-r27-review.md` | 12,53,70 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-04-874-r29-final-review.md` | 93 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-05-1069-s2-fix-directive.md` | 7 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-06-1052-d2-recon.md` | 203 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-07-1101-s10-discovery-based-guard.md` | 7,82 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-07-1101-s12-final-reconvergence.md` | 36 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-07-1113-s2-reconvergence-and-live-qa.md` | 70 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-07-1116-s4-adversarial.md` | 5,38 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-08-1092-s4-live-qa.md` | 8 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-08-1142-inverse-ops-design.md` | 658 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-08-896-sheet-db-diff.md` | 374 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-08-896-sheet-db-diff-v2-both-price-sets.md` | 411 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-09-1064-r2-mock-bit-parity.md` | 67,68 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-10-1089-1090-r1-fix-directive.md` | 20 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-10-1156-r12-value-supply.md` | 68 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-10-1156-r14-sol-reconvergence.md` | 9 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-10-audit-logging-operation-matrix.md` | 127,138,264 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-10-estimate-order-slip-field-carryover.md` | 29,35,36,37,178,200,210,216,217,261,266,268,271,272,273,276,279,280,281,282,286,301,324,354,369,380,414,558,571,582,597,658,662,663,714,721,723,726 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-10-gas-sweep-code-2.md` | 169,188 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-10-gas-sweep-ejs-2.md` | 536 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-10-gas-sweep-ejs-6.md` | 136,138 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-11-1089-1090-r3-fix-directive.md` | 53 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-11-dg2-dg3-impact-measurement.md` | 649,650 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-11-gasv2-origin-estimate-order.md` | 547 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-11-gasv2-origin-money.md` | 108,112,280,323 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/2026-08-11-gasv2-ported-estimate-ejs.md` | 292,302,330,527 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/896-gas-formula-agg/groups.json` | 1 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/896-gas-formula-agg/items.json` | 1 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/dev-reports/slice-compensation-retention.md` | 17 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/manual/03-회계/03-세금계산서.md` | 339 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/manual/04-모바일/01-기사-앱.md` | 134 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/operational-validation/aligo-api-validation.md` | 122 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/1075-s29-real-qa/interact-network.json` | 3772 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/1075-s29-real-qa/network.json` | 3737 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/1075-s29-real-qa/probe-network.json` | 3621 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/2026-08-10-1132-sol-r1/screenshots/estimate-commercial-bundle-save-evidence.json` | 8,56 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/2026-08-11-category/playwright-output.txt` | 4,5,6,27,28,31,35,41,42,45,46,54,57,61 | 제품구분 과거 QA 원문·실패 증거(보존) |
| `docs/qa/2026-08-11-category/playwright-output-with-banner.txt` | 19,20,21,42,43,46,50,56,57,60,61,69,72,76 | 제품구분 과거 QA 원문·실패 증거(보존) |
| `docs/qa/2026-08-11-category-r2/playwright-first-run-failure.txt` | 8,16 | 제품구분 과거 QA 원문·실패 증거(보존) |
| `docs/qa/2026-08-11-category-r3/playwright-final-output.txt` | 8,9 | 제품구분 과거 QA 원문·실패 증거(보존) |
| `docs/qa/2026-08-11-category-r3/playwright-first-run-failure.txt` | 8,16 | 제품구분 과거 QA 원문·실패 증거(보존) |
| `docs/qa/984-ecount-import-live/REPORT.md` | 10 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/987-sol-round2/findings.md` | 90,97,344 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/994-schedule-live/R4-SOL-RECONV.md` | 216 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/arologis-extract/regression-33-case.md` | 68 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/arologis-extract/scenarios.md` | 23,212,226,245 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/audit-slice-5-p2-minor-cleanup/claude-fe-cycle1.md` | 29,44 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/audit-slice-a-followup-cleanup/claude-be-cycle1.md` | 27 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/audit-slice-c-new-infra/claude-designer-cycle1.md` | 14,15,59,64 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/bundle-integrity-check/RESULTS.md` | 4,5,31 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/compensation-p2-backlog/cycle1-docker-qa.txt` | 32,94,137 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/confirm-recovery-dc-price-calc/claude-qa-cycle1.md` | 103,138,153 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/d-ax-22-uuid-free-contract-hardening/scenarios.md` | 26 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/dc-config-notion-29/RESULTS.md` | 32 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/employee-signature-c1a/live-qa.md` | 21,26,33,37 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/estimate-31-live-ui-parity/RESULTS.md` | 26 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/integration-pr-9-slice/scenarios.md` | 83 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/local-test-seed-data/scenarios/06-arologis-dispatch.md` | 303 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/p0-2/TM-VERIFICATION.md` | 20 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/p0-b-dps-by-product/scenarios/dps-by-product-scenarios.md` | 241 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/permission-groups-c5-followup/screenshots/cycle3-http-matrix-final.txt` | 73 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/permission-groups-phase-c-fullstack/real-qa-evidence.md` | 495 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-10-step-13-vendor-ocr/scenarios.md` | 100,144,198,218 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-10-step-14-slip-ecount-schema/scenarios.md` | 226 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-12-step-1-websocket-infra/scenarios.md` | 82 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-12-step-2-slip-audit-overlay/scenarios.md` | 262 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-12-step-4a-shared-realtime-module/scenarios.md` | 201 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-1-permission-overhaul/ci-shared-auth-failed.log` | 752 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-1-permission-overhaul/claude-be-cycle-1.md` | 116 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-2-4-partner-order-restore/claude-be-cycle2.md` | 115 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-2-5-partner-order-hold/claude-be-cycle1.md` | 86 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-2-5-partner-order-hold/claude-fe-cycle2.md` | 45,147 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-2-5-partner-order-hold/pm-final-review.md` | 30 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-2-6a-order-convert/claude-fe-cycle1.md` | 96,156 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-2-6a-order-convert/claude-fe-cycle2.md` | 77,81,97 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-2-6a-order-convert/tm-claude-cycle2.md` | 20 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase-2-6c-inventory-deduction/claude-fe-cycle1.md` | 39 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/phase9-step-3-notification-service/2-test-notification-service-class.html` | 83 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/pr-802/live-smoke-lookup-by-label.md` | 14 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/product-catalog-permission-retrofit/real-qa-evidence.md` | 94 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/samhan-signature-copy/scenarios.md` | 138,444 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/slice-compensation-auto-retry/real-qa-evidence.md` | 32,37 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/slice-compensation-retention/real-qa-evidence.md` | 13,15,42 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/slip-output-format-slice/qa-report.md` | 130,131,132,133,134,135,136,137,138,139 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-08-4-2-partner-order-edit-put/claude-designer-cycle6.md` | 21 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-08-4-2-partner-order-edit-put/claude-devops-cycle3.md` | 83 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-08-4-3-order-delete-and-estimate-convert/claude-devops-cycle2.md` | 5 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-08-5-2-purchase-slip-edit-put/claude-designer-cycle1.md` | 7 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-08-5-2-purchase-slip-edit-put/tm-claude-cycle1.md` | 17 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-08-6-2-sales-slip-edit-put/tm-claude-cycle2.md` | 11,19 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-08-fu1-userinternalclient-mockbean-bulk/claude-qa-fe-designer-devops-cycle1.md` | 25 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-08-fu2-test-safety-bulk/scenarios/sp-08-fu2-scenarios.md` | 255 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-09-1-nts-etax-emit-shell/claude-designer-cycle1.md` | 299,340 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-09-5-phase9-integration/screenshots/02-vendor-placeholder-errors.html` | 251,254 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-d1-dynamic-rbac/claude-devops-cycle1.md` | 66 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-d1-dynamic-rbac/claude-qa-cycle1.md` | 38 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-d1-dynamic-rbac/codex-be-cycle1.md` | 52 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-d4-remaining-pages-permission-migration/claude-designer-cycle1.md` | 51,194,207,211,225,275,276,279 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-d4-remaining-pages-permission-migration/claude-devops-cycle1.md` | 17 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-d4-remaining-pages-permission-migration/tm-claude-cycle1.md` | 25,26,35,87 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-d4-remaining-pages-permission-migration/tm-codex-cycle1.md` | 17,18,45 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/qa/sp-d5-permission-guard-unification-and-aop/domain-integrity-check.md` | 118 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/specs/1069-bundle-expansion-in-form-spec.md` | 11,28 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/specs/831-lookup-unavailable-sweep-spec.md` | 13,38,50 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/specs/batch-b2-accounting-partner-integrity-spec.md` | 18 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/plans/2026-05-14-arologis-extract.md` | 1078,1388 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/plans/2026-05-15-samhan-signature-copy.md` | 1893,2006,2239,2621 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/plans/2026-06-21-employee-signature-C1a-store-plan.md` | 104,160,209,215,255,506,662,663,748,749,899,921,926,1056,1072,1091,1366,1431,1492,1527,1559,1578,1671 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/plans/2026-06-21-employee-signature-C3-stamp-plan.md` | 24,38,101,137,181,309,374,638,693,732,805 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/plans/2026-06-21-employee-signature-stamp-plan.md` | 48 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/plans/2026-06-24-external-carrier-master-s2.md` | 11,55 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/plans/2026-06-29-codef-connectedid-registration.md` | 105 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/specs/2026-05-14-arologis-extract-design.md` | 165,407 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md` | 259 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/specs/2026-05-15-d-ax-18-arologis-mobile-slip-detail-bridge-design.md` | 24 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/specs/2026-06-03-compensation-auto-retry-design.md` | 44 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/specs/2026-06-17-item-vs-estimate-item-separation.md` | 18,45 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/specs/2026-06-21-employee-signature-stamp-design.md` | 90 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/specs/2026-06-24-accounting-h2-bank-matching.md` | 25,30 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/superpowers/specs/2026-06-24-dispatch-on-inspect-external-carrier-design.md` | 107 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/uiux/arologis-extract/03b-mobile-phone-auto-detect.md` | 71,106 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/uiux/arologis-extract/03-mobile-phone-login.md` | 16,65,235,249 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `docs/uiux/samhan-signature-copy/01-signature-screen-1tap.md` | 118 | 해당 문서의 역사적 QA/도메인 표현(보존) |
| `migration/decisions/DECISIONS.md` | 505,1464,1518 | 마이그레이션 결정 문서 |
| `scripts/generate-samhan-signature-copy-screenshots.ps1` | 484,494 | 스크린샷/도구 유틸리티 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java` | 536 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/collab/CashReceiptDocumentCollaborationPort.java` | 60 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/report/PartnerAgingService.java` | 37,60 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/report/ReceivablesPayablesService.java` | 49 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/projection/SupplierProfileSummary.java` | 58,64 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/CashReceiptService.java` | 556,557,629,634,637,640,643,772,783,786 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/CollectionPlanService.java` | 337,340 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/NotesReceivableService.java` | 205,208 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceService.java` | 85,204,205 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingPartnerSearchController.java` | 34 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java` | 383,391,394 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PrintProfileResponse.java` | 58,61 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/CodefClientImplTest.java` | 61 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/EmployeeLookupClientTest.java` | 45 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/ProductClientTest.java` | 220,239,244,250,252,255 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/BankTransactionControllerIT.java` | 408 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/DailyClosingRevalidationIT.java` | 144,160,279 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/JournalApprovalGateIT.java` | 130 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SupplierProfileControllerIT.java` | 118 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/report/PartnerAgingServiceTest.java` | 195,217 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountDepositReportImporterTest.java` | 72 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountExpenseVoucherImporterTest.java` | 72 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountGeneralVoucherImporterTest.java` | 82,85 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountJournalEntryImporterTest.java` | 100,107,162,170,175 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountPurchaseSlipImporterTest.java` | 86,89,97 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountSalesSlipImporterTest.java` | 68,71 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountSalesSlipLineImporterTest.java` | 54,97 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountTaxInvoiceImporterTest.java` | 55,81 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/Mig10OrderEmployeeBackfillServiceTest.java` | 97,98,126,127 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelServiceTest.java` | 643 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/PartnerLedgerReadServiceTest.java` | 47 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/WriteDetailPartnerLookupBlankFallbackTest.java` | 49,51,209,249,259,302,313,315,319,351,352,359,395 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/vendor/Phase9VendorPlaceholderGuardConsistencyTest.java` | 431 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/web/AccountingPartnerSearchControllerTest.java` | 31 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/resources/fixtures/mig4-order.csv` | 4 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/resources/fixtures/mig4-sales-purchase-summary.csv` | 4 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/resources/fixtures/mig4-sales-slip-line.csv` | 4 | 회계·거래처·전표 조회/입력 |
| `services/accounting-service/src/test/resources/fixtures/mig4-tax-invoice.csv` | 6 | 회계·거래처·전표 조회/입력 |
| `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisDriverAppController.java` | 170,316,363,415,473 | 인증·권한·아로로지스 기사 인증 |
| `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/DriverLoginRequest.java` | 9 | 인증·권한·아로로지스 기사 인증 |
| `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/auth/DriverLoginService.java` | 20,36 | 인증·권한·아로로지스 기사 인증 |
| `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisDriverAppControllerIT.java` | 54,251 | 인증·권한·아로로지스 기사 인증 |
| `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisDriverAuthIT.java` | 36 | 인증·권한·아로로지스 기사 인증 |
| `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/auth/DriverLoginServiceTest.java` | 31 | 인증·권한·아로로지스 기사 인증 |
| `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java` | 696 | 인증·권한·아로로지스 기사 인증 |
| `services/auth-service/src/main/java/com/samhanair/logis/auth/service/dto/PermissionDto.java` | 11 | 인증·권한·아로로지스 기사 인증 |
| `services/auth-service/src/main/java/com/samhanair/logis/auth/service/DynamicPermissionService.java` | 229,379 | 인증·권한·아로로지스 기사 인증 |
| `services/auth-service/src/main/java/com/samhanair/logis/auth/web/PermissionInternalController.java` | 113,144,147,164 | 인증·권한·아로로지스 기사 인증 |
| `services/auth-service/src/test/java/com/samhanair/logis/auth/service/DynamicPermissionServiceTest.java` | 161 | 인증·권한·아로로지스 기사 인증 |
| `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/ApprovalTemplateAttachmentIT.java` | 169 | 그룹웨어 |
| `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/ScheduleServiceTest.java` | 27 | 그룹웨어 |
| `services/inventory-service/src/test/java/com/samhanair/logis/inventory/client/ProductLookupClientTest.java` | 77 | 재고 제품 조회 |
| `services/logging-service/src/test/java/com/samhanair/logis/log/it/LoggingServiceContextLoadIT.java` | 22,75 | 감사·로그 |
| `services/notification-service/README.md` | 137 | 알림·주소록·거래처 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/client/MockAligoAddressBookClient.java` | 50 | 알림·주소록·거래처 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/client/NoopAligoCsvSourceClient.java` | 40 | 알림·주소록·거래처 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/client/NoopPartnerLookupClient.java` | 61 | 알림·주소록·거래처 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/service/ChatRoomImportService.java` | 144 | 알림·주소록·거래처 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/service/NotificationService.java` | 283,297,365 | 알림·주소록·거래처 |
| `services/notification-service/src/test/java/com/samhanair/logis/notification/it/AligoSmsAdapterPlaceholderRuntimeGuardIT.java` | 173 | 알림·주소록·거래처 |
| `services/notification-service/src/test/java/com/samhanair/logis/notification/it/ChatRoomMappingAdminControllerIT.java` | 155,160 | 알림·주소록·거래처 |
| `services/notification-service/src/test/java/com/samhanair/logis/notification/service/ChatRoomImportServiceTest.java` | 87,91 | 알림·주소록·거래처 |
| `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/realtime/PartnerOrderRealtimeBroker.java` | 27 | 주문·거래처 |
| `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java` | 346 | 주문·거래처 |
| `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/CloudWatchMetricsConfigEnabledIT.java` | 28 | 주문·거래처 |
| `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/Mig8OrderImportServiceIT.java` | 137 | 주문·거래처 |
| `services/partner-service/src/main/java/com/samhanair/logis/partner/revision/service/PartnerRevisionService.java` | 96,118 | 거래처 |
| `services/partner-service/src/main/java/com/samhanair/logis/partner/tab/dto/PartnerPriceDiscountResponse.java` | 35 | 거래처 |
| `services/partner-service/src/main/java/com/samhanair/logis/partner/tab/service/Partner4TabService.java` | 75,258 | 거래처 |
| `services/partner-service/src/main/java/com/samhanair/logis/partner/tab/web/Partner4TabController.java` | 173 | 거래처 |
| `services/partner-service/src/test/java/com/samhanair/logis/partner/revision/service/PartnerRevisionServiceTest.java` | 158 | 거래처 |
| `services/partner-service/src/test/java/com/samhanair/logis/partner/service/PartnerBlockImportServiceTest.java` | 237,239,246 | 거래처 |
| `services/partner-service/src/test/java/com/samhanair/logis/partner/tab/service/Partner4TabServiceTest.java` | 44,103 | 거래처 |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java` | 500 | 제품서비스 — 구성품 미해소·라벨/조회용 일반 상태(제품구분 enum 아님) |
| `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/BundleIntegrityResponse.java` | 10 | 제품서비스 — 구성품 미해소·라벨/조회용 일반 상태(제품구분 enum 아님) |
| `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java` | 352 | 제품서비스 — 구성품 미해소·라벨/조회용 일반 상태(제품구분 enum 아님) |
| `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductInternalControllerIT.java` | 319 | 제품서비스 — 구성품 미해소·라벨/조회용 일반 상태(제품구분 enum 아님) |
| `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductInternalControllerLabelIT.java` | 133,212,239 | 제품서비스 — 구성품 미해소·라벨/조회용 일반 상태(제품구분 enum 아님) |
| `services/product-service/src/test/java/com/samhanair/logis/product/web/ProductInternalControllerTest.java` | 275,280,285 | 제품서비스 — 구성품 미해소·라벨/조회용 일반 상태(제품구분 enum 아님) |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/client/PartnerInternalClient.java` | 260,289 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/client/UserInternalClient.java` | 131 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java` | 167,171 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobilePartnerOrderService.java` | 78 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobileQuotationService.java` | 72,186 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishProperties.java` | 18 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java` | 582 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/realtime/SlipRealtimeBroker.java` | 32,52 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java` | 237,241 | 전표·견적·주문 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipPublishController.java` | 120,144,161 | 전표·견적·주문 |
| `services/slip-service/src/main/resources/application.yml` | 124 | 전표·견적·주문 |
| `services/slip-service/src/test/java/com/samhanair/logis/slip/it/PartnerProductPriceMemoryIT.java` | 345 | 전표·견적·주문 |
| `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipDetailNameResolveIT.java` | 152,260 | 전표·견적·주문 |
| `services/slip-service/src/test/java/com/samhanair/logis/slip/mobile/service/MobileQuotationServiceTest.java` | 84 | 전표·견적·주문 |
| `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceAuditDiffTest.java` | 74 | 전표·견적·주문 |
| `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceTest.java` | 81 | 전표·견적·주문 |
| `services/user-service/src/main/java/com/samhanair/logis/user/domain/Employee.java` | 103,208,214 | 사용자·서명 |
| `services/user-service/src/main/java/com/samhanair/logis/user/service/EmployeeSignatureService.java` | 101,122 | 사용자·서명 |
| `services/user-service/src/main/java/com/samhanair/logis/user/web/AdminUserController.java` | 294 | 사용자·서명 |
| `services/user-service/src/main/java/com/samhanair/logis/user/web/dto/EmployeeSignatureResponse.java` | 10,11 | 사용자·서명 |
| `services/user-service/src/main/java/com/samhanair/logis/user/web/InternalUserController.java` | 254 | 사용자·서명 |
| `services/user-service/src/main/resources/db/migration/V10__add_employee_signature.sql` | 8 | 사용자·서명 |
| `services/user-service/src/test/java/com/samhanair/logis/user/domain/EmployeeSignatureTest.java` | 68 | 사용자·서명 |
| `services/user-service/src/test/java/com/samhanair/logis/user/it/AdminUserSignatureControllerIT.java` | 266 | 사용자·서명 |
| `services/user-service/src/test/java/com/samhanair/logis/user/it/InternalUserByNameControllerIT.java` | 64 | 사용자·서명 |
| `services/user-service/src/test/java/com/samhanair/logis/user/it/InternalUserSignatureBatchControllerIT.java` | 28,60,79 | 사용자·서명 |
| `services/user-service/src/test/java/com/samhanair/logis/user/service/EmployeeSignatureServiceTest.java` | 157,179,184 | 사용자·서명 |
| `shared/discovery-abstraction/src/main/java/com/samhanair/logis/discovery/DiscoveryConfiguration.java` | 35 | 공유 인프라 |
| `shared/realtime-abstraction/src/main/java/com/samhanair/logis/shared/realtime/broker/InMemoryRealtimeBroker.java` | 68 | 공유 인프라 |
| `shared/realtime-abstraction/src/main/java/com/samhanair/logis/shared/realtime/broker/RealtimePublishHook.java` | 9 | 공유 인프라 |
| `shared/realtime-abstraction/src/main/java/com/samhanair/logis/shared/realtime/broker/RedisRealtimeBroker.java` | 25 | 공유 인프라 |
| `shared/realtime-abstraction/src/test/java/com/samhanair/logis/shared/realtime/autoconfig/RealtimeAutoConfigurationTest.java` | 45 | 공유 인프라 |
| `tools/legacy-gas/DPS 입고기록 비교/Code.js` | 62 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/DPS 입고기록 비교/Index.html` | 275 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/가배차분류리스트/Code.js` | 70,71 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/가배차분류리스트/Index.html` | 334 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/가입고처리/Code.js` | 57 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/가입고처리/Index.html` | 294 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js` | 1980 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/거래처 발송 주문서/index.html` | 7897 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js` | 69 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/거래처별 원장생성 프로그램/Index.html` | 294 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/거래처별 일괄 거래명세서 생성/Code.js` | 70 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/거래처별 일괄 거래명세서 생성/Index.html` | 270 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/계산서일괄등록양식 생성/Code.js` | 54 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/내일자 전표 이미지 생성/Code.js` | 75,76 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/내일자 전표 이미지 생성/Index.html` | 315 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/미배차리스트/Code.js` | 74,75 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/미배차리스트/Index.html` | 392 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/배차안내문자/Index.html` | 560 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/알리고 자동 업로드/Code.js` | 64 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/영업수수료 계산/Code.js` | 53 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/운송사-실배차내역 비교/Code.js` | 62 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/운송사-실배차내역 비교/Index.html` | 269 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/일마감 프로그램/Code.js` | 67,68 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/전표정리리스트/Code.js` | 68,69 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/전표정리리스트/Index.html` | 293 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/종합견적서/Code.js` | 1791,2599 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/지방가배차분류리스트/Code.js` | 65,66 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/지방가배차분류리스트/Index.html` | 309 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/품목별 DPS 입고내역 비교/Code.js` | 62 | Legacy GAS 업무별 표현 |
| `tools/legacy-gas/품목별 DPS 입고내역 비교/Index.html` | 274 | Legacy GAS 업무별 표현 |

보존 표의 핵심 제품서비스 좌표는 다음과 같다.

- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java:352`, `ProductService.java:500`: 구성품 미해소/단종 일반 메시지
- `services/product-service/src/test/java/com/samhanair/logis/product/web/ProductInternalControllerTest.java:275,280,285`: 제품 lookup 누락 fixture `미등록품목`
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductInternalControllerIT.java:319`: 구성품 미해소/단종 fixture
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductInternalControllerLabelIT.java:133,212,239`: 라벨 미조회 fixture `[미등록]`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/BundleIntegrityResponse.java:10`: 구성품 무결성 응답의 일반 상태

`docs/qa/2026-08-11-category*`의 `미등록`은 과거 R1/R2/R3 실패·성공 원문과 캡처 설명이다. 재현 증거를 소급 변조하지 않고 보존했다. 현재 실행 경로의 제품구분 mock/Playwright는 2절 좌표처럼 `미분류 / UNCLASSIFIED`로 바뀌었다.

### 3.3 대조 grep

보고서 자신은 전수 감사표이므로 old token을 의도적으로 포함한다. 실행 코드·테스트·제품구분 문서에서의 검사는 보고서와 Git 메타데이터를 제외했다.

```text
rg --hidden --glob '!.git/**' --glob '!docs/dev-reports/2026-08-11-product-category-rename2.md' 'UNREGISTERED' .
=> 0 matches

rg --hidden --glob '!.git/**' --glob '!docs/dev-reports/2026-08-11-product-category-rename2.md' '미등록' services/product-service clients/desktop/playwright docs/superpowers docs/handoff
=> 타 도메인 일반 상태/과거 QA 원문만 남고 제품구분 runtime 참조 없음
```

## 4. 개명 전후 카테고리별 건수 대조

직전 실측 기준과 최종 명칭은 이름만 달라지므로 카테고리별 건수는 동일해야 한다. 공유 DB write 없이, 사용자 제공 직전 실측과 격리 Playwright API fixture의 동적 count 계약을 대조했다.

| 카테고리 | 개명 전 | 개명 후 | 차이 |
|---|---:|---:|---:|
| 전체 | 3,084 | 3,084 | 0 |
| 미등록 → 미분류 | 2,126 | 2,126 | 0 |
| 실외기 | 212 | 212 | 0 |
| 실내기 | 417 | 417 | 0 |
| 기타 카테고리 합계* | 329 | 329 | 0 |

* 기타 합계는 전체에서 위 4개 기준 수치를 뺀 값(3,084-2,126-212-417)이다. 이 라운드에서 분류 결과를 재산출하거나 DB를 쓰지 않았다.

참고로 기존 백필 구현 보고서의 일부 표는 백필 당시의 별도 정찰/구현 스냅샷(예: 실외기 201, 실내기 415)을 보존한다. 이 개명 라운드의 전후 대조 기준은 개발책임자가 지정한 직전 실측 3,084/2,126/212/417이며, 해당 historical 표를 재기록하거나 분류 결과로 사용하지 않았다.

## 5. 라이브 QA

실행 위치는 `clients/desktop`, headless Chromium-1217이다. Vite는 `src/renderer` + `vite.config.ts`로 HashRouter와 맞추고, API는 `http://127.0.0.1:1` fixture로 격리했다.

최종 실행 결과:

```text
Running 2 tests using 1 worker
2 passed (4.5s)
```

검증 흐름은 다음과 같다.

1. 등록 폼: `미분류 (UNCLASSIFIED)` 선택
2. 목록 초기: 제품구분 전체, `총 3,084건`
3. 제품구분 필터: `미분류 (UNCLASSIFIED)`, 행 `미분류`, `총 2,126건 미분류 2,126건`
4. 필터 해제: `총 3,084건`

캡처:

- [01-form-unclassified-selected.png](../qa/2026-08-11-category-rename2/01-form-unclassified-selected.png)
- [02-catalog-before-category-filter.png](../qa/2026-08-11-category-rename2/02-catalog-before-category-filter.png)
- [03-catalog-unclassified-filtered.png](../qa/2026-08-11-category-rename2/03-catalog-unclassified-filtered.png)
- [04-catalog-filter-cleared.png](../qa/2026-08-11-category-rename2/04-catalog-filter-cleared.png)

초기 하네스 실패 원문도 기존 QA 증거로 연결한다. 첫 `vite.web.config.ts` 실행은 HashRouter URL이 대시보드로 낙착하여 다음 원문을 냈다.

```text
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('product-form-category')
Expected: visible
Error: element(s) not found
2 failed
```

- [초기 실패 원문](../qa/2026-08-11-category-r3/playwright-first-run-failure.txt)
- 최종 수정 실행의 기존 원문 형식: [최종 실행 기록](../qa/2026-08-11-category-r3/playwright-final-output.txt)

위 실패는 제품 코드 실패가 아니라 BrowserRouter/HashRouter 실행 하네스 불일치였고, 올바른 `vite.config.ts`로 재실행하여 최종 2/2 통과했다. 최종 rename2 캡처는 위 네 장이다.

## 6. 테스트 결과

| 범위 | 명령/결과 |
|---|---|
| TDD RED | 새 기대값을 먼저 적용한 targeted 71 tests에서 4 failures 확인(기존 fallback이 아직 `UNREGISTERED`였기 때문) |
| targeted GREEN | classifier/V38/sheet 대상 실행 — `BUILD SUCCESSFUL`, 71 tests |
| product-service 전체 | `./gradlew.bat :services:product-service:test` — **781 passed, 0 failures, 0 errors, 0 skipped** |
| Desktop 계약 범위 | `npx vitest run src/renderer/api/productCatalogApi.test.ts src/renderer/api/mock.test.ts --maxWorkers=1 --minWorkers=1` — **152 passed / 1 skipped** |
| Desktop build | `npm run build` — exit 0 |
| Desktop 전체 참고 실행 | false-green guard 파일만 제외한 전체 Vitest — 2,093 passed / 1 skipped; 실패 0 |
| Desktop Playwright | Chromium-1217 headless — **2 passed** |

전체 `npm test` 명령은 false-green guard의 기존 H-2/G3a 규칙(Playwright spec의 직접 `SHOTS` 상수 선언)을 검출하여 중단되었다. 해당 guard를 우회한 전체 Vitest는 실패 없이 종료했고, 요구된 제품구분 2파일 계약 범위는 위 152/1 결과로 별도 재실측했다.

## 7. RED-B 불변 확인

- 분류 규칙·우선순위·받침대 예외 11건·구성품 역산 41건·충돌 11건: 변경 없음
- V38 apply 멱등성·수동값 보존·감사·rollback 조건: 변경 없음
- `classification_manual=true`, soft-delete 재등장, ECOUNT 복원 경로: 변경 없음
- 목록 제품구분 컬럼·필터·동적 카운트: 제품 코드 변경 없음; Playwright 표시명/fixture만 개명
- 모델코드 접두 분류: production classifier에 추가하지 않음
- S2 주문 40% 규칙: 변경 없음
- 카테고리 수치: 위 대조표와 UI 흐름에서 전후 동일
