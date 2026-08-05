# PR #1061 R7 재수렴 — SalesAggregateService 영향 조사

## 조사 로그

- 2026-08-03: 저장소 지침(`AGENTS.md`, `docs/handoff/CURRENT-WORK.md`, `.codex/AGENTS.md`)을 확인했다. 이번 라운드는 요청된 단일 각도만 읽기 전용으로 조사하고, git 변경 작업·공유 DB write/DDL·전체 accounting-service 스위트는 수행하지 않는다.
- 2026-08-03: 작업 위치는 `feat/1001-ledger-spec-rest`의 HEAD `bd9082802f62039d088986f994f1235a0471dfce`이며, 조사 시작 시 작업트리 변경은 이 R7 신규 보고서뿐이었다.
- 2026-08-03: R6 보고서에서 `SalesAggregateService`가 선택 거래처의 `salesTotal`만 회계 401 분개 합계 대신 `PartnerLedgerSalesClient.find(...)`의 출고 slip 품목 `lineAmount` 합계로 바꿨고, payment/receivable 계산은 journals 기준을 유지했음을 확인했다. 보고서에 기록된 실데이터 양방향 차이는 고아 회계분개 공급가액 20,000,000원 1건과 무분개 출고 slip 12,276,000원 1건이다.
- 2026-08-03: 저장소 전체 심볼 검색 결과 동명 클래스가 accounting-service와 dashboard-service에 각각 존재한다. R6에서 변경된 accounting-service 클래스의 운영 코드 참조는 `AccountingReportController.java:95` 주입 및 `:123`의 `aggregate(...)` 호출 1곳뿐이다. 테스트 참조는 `SalesAggregateServiceTest.java:49`, `AccountingPermissionControllerIT.java:157`이며 운영 호출 지점으로 세지 않는다. dashboard-service의 동명 클래스와 `DashboardAdminController.java:111` 호출은 패키지·구현이 다른 별도 클래스이므로 R6 변경의 직접 영향 대상이 아니다.
- 2026-08-03: 운영 호출 1곳은 `GET /accounting/sales/aggregate`(`AccountingReportController.java:108-124`)이며 응답은 매출·수금·채권 집계 행이다. 컨트롤러 설명과 OpenAPI는 이를 `accounting.reports` 재무 보고서의 BE-A8 화면으로 규정하고, 아직 "자체 분개 401/110 코드 기반 합계"라고 명시한다(`:55-66`, `:86-89`, `:108-116`). 따라서 선택 거래처 요청에서 매출만 slip 기준으로 바뀐 현재 구현(`SalesAggregateService.java:108-121`)은 이 endpoint의 기존 문서 계약과 충돌한다. 다만 이 화면이 PR #1001 원장 목록과 동일 화면인지 별도 화면인지 FE 소비처 확인 전에는 사용자 도달 결함 판정을 보류한다.
- 2026-08-03: endpoint 문자열과 DTO의 저장소 전체 소비처 검색 결과 실제 제품 FE 소비자는 `partnerLedgerApi.ts:186-203`과 `PartnerLedgerPage.tsx:243` 한 계통뿐이다. 그 밖의 일치는 mock, Playwright 계약 검사, k6 부하 요청, 문서이며 별도 제품 화면·문서 생성 호출은 발견되지 않았다. 따라서 현재까지 R6 변경이 움직일 수 있는 사용자 표면은 거래처별 원장 페이지의 집계 단계 하나로 한정된다.
- 2026-08-03: FE 데이터 흐름을 열어 확인했다. `/accounting/partner-ledger` 라우트는 집계→원장 상세→인쇄/CSV를 통합한 `PartnerLedgerPage` 하나이며(`routes/index.tsx:968-978`), Step 1이 `getSalesAggregate`를 호출한다(`PartnerLedgerPage.tsx:220-252`). 이 집계값은 같은 페이지 표와 CSV 집계 섹션(`:115-149`)에 쓰인다. 별도 화면이나 별도 문서는 아니다. 따라서 R6 변경의 직접 사용자 영향은 PR #1001 대상 원장 화면 내부에만 있고, 이 PR 밖 화면으로 이어지는 FE 호출은 발견되지 않았다.
- 2026-08-03: Issue #1001 본문을 확인했다. 정본 불변식은 거래처별 원장에 출고 판매전표(매출)와 입금보고서(수금) 두 종류만 싣고, 판매전표 내부 품목을 모두 펼치는 것이다. 따라서 이 이슈의 원장 Step 1 매출에는 출고 slip 기준이 맞다. 이슈에는 별도 재무 집계 화면이나 회계분개 기준 화면의 사양은 없다. 기존 API/FE Javadoc의 401/110 설명은 과거 BE-A8 계약 근거이지만, 현재 제품 소비자가 #1001 원장 화면 하나뿐이므로 별도 사용자 표면의 충돌 근거가 되지는 않는다.
- 2026-08-03: 정본 메모리 `.claude/memory/project_partner_ledger_and_cash_receipt.md`도 원장 매출 원천을 출고 판매전표, 수금 원천을 입금보고서로 확정한다. 반면 과거 `integration-phase-10-step-11-gas-b-accounting.md`는 BE-A8 `SalesAggregateService`를 401/110 분개 집계로 정의했지만, FE-7 산출물에서 그 BE-A8 집계를 `/accounting/partner-ledger`에 통합했다고 기록한다. 즉 과거 분개 계약은 별도 화면 사양이 아니라 현재 #1001 원장 화면의 선행 구현이며, #1001 사양이 그 화면의 매출 원천을 더 구체적으로 갱신했다.
- 2026-08-03: R6 집계가 읽는 slip 원천을 확인했다. `PartnerLedgerSalesClient.java:28-44`는 `/internal/slips/partner-ledger-sales`만 호출하고, 해당 endpoint는 활성 OUTBOUND 중 `CONFIRMED/DELIVERED/COMPLETED/SHIPPING/INSPECTING` 상태만 기간·partnerId로 조회한다(`SlipInternalController.java:75-81`, `:401-424`; `SlipRepository.java:80-96`). 그러므로 이후 SQL의 slip 집합도 이 코드 조건과 동일하게 센다.
- 2026-08-03: `information_schema.columns` SELECT로 실 DB 스키마를 확인했다. accounting 쪽 `journal_lines`에는 `journal_id/account_code/debit_amount/credit_amount/partner_id/is_deleted`가 있고, 요청한 `journal_entries` 이름은 결과에 없어 실제 헤더 테이블명을 추가 확인해야 한다. slip 쪽은 `slips(id, slip_type, slip_no, slip_date, status, partner_id, partner_code, is_deleted, ...)`와 `slip_lines(slip_id, quantity, unit_price_with_vat, line_total, is_deleted, ...)`가 존재한다. 원문 출력은 각각 15행과 102행이었다.
- 2026-08-03: accounting 헤더의 실제 테이블명은 `journals`다. SELECT 결과 `journals`에는 `id, journal_no, journal_date, source_type, source_ref_id, status, is_deleted`가 있으며, journal 관련 public 테이블은 5개였다. 이후 고아 판정은 POSTED·활성 `journals`의 `source_type='SLIP'`, `source_ref_id`와 활성 `journal_lines` 401을 사용한다.
- 2026-08-03: accounting DB의 활성 POSTED `source_type='SLIP'` + 활성 401 라인을 전수 집계했다. 서로 다른 `source_ref_id` 30건, 401 순매출 합계 412,300,000원이다. 상세 원문은 2026/01/01-1부터 2026/07/26-2까지 30행이며, R6 사례 `447d46f5-...`/`2026/02/18-1`/20,000,000원과 음수 분개 `1092f444-...`/`2026/07/26-2`/-300,000원도 포함한다. 다음 단계에서 이 30개 UUID의 현재 slip 존재 여부를 대조한다.
- 2026-08-03: accounting의 30개 `source_ref_id`를 slip DB에서 `slips.id IN (...)`로 조회한 결과 원문은 `(0 rows)`, `matched_current_slips=0`이었다. 따라서 현재 DB의 해당 회계분개는 전부 현재 slip이 없는 고아다: **30건, 401 순매출 412,300,000원**. 이 금액은 R6 후 선택 거래처 원장 집계에서 해당 거래처·기간에 원장 대상 slip이 있으면 기존 회계 매출에서 제외되는 후보 총액이다. 실제 화면 이동액은 같은 거래처·기간의 slip 합계와 함께 비교해야 하므로 아직 합산 판정하지 않는다.
- 2026-08-03: slip의 `lineAmount` 계산은 `supply_amount + vat_amount`를 우선하고, 없으면 `unit_price_with_vat × quantity`, 마지막으로 `line_total + vat_amount`를 사용한다(`PartnerLedgerSalesResponse.java:71-90`). 이후 slip SQL도 이 CASE 식으로 코드와 동일하게 계산한다.
- 2026-08-03: 코드와 동일한 상태·lineAmount CASE로 slip DB를 전수 집계했다. 원장 대상 활성 OUTBOUND slip은 **31건**, 모두 활성 품목이 있고, 품목 합계는 **354,121,900원**이다. 거래처별 결과는 31행이며 각 거래처 1건씩이다. `partner_code` snapshot은 전부 빈 값이지만 `partner_id`는 존재하므로 R6의 partnerId 조회 경로에는 포함된다. 반대 방향 무분개 여부는 이 31개 slip UUID를 accounting `source_ref_id`와 추가 대조한다.
- 2026-08-03: 원장 대상 slip 31개 UUID를 accounting의 모든 `source_type='SLIP'` journal과 대조한 결과 원문은 `(0 rows)`, `matched_ledger_slip_sources=0`이었다. 따라서 반대 방향도 **slip은 있으나 분개가 없는 전표 31건, 354,121,900원**이다. 현재 두 DB의 seed 집합은 UUID로 단 한 건도 서로 연결되지 않는다.
- 2026-08-03: 전체 보유 데이터 기간을 한 번에 보는 선택 거래처 검색을 모델링해 partnerId별 구·신 매출을 대조했다. slip이 있는 31개 거래처의 구 회계 401 합계는 189,700,000원, 신 slip 합계는 354,121,900원, 순이동은 **+164,421,900원**이다. 12개 거래처는 양쪽 원천이 모두 있으나 UUID는 불일치하고, 19개는 slip 쪽에만 있다. 31개별 이동 원문에는 R6 사례 -7,724,000원, 최대 증가 +21,687,600원 등이 포함된다. 이는 한 화면의 31가지 선택 필터 결과이지 31개 화면이 아니다. 무필터 집계는 코드상 slip override를 타지 않아 **이동 0원**이다.
- 2026-08-03: `git show HEAD`로 R6 커밋 범위를 재확인했다. 변경 파일은 R6 보고서, accounting `SalesAggregateService`, 그 단위 테스트 3개뿐이며 서비스 구현 변화는 선택 거래처(`filterPartnerId != null`)일 때 ledger slip이 비어 있지 않은 경우 `salesTotal`만 대체하는 18줄이다. 따라서 accounting-only 거래처나 무필터 요청은 기존 회계값을 그대로 유지한다.
- 2026-08-03: 선택 거래처 이동을 양쪽 원천 존재 여부로 다시 집계했다. 양쪽 partnerId가 있는 12곳은 189,700,000원→178,340,800원, **-11,359,200원**(개별 -17,343,800원~+17,946,600원)이고, slip-only 19곳은 0원→175,781,100원, **+175,781,100원**(개별 +229,900원~+21,687,600원)이다. 합계 순이동은 +164,421,900원이다.
- 2026-08-03: 회계 고아 후보 합계 명령을 중복 가능성이 없는 단일 grouped subquery(`COUNT(*), SUM(revenue_401)`)로 다시 실행해도 30건·412,300,000원으로 동일했다. 아래 재현 명령은 이 단순화한 최종 SELECT를 사용한다.
- 2026-08-03: 최종 검증에서 보고서 전문, 서비스 심볼 참조, 필수 섹션, DB 합계를 다시 읽었다. 명령은 exit 0이며 accounting 30건·412,300,000원, slip 31건·354,121,900원이 재현됐다. `git status --short`는 이 신규 보고서 1개만 표시했고 `git diff --check` 출력은 없었다.

