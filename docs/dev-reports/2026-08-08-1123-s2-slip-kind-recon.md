# Issue #1123 S2 전표 종류 정찰 보고서

- 조사일: 2026-08-08
- 범위: 조사만 수행. 코드·DB 변경 없음.
- 읽은 자료: `docs/dev-reports/2026-08-08-1123-s1-recon.md`, 이슈 #1123 본문 및 코멘트 3건
- DB: 공유 Docker 스택 재기동 없음. `slip_db`, `accounting_db`에서 아래 SELECT만 실행.
- 결론을 선택하지 않음. 개발책임자 추가 지시의 마감 축은 `(전표 종류 × 날짜)`로 기록한다.

## A. 사용자가 보는 전표 종류

### A-1. 전표 화면의 명칭과 데이터 경로

| 화면·표시 | 파일:줄 | 실제 조회/쓰기 데이터 | 종류 구분 |
|---|---|---|---|
| 판매관리 / `매출 전표` | `clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx:170-171` | `querySlips()` → slip-service `slips` | `slipType: 'OUTBOUND'` (`:236-237`), 신규 버튼은 판매전표 (`:618`) |
| 판매관리 목록의 판매번호·출고일자 | `clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx:236-237,297,315` | 위와 동일한 `slips` | `OUTBOUND` |
| 구매관리 / `구매관리` | `clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx:112-113` | `querySlips()` → slip-service `slips` | `slipType: 'INBOUND'` (`:166-172`), 신규 버튼은 입고전표 (`:416-425`) |
| 구매관리 목록의 구매번호·전표일자 | `clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx:189-204` | 위와 동일한 `slips` | `INBOUND` |
| 구 legacy 목록: `판매전표 목록` / `입고전표 목록` | `clients/desktop/src/renderer/routes/SlipListPage.tsx:153-154,172,359` | `listSlips()` → slip-service `slips` (`:184`) | `OUTBOUND`이면 판매전표, `INBOUND`이면 입고전표 (`mode` 기준) |
| 전표 상세 | `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1714` | slip-service `GET /slips/{id}` → `slips`와 `slip_lines` | `isOutbound`이면 판매전표 상세, 아니면 입고전표 상세 |
| 전표 작성 | `clients/desktop/src/renderer/routes/SlipFormPage.tsx:662,670` | slip-service 전표 생성/수정 → `slips`, `slip_lines` | `isOutbound`이면 새 판매전표, 아니면 새 입고전표 |
| 배차 그룹 | `clients/desktop/src/renderer/routes/DispatchGroupPage.tsx:46-49` | 출고전표는 배차 조회, 구매전표 검색은 slip-service 조회 | 출고전표 쪽은 `OUTBOUND`, 구매전표 검색/편입은 `INBOUND` |
| 배차 보드·미배차 목록 | `clients/desktop/src/renderer/routes/dispatch-board/DispatchBoardPage.tsx:5,19`; `clients/desktop/src/renderer/routes/dispatch-board/components/UnDispatchedSlipList.tsx:169,191` | slip-service 배차 조회 → `slips` | 출고전표만, `OUTBOUND` |
| 아로로지스 배차 화면 | `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:362,553,640`; `clients/desktop/src/renderer/routes/ArologisUnassignedPage.tsx:124,189` | 아로로지스 배차 API가 출고전표를 읽음. 원천은 slip-service `OUTBOUND` | 출고전표만 |
| 전표 라인 배분 | `clients/desktop/src/renderer/components/SlipLineAllocationEditor.tsx:173,226` | 회계 배분 API와 원천 전표 조회 | `sourceKind === 'OUTBOUND'`이면 출고전표, 아니면 입고전표 |
| 승인선 문서 종류 | `clients/desktop/src/renderer/api/approvalLineConfigApi.ts:72-73` | 승인선 설정 API, 전표 본문 저장 테이블은 아님 | `SLIP_OUTBOUND` 표시 판매전표, `SLIP_INBOUND` 표시 입고전표 |
| 인쇄: 작업지시서 | `clients/desktop/src/renderer/print/DispatchView.tsx:2,62` | 상세 전표 조회 → `slips` | 출고전표/판매전표 |
| 인쇄: 매출 전표 | `clients/desktop/src/renderer/print/SalesInvoicePrintPage.tsx:60`; `clients/desktop/src/renderer/print/SalesTransactionStatementPrintPage.tsx:108` | slip-service 전표 조회 → `slips` | 매출 전표, 원천 화면은 `OUTBOUND` |

