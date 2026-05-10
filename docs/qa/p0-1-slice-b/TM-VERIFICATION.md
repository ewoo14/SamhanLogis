# TM 통합 검증 리포트 — PR #136 (P0-1 Slice B)

| 항목 | 값 |
|---|---|
| PR | [#136 P0-1 Slice B 부가세/법인세/거래처미수미지급](https://github.com/ewoo14/SamhanLogis/pull/136) |
| 브랜치 | `feature/p0-1-accounting-slice-b` |
| 베이스 | `main` |
| 검증 commit (사전) | `086e461` (BE+IT) / `4e98f62` (FE) / `ca71dd0` (Designer+DevOps+history) |
| 검증 일자 | 2026-05-10 |
| 검증 책임 | TM (Tech Manager) |

본 리포트는 PR #134 검증 패턴을 그대로 적용한 10개 영역 통합 cross-check 결과입니다.

---

## 1. 검증 영역별 결과

### 1-1. API contract (BE-FE 정합성)

| 끝점 | BE 응답 필드 | FE 인터페이스 | 결과 |
|---|---|---|---|
| `GET /api/v1/accounting/reports/vat` | `period`, `fromDate`, `toDate`, `salesSupplyAmount`, `salesVatAmount`, `salesTotalAmount`, `salesInvoiceCount`, `purchaseSupplyAmount`, `purchaseVatAmount`, `purchaseTotalAmount`, `purchaseInvoiceCount`, `vatPayable`, **`filingDeadline`**, `generatedAt` | TM fix 전: `dueDate` (오정렬), `salesTotalAmount`/`purchaseTotalAmount` 누락 → TM fix 후: BE 와 1:1 일치 | BLOCKER → **fix 완료** |
| `GET /api/v1/accounting/reports/corporate-tax` | `fiscalYear`, **`fromDate`**, **`toDate`**, `incomeBeforeTax`, **`addedDeductions`**, **`subtractedDeductions`**, `taxableIncome`, `calculatedTax`, **`taxAlreadyPaid`**, `taxPayable`, **`filingDeadline`**, `generatedAt` | TM fix 전: `addBack` / `deductions` / `prepaidTax` / `dueDate` (오정렬) → TM fix 후: BE 와 1:1 일치 | BLOCKER → **fix 완료** |
| `GET /api/v1/accounting/reports/partner-aging` | `asOfDate`, `type`, `accountCode`, `accountName`, `totalAmount`, `partnerCount`, `lines[]`, `generatedAt` | FE 인터페이스 일치 | PASS |

**근거:**
- `clients/desktop/src/renderer/routes/VatReportPage.tsx:389` — 기존 `data.dueDate` 참조가 BE 응답에는 없는 필드라 항상 `undefined` 표시 → BLOCKER.
- `clients/desktop/src/renderer/routes/CorporateTaxReportPage.tsx:282/288/335/399` — 4건 필드 오정렬 → BLOCKER.
- `clients/desktop/src/renderer/routes/accounting/print/VatReportPrintLayout.tsx:315`, `CorporateTaxReportPrintLayout.tsx:251/252/283/311` — 인쇄 레이아웃에서도 동일 오정렬.

### 1-2. mock shape (mock.ts ↔ FE 인터페이스)

`mock.ts` 의 `MOCK_VAT_REPORT` / `MOCK_CORPORATE_TAX_REPORT` 도 동일하게 BE 필드명 (`filingDeadline`, `addedDeductions`, `subtractedDeductions`, `taxAlreadyPaid`, `salesTotalAmount`, `purchaseTotalAmount`, `fromDate`, `toDate`) 으로 정렬 완료.

추가로 `period` 필드 형식을 BE 가 반환하는 `"2026-04"` (라벨 형식) 으로 정정 (BE `VatReportService.findByPeriod` § 45 줄). 이전 `"202604"` 는 mock 모드에서 혼동 유발.

### 1-3. 도메인 정합성 (계정 코드, 잔액, 세율)

| 항목 | 결과 |
|---|---|
| 한국 부가세 10% 엄수 (V8 seed) | PASS — `vat = supply * 0.10` 모든 5건 |
| 부가세 신고 기한 분기별 정렬 (4/25, 7/25, 10/25, 다음해 1/25) | PASS — `VatReportService.resolveFilingDeadline` |
| 한국 법인세율 누진 4단계 (9%/19%/21%/24%) + 법인세법 §55 | PASS — `CorporateTaxReportService.computeProgressiveTax` |
| 법인세 신고 기한 = 결산일 + 3개월 | PASS — 12월 결산 → 다음해 3/31 |
| 외상매출금 110 (자산, 차변) / 외상매입금 201 (부채, 대변) | PASS — `PartnerAgingService.computeBalance` 부호 검증 |
| 잔액 0 이하 거래처 제외 + ETC 그룹 처리 | PASS — `PartnerAgingService.buildReport` |

### 1-4. Layer 4 도메인 메서드

`TaxInvoice` 도메인의 라이프사이클 (DRAFT → ISSUED → CANCELLED) 변경 없음. V7 추가 컬럼 `invoiceType` 은 생성 시점 set + null 시 SALES 기본값 (`TaxInvoice.create` § 178 줄). 기존 단일 인자 팩토리도 호환 유지 (`TaxInvoice.create` § 234 줄). 외부 mutation API 추가 없음 → invariant 보존.

### 1-5. UUID 가드 (feedback_uuid_no_user_visibility)

| 항목 | 결과 |
|---|---|
| `PartnerAgingLine.partnerId` 화면 노출 여부 | PASS — `partnerCode` / `partnerName` 만 표시 |
| `PartnerAgingPage` JSDoc UUID 비공개 명시 | PASS |
| `accounting.ts` PartnerAgingLine 인터페이스 `@internal` 주석 | PASS — § 543 줄 |
| CSV 다운로드에 partnerId 미포함 | PASS — PR 본문 명시 |
| BE PartnerAgingLine record 가 `partnerId.toString()` 으로 String 직렬화 | NIT — partnerId 가 응답에 string 으로 포함됨. 내부 참조용으로 BE 가 노출하지만 FE 가 화면에 표시 안 함. 향후 PartnerAgingLine record 에서 partnerId 제거 검토 권장 (별 PR) |

### 1-6. design-system 일관성 (PR #134 회고 가드)

| 항목 | 결과 |
|---|---|
| raw hex 0건 | PASS — `var(--color-*)` 토큰만 사용 |
| design-system Input 컴포넌트 (native input 금지) | PASS — VatReportPage `Input id="vat-report-period"`, CorporateTaxReportPage `Input id="corp-tax-fiscal-year"`, PartnerAgingPage `Input` |
| design-system Card / Button / Spinner 재사용 | PASS |
| `tabular-nums` 금액 표시 | PASS |
| `.report-total-row` / `.report-grand-total-row` class | PASS |
| `@media print` 강제 색상 | PASS — 인쇄 레이아웃 3종 |

### 1-7. Flyway 의존성 (V7~V9)

| migration | 의존성 | 결과 |
|---|---|---|
| `V7__add_tax_invoice_type_and_partner_aging_index.sql` | `tax_invoices` (V2) + `journal_lines` (V1) | PASS — `ADD COLUMN IF NOT EXISTS` + DEFAULT `'SALES'` (legacy 호환) |
| `V8__seed_vat_validation_invoices.sql` | V7 (invoice_type 컬럼) + V2 (tax_invoices) | PASS — `ON CONFLICT DO NOTHING` re-run 안전 |
| `V9__seed_partner_aging_journals.sql` | V1 (journals + journal_lines + 표준 계정 110/201/220/404/101) | PASS — 복식부기 균형 5건 모두 OK |

V1~V6 보존 + V7~V9 신규 추가만 — 회귀 0.

### 1-8. 매뉴얼 동기화 (feedback_continuous_docs_sync)

`docs/manual/03-회계/02-보고서.md` 갱신 상태:
- Stage 4 ✅ 표기 (§ 3 줄)
- 부가세/법인세/미수미지급 모두 ✅ 운영 (mock) 표기 (§ 24~26 줄)
- 4-4-2 / 4-4-3 / 4-4-4 본문 추가
- Q4 / Q6 / Q7 FAQ 갱신

본 PR 동봉 ✅ — 별도 docs PR 폐기 패턴 준수.

### 1-9. 한국어 가드 (feedback_korean_commits / feedback_role_naming_full)

| 항목 | 결과 |
|---|---|
| commit 메시지 한국어 | PASS — 086e461 / 4e98f62 / ca71dd0 모두 한국어 |
| PR title / body 한국어 | PASS |
| Javadoc / JSDoc 한국어 | PASS |
| Role 풀네임 (ACCOUNTANT / MANAGER / MASTER) | PASS — ACCOUNTING enum 사용 0건 (PR #134 회고 적용) |
| `@PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")` 일관 | PASS — Vat / CorporateTax / PartnerAging Controller 3개 모두 |
| `feedback_no_dev_director_mention` (개발책임자 언급 금지 — 코드/문서) | PASS |

### 1-10. 파일 충돌 / 회귀

| 영역 | 결과 |
|---|---|
| `accounting.ts` Slice A 부분 (PR #134) | PASS — Slice B 추가만, 기존 변경 없음 |
| `mock.ts` Slice A fixture / endpoint | PASS — Slice B 추가만 |
| `AppLayout.tsx` 사이드바 기존 6 NavLink (Slice A) | PASS — Slice B 4개 추가 + end prop 의무 적용 |
| `routes/index.tsx` Slice A 라우트 6개 | PASS — Slice B 라우트 6개 (페이지 3 + 인쇄 3) 신규 추가 |
| `TaxInvoice` domain | PASS — invoiceType 신규 필드만, 기존 라이프사이클 메서드 무수정 |

---

## 2. PR #134 회고 가드 점검

| 가드 | 결과 | 근거 |
|---|---|---|
| ACCOUNTING enum 사용 X | PASS | `@PreAuthorize` 모두 `ACCOUNTANT/MANAGER/MASTER` 풀네임 |
| `@MockitoSettings(strictness = Strictness.LENIENT)` 명시 | PASS | VatReportServiceTest § 42 / CorporateTaxReportServiceTest § 31 / PartnerAgingServiceTest § 38 |
| IT `@Transactional` + `@MockBean` 외부 client | PASS | SliceBValidationIT § 54 (@Transactional) + § 58~61 (@MockBean SlipServiceClient/ProductClient/PartnerLookupClient/ChatRoomMappingClient) |
| raw hex 0건 (FE) | PASS | grep 결과 0건 — design-system 토큰만 |
| design-system Input 컴포넌트 | PASS | VatReportPage / CorporateTaxReportPage / PartnerAgingPage 모두 |
| NavLink end prop | PASS | Slice B 4개 NavLink 모두 end prop 적용 (AppLayout § 246~298) |
| BE-FE 권한 enum 일치 (ACCOUNTANT/MANAGER/MASTER) | PASS | BE @PreAuthorize ↔ FE `ACCOUNTING_ROLES` (`routes/index.tsx` § 204) |

---

## 3. TM 자가 fix 작업 요약

PR 발행 전 TM 이 발견한 BLOCKER 와 자가 fix 내용 (별도 commit 으로 발행 예정):

### 3-1. BLOCKER fix

| 파일 | 변경 | 사유 |
|---|---|---|
| `clients/desktop/src/renderer/api/accounting.ts` | VatReportResponse / CorporateTaxReportResponse 인터페이스 BE 와 1:1 정렬 | 런타임 시 `undefined` 표시 → 화면 깨짐 |
| `clients/desktop/src/renderer/routes/VatReportPage.tsx` | `data.dueDate` → `data.filingDeadline` (1건) | 동일 |
| `clients/desktop/src/renderer/routes/CorporateTaxReportPage.tsx` | `addBack`/`deductions`/`prepaidTax`/`dueDate` → `addedDeductions`/`subtractedDeductions`/`taxAlreadyPaid`/`filingDeadline` (4건) | 동일 |
| `clients/desktop/src/renderer/routes/accounting/print/VatReportPrintLayout.tsx` | `dueDate` → `filingDeadline` (1건) | 동일 |
| `clients/desktop/src/renderer/routes/accounting/print/CorporateTaxReportPrintLayout.tsx` | `addBack`/`deductions`/`prepaidTax`/`dueDate` → `addedDeductions`/`subtractedDeductions`/`taxAlreadyPaid`/`filingDeadline` (4건) | 동일 |
| `clients/desktop/src/renderer/api/mock.ts` | `MOCK_VAT_REPORT` / `MOCK_CORPORATE_TAX_REPORT` fixture + endpoint handler 필드명 정렬 | mock 모드 화면 정합성 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SliceBValidationIT.java` | corporate-tax 테스트 query param `year` → `fiscalYear` + Javadoc | BE controller 가 `@RequestParam int fiscalYear` 필수 → 기존 `year` 는 missing required parameter 400 → assertion fail |

### 3-2. NIT (별도 fix 없음, PR 댓글 권고)

| 항목 | 메모 |
|---|---|
| `canAccessAccounting(role)` 가드가 ACCOUNTANT/MASTER 만 허용 (MANAGER 제외) | AppLayout 사이드바 회계 그룹이 MANAGER 에게 미노출. 그러나 `canAccessAccountingReports` 함수 (§ 624) 는 MANAGER 포함 — 별도 가드 함수. 본 PR 책임 아님. 향후 MANAGER 의 회계 그룹 가시성 정책 명확화 필요 (별 PR) |
| `PartnerAgingLine.partnerId` BE 가 응답에 string 직렬화 | FE 화면 표시 안 함. 그러나 응답 payload 에 UUID 노출됨. 향후 BE record 에서 partnerId 제거 또는 internal-only 마킹 검토 (별 PR) |
| Slice A `MOCK_INCOME_STATEMENT.period: '202604'` (라벨 형식 미정렬) | PR #134 머지 완료 항목. Slice A 별도 후속 정합성 패치 검토 |

---

## 4. 검증 결과 요약

| Check | 결과 | fix |
|---|---|---|
| API contract | BLOCKER 6건 → **fix 완료** | TM commit |
| mock shape | BLOCKER (계약 정렬에 종속) → **fix 완료** | TM commit |
| 도메인 정합성 | PASS | — |
| Layer 4 메서드 | PASS | — |
| UUID 가드 | PASS (NIT 1건) | — |
| design-system | PASS | — |
| Flyway 의존성 (V7~V9) | PASS | — |
| 매뉴얼 동기화 | PASS | — |
| 한국어 가드 | PASS | — |
| 파일 충돌/회귀 | PASS | — |
| **PR #134 회고 가드 7항** | PASS | — |

### 검증 카운트
- BLOCKER: **6건 (모두 fix 완료)**
- WARNING: 0건
- NIT: 3건 (별 PR 권고)

### 빌드/테스트 결과 (TM fix 후)
- `gradlew :services:accounting-service:compileJava` PASS
- `gradlew :services:accounting-service:compileTestJava` PASS
- `gradlew :services:accounting-service:test` (VatReport 8 + CorporateTax 5 + PartnerAging 5 = 18건) PASS
- `clients/desktop` `npx tsc --noEmit` PASS (exit 0)

---

## 5. PM 권고

- **PR 발행 권장**: ✅ 권장. TM 자가 fix commit 1건 추가 후 5-team reviewer 호출 + PM 풀빌드 + CI green watch.
- **머지 권한**: 개발책임자 본인 (feedback_user_merge_authority).
- **후속 NIT 3건**: 별 PR 또는 Slice C 진행 시 동봉 검토.