## 호출 지점 전수 목록과 화면·문서 판정

| 구분 | 호출 지점(파일:줄) | 쓰이는 화면·문서 | 원천 판정 | 근거 및 영향 |
|---|---|---|---|---|
| 운영 controller 주입 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:95` | 아래 BE-A8 endpoint | 주입만 수행 | 운영 bean 보유 지점이다. |
| 운영 직접 호출(유일) | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:123` | `GET /accounting/sales/aggregate` → 데스크톱 `/accounting/partner-ledger` Step 1 표와 같은 페이지 CSV 집계 섹션 | **출고 slip 기준이 맞음** | Issue #1001 및 정본 메모리는 원장 매출을 출고 판매전표로 확정한다. FE 연결은 `partnerLedgerApi.ts:193-206`, `PartnerLedgerPage.tsx:243-252`; CSV 소비는 `PartnerLedgerPage.tsx:115-149`. |
| 단위 테스트 직접 호출 | `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesAggregateServiceTest.java:69,86,147,174,197,224` | 화면·문서 없음; service fixture | 제품 판정 대상 아님 | 운영 호출이 아니다. `:224`가 R6 slip 기준 회귀다. |
| 권한 IT mock 주입 | `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/AccountingPermissionControllerIT.java:157` | endpoint 권한 검사 fixture | 제품 판정 대상 아님 | 서비스는 mock이며 직접 집계하지 않는다. |

