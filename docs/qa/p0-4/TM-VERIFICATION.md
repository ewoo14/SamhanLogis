# TM 통합 검증 보고서 — PR #139 P0-4 세금계산서 발행/인쇄

- 대상 PR: [#139 — feat(P0-4): 세금계산서 발행 + 인쇄 (NTS 종이 양식, NTS API 연계는 Phase 11+1개월)](https://github.com/ewoo14/SamhanLogis/pull/139)
- 브랜치: `feature/p0-4-tax-invoice-issue`
- 회수한 commit: `0a8bf9d` (BE) / `3b0ae57` (FE) / `6c44157` (Designer + DevOps)
- TM 검증 일시: 2026-05-11
- 5-team 산출물 종합 + cross-check + 자가 fix commit

---

## 1. 검증 범위

| 영역 | 산출물 | TM 점검 항목 |
| --- | --- | --- |
| BE | TaxInvoice 도메인 + Service + Controller + 5 endpoint + V11/V12 + 19 unit/IT | 도메인 메서드 의미 / @MockitoSettings(LENIENT) / @Transactional + @MockBean 4종 / V11 의존성 / KoreanAmountConverter 정확도 |
| FE | TaxInvoiceListPage + FormPage + DetailPage + Print + mock + 매뉴얼 | BE record ↔ TS interface 1:1 / @RequestParam 이름 / design-system Input / raw hex 0건 / UUID 비공개 |
| Designer | `TAX-INVOICE-DESIGN.md` (NTS 표준 A4 spec) | Pretendard 9 weight / 토큰 / 5회 iteration |
| DevOps | V12 seed (DRAFT 2 + ISSUED 3 + CANCELLED 1) + P04ValidationIT 5 시나리오 | UUID 결정성 / VAT 10% invariant / 외부 client @MockBean 4종 |

---

## 2. PR #134/#136/#137/#138 회고 가드 점검

| 회고 가드 | 결과 | 비고 |
| --- | --- | --- |
| BE record vs FE TS interface 1:1 (PR #136) | **FAIL → fix commit 발행** | `TaxInvoiceLineResponse.spec` → `specification` BE rename 했으나 FE 미반영. 자가 fix 로 `TaxInvoiceLine.specification` + `unit` 동기화 |
| @RequestParam 이름 정확 (PR #136) | PASS | `TaxInvoiceController.history` — `status / type / fromDate / toDate / partnerId / page / size` 모두 명시 |
| @MockitoSettings(LENIENT) | PASS | `TaxInvoiceServiceTest` `@MockitoSettings(strictness = Strictness.LENIENT)` 적용 |
| IT @Transactional + @MockBean 외부 client 4종 | PASS | `P04ValidationIT` SlipServiceClient/ProductClient/PartnerLookupClient/ChatRoomMappingClient 4종 격리 + `@Transactional` |
| raw hex 0건 (FE) | PARTIAL | `TaxInvoiceDetailPage` / `FormPage` / `ListPage` 에 inline hex (`#6B7280`, `#1E40AF`, `#FEF2F2` 등) 다수 — Slice A/B/C 패턴이라 **본 PR 범위 외 회고 가드 필요** (별도 NIT) |
| ROLE enum ACCOUNTANT/MANAGER/MASTER (ACCOUNTING X) | PASS | Controller `@PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")` 표기 정확 |

---

## 3. P0-4 특화 검증

| 항목 | 결과 | 검증 근거 |
| --- | --- | --- |
| TaxInvoice 도메인 메서드 (cancel / issue / addLine) | PASS | `TaxInvoice.cancel(reason, actorUserId)` 5자 검증 + `@Deprecated cancel(actorUserId)` 호환 유지. `issue()` taxInvoiceNo 채번 + DRAFT-only + 라인 0건 가드 / `addLine()` DRAFT-only 가드 |
| KoreanAmountConverter 정합성 | PASS | 0 → "일금영원정", 305만 → "일금삼백오만원정", 1조 미만 / 음수 처리 로직 검증. 단위 테스트 시나리오 8 (`scenario8_print_issuedInvoice`) 통과 |
| partnerBusinessNumber 형식 (XXX-XX-XXXXX) | PASS | `TaxInvoiceCreateRequest.@Pattern(regexp = "^\\d{3}-\\d{2}-\\d{5}$")` + IT 시나리오 2 (`issueRequest_invalidBusinessNumber_400`) |
| invoiceNo 채번 (TaxInvoiceNumberSequence) | PASS | `TaxInvoiceNumberService.next()` 호출 + DB UNIQUE INDEX 백업. IT `issueChangesStatusToIssuedWithJournalId` 검증 |
| V11/V12 Flyway 의존성 | PASS | V11 = column ADD (cancel_reason / partner_code / unit) + 인덱스 3종, IF NOT EXISTS 가드. V12 = seed (V11 컬럼 사용). 모두 NULLable / `ON CONFLICT DO NOTHING` |
| NTS 양식 spec (Designer) | PASS | `TAX-INVOICE-DESIGN.md` — NTS 표준 A4 / 책번호/일련번호/공급자/수신자/11자리 셀 + 5회 iteration 계획 + Status Badge 토큰 |

---

## 4. TM 발견 결함

### 4-1. BLOCKER (실 BE 통신 시 즉시 회귀)

| # | 위치 | 결함 | fix commit |
| --- | --- | --- | --- |
| **B1** | `clients/desktop/src/renderer/api/taxInvoiceApi.ts` `TaxInvoiceLine.spec` | BE `TaxInvoiceLineResponse` 가 `spec` → `specification` 으로 rename 됨 (commit 0a8bf9d). FE TS interface 미반영 → 모든 라인 표 / 인쇄 양식 / 폼 hydrate 에서 `undefined`. mock 모드에서는 mock 데이터가 `spec` 키를 사용해 가짜로 작동. **실 BE 통신 시 100% 깨짐** | 본 PR 통합 fix |
| **B2** | `clients/desktop/src/renderer/api/printApi.ts` `TaxInvoiceLine.spec` | (B1 과 별개의 두 번째 type) — `TaxInvoiceView.tsx` 인쇄 양식이 사용. 동일 회귀 | 본 PR 통합 fix |
| **B3** | `clients/desktop/src/renderer/api/taxInvoiceApi.ts` `TaxInvoiceCancelRequest` | JSDoc 주석 `1~200자` + Modal `maxLength={200}` + Submit 버튼 `!cancelReason.trim()` 활성화 → 사용자가 1~4자 reason 입력 후 제출 가능. BE `@Size(min=5, max=1000)` 검증으로 400 반환 — UX 회귀 | 본 PR 통합 fix |

### 4-2. WARNING

| # | 위치 | 결함 | fix commit |
| --- | --- | --- | --- |
| **W1** | `TaxInvoiceDetailPage.tsx` CANCELLED 상태 | BE 가 cancelReason 을 응답에 포함하나 FE Detail 화면이 noscript 로 표시 안 함. 사용자는 "왜 취소되었는지" 알 수 없음 | 본 PR 통합 fix — CANCELLED 시 빨간 banner 로 cancelReason 인라인 노출 |
| **W2** | `TaxInvoiceDetail` interface | P0-4 신규 필드 (`invoiceType`, `partnerCode`, `cancelReason`) 누락. mock 도 동일 누락 | 본 PR 통합 fix — 3 필드 추가 + mock fixture 동기화 |
| **W3** | `mock.ts` cancel handler | `cancelReason` body 를 echo 안 해 mock 모드에서 W1 검증 불가 | 본 PR 통합 fix — `req.reason` echo |

### 4-3. NIT (회고 PR 대상)

| # | 위치 | 결함 | 처리 |
| --- | --- | --- | --- |
| N1 | `application.yml` `app.company.business-number` 기본값 | `000-00-00000` 더미. Designer spec 은 실제 사업자번호 `214-87-20659`. 운영 배포 시 `SAMHAN_COMPANY_BUSINESS_NUMBER` 주입 의무 — README/배포 가이드에 명시 권장 | 후속 PR |
| N2 | `mock.ts` GET regex `\/accounting\/tax-invoices\/([^/?]+)$` | `/accounting/tax-invoices/history` 와도 매칭. 단건 detail handler 가 history 응답 가로챔 (현 FE 는 legacy GET 사용 → 무영향). 향후 FE 가 `/history` 호출 시 NIT 충돌 | 후속 PR — regex 에 `(?!history|new|edit)` lookahead |
| N3 | `TaxInvoiceFormPage` raw hex (`#D1D5DB`, `#F9FAFB` 등) | Slice A/B/C 패턴 일관 — 본 PR 범위 외 (전체 회계 화면 통합 정정 PR 권장) | 후속 PR |
| N4 | `TaxInvoiceCreateRequest.@Pattern` | `partnerBusinessNumber` null 허용이지만 `@NotNull` 미적용 → `null` 시 검증 통과. 신규 BE endpoint `/issue-request` 에서 사업자번호 누락 가능 | NIT (NTS spec 상 의무 필드이므로 후속 강화) |
| N5 | `TaxInvoicePrintResponse.PrintLine.specification` | BE record 필드는 `specification` 인데 designer ASCII spec 의 컬럼 라벨은 "규격". FE 매핑 PR 의 print iteration 2 에서 정렬 확인 권장 | 후속 PR — Iteration 2 |

---

## 5. TM 통합 cross-check 결과

| Check | 결과 | fix commit |
| --- | --- | --- |
| UUID 정합성 | PASS | partnerId / journalId / reverseJournalId / lineId 모두 path-only. 화면 노출 = `taxInvoiceNo` / `partnerCode` / `partnerName` / `partnerBusinessNo` |
| API contract (BE record ↔ FE interface) | **WARN → fix 발행** | B1/B2/B3/W1/W2/W3 통합 fix commit |
| 디자인 일관성 | PASS (NIT 후속) | design-system Input / Button / Card / Modal / Badge / DataTable 사용. raw hex 는 Slice A/B/C 패턴 — N3 후속 |
| 도메인 정합성 (Layer 4) | PASS | TaxInvoice.cancel(reason, actor) / issue(no, actor) / addLine 모두 도메인 메서드. KoreanAmountConverter / VAT 10% invariant 보장 |
| Flyway 의존성 (V11/V12) | PASS | V11 column ADD (NULLable / IF NOT EXISTS), V12 seed 가 V11 컬럼 의존 — 순서 정확. legacy 호환 OK |
| 메모리 가드 | PASS | feedback_uuid_no_user_visibility / project_korean_accounting / feedback_korean_commits / feedback_no_dev_director_mention / feedback_role_naming_full / feedback_pr_qa_screenshots 모두 준수 |

---

## 6. TM 자가 fix commit 변경 파일

| 파일 | 변경 |
| --- | --- |
| `clients/desktop/src/renderer/api/taxInvoiceApi.ts` | `TaxInvoiceLine.spec` → `specification` + `unit` 신규 / `TaxInvoiceDetail` 에 `invoiceType` + `partnerCode` + `cancelReason` 추가 / `TaxInvoiceCancelRequest` 주석 `5~1000자` 정정 / `TaxInvoiceType` export |
| `clients/desktop/src/renderer/api/printApi.ts` | `TaxInvoiceLine.spec` → `specification` + `unit` (B2 fix) |
| `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx` | 라인 표 `spec` → `specification` 컬럼 + `unit` 컬럼 신규 / CANCELLED 시 `cancelReason` banner 노출 / Modal `min=5, max=1000` 강제 + 카운터 색상 |
| `clients/desktop/src/renderer/routes/TaxInvoiceFormPage.tsx` | hydrate 시 `l.spec` → `l.specification` 매핑 |
| `clients/desktop/src/renderer/print/TaxInvoiceView.tsx` | 라인 표 `l.spec` → `l.specification` |
| `clients/desktop/src/renderer/api/mock.ts` | `MOCK_TAX_INVOICES` 3건 모두 `specification` + `unit` + `partnerCode` + `invoiceType` + `cancelReason` 필드 추가 / cancel mock handler `reason` body echo |

검증:
- `cd clients/desktop && npm run typecheck` → PASS
- `cd clients/desktop && npm run lint` → 0 error (pre-existing 2 warning 무관)
- `./gradlew :services:accounting-service:assemble` → PASS

---

## 7. PM 위임 요청

- 풀빌드 (`./gradlew assemble` + `npm run build`) 검증 위임
- CI 100% green 확인 후 PR 발행 권장 (PM 작업)
- 본 TM commit 은 사용자 PR comment + 회고 가드로 추가 활용

---

## 8. 회고 인덱스

본 PR 의 회귀 가드를 누락하지 않도록 `feedback_be_fe_field_rename_propagation` 신규 메모리 등록 권장 (PM 결정):
- BE record 필드 rename (예: `spec` → `specification`) 시 FE TS interface + mock fixture + 인쇄 view + 폼 hydrate 4 곳 동시 갱신 의무
- 회귀 검출 = `npm run typecheck` 만으로는 부족 (FE interface 가 BE record 와 독립이라 mismatch silent). 반드시 mock 모드 → 실 BE 모드 양쪽 smoke test 필수

---

생성: 2026-05-11 / TM (Claude Opus 4.7 1M context)
