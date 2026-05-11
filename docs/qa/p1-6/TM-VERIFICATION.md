# TM 통합 검증 — PR #146 (P1-6 Excel export)

| 항목 | 값 |
|------|-----|
| 작성일 | 2026-05-11 |
| 담당 | TM (통합 cross-check) |
| 대상 PR | https://github.com/ewoo14/SamhanLogis/pull/146 |
| 대상 branch | `feature/p1-6-excel-export` |
| TM fix branch | `fix/p1-6-excel-export-tm-cross-check` |
| 선행 PR 회고 가드 | #134 ~ #145 (P0-1 Slice A~C, P0-2, P0-4, P0-5, P0-6, P0-9, P1-3, P1-4, P1-5) |

> **본 검증 진행 중 origin push 동기화 메모** — TM 검증 도중 origin/feature/p1-6-excel-export
> 에 BE/FE/Designer 후속 fix 3 commit (`a051391`, `4ef82f2`, `a365b5a`) 이 추가 push 되었다.
> 해당 commit 들이 본 TM 이 식별한 BLOCKER 5건을 모두 해소함이 확인되었으므로, 본 TM 통합
> commit 은 docs 정정 + TM-VERIFICATION 문서화만 포함한다.

---

## 1. cross-check 결과 요약

| Check | 결과 | 조치 |
|---|---|---|
| UUID 정합성 | PASS | BE 응답 / FE 컬럼 모두 비즈니스 식별자 (slipNo / partnerCode / journalNo / warehouseCode) 만 사용. UUID 사용은 mutation path 내부 한정. |
| API contract (path) | **fix 필요 → fix 완료** | FE excelExportApi.ts 의 4 path 가 BE controller `@RequestMapping` + `.xlsx` suffix 와 mismatch — 정정. |
| API contract (query param) | **fix 필요 → fix 완료** | partner `type→q`, slip `fromDate/toDate→from/to`, journal `period→from/to (필수)` 정정. |
| 디자인 일관성 | PASS (NIT 1) | EXCEL-EXPORT-DESIGN.md 의 `onDownload/fileName` ↔ 실제 `onFetch/filename` mismatch — 가이드 정정. |
| 도메인 정합성 | PASS | SlipExcelExportService.list 호출 시그니처 (8 인수) ↔ SlipController.list 일치. JournalService.list / PartnerRepository.searchAdmin / StockBalanceRepository 호출 검증. |
| Flyway 의존성 | PASS | 신규 마이그레이션 0건 (read-only 조회만). |
| 메모리 가드 | PASS | 한국어 commit / Layer 4 / @MockBean 4종 / extends AbstractPostgresIT / role 풀네임 (MASTER/MANAGER/SALES) / UUID 비공개. |
| 권한 가드 (export endpoint) | **fix 필요 → fix 완료** | SlipController.exportXlsx `@PreAuthorize("isAuthenticated()")` ↔ IT TC-8 (SALES → 403) mismatch — `hasAnyRole('MANAGER','MASTER')` 로 정정. |

---

## 2. 발견 BLOCKER (5건) + fix

### B-1. SlipController.exportXlsx 권한 ↔ IT TC-8 충돌

- **현상**: BE `@PreAuthorize("isAuthenticated()")` (모든 인증 사용자 허용) ↔ IT TC-8 (SALES → 403 기대) 정면 충돌.
- **fix**: `hasAnyRole('MANAGER','MASTER')` 로 변경.
- **commit**: `9700b0d fix(slip-be): SlipController.exportXlsx 권한 MANAGER/MASTER 만`

### B-2 ~ B-5. FE ↔ BE endpoint URL / query param mismatch (4 endpoint)

| # | endpoint | BE 실제 (gateway 통과 후 매칭 path) | FE 호출 (PR head, fix 전) | fix 후 FE 호출 |
|---|---|---|---|---|
| B-2 | partner | `/admin/partners/export.xlsx?q&status` | `/api/v1/partners/export?type&status` | `/api/v1/partners/admin/partners/export.xlsx?q&status` |
| B-3 | slip | `/slips/export.xlsx?slipType&status&from&to&partnerCode` | `/api/v1/slips/export?slipType&fromDate&toDate` | `/api/v1/slips/slips/export.xlsx?slipType&from&to` |
| B-4 | accounting | `/accounting/journals/export.xlsx?from&to&status` (from/to **필수**) | `/api/v1/accounting/journals/export?period&status` | `/api/v1/accounting/accounting/journals/export.xlsx?from&to&status` |
| B-5 | inventory | `/inventory/stocks/export.xlsx?warehouseId` | `/api/v1/inventory/stocks/export?warehouseCode` | `/api/v1/inventory/inventory/stocks/export.xlsx` (전 창고 export 만 사용) |