다른 service·batch·report의 accounting `SalesAggregateService` 직접 호출은 **0곳**이다. `services/dashboard-service/.../SalesAggregateService.java:26`과 `DashboardAdminController.java:111`은 패키지와 구현이 다른 동명 클래스라 R6 변경 대상이 아니다. 저장소 밖 비공개 소비자 존재 여부에는 근거가 없으므로 추측하지 않는다.

## 사용자 도달 경로와 수치 이동

| 사용자 조작 | R6 전 | R6 후 | 이동 | 판정 |
|---|---:|---:|---:|---|
| `/accounting/partner-ledger`에서 거래처를 비우고 조회 | 회계 401 집계 | 회계 401 집계 | 0원 | `filterPartnerId == null`이라 변경 코드 미진입. 이번 각도에서 회귀 없음. |
| 같은 화면에서 원장 대상 slip이 있는 거래처 31곳을 각각 선택 검색(현재 보유 데이터 전체 기간 기준) | 합계 189,700,000원 | 합계 354,121,900원 | **+164,421,900원** | 한 화면의 31개 필터 결과를 분석 목적으로 합산. #1001 원장 사양에 맞는 의도된 이동. |
| 위 31곳 중 양쪽 partnerId가 있는 12곳 | 189,700,000원 | 178,340,800원 | **-11,359,200원** | 개별 이동 -17,343,800원~+17,946,600원. source UUID는 모두 불일치. |
| 위 31곳 중 slip-only 19곳 | 0원 | 175,781,100원 | **+175,781,100원** | 개별 이동 +229,900원~+21,687,600원. slip 기준 원장 매출 신규 표시. |
| R6 기준 사례 `P-2026-0017`, `2026-02-01~2026-03-31` | 20,000,000원 | 12,276,000원 | **-7,724,000원** | Issue #1001 사양과 일치. |