코드의 사용자 표시 명칭은 일관되지 않다. `SlipType`의 정식 표시명은 `OUTBOUND("출고전표")`, `INBOUND("입고전표")` (`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipType.java:12-15`)이지만, 영업·구매 화면은 같은 `slips`의 `OUTBOUND`를 `판매전표` 또는 `매출 전표`, `INBOUND`를 `구매전표` 또는 `입고전표`로 표시한다.

### A-2. 전표가 아닌 문서

| 문서 | 파일:줄 | 읽고 쓰는 데이터 | 현재 전표와의 관계 |
|---|---|---|---|
| 견적서 | `clients/desktop/src/renderer/routes/EstimateListPage.tsx:103,451`; `clients/desktop/src/renderer/routes/EstimateDetailPage.tsx:96,137,191` | slip-service의 `estimates`, `estimate_lines` | 별도 테이블/도메인. 견적→출고전표 변환 때만 `slips`에 `OUTBOUND` 신규 행 생성 (`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java:62-81`) |
| 주문서 | `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx:154,454,573`; `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:2,728` | partner-order-service 주문서 데이터 | 별도 데이터. 주문서→출고전표 전환/병합 때 `OUTBOUND` 전표가 생성된다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:229-238,330-337`) |
| 회계 매출전표 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlip.java:20`; `.../web/SalesAccountingSlipController.java:45` | `accounting_db.sales_accounting_slips` | `slips`와 다른 테이블. 출고전표를 원천으로 회계 분개 전표를 만든다 |
| 회계 매입전표 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/PurchaseAccountingSlip.java:20`; `.../web/PurchaseAccountingSlipController.java:45` | `accounting_db.purchase_accounting_slips` | `slips`와 다른 테이블. 입고전표를 원천으로 회계 분개 전표를 만든다 |

견적서·주문서를 마감 대상에 포함할지는 코드상 자동 결정 규칙이 확인되지 않았다. 현재 확인된 변환 경로는 견적서/주문서를 `OUTBOUND` 전표로 바꾸는 경로이지, 견적서·주문서 자체를 `Slip.slipDate`와 함께 마감하는 경로가 아니다.

## B. 저장 구조와 실측

### B-1. `slips`의 실제 구분 컬럼

정본 컬럼은 `slips.slip_type`이다. 초기 스키마가 `slip_type VARCHAR(20) NOT NULL`로 선언하고, 출고·입고를 한 테이블에 저장하는 Single Table Inheritance 구조다 (`services/slip-service/src/main/resources/db/migration/V1__init_slip_service.sql:13-19`). Java 정본은 `SlipType.OUTBOUND`/`INBOUND`다.

`io_type`는 정본 종류 구분자로 사용할 수 없다. 마이그레이션 주석상 이카운트 IO_TYPE(`10`=출고, `11`=입고) 컬럼이지만, 실 데이터에서 `OUTBOUND`가 `10`만 가지는 반면 `INBOUND`는 `10`과 `11`을 모두 가진다.

`source_type`도 판매/구매 구분자가 아니다. 값은 생성 원천(`MANUAL`, `ESTIMATE`, `PARTNER_ORDER`)이고, 현재 실 데이터의 모든 `INBOUND`는 `MANUAL`이며 `OUTBOUND`도 `MANUAL`/`ESTIMATE`/`PARTNER_ORDER`가 섞여 있다.

### B-2. 화면 쿼리 조건

- 판매관리: `clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx:236-237` — `querySlips({ slipType: 'OUTBOUND', ... })`
- 구매관리: `clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx:166-172` — `querySlips({ slipType: 'INBOUND', ... })`
- legacy 판매/입고 목록: `clients/desktop/src/renderer/routes/SlipListPage.tsx:153-184` — `mode`를 `listSlips({ slipType: mode, ... })`로 전달
- 서버 목록 endpoint: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:150-167` — 요청 `slipType`를 `effectiveSlipType`으로 확정
- 서버 native 검색 쿼리: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:287-316,353-374` — `s.slip_type = CAST(:slipType AS varchar)` 조건

따라서 화면은 별도 판매/구매 테이블을 조회해서 나누는 것이 아니라, 같은 `slips` 테이블에 `slip_type` 조건을 붙여 나눈다.

### B-3. 실 데이터 SQL 원문과 결과

실행 기준: `slip_db`, soft-delete 포함 여부는 SQL에 그대로 표시했다.

```sql
SELECT slip_type, COUNT(*) AS row_count FROM slips GROUP BY slip_type ORDER BY slip_type;
```

```text
 slip_type | row_count