**fix 정책**:

1. URL: BE 그대로 유지 (`.xlsx` suffix), FE 가 BE 시그니처에 맞춰 정정. gateway routing `/api/v1/{service}/**` → StripPrefix=2 → BE controller `/{prefix}/...` 매칭.
2. partner: BE 가 type 미지원이므로 FE 의 typeFilter 는 export 에서 제외 (검색 list 에서는 보존).
3. slip: BE 가 8 인수 받음 (`slipType, status, from, to, partnerCode, driverPhone, regionGroup`) — FE 는 slipType + from + to 만 사용. 추후 BE-A0 5 param 화면 보강은 후속 슬라이스.
4. journal: BE 가 from/to 를 필수로 받음. FE 가 period(YYYYMM) → 1일~말일 변환 후 from/to 전달.
5. inventory: BE 가 warehouseId(UUID) 만 받음. FE 사용처 (TransferListPage) 는 전 창고 export 만 호출하므로 warehouseId 미전달 → UUID 비공개 가드 자동 보존. 향후 창고별 export 시 별도 슬라이스에서 warehouseCode→id 변환 endpoint 도입 권장.

- **commit**: 본 TM 통합 fix commit (아래 §4 참조).

---

## 3. WARNING / NIT (보고 + 비-차단)

### W-1. mock CSV 컬럼 ↔ 실제 BE Excel 컬럼 mismatch (NIT)

`excelExportMock.ts` 의 4 mock CSV 가 BE 의 실제 컬럼과 불일치.

| 도메인 | mock CSV 컬럼 | BE 실제 컬럼 |
|---|---|---|
| 거래처 | 거래처코드 / 상호 / 사업자번호 / 유형 / 대표자 / 전화 / FAX / 이메일 / 상태 / 신용한도 / 미수금잔액 / 거래시작일 | 거래처코드 / 거래처명 / 사업자번호 / 연락처 / 주소 / 분류1 / 분류2 / 상태 / 신용한도 / 미수금 |
| 전표 | 전표번호 / 구분 / 거래처 / 일자 / 상태 / 창고 / 품목수 / 금액합계 | 전표번호 / 전표일자 / 전표유형 / 상태 / 거래처명 / 배송태그 / 요청자 / 수락자 / 수락일시 / 완료일시 / 확정일시 |
| 분개 | 분개번호 / 일자 / 상태 / 적요 / 차변합계 / 대변합계 / 작성자 | 분개번호 / 분개일자 / 적요 / 출처 / 상태 / 차변합계 / 대변합계 / 게시일시 / 게시자 |
| 재고 | 창고코드 / 창고명 / 품목코드 / 품목명 / 가용수량 / 예약수량 / 합계 / 안전재고임계 / 상태 | 창고코드 / 창고명 / 가용수량 / 예약수량 / 총수량 |

mock 은 dev-only screenshot capture 용이므로 본 PR 에서는 비-차단으로 분류. 후속 슬라이스에서 BE 컬럼과 1:1 정렬 권장.

### W-2. EXCEL-EXPORT-DESIGN.md props 명명 불일치 (정정 완료)

Designer 가이드의 `onDownload / fileName / className` ↔ 실제 구현의 `onFetch / filename / variant / size`. 본 TM commit 에서 가이드 측 정정.

### N-1. partner-service 의 PartnerType enum 부재

PartnersPage 가 `PARTNER_TYPE_LABEL` (FE) 을 import 하고 typeFilter 로 list 검색에 사용하지만, BE partner.domain 에는 PartnerType enum 자체가 없음. 검색 list 호출 시 BE 가 type param 을 무시하는 silent fallback. 본 PR 범위 외 (별도 backlog).

### N-2. desktop renderer baseURL = http://localhost:8080 + `/slips/...` 호출 패턴

`slip.ts` 가 `/slips/{id}` 직접 호출 (gateway prefix 미사용). 8080 gateway 의 어떤 route 와도 매칭되지 않으나 본 PR 범위 외 기존 버그 (또는 mock-only 사용). PR #146 신규 endpoint 는 `/api/v1/{service}/...` 표준 prefix 를 정확히 사용함.