화면 표와 CSV는 같은 `aggregateQuery` 데이터를 쓰므로 동일하게 움직인다. 인쇄 라우트는 이 endpoint를 소비하지 않아 R6 변경으로 움직이지 않는다.

## 읽기 전용 SQL 재현 명령과 출력 원문

### 1. 회계분개 쪽 전체 후보

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -c "SELECT COUNT(*) AS posted_slip_source_count, COALESCE(SUM(x.revenue_401),0) AS posted_slip_revenue_401 FROM (SELECT j.source_ref_id, SUM(jl.credit_amount-jl.debit_amount) AS revenue_401 FROM journals j JOIN journal_lines jl ON jl.journal_id=j.id AND jl.is_deleted=false AND jl.account_code='401' WHERE j.is_deleted=false AND j.status='POSTED' AND j.source_type='SLIP' AND j.source_ref_id IS NOT NULL GROUP BY j.source_ref_id) x;"
```

```text
 posted_slip_source_count | posted_slip_revenue_401
--------------------------+-------------------------
                       30 |            412300000.00
(1 row)
```

30개 `source_ref_id`를 accounting SELECT로 받아 slip DB의 `slips.id IN (...)`에 넣은 읽기 전용 대조 출력:

```text
 id | slip_no | slip_date | slip_type | status | partner_id | partner_code | is_deleted
