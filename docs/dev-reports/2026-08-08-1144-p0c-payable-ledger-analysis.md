# #1144 P0-C 채무 원장 누락 판단 재료

> 2026-08-08 · CODEX SOL 5.6 · 읽기 전용 조사
>
> 범위: 코드 정적 추적과 실행 중 PostgreSQL에 대한 `SELECT`만 수행했다. 코드 구현, DB 쓰기, Docker 재기동·재배포, git 명령은 수행하지 않았다. 아래 선택지는 결론이 아니며 결정은 개발책임자 몫이다.

## 요약 판정

- 같은 현행 원장 금액 산식으로 활성 정본 상태를 재계산하면 OUTBOUND 40건/34거래처는 **359,003,920원**, INBOUND 20건/12거래처는 **116,747,400원**이다. INBOUND는 OUTBOUND의 **32.52%** 규모다.
- `findPartnerLedgerSales`의 `OUTBOUND` 조건만 단순히 `INBOUND`까지 넓히면 안 된다. 응답에는 `slipType`이 없고 모든 소비자가 결과를 `Sale`로 취급한다. 따라서 116,747,400원이 매입·채무가 아니라 **매출·채권으로 조용히 더해진다**.
- 영향은 거래처별 원장 계열에 한정되지 않는다. 같은 client를 `SalesAggregateService`, `PartnerLedgerReadService`, `PartnerLedgerReadModelService`가 공유한다. 운영 wiring에서는 공통 read model을 통해 집계·상세·인쇄·CSV·명시적 snapshot 저장이 함께 바뀐다.
- 거래처별 원장은 거래 사실 문서, 채권채무 현황은 미상계 채권·채무 aging 보고서, 총계정원장은 게시된 분개 line 통합 조회라고 코드가 각각 명시한다. 세 표면의 시점을 같게 할지는 코드만으로 확정할 수 없다.
- P0-C와 P0-D는 **코드·배포 단위로는 분리 가능**하다. 다만 P0-C만 하면 문서원장만 즉시 맞고 분개 기반 두 표면은 그대로이며, P0-D를 나중에 단순 추가하면 현재 `canonicalSlipKeys = Set.of()` 때문에 원 전표와 새 분개가 이중계상될 수 있다.

## 1. 채무를 넣으면 무엇이 바뀌는가

### 1.1 `findPartnerLedgerSales` 전수 호출 관계

`src/main` 전수 `rg` 결과의 실 호출 흐름은 다음과 같다.

1. `SlipRepository.findPartnerLedgerSales`
   - `SlipRepository.java:256-273`: `lines` fetch, 활성 전표, 정본 상태, 기간·거래처 조건. `:260`이 `SlipType.OUTBOUND`를 하드코딩한다.
   - `SlipInternalController.java:78-81`: 정본 상태는 `CONFIRMED`, `DELIVERED`, `COMPLETED`, `INSPECTING`, `SHIPPING`이다(`PartnerLedgerContract.java:15-17`).
2. 내부 API
   - `SlipInternalController.java:381-394`: “원장은 회계 반영 완료 목록이 아니라 거래 사실 문서”, OUTBOUND 판매전표 조회라고 명시한다.
   - `SlipInternalController.java:405-429`: `GET /internal/slips/partner-ledger-sales`가 repository 결과를 그대로 응답한다.
3. accounting client
   - `PartnerLedgerSalesClient.java:16-18,28-44`: 위 endpoint를 `Sale` 목록으로 소비한다.
   - `PartnerLedgerSalesClient.java:48-64`: `Sale`/`Line`에 `slipType` 또는 매입·매출 방향 필드가 없다.