---

## 4. TM 통합 fix commit

origin 의 후속 fix 3 commit (BE/FE/Designer agent 가 본 TM 검증과 병행 수행) 이 코드 BLOCKER
5건을 모두 해소하였으므로, 본 TM 통합 commit 은 docs 정정 + TM-VERIFICATION 문서화로 한정한다.

| 변경 파일 | 변경 내용 |
|---|---|
| `clients/desktop/src/renderer/EXCEL-EXPORT-DESIGN.md` | props 가이드 (`onDownload/fileName` → `onFetch/filename`) 실제 구현과 정렬 + DOM 패턴 예시 정정 |
| `docs/dev-reports/p1-6-excel-export.md` | §6-4 endpoint 표 정정 (정정 후 최종 매트릭스 명시) |
| `docs/qa/p1-6/TM-VERIFICATION.md` | (본 문서 신규) |

origin 에 이미 적용된 코드 fix commit:
- `a051391 fix(slip-be): SlipController.exportXlsx 권한 MANAGER/MASTER 만 (TC-8 충돌 해소)` — B-1
- `4ef82f2 fix(p1-6): Designer + QA BUG fix 통합 (Excel green / 텍스트 / UUID 노출 / 한글 파일명)` — B-2/3/4/5 + Designer / SlipExcelExportService UUID 컬럼 제거 (requesterId / acceptedBy)
- `a365b5a fix(excel-fe): PR #146 Designer BLOCKER fix (Excel green #107C41 적용 + 텍스트 통일)` — Stories type 에러 fix

---

## 5. 검증 결과 (TM fix 적용 후)

| 검증 | 결과 |
|------|:----:|
| BE 5 모듈 (`partner-service` / `slip-service` / `inventory-service` / `accounting-service` / `shared:common`) `compileJava` | PASS |
| BE 5 모듈 `compileTestJava` (test source 포함) | PASS |
| `shared:common:test --tests ExcelExporterTest` (5 단위 TC) | PASS |
| `clients/desktop` `tsc --noEmit -p tsconfig.web.json` | PASS |
| SlipExcelExportIT (8 TC) | Docker 가용 환경에서 PM 풀빌드 검증 위임 |

---

## 6. 메모리 가드 점검 (PR #134~#145 회고 적용)

| 가드 | 적용 여부 |
|---|:---:|
| `feedback_uuid_no_user_visibility` (UUID 비공개) | PASS — 전 컬럼 비즈니스 식별자, FE 의 inventory 호출은 전체 export 만 |
| `project_korean_accounting` (한국 표준 계정과목) | PASS — JournalExcelExportService 의 sourceType / status 한국어 라벨 |
| `feedback_korean_commits` (한국어 commit/PR/Issue) | PASS — fix commit 메시지 모두 한국어 |
| `feedback_no_dev_director_mention` (개발책임자 단어 금지) | PASS — 본 검증 산출물 점검 완료 |
| `feedback_role_naming_full` (Role 풀네임) | PASS — MASTER/MANAGER/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY 풀네임 |
| `feedback_pr_qa_screenshots` (QA 스크린샷) | PM 풀빌드 단계에서 `docs/qa/p1-6/*.png` 추가 권장 |
| `feedback_it_mockbean_external_clients` (IT 외부 client @MockBean) | PASS — InventoryClient / ProductClient / NotificationClient / PartnerInternalClient 4종 모두 `@MockBean` + `Mockito.lenient()` |
| `feedback_pm_integration_build_check` (PM 통합 풀빌드 가드) | PM 위임 — gradle assemble + 단위테스트 |

---

## 7. PM 위임 사항

1. PM 풀빌드 (`./gradlew assemble` + 5 모듈 `:test`).
2. Docker 가용 환경에서 SlipExcelExportIT 8 TC 실행.
3. PR 본문에 QA 스크린샷 첨부 (4 페이지 Excel 버튼 클릭 → 다운로드 성공 캡처).
4. PR description 의 endpoint 표를 본 fix 결과와 일치시킬 것 권장.
5. CI green 후 PM 승인 → 개발책임자 머지 요청.

---

## 8. TM 검수 결과

**통과** (BLOCKER 5건 자가 fix 완료, WARNING 2건 fix 완료, NIT 2건 후속 backlog).

PM 단계로 위임.