-----------+-----------
 INBOUND   |        54
 OUTBOUND  |      2512
```

```sql
SELECT slip_type, source_type, COUNT(*) AS row_count FROM slips GROUP BY slip_type, source_type ORDER BY slip_type, source_type;
```

```text
 slip_type |  source_type  | row_count
-----------+---------------+-----------
 INBOUND   | MANUAL        |        54
 OUTBOUND  | ESTIMATE      |         1
 OUTBOUND  | MANUAL        |      2491
 OUTBOUND  | PARTNER_ORDER |        20
```

```sql
SELECT slip_type, io_type, COUNT(*) AS row_count FROM slips GROUP BY slip_type, io_type ORDER BY slip_type, io_type;
```

```text
 slip_type | io_type | row_count
-----------+---------+-----------
 INBOUND   | 10      |        30
 INBOUND   | 11      |        24
 OUTBOUND  | 10      |      2512
```

```sql
SELECT slip_type, COUNT(*) AS active_row_count FROM slips WHERE is_deleted = FALSE GROUP BY slip_type ORDER BY slip_type;
```

```text
 slip_type | active_row_count
-----------+------------------
 INBOUND   |               42
 OUTBOUND  |              349
```

```sql
SELECT COUNT(*) AS all_rows FROM slips;
SELECT COUNT(*) AS active_rows FROM slips WHERE is_deleted = FALSE;
```

```text
 all_rows
----------
     2566

 active_rows
-------------
         391
```

회계 분개 전표는 별도 `accounting_db`에서 조회했다.

```sql
SELECT COUNT(*) AS all_rows FROM sales_accounting_slips;
SELECT COUNT(*) AS active_rows FROM sales_accounting_slips WHERE is_deleted = FALSE;
SELECT COUNT(*) AS all_rows FROM purchase_accounting_slips;
SELECT COUNT(*) AS active_rows FROM purchase_accounting_slips WHERE is_deleted = FALSE;
```

```text
 all_rows
----------
        1

 active_rows
-------------
           0

 all_rows
----------
        0

 active_rows
-------------
           0
```

현재 회계 `daily_closings` 분포도 함께 조회했다.

```sql
SELECT closing_kind, source_kind, COUNT(*) AS row_count FROM daily_closings GROUP BY closing_kind, source_kind ORDER BY closing_kind, source_kind;
```

```text
 closing_kind | source_kind | row_count
--------------+-------------+-----------
 SALES        | TAX_INVOICE |         2
```

## C. 마감 축으로 쓸 수 있는지

### C-1. 모든 생성 경로에서 구분자가 확정되는가

확인된 런타임 생성 경로에서는 `SlipType`이 저장 시점에 정해진다.

- 수동 생성: 요청의 `slipType`을 채번과 `Slip.createOutbound`/`Slip.createInbound`에 그대로 사용한다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:253-285`).
- 견적 변환: `SlipType.OUTBOUND`를 고정한다 (`.../estimate/service/EstimateToSlipConverter.java:64-75`).
- 견적/주문 발행: `SlipType.OUTBOUND`를 고정한다 (`.../publish/SlipPublishService.java:137-150,231-238,330-337`).
- 모바일 거래처 주문: `SlipType.OUTBOUND`를 고정한다 (`.../mobile/service/MobilePartnerOrderService.java:115-130`).
- 서버 복사: 원본 `source.getSlipType()`으로 채번하고 `OUTBOUND`/`INBOUND` 생성자를 분기한다 (`.../service/SlipDuplicateService.java:81-105`).

코드 검색에서 전표 생성 후 `slipType`을 판매↔구매로 변경하는 경로는 확인되지 않았다. 다만 seed/test 경로는 운영 요청과 별도이며, `SlipSeeder.java:263-312`에서 종류를 직접 지정한다.

### C-2. 공통 날짜와 함께 쓸 수 있는가

S1에서 전수 확인한 신규 전표 생성 경로의 공통 업무 날짜는 `Slip.slipDate`/DB `slip_date`다. 수동 생성은 요청 `slipDate`를 사용한다 (`SlipService.java:265-267`). 견적 변환·복사는 오늘 날짜를 새 `slipDate`로 만든다 (`EstimateToSlipConverter.java:64`, `SlipDuplicateService.java:86-88`).