4. main 소비자 3곳
   - `PartnerLedgerReadModelService.java:92-95,131-170,417-426,462-467`: 기초와 기간 판매전표를 모두 읽어 원장에 넣는다.
   - `PartnerLedgerReadService.java:51-61`: 운영 Spring wiring에서는 위 공통 read model 결과를 응답한다. `:93-159`의 직접 client 경로도 fallback으로 남아 있고 역시 모두 `SALE`로 만든다.
   - `SalesAggregateService.java:81-90`: 운영 wiring에서는 공통 read model의 `salesTotal`, `receivableBalance`를 반환한다. `:262-352`의 직접 client fallback도 결과를 모두 매출 합계로 대체한다.

### 1.2 영향 API와 화면

직접·간접 영향은 아래와 같다.

| 구분 | 영향 근거 | 현재 의미 |
|---|---|---|
| 내부 API | `GET /internal/slips/partner-ledger-sales` (`SlipInternalController.java:405-429`) | 판매전표 전용 projection |
| 집계 API | `GET /accounting/sales/aggregate` (`AccountingReportController.java:107-123`) | 매출/수금/채권 집계 |
| 원장 상세 API | `GET /accounting/journals/partner-ledger` (`AccountingReportController.java:180-187`) | 출고 판매전표+입금보고서 원장 |
| legacy 상세 API | `GET /accounting/journals/ledger-data` (`AccountingReportController.java:125-165`) | 같은 read model을 legacy line shape로 변환 |
| snapshot 쓰기 API | `POST /accounting/journals/ledger-snapshots` (`AccountingReportController.java:168-177`) | 현재 read model JSON 저장 |
| 화면 | `PartnerLedgerPage.tsx:257-271,510-608,800-875` | 집계, 상세, CSV, 원장 저장 진입점 |
| 인쇄 | `PartnerLedgerView.tsx:224` | 단건·일괄 live 원장 인쇄가 같은 상세 API 사용 |

`채권채무 현황`과 `총계정원장`은 이 함수의 직접 소비자가 아니다. 각각 `journal_lines`를 별도로 읽으므로 repository 조건만 바꿔도 두 화면은 바뀌지 않는다(`ReceivablesPayablesService.java:153-166`, `LedgerService.java:101-107`).

### 1.3 부호·잔액 방향과 조용한 금액 변경

**확정: 현재 소비자는 채권만 가정한다.**

- DTO와 domain type은 `SALE`, `SALE_SUMMARY`, `CASH_RECEIPT`, `JOURNAL_ONLY`뿐이고 PURCHASE/PAYABLE이 없다(`PartnerLedgerReadModel.java:36-42`, `PartnerLedgerContract.java:19-27`).
- 모든 client 행을 `SALE` 문서로 만들고 양수 금액을 차변으로 둔다(`PartnerLedgerReadModelService.java:243-249`).
- 기초 INBOUND까지 들어오면 `result.merge(..., saleAmount, BigDecimal::add)`로 채권 기초잔액에 더한다(`PartnerLedgerReadModelService.java:417-426`).
- 기간 INBOUND는 `group.slipSales += saleAmount`이고 `SALE` 문서가 된다(`PartnerLedgerReadModelService.java:165-170`).
- 공통 fold는 `closing = opening + sales + adjustments - payments`이다(`PartnerLedgerContract.java:99-120`).
- FE도 양수 문서금액을 차변으로 만들고 문서 라벨을 `매출`로 표시한다(`partnerLedgerApi.ts:169-198`, `PartnerLedgerPage.tsx:852-860`). 집계 열도 `매출 합계`, `채권 잔액`뿐이다(`PartnerLedgerPage.tsx:530-535`).

따라서 `s.slipType IN (OUTBOUND, INBOUND)`처럼 repository만 넓히면 다음이 조용히 발생한다.

- 전체 기준 INBOUND **116,747,400원**이 `salesTotal`과 `receivableBalance`에 가산된다.
- 2026년 8월 기본 조회에서는 3월 31일~4월 8일 INBOUND **111,177,000원**이 기초 채권에 가산되고, 8월 INBOUND **5,570,400원**이 기간 매출에 가산된다.
- 매입·채무라는 표시 없이 차변·매출·채권으로 나타난다.
- 계획서도 단순 확장이 아니라 “타입 안전한 공통 projection 또는 INBOUND 전용 쿼리”와 별도 purchase/payable fold를 요구한다(`2026-08-08-1144-implementation-plan.md:210-220`). 어느 방식을 택할지는 본 조사에서 정하지 않는다.