----+---------+-----------+-----------+--------+------------+--------------+------------
(0 rows)

 matched_current_slips
-----------------------
                     0
(1 row)
```

따라서 **현재 slip이 없는 고아 회계분개 30건, 401 순매출 412,300,000원**이다.

### 2. 반대 방향 — 원장 대상 slip 쪽 전체 후보

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT COUNT(*) AS ledger_slip_count, COUNT(*) FILTER (WHERE x.line_count>0) AS slips_with_lines, COALESCE(SUM(x.slip_amount),0) AS ledger_slip_amount FROM (SELECT s.id, COUNT(sl.id) AS line_count, COALESCE(SUM(CASE WHEN sl.supply_amount IS NOT NULL AND sl.vat_amount IS NOT NULL THEN sl.supply_amount+sl.vat_amount WHEN sl.unit_price_with_vat IS NOT NULL THEN sl.unit_price_with_vat*sl.quantity WHEN sl.line_total IS NULL THEN NULL ELSE sl.line_total+COALESCE(sl.vat_amount,0) END),0) AS slip_amount FROM slips s LEFT JOIN slip_lines sl ON sl.slip_id=s.id AND sl.is_deleted=false WHERE s.is_deleted=false AND s.slip_type='OUTBOUND' AND s.status IN ('CONFIRMED','DELIVERED','COMPLETED','SHIPPING','INSPECTING') GROUP BY s.id) x;"
```

```text
 ledger_slip_count | slips_with_lines | ledger_slip_amount
-------------------+------------------+--------------------
                31 |               31 |       354121900.00
(1 row)
```

31개 slip UUID를 slip SELECT로 받아 accounting DB의 `journals.source_ref_id IN (...)`에 넣은 읽기 전용 대조 출력:

```text
 source_ref_id | journal_no | journal_date | status | is_deleted
---------------+------------+--------------+--------+------------
(0 rows)

 matched_ledger_slip_sources
-----------------------------
                           0
(1 row)
```

따라서 **slip은 있으나 분개가 없는 원장 대상 전표 31건, 354,121,900원**이다.

### 3. 선택 거래처 화면 이동 요약 원문

accounting partnerId별 401 SELECT 결과를 read-only `VALUES`로 넘겨 위 slip 집합과 비교했다.

```text
  bucket   | partner_count | before_amount | after_amount |   movement   | min_partner_movement | max_partner_movement
-----------+---------------+---------------+--------------+--------------+----------------------+---------------------
 BOTH      |            12 |  189700000.00 | 178340800.00 | -11359200.00 |         -17343800.00 |          17946600.00
 SLIP_ONLY |            19 |             0 | 175781100.00 | 175781100.00 |            229900.00 |          21687600.00
(2 rows)
```

## 결론

**이 각도에서 도달 가능한 결함 0.** R6에서 변경된 accounting `SalesAggregateService`의 운영 호출자는 거래처별 원장 화면 한 곳뿐이고, 그 화면과 CSV의 매출 원천은 Issue #1001·정본 메모리상 출고 slip이 맞다. 회계 분개가 정본인 별도 화면·문서·batch·report 호출자는 발견되지 않았다.

단, 과거 controller/API Javadoc의 "401/110 코드 기반" 설명은 현재 선택 거래처 매출 동작과 문언상 다르다. 이번 라운드는 화면 이동 결함만 판정하므로 문서 정리는 수행하지 않았다.

## 이번 라운드에서 보지 않은 표면

- D2 정렬
- D3 인쇄 반복
- D4 인쇄 음수색
- 표시 규약
- VAT
- typecheck
- accounting-service 전체 스위트
- 리팩터링
- PR 대상 화면 내부의 무필터 목록과 상세 정합 재검증

## 신규 파일

- `docs/dev-reports/2026-08-03-1001-r7-reconvergence.md`