따라서 저장·판정 후보 축은 코드상 `(slip_type, slip_date)`로 함께 표현할 수 있다. 이는 구현 선택이 아니라 현재 저장 구조가 제공하는 사실이다. 회계 `sales_accounting_slips.slip_date`, `purchase_accounting_slips.slip_date`는 별도 회계 분개 전표의 날짜이며, `Slip.slipDate`와 같은 테이블/동일 객체라는 근거는 없다.

### C-3. `DailyClosingKind`와 `SlipType` 사이 기존 매핑

**직접 매핑 규칙은 없다.** `DailyClosingKind`는 `SALES`/`PURCHASE` (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/DailyClosingKind.java:3-6`)이고 `SlipType`은 `OUTBOUND`/`INBOUND` (`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipType.java:8-15`)지만, 두 enum을 변환하는 메서드·공통 enum·서비스 간 매핑은 검색되지 않았다.

가장 가까운 기존 규칙은 `DailyClosingKind`와 `DailyClosingSourceKind` 사이의 검증이다.

- `DailyClosingSourceKind.SALES_SLIP`는 `매출전표`, `PURCHASE_SLIP`는 `매입전표` (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/DailyClosingSourceKind.java:3-7`).
- `DailyClosingService.validateKindSourceMatch()`는 `SALES + PURCHASE_SLIP`, `PURCHASE + SALES_SLIP` 조합을 거부한다 (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java:375-384`).
- 화면에도 같은 source 필터 정합화가 있다 (`clients/desktop/src/renderer/routes/DailyClosingPage.tsx:273-283`). 이 규칙은 회계 `sourceKind`와 `closingKind`의 정합성이지, slip-service의 `SlipType` 값을 직접 변환하는 규칙은 아니다.

추가로 `DailyClosing`의 현재 실데이터는 `SALES + TAX_INVOICE` 2건뿐이고, `SALES_SLIP`/`PURCHASE_SLIP` 행은 0건이다. 그러므로 현재 데이터가 두 전표 종류에 대한 매핑을 실증하지 않는다.

## D. 개발책임자 판단용 선택지

아래는 조사 결과에서 도출되는 선택지이며, 정찰자는 선택하지 않는다.

1. **`SlipType.OUTBOUND/INBOUND`를 마감 종류의 정본으로 사용**
   - 고르면 `slips`의 실제 생성·조회·저장 구분과 `(slip_type, slip_date)`를 직접 연결할 수 있지만, 회계 화면의 `DailyClosingKind.SALES/PURCHASE`와 이름·서비스 경계가 달라 별도 매핑 계약이 필요하다.

2. **`DailyClosingKind.SALES/PURCHASE`를 마감 종류의 정본으로 사용**
   - 고르면 기존 일마감 화면·권한·집계 의미와 이어지지만, `SlipType`와의 직접 매핑이 현재 코드에 없어 `OUTBOUND→SALES`, `INBOUND→PURCHASE`를 새 계약으로 명시해야 한다.

3. **마감 전용 종류를 새로 두고 `SlipType`·`DailyClosingKind`를 각각 변환**
   - 고르면 마감 기능의 의미를 두 기존 도메인에서 분리할 수 있지만, 전표 생성 경로마다 변환 규칙을 추가하고 회계 일마감과의 정합성·중복 저장을 새로 관리해야 한다.

4. **회계 분개 전표(`sales_accounting_slips`/`purchase_accounting_slips`)까지 마감 대상에 포함**
   - 고르면 회계 분개 전표의 `SALES/PURCHASE` 구분을 직접 사용할 수 있지만, `slips`의 신규 전표 생성 차단과는 다른 DB·생성 흐름이어서 두 저장 구조를 함께 판정하는 계약이 필요하다. 현재 회계 분개 전표 활성 건수는 둘 다 0이다.

5. **견적서·주문서도 마감 대상에 포함**
   - 고르면 전표로 변환되기 전 문서의 생성·수정까지 차단 범위를 넓힐 수 있지만, 두 문서는 `slips`와 별도 데이터이며 현재 `(종류 × 날짜)` 마감과 연결하는 규칙이 확인되지 않았다.

### 개발책임자께 확인할 질문

- 마감 종류의 정본을 (a) `SlipType`, (b) `DailyClosingKind`, (c) 새 마감 전용 종류 중 어느 것으로 둘 것인가?
- 견적서·주문서 자체는 마감 대상에서 제외하고 전표 생성 시점만 `(종류 × Slip.slipDate)`로 막을 것인가, 아니면 별도 문서 생성·수정도 포함할 것인가?