## 2. 실 데이터 영향 범위

### 2.1 집계 SQL 원문

아래 SQL은 `PartnerLedgerSalesResponse.lineAmount()`의 우선순위(`PartnerLedgerSalesResponse.java:88-106`)와 같은 산식을 사용했다. 실행 DB는 `slip_db`, 모두 `SELECT`다.

```sql
WITH canonical_slips AS (
    SELECT s.id, s.slip_type, s.slip_no, s.slip_date, s.status,
           s.partner_id, NULLIF(BTRIM(s.partner_code), '') AS partner_code,
           s.partner_name
    FROM slips s
    WHERE s.is_deleted = false
      AND s.slip_type IN ('OUTBOUND', 'INBOUND')
      AND s.status IN ('CONFIRMED', 'DELIVERED', 'COMPLETED', 'INSPECTING', 'SHIPPING')
), slip_amounts AS (
    SELECT s.*,
           COALESCE(SUM(
               CASE
                   WHEN l.supply_amount IS NOT NULL AND l.vat_amount IS NOT NULL
                       THEN l.supply_amount + l.vat_amount
                   WHEN l.unit_price_with_vat IS NOT NULL
                       THEN l.unit_price_with_vat * l.quantity
                   WHEN l.line_total IS NOT NULL
                       THEN l.line_total + COALESCE(l.vat_amount, 0)
                   ELSE 0
               END
           ) FILTER (WHERE l.is_deleted = false), 0) AS amount
    FROM canonical_slips s
    LEFT JOIN slip_lines l ON l.slip_id = s.id
    GROUP BY s.id, s.slip_type, s.slip_no, s.slip_date, s.status,
             s.partner_id, s.partner_code, s.partner_name
)
SELECT slip_type,
       COUNT(*) AS slip_count,
       COUNT(DISTINCT partner_id) AS partner_count,
       SUM(amount) AS total_amount
FROM slip_amounts
GROUP BY slip_type
ORDER BY slip_type;
```

실측 결과:

| 유형 | 전표 | 거래처 | 합계 |
|---|---:|---:|---:|
| INBOUND | 20 | 12 | 116,747,400원 |
| OUTBOUND | 40 | 34 | 359,003,920원 |

비율은 `116,747,400 / 359,003,920 = 32.5198...%`다.

### 2.2 거래처별 INBOUND 실측

거래처 표시는 `partner_db.partners`의 활성/비삭제 master를 별도 `SELECT`해 업무 식별자인 거래처코드·명으로 치환했다. 내부 조인키 UUID는 화면·아래 결과표에 노출하지 않았다.

```sql
WITH inbound_slips AS (
    SELECT s.id, s.slip_no, s.slip_date, s.status, s.partner_id,
           NULLIF(BTRIM(s.partner_code), '') AS partner_code,
           s.partner_name
    FROM slips s
    WHERE s.is_deleted = false
      AND s.slip_type = 'INBOUND'
      AND s.status IN ('CONFIRMED', 'DELIVERED', 'COMPLETED', 'INSPECTING', 'SHIPPING')
), slip_amounts AS (
    SELECT s.*,
           COALESCE(SUM(
               CASE
                   WHEN l.supply_amount IS NOT NULL AND l.vat_amount IS NOT NULL
                       THEN l.supply_amount + l.vat_amount
                   WHEN l.unit_price_with_vat IS NOT NULL
                       THEN l.unit_price_with_vat * l.quantity
                   WHEN l.line_total IS NOT NULL
                       THEN l.line_total + COALESCE(l.vat_amount, 0)
                   ELSE 0
               END
           ) FILTER (WHERE l.is_deleted = false), 0) AS amount
    FROM inbound_slips s
    LEFT JOIN slip_lines l ON l.slip_id = s.id
    GROUP BY s.id, s.slip_no, s.slip_date, s.status,
             s.partner_id, s.partner_code, s.partner_name
)
SELECT partner_id,
       COUNT(*) AS slip_count,
       MIN(slip_date) AS first_date,
       MAX(slip_date) AS last_date,
       SUM(amount) AS inbound_amount
FROM slip_amounts
GROUP BY partner_id
ORDER BY inbound_amount DESC, partner_id;
```

master 확인 SQL(`partner_db`):

```sql
SELECT id, partner_code, name, biz_no, status, is_deleted
FROM partners
WHERE id IN (<위 집계의 12개 partner_id>)
ORDER BY partner_code;
```

| 거래처코드 | 거래처명 | 전표 수 | 전표일 | INBOUND 금액 |
|---|---|---:|---|---:|
| P-2026-0045 | 오산냉난방 | 1 | 2026-04-05 | 29,128,000원 |
| P-2026-0048 | 여주에어컨테크 | 1 | 2026-04-08 | 27,597,900원 |
| P-2026-0044 | 구리에어시스템 | 1 | 2026-04-04 | 16,209,600원 |
| P-2026-0047 | 이천공조에너지 | 1 | 2026-04-07 | 13,917,200원 |
| P-2026-0040 | (주)파주HVAC | 1 | 2026-03-31 | 8,448,000원 |
| P-2026-0043 | 하남공조산업 | 1 | 2026-04-03 | 7,695,600원 |
| P-2026-0018 | 강릉HVAC솔루션 | 3 | 2026-08-03 | 5,217,300원 |
| P-2026-0046 | 안성HVAC솔루션 | 1 | 2026-04-06 | 5,002,800원 |
| P-2026-0042 | 시흥에어컨공업 | 1 | 2026-04-02 | 2,728,000원 |
| P-2026-0041 | 광명냉난방테크 | 1 | 2026-04-01 | 449,900원 |
| 1012555999 | 동영 온라인점-송아름 | 4 | 2026-08-08 | 304,700원 |
| P0-6-C001 | (주)한국냉동물류 | 4 | 2026-08-08 | 48,400원 |
| **합계** | **12거래처** | **20** |  | **116,747,400원** |

### 2.3 현재 거래처 원장 화면에서의 노출

화면 기본 기간은 당월 1일~말일이다(`PartnerLedgerPage.tsx:70-75,235-248`). 조사일 2026-08-08 기준 기본 기간은 2026-08-01~2026-08-31이다.

행 존재 여부는 현재 read model의 입력을 그대로 분해해 `SELECT`했다.

```sql
-- slip_db: 기본 기간의 현재 화면 매출 입력
SELECT s.partner_id,
       COUNT(DISTINCT s.id) AS outbound_slip_count,
       COALESCE(SUM(
           CASE
               WHEN l.supply_amount IS NOT NULL AND l.vat_amount IS NOT NULL
                   THEN l.supply_amount + l.vat_amount
               WHEN l.unit_price_with_vat IS NOT NULL
                   THEN l.unit_price_with_vat * l.quantity
               WHEN l.line_total IS NOT NULL
                   THEN l.line_total + COALESCE(l.vat_amount, 0)
               ELSE 0
           END
       ) FILTER (WHERE l.is_deleted = false), 0) AS outbound_amount
FROM slips s
LEFT JOIN slip_lines l ON l.slip_id = s.id
WHERE s.is_deleted = false
  AND s.slip_type = 'OUTBOUND'
  AND s.status IN ('CONFIRMED', 'DELIVERED', 'COMPLETED', 'INSPECTING', 'SHIPPING')
  AND s.slip_date BETWEEN DATE '2026-08-01' AND DATE '2026-08-31'
GROUP BY s.partner_id;
```

```sql
-- accounting_db: 기본 기간의 다른 현재 화면 입력
SELECT l.partner_id, COUNT(*) AS journal_line_count
FROM journal_lines l
JOIN journals j ON j.id = l.journal_id
WHERE l.is_deleted = false
  AND j.is_deleted = false
  AND j.status IN ('POSTED', 'REVERSED')
  AND j.journal_date BETWEEN DATE '2026-08-01' AND DATE '2026-08-31'
GROUP BY l.partner_id;

SELECT partner_id, COUNT(*) AS receipt_count, SUM(amount) AS receipt_amount
FROM cash_receipts
WHERE is_deleted = false
  AND status = 'CONFIRMED'
  AND transaction_date BETWEEN DATE '2026-08-01' AND DATE '2026-08-31'
GROUP BY partner_id;
```

12거래처 모두 8월 분개 line과 확정 입금보고서는 0건이었다. `동영 온라인점-송아름`만 8월 OUTBOUND 7건/3,142,920원이 있고, 3~7월 OUTBOUND가 있는 10곳과 강릉HVAC솔루션은 기초 채권 때문에 기본 화면 행이 유지된다. `(주)한국냉동물류`는 OUTBOUND 0, 유효한 기초잔액 0, 8월 journal/receipt 0이므로 **INBOUND 4건/48,400원만으로는 행 자체가 생기지 않는다**.

| 현재 기본 화면 상태 | 거래처 수 | 의미 |
|---|---:|---|
| 행은 있으나 INBOUND 금액은 어느 칸에도 없음 | 11 | 기존 OUTBOUND/기초 채권으로 나타날 뿐, `매입액`·`채무잔액` 열 자체가 없다. “매입 0”을 표시하는 것도 아니다. |
| 행 자체 없음 | 1 | P0-6-C001 `(주)한국냉동물류`; INBOUND만으로 cohort에 들어오지 않는다. |

즉 질문의 두 표현 중 정확한 답은 **11곳은 매입이 0으로 보이는 것이 아니라 매입 개념 자체가 없는 기존 채권 행**, **1곳은 아예 안 보임**이다.

## 3. 세 표면의 시점 불일치

### 3.1 코드가 명시한 각 표면의 목적

| 표면 | 코드·주석 근거 | 확인되는 목적과 시점 |
|---|---|---|
| 거래처별 원장 | `SlipInternalController.java:381-394`: “회계 반영 완료 목록이 아니라 거래 사실 문서”. `PartnerLedgerReadService.java:28`, `partnerLedgerApi.ts:8-12,294-300`도 출고 판매전표+확정 입금보고서 read model이라고 명시 | 거래 문서와 수금을 거래처별로 보여 주는 문서원장. 회계전표 생성 전 반영은 코드상 의도다. |
| 채권채무 현황 | `ReceivablesPayablesService.java:30-38`: POSTED+REVERSED 분개, 받을어음, 수금계획을 읽어 FIFO로 미상계 aging. `:45-47`은 110/120·201/210 계정 분류. Controller `:39-42`도 기준일 분개 잔액 aging이라고 명시 | 계정과목에 게시된 채권·채무의 기준일 잔액, aging, 여신·수금계획 보고서. 거래문서 직접 조회 목적은 코드에서 찾지 못했다. |
| 총계정원장 | `LedgerService.java:30-43`: 다중 거래처 통합 원장, source는 POSTED+REVERSED `journal_lines`. `:63-79`는 차변 정상잔액 누적. `LedgerController.java:19-33,54-56`도 같은 계약 명시 | 게시된 모든 분개 line의 기간·거래처 통합 조회와 차변/대변 합계. 미게시 거래문서를 포함한다는 근거는 찾지 못했다. |

### 3.2 같게 해야 하는가

**코드·주석만으로는 정할 수 없다.** 세 표면은 이름이 비슷하지만 현재 구현 목적이 다르다. 특히 총계정원장에 미게시 문서를 넣으면 `journal_lines`의 대차·계정과목 audit view라는 현재 계약이 바뀐다. 반대로 규칙 8의 “거래처별 채권/채무 원장”이 세 표면 전체를 뜻한다면 현재 두 분개 표면은 명세를 충족하지 않는다. 어느 문구가 업무 정본인지 코드에서 알 수 없다.

결정 가능한 선택지와 대가는 다음과 같다.

- 선택지 A: 거래처별 문서원장만 전표 즉시, 채권채무 현황·총계정원장은 POST 분개 이후.
  - 대가: 목적 구분과 현행 총계정원장 계약은 보존되지만 같은 거래가 화면별로 다른 시점에 보인다. UI에 `거래 기준`/`게시 기준`을 명확히 알려야 혼동을 줄일 수 있다.
- 선택지 B: 거래처별 원장과 채권채무 현황은 전표 즉시, 총계정원장은 POST 분개 이후.
  - 대가: 운영 채권·채무 가시성은 빨라지지만 aging에 미게시 문서의 발생월·지급 상계 규칙이 추가로 필요하다. 총계정원장과는 여전히 시점이 다르다.
- 선택지 C: 세 표면 모두 전표 즉시.
  - 대가: 화면 시점은 같아지지만 총계정원장이 더는 순수 `journal_lines` 원장이 아니게 된다. provisional 행의 계정, 대차, POST 후 치환·중복제거 계약이 필요하다.

본 조사에서는 어느 선택지도 추천·확정하지 않는다.

## 4. P0-D(분개 인과)와의 관계

### 4.1 P0-C만 하고 P0-D를 하지 않는 상태

P0-C를 타입 분리된 purchase/payable 문서원장으로 올바르게 만든다는 전제에서:

- 거래처별 원장: OUTBOUND 매출/채권과 INBOUND 매입/채무를 회계전표 생성 전부터 보여 줄 수 있다.
- 매출·매입 회계전표 POST: 여전히 상태만 `POSTED`로 전이하고 journal을 만들지 않는다(`SalesAccountingSlipService.java:71-82`, `PurchaseAccountingSlipService.java:71-82`).
- 채권채무 현황: 여전히 110/120·201/210 `journal_lines`만 읽으므로 새 INBOUND 116,747,400원은 반영되지 않는다(`ReceivablesPayablesService.java:45-47,153-174`).
- 총계정원장: 여전히 `journal_lines`만 읽으므로 반영되지 않는다(`LedgerService.java:37-38,101-107`).
- 세금계산서 발행: 계속 `(차)110/(대)255+401` 분개를 만든다(`TaxInvoiceService.java:223-265`).

따라서 **문서원장은 맞고, 분개 인과와 두 분개 표면은 현행 그대로**인 상태가 된다. 이것이 허용 가능한 역할 분리인지 불완전한 명세 이행인지는 개발책임자 판단이 필요하다.

실 DB `SELECT` 재확인:

```sql
SELECT 'active_sales_accounting_slips' AS metric, COUNT(*)::numeric AS value
FROM sales_accounting_slips WHERE is_deleted = false
UNION ALL
SELECT 'active_purchase_accounting_slips', COUNT(*)::numeric
FROM purchase_accounting_slips WHERE is_deleted = false;

SELECT j.source_type, j.posted_by, COUNT(*) AS line_count,
       SUM(l.debit_amount) AS debit, SUM(l.credit_amount) AS credit
FROM journal_lines l
JOIN journals j ON j.id = l.journal_id
WHERE l.is_deleted = false
  AND j.is_deleted = false
  AND j.status IN ('POSTED', 'REVERSED')
  AND l.account_code IN ('201', '210')
GROUP BY j.source_type, j.posted_by;
```

결과는 활성 매출·매입 회계전표 각각 0건, 201/210 line 4건은 전부 `MANUAL / SYSTEM_SEED`였다. 실행된 매입전표→채무 표본은 없다.

세금계산서 연결 110 분개 확인 SQL:

```sql
SELECT ti.status,
       COUNT(DISTINCT ti.id) AS invoice_count,
       COUNT(l.id) AS line_count,
       COALESCE(SUM(l.debit_amount), 0) AS debit,
       COALESCE(SUM(l.credit_amount), 0) AS credit
FROM tax_invoices ti
JOIN journals j ON j.id = ti.journal_id
JOIN journal_lines l
  ON l.journal_id = j.id
 AND l.account_code = '110'
 AND l.is_deleted = false
WHERE ti.is_deleted = false
  AND j.is_deleted = false
GROUP BY ti.status
ORDER BY ti.status;
```

`ISSUED` 4건 4,259,999원 + `CANCELLED` 원분개 1건 330,000원 = 조사에서 제시된 5건/4,589,999원을 재현했다. 취소 상쇄는 별도 reverse journal이므로 위 `ti.journal_id` 원분개 집계에는 포함되지 않는다.

### 4.2 분리 가능성 및 결합 위험

**기술적으로 분리 가능**하다.

- P0-C는 `slips`/`slip_lines` read projection과 UI/read model의 문제이며 계획서도 테이블 변경 없음으로 정의한다(`implementation-plan.md:194-226`).
- P0-D는 POST 트랜잭션, `journals`/`journal_lines`, 멱등키, 역분개, 세금계산서 책임 이전의 쓰기 문제다(`implementation-plan.md:228-273`).

**그러나 P0-D를 나중에 독립적으로 단순 추가하는 것은 안전하지 않다.**

- 거래처 원장은 원 전표를 이미 직접 `SALE`로 더한다.
- journal 분류기는 110 차변+401 대변을 `SALE_SUMMARY`로 다시 더한다(`PartnerLedgerCollectionContract.java:162-193`).
- 현재 read model은 journal의 원 전표 중복제거 키를 `canonicalSlipKeys = Set.of()`로 비워 둔다(`PartnerLedgerReadModelService.java:172-180,296-314`).
- 따라서 매출/매입 POST journal을 추가하면서 source 연결·제외 계약을 같이 만들지 않으면 원 전표와 분개가 이중계상될 수 있다. 계획서도 이 제외를 P0-D 실행 순서에 명시한다(`implementation-plan.md:254-268`).

판단 재료로 정리하면:

- P0-C를 먼저 별도 배포하는 선택은 가능하지만, 세 표면의 시점 차이를 의도된 계약으로 승인하거나 명시해야 한다.
- P0-C와 P0-D를 한 배포로 묶는 선택은 표면 간 인과를 한 번에 정렬할 수 있지만, 분개 계정·멱등성·중복제거·역분개·기존 세금계산서 책임 이전까지 함께 검증해야 하므로 위험과 되돌리기 비용이 크게 증가한다.
- P0-D는 Q4(표면 범위)·Q10(계정/VAT/세금계산서 분개 책임) 없이는 확정할 수 없다(`implementation-plan.md:248`).

## 5. 되돌리기

### 5.1 P0-C만 적용 후 되돌리는 경우

계획서의 현재 범위대로라면 되돌릴 것은 다음 read/UI 단위다.

- slip-service의 INBOUND 전용 또는 타입 일반화 projection/API 계약
- accounting-service의 purchase/payable client DTO와 fold/read response
- desktop의 매입액·지급액·채무잔액 탭/열, CSV·인쇄 매핑
- 관련 feature flag와 계약 테스트

`slips`/`slip_lines` 원본은 읽기만 하므로 자동으로 새 회계 데이터가 생기지 않고, DB migration도 계획돼 있지 않다(`implementation-plan.md:196-202,224-226`). 따라서 **live read만 사용했다면 코드 원복 뒤 INBOUND 원본만 그대로 남고 별도 P0-C 생성 데이터는 없다.**

단, 현재 화면에는 사용자가 명시적으로 원장을 저장하는 API가 있다. `LedgerSnapshotService.capture()`는 현재 read model을 `TaxInvoiceBatch.data_snapshot_json`에 저장한다(`LedgerSnapshotService.java:52-63`), 복원·복사는 저장 당시 JSON을 유지한다(`:76-100`). 그러므로 P0-C 응답 필드가 snapshot payload에 포함되는 방식으로 구현되고 사용자가 저장했다면:

- 코드 롤백만으로 기존 snapshot JSON은 삭제되지 않는다.
- 삭제할지, 구 버전 이력으로 보존할지, 새 reader가 호환할지는 현재 설계가 없어 **모른다**.
- 회계 감사 이력을 임의 삭제하면 안 되므로 별도 개발책임자 결정이 필요하다.

### 5.2 P0-D까지 적용 후 되돌리는 경우

P0-D가 실제 journal을 게시했다면 코드만 되돌려 금액이 원복되지 않는다. 신규 게시를 중단하고 이미 게시된 분개는 hard delete/UPDATE가 아니라 역분개해야 한다는 것이 계획서의 원칙이다(`implementation-plan.md:271-273`). 이 경우 데이터와 감사 이력은 남는다. 다만 정확한 역분개·세금계산서 연결해제 순서는 아직 확정되지 않았다.

## 개발책임자 확인 항목

1. 규칙 8의 “거래처별 채권/채무 원장”은 (a) 거래처별 문서원장만, (b) 문서원장+채권채무 현황, (c) 총계정원장까지 세 표면 모두 중 어디까지입니까?
2. 세 표면의 시점은 (a) 문서원장=전표 즉시·나머지=POST, (b) 문서원장+채권채무 현황=전표 즉시·총계정원장=POST, (c) 세 표면 모두 전표 즉시 중 어느 계약입니까?
3. 거래처별 채무는 기존 화면의 (a) 별도 탭, (b) 같은 행의 매입·지급·채무 열 중 어느 형태이며, “원장 반영”은 문서 금액만입니까 아니면 지급과 채무잔액 fold까지입니까?
4. P0-C를 P0-D보다 먼저 별도 배포해 문서원장과 분개 표면의 시점 차이를 일시적으로 허용합니까, 아니면 source 연결·중복제거까지 포함해 함께 배포해야 합니까?
5. 매출/매입 회계전표 POST 분개의 정확한 상대 계정과 VAT 계정은 무엇이며, 현행 `TaxInvoiceService.issue()`의 110 생성 책임은 제거·축소·기존자료 전용 중 무엇입니까?
6. P0-C 기간에 저장된 거래처 원장 snapshot에 채무 필드가 들어간 뒤 롤백하는 경우, 그 snapshot은 감사 이력으로 보존합니까, 별도 보정합니까?

## 확정하지 못한 것

- 규칙 8이 거래처별 문서원장만 가리키는지, 채권채무 현황과 총계정원장까지 포함하는지 **모른다**.
- 세 표면의 시점을 같게 해야 한다는 업무 규칙은 코드·주석에서 찾지 못했다. 현재 목적이 서로 다르다는 것만 확정했다.
- INBOUND 정본 상태를 OUTBOUND의 5상태와 완전히 대칭으로 볼지는 **모른다**. 이번 20건은 계획서의 기존 5상태를 그대로 적용해 재현한 수치다.
- 채무 원장의 지급 원천과 정확한 `payableBalance` 산식은 **모른다**. 현재 거래처 원장에는 입금보고서만 있고 출금보고서 live 계약은 별도 P0 범위다.
- 매출/매입 회계전표 POST의 상대 계정·VAT 계정, 세금계산서 발행 분개 책임 이전 방식은 **모른다**.
- P0-D journal과 원 전표를 잇는 안정적인 자연키/sourceRef 계약은 **모른다**. 현재 `canonicalSlipKeys`가 비어 있다는 위험만 확정했다.
- P0-C 구현이 기존 snapshot JSON schema를 확장할지 별도 채무 snapshot을 만들지는 설계 전이라 **모른다**.
- 위 수치는 2026-08-08 조사 시점의 실행 DB 상태다. 다른 PC·환경·기준시각의 값이 같은지는 **모른다**.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-1144-p0c-payable-ledger-analysis.md` (본 조사 보고서 1개)

