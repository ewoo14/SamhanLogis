# 2026-08-01 회계 정정 대상 19건 부가세 과다 계상 조사

## 조사 원칙과 실행 환경

- 조사일: 2026-08-01 (Asia/Seoul)
- 범위: 과거 Partner order 출처 전표의 VAT 중복 가산 19건 식별, 세금계산서 및 `accounting_db` 전파 여부 확인
- 금지사항 준수: git 명령, Docker 재빌드·재기동, DB 쓰기, 코드·마이그레이션 수정, 빌드·테스트를 실행하지 않았다.
- DB 조회는 실행 중인 `samhan-postgres` 컨테이너에 `PGOPTIONS=-c default_transaction_read_only=on`을 지정해 수행한다. 각 연결에서 `SHOW transaction_read_only` 원문을 함께 남긴다.

### 실행 중 컨테이너 확인 원문

명령:

```powershell
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

관련 출력:

```text
NAMES                          IMAGE                                                  STATUS
samhan-slip-service            infrastructure-slip-service                            Up About an hour (healthy)
samhan-partner-order-service   infrastructure-partner-order-service                   Up 6 hours (healthy)
samhan-accounting-service      infrastructure-accounting-service                      Up 7 hours (healthy)
samhan-postgres                postgres:16-alpine                                     Up 24 hours (healthy)
```

위 컨테이너를 재빌드하거나 재기동하지 않았다.

### 읽기 전용 연결 및 교차 대조 키 확인

세 DB 모두 아래 출력으로 읽기 전용 연결을 확인했다.

```text
 transaction_read_only
-----------------------
 on
(1 row)
```

스키마 조회 결과, 교차 대조 키와 금액 컬럼은 다음과 같다.

```text
slip_db.public.slip_lines:
  slip_id uuid, product_name varchar, model_name varchar, quantity integer,
  unit_price numeric, line_total numeric, unit_price_with_vat numeric,
  supply_amount numeric, vat_amount numeric, source_order_line_id uuid,
  unit_price_domain varchar, is_deleted boolean

slip_db.public.slips:
  id uuid, slip_no varchar, slip_date date, partner_name varchar,
  source_type varchar, source_id varchar, status varchar, is_deleted boolean

partner_order_db.public.partner_order_lines:
  id uuid, partner_order_id uuid, product_name varchar, model_name varchar,
  quantity integer, price_vat numeric, subtotal numeric,
  supply_amount numeric, vat_amount numeric, is_deleted boolean

partner_order_db.public.partner_orders:
  id uuid, order_no varchar, slip_no varchar, partner_code varchar,
  status varchar, slip_publish_status varchar, is_deleted boolean

accounting_db:
  sales_accounting_slip_allocations.source_slip_id/source_slip_no/source_line_id
  purchase_accounting_slip_allocations.source_slip_id/source_slip_no/source_line_id
  journals.source_type/source_ref_id/source_ref
  tax_invoices.tax_invoice_no, tax_invoice_lines.tax_invoice_id
```

따라서 19건 식별은 `slip_lines.source_order_line_id = partner_order_lines.id`로 수행하고, 회계 전파 여부는 전표번호·전표/라인 식별자를 별도로 대조한다. 보고서 본문 표에는 사용자 비공개 UUID를 싣지 않는다.

## 넓은 조건의 모집단

가장 넓은 안전한 후보 조건은 `slip_lines.source_order_line_id IS NOT NULL`이다. 현재 DB에서는 모두 `source_type='PARTNER_ORDER'`였지만, 중복 가산 여부를 아직 단정하지 않고 먼저 전부 셌다.

SQL (`slip_db`):

```sql
SHOW transaction_read_only;
SELECT
    COUNT(*) AS linked_lines,
    COUNT(DISTINCT source_order_line_id) AS distinct_source_lines,
    COUNT(*) FILTER (WHERE s.slip_date < DATE '2026-08-01') AS before_aug_1,
    COUNT(*) FILTER (WHERE s.slip_date >= DATE '2026-08-01') AS aug_1_or_later,
    COUNT(*) FILTER (WHERE s.source_type = 'PARTNER_ORDER') AS partner_order_source,
    COUNT(*) FILTER (WHERE s.is_deleted OR sl.is_deleted) AS deleted_rows
FROM slips s
JOIN slip_lines sl ON sl.slip_id = s.id
WHERE sl.source_order_line_id IS NOT NULL;
```

출력 원문:

```text
 transaction_read_only
-----------------------
 on
(1 row)

 linked_lines | distinct_source_lines | before_aug_1 | aug_1_or_later | partner_order_source | deleted_rows
--------------+-----------------------+--------------+----------------+----------------------+-------------
           29 |                    24 |           22 |              7 |                   29 |            0
(1 row)
```

즉 넓은 조건은 현재 **29행**이다. 이 중 2026-08-01 이전 22행과 이후 7행이 있으며, 같은 원천 주문 라인을 여러 전표가 참조하므로 원천 라인 식별자는 24개다. 이 29행 전체를 정정 대상으로 삼으면 안 된다. 아래에서 원천 주문 금액과 대조해 19개 오염행, 7개 정상행, 원천 소실로 확인 불가한 3개 행으로 분리한다.

## 원천 주문 교차 대조 결과

`slip_db`와 `partner_order_db`는 별도 DB이므로 한 SQL 연결에서 직접 조인할 수 없다(`dblink`/FDW 확장도 설치되어 있지 않음). 아래 두 읽기 전용 SELECT의 결과를 `source_order_line_id = order_line_id`로 메모리에서 조인했다.

SQL A (`slip_db`):

```sql
SELECT
    s.slip_no, s.slip_date,
    COALESCE(NULLIF(s.partner_name, ''), '') AS slip_partner_name,
    s.partner_code, s.status, s.source_type,
    sl.id AS slip_line_id, sl.source_order_line_id,
    sl.product_name, sl.model_name, sl.quantity,
    sl.unit_price, sl.supply_amount, sl.vat_amount,
    sl.unit_price_with_vat, sl.line_total,
    COALESCE(sl.unit_price_domain, '') AS unit_price_domain
FROM slips s
JOIN slip_lines sl ON sl.slip_id = s.id
WHERE sl.source_order_line_id IS NOT NULL
  AND NOT s.is_deleted
  AND NOT sl.is_deleted
ORDER BY s.slip_date, s.slip_no, sl.created_at, sl.id;
```

SQL B (`partner_order_db`, SQL A에서 얻은 식별자 목록을 `IN (...)`에 그대로 전달):

```sql
SELECT
    pol.id AS order_line_id,
    po.order_no, po.partner_code,
    pol.product_name AS order_product_name,
    pol.model_name AS order_model_name,
    pol.quantity AS order_quantity,
    pol.price_vat
FROM partner_order_lines pol
JOIN partner_orders po ON po.id = pol.partner_order_id
WHERE pol.id IN (<SQL A의 source_order_line_id 목록>)
  AND NOT po.is_deleted
  AND NOT pol.is_deleted;
```

판정식:

```text
OVERCHARGED = unit_price = price_vat
          AND unit_price_with_vat = price_vat × 1.10
          AND unit_price_with_vat > price_vat

NORMAL      = 원천 라인이 존재하지만 위 식이 거짓
UNRESOLVED  = source_order_line_id는 있으나 현재 partner_order_lines에 원천 행 없음
```

교차 대조 출력 원문(요약):

```text
SUMMARY
UNRESOLVED=3
OVERCHARGED=19
NORMAL=7
overcharged_unit_delta_sum=2835000
overcharged_line_delta_sum=5169000
overcharged_stored_vat_sum=5169000
```

핵심 판정:

- 원천과 교차 대조 가능한 26행 중 **중복 가산 19행**, **정상 7행**이다.
- 원천 행이 현재 DB에 없어 판정할 수 없는 행은 3행이다.
- 보고된 **2,835,000원은 19행의 개당 VAT 포함 단가 차이를 수량 없이 합한 값**으로 정확히 재현된다.
- 그러나 회계 금액인 각 라인의 `(저장 공급가액 + 저장 부가세) - (원천 VAT포함 단가 × 수량)` 합계는 **5,169,000원**이다. 저장 부가세 합계도 5,169,000원이다. 따라서 “회계 과다 계상 합계”를 라인 총액 기준으로 뜻했다면 보고된 2,835,000원과 실측이 다르다. 두 수치를 혼용하면 안 된다.

### 거래처 코드-명칭 확인

SQL (`partner_db`):

```sql
SHOW transaction_read_only;
SELECT partner_code, name, status, is_deleted
FROM partners
WHERE partner_code IN (
  'P-2026-0001','P-2026-0002','P-2026-0003','P-2026-0004','P-2026-0005',
  'P-2026-0006','P-2026-0007','P-2026-0008','P-2026-0010','P-2026-0019'
)
ORDER BY partner_code;
```

출력 원문:

```text
 partner_code |         name         |  status   | is_deleted
--------------+----------------------+-----------+-----------
 P-2026-0001  | (주)서울에어컨       | ACTIVE    | f
 P-2026-0002  | 한국공조시스템(주)   | ACTIVE    | f
 P-2026-0003  | 부산냉난방테크       | ACTIVE    | f
 P-2026-0004  | 광주에어시스템       | ACTIVE    | f
 P-2026-0005  | 대구HVAC솔루션       | ACTIVE    | f
 P-2026-0006  | 인천공조산업         | ACTIVE    | f
 P-2026-0007  | 울산냉난방엔지니어링 | ACTIVE    | f
 P-2026-0008  | 수원에어컨센터       | ACTIVE    | f
 P-2026-0010  | (주)성남에어시스템   | SUSPENDED | f
 P-2026-0019  | 청주공조에너지       | ACTIVE    | f
(10 rows)
```

## 정정 검토 대상 19행 상세

표 해석:

- `저장 단가`는 `slip_lines.unit_price`이며, 괄호 안은 사용자 총액에 영향을 주는 `unit_price_with_vat`이다.
- `저장 공급가액`·`저장 부가세`는 라인 전체 금액이다.
- 품목 칸에 모델과 수량을 함께 적었다. 같은 전표번호의 복수 품목은 서로 다른 정정 대상 행이다.
- 올바른 값은 PR #991 이후 발행 계약과 동일하게 원천 `price_vat × 수량`을 VAT 포함 합계로 두고, 공급가액을 `ROUND(합계 / 1.10, 0)`으로 분리한 값이다. 공급단가는 `ROUND(공급가액 / 수량, 2)`다.
- 차액은 보고된 2,835,000원과 대조하기 위한 `개당 VAT포함 단가 차이`와 실제 라인 총액에 반영되는 `라인 차이`를 모두 적었다.

| 전표번호 | 일자 | 거래처 | 품목 | 저장 단가 | 저장 공급가액 | 저장 부가세 | **올바른 값** | **차액** |
|---|---|---|---|---:|---:|---:|---|---:|
| 2026/05/31-1 | 2026-05-31 | (주)서울에어컨 (`P-2026-0001`) | 삼성 DVM-S 10HP / AM100BNNDEH-57 / 수량 2 | 3,000,000원 (VAT포함 3,300,000원) | 6,000,000원 | 600,000원 | 공급단가 2,727,272.50원; 공급 5,454,545원; VAT 545,455원; 합계 6,000,000원 | 개당 +300,000원; 라인 +600,000원 |
| 2026/05/31-10 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 윈드프리 9평형 / AR09TXEAAWKNEU-04 / 수량 1 | 1,080,000원 (VAT포함 1,188,000원) | 1,080,000원 | 108,000원 | 공급단가 981,818원; 공급 981,818원; VAT 98,182원; 합계 1,080,000원 | 개당 +108,000원; 라인 +108,000원 |
| 2026/05/31-10 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 윈드프리 7평형 / AR07TXEAAWKNEU-03 / 수량 2 | 840,000원 (VAT포함 924,000원) | 1,680,000원 | 168,000원 | 공급단가 763,636.50원; 공급 1,527,273원; VAT 152,727원; 합계 1,680,000원 | 개당 +84,000원; 라인 +168,000원 |
| 2026/05/31-2 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 윈드프리 5평형 / AR05TXEAAWKNEU-01 / 수량 1 | 750,000원 (VAT포함 825,000원) | 750,000원 | 75,000원 | 공급단가 681,818원; 공급 681,818원; VAT 68,182원; 합계 750,000원 | 개당 +75,000원; 라인 +75,000원 |
| 2026/05/31-3 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 윈드프리 5평형 / AR05TXEAAWKNEU-01 / 수량 1 | 750,000원 (VAT포함 825,000원) | 750,000원 | 75,000원 | 공급단가 681,818원; 공급 681,818원; VAT 68,182원; 합계 750,000원 | 개당 +75,000원; 라인 +75,000원 |
| 2026/05/31-4 | 2026-05-31 | 대구HVAC솔루션 (`P-2026-0005`) | 삼성 비스포크 스탠드 20평형 (단종) / AF20BX1NWAEAH-50 / 수량 1 | 2,100,000원 (VAT포함 2,310,000원) | 2,100,000원 | 210,000원 | 공급단가 1,909,091원; 공급 1,909,091원; VAT 190,909원; 합계 2,100,000원 | 개당 +210,000원; 라인 +210,000원 |
| 2026/05/31-4 | 2026-05-31 | 대구HVAC솔루션 (`P-2026-0005`) | 삼성 DVM-S 3HP / AM030BNNDEH-51 / 수량 2 | 900,000원 (VAT포함 990,000원) | 1,800,000원 | 180,000원 | 공급단가 818,182원; 공급 1,636,364원; VAT 163,636원; 합계 1,800,000원 | 개당 +90,000원; 라인 +180,000원 |
| 2026/05/31-5 | 2026-05-31 | 광주에어시스템 (`P-2026-0004`) | 삼성 천장형 3톤 / AC100CNCDEH-76 / 수량 2 | 2,400,000원 (VAT포함 2,640,000원) | 4,800,000원 | 480,000원 | 공급단가 2,181,818원; 공급 4,363,636원; VAT 436,364원; 합계 4,800,000원 | 개당 +240,000원; 라인 +480,000원 |
| 2026/05/31-6 | 2026-05-31 | 부산냉난방테크 (`P-2026-0003`) | 삼성 윈드프리 11평형 / AR11TXEAAWKNEU-05 / 수량 4 | 1,320,000원 (VAT포함 1,452,000원) | 5,280,000원 | 528,000원 | 공급단가 1,200,000원; 공급 4,800,000원; VAT 480,000원; 합계 5,280,000원 | 개당 +132,000원; 라인 +528,000원 |
| 2026/05/31-6 | 2026-05-31 | 부산냉난방테크 (`P-2026-0003`) | 삼성 천장형 3톤 / AC100CNCDEH-76 / 수량 5 | 2,400,000원 (VAT포함 2,640,000원) | 12,000,000원 | 1,200,000원 | 공급단가 2,181,818.20원; 공급 10,909,091원; VAT 1,090,909원; 합계 12,000,000원 | 개당 +240,000원; 라인 +1,200,000원 |
| 2026/05/31-6 | 2026-05-31 | 부산냉난방테크 (`P-2026-0003`) | 삼성 비스포크 스탠드 20평형 (단종) / AF20BX1NWAEAH-50 / 수량 1 | 2,100,000원 (VAT포함 2,310,000원) | 2,100,000원 | 210,000원 | 공급단가 1,909,091원; 공급 1,909,091원; VAT 190,909원; 합계 2,100,000원 | 개당 +210,000원; 라인 +210,000원 |
| 2026/05/31-7 | 2026-05-31 | 광주에어시스템 (`P-2026-0004`) | 삼성 천장형 3톤 / AC100CNCDEH-76 / 수량 1 | 2,400,000원 (VAT포함 2,640,000원) | 2,400,000원 | 240,000원 | 공급단가 2,181,818원; 공급 2,181,818원; VAT 218,182원; 합계 2,400,000원 | 개당 +240,000원; 라인 +240,000원 |
| 2026/05/31-8 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 윈드프리 11평형 / AR11TXEAAWKNEU-05 / 수량 2 | 1,320,000원 (VAT포함 1,452,000원) | 2,640,000원 | 264,000원 | 공급단가 1,200,000원; 공급 2,400,000원; VAT 240,000원; 합계 2,640,000원 | 개당 +132,000원; 라인 +264,000원 |
| 2026/05/31-8 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 윈드프리 5평형 / AR05TXEAAWKNEU-01 / 수량 1 | 750,000원 (VAT포함 825,000원) | 750,000원 | 75,000원 | 공급단가 681,818원; 공급 681,818원; VAT 68,182원; 합계 750,000원 | 개당 +75,000원; 라인 +75,000원 |
| 2026/05/31-8 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 DVM-S 3HP / AM030BNNDEH-51 / 수량 1 | 1,080,000원 (VAT포함 1,188,000원) | 1,080,000원 | 108,000원 | 공급단가 981,818원; 공급 981,818원; VAT 98,182원; 합계 1,080,000원 | 개당 +108,000원; 라인 +108,000원 |
| 2026/05/31-9 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 윈드프리 6평형 / AR06TXEAAWKNEU-02 / 수량 1 | 720,000원 (VAT포함 792,000원) | 720,000원 | 72,000원 | 공급단가 654,545원; 공급 654,545원; VAT 65,455원; 합계 720,000원 | 개당 +72,000원; 라인 +72,000원 |
| 2026/05/31-9 | 2026-05-31 | 한국공조시스템(주) (`P-2026-0002`) | 삼성 윈드프리 11평형 / AR11TXEAAWKNEU-05 / 수량 2 | 1,320,000원 (VAT포함 1,452,000원) | 2,640,000원 | 264,000원 | 공급단가 1,200,000원; 공급 2,400,000원; VAT 240,000원; 합계 2,640,000원 | 개당 +132,000원; 라인 +264,000원 |
| 2026/07/05-1 | 2026-07-05 | 청주공조에너지 (`P-2026-0019`) | 삼성 윈드프리 13평형 / AR13TXEAAWKNEU-06 / 수량 1 | 1,560,000원 (VAT포함 1,716,000원) | 1,560,000원 | 156,000원 | 공급단가 1,418,182원; 공급 1,418,182원; VAT 141,818원; 합계 1,560,000원 | 개당 +156,000원; 라인 +156,000원 |
| 2026/07/05-2 | 2026-07-05 | 광주에어시스템 (`P-2026-0004`) | 삼성 윈드프리 13평형 / AR13TXEAAWKNEU-06 / 수량 1 | 1,560,000원 (VAT포함 1,716,000원) | 1,560,000원 | 156,000원 | 공급단가 1,418,182원; 공급 1,418,182원; VAT 141,818원; 합계 1,560,000원 | 개당 +156,000원; 라인 +156,000원 |

### 19행 합계 출력 원문

```text
count=19
stored_supply_sum=51690000.00
stored_vat_sum=5169000.00
stored_total_sum=56859000.00
correct_supply_sum=46990908
correct_vat_sum=4699092
correct_total_sum=51690000
line_total_delta=5169000.00
unit_delta_sum=2835000.00
```

합계 결론:

- 개당 VAT포함 단가 차이 합계: **2,835,000원** — 기존 보고 수치와 일치.
- 수량 반영 저장 총액: 56,859,000원.
- 수량 반영 올바른 총액: 51,690,000원.
- 수량 반영 총액 차이: **+5,169,000원** — 회계상 과다 계상액으로 해석해야 할 실측값.

## 세금계산서 발행 여부

결론: **이 19행에서 발행된 것으로 연결되는 세금계산서는 0건**이다.

확인 수단은 두 가지다.

1. `sales_accounting_slip_allocations`/`purchase_accounting_slip_allocations`에서 원 판매전표를 참조하는 accounting slip을 찾고, 그 header의 `tax_invoice_id`를 따라간다. 아래 회계 전파 조회에서 allocation 자체가 0건이다.
2. 보조 검증으로 대상 거래처 코드·명칭에 해당하는 전체 `tax_invoices` 상태를 조회했다. ISSUED는 0건이고, 2026-07-20의 별도 DRAFT 3건(각 110,000원)만 존재한다. 대상 전표 일자(2026-05-31, 2026-07-05)에는 후보가 0건이다.

대상 일자·거래처 SQL (`accounting_db`):

```sql
SHOW transaction_read_only;
SELECT
    ti.tax_invoice_no, ti.supply_date, ti.partner_code, ti.partner_name,
    ti.status, ti.invoice_type, ti.direction,
    ti.supply_amount, ti.vat_amount, ti.total_amount,
    ti.issued_at, ti.e_tax_external_id,
    COUNT(til.id) FILTER (WHERE NOT til.is_deleted) AS active_lines
FROM tax_invoices ti
LEFT JOIN tax_invoice_lines til ON til.tax_invoice_id = ti.id
WHERE NOT ti.is_deleted
  AND ti.supply_date IN (DATE '2026-05-31', DATE '2026-07-05')
  AND ti.partner_code IN (
    'P-2026-0001','P-2026-0002','P-2026-0003',
    'P-2026-0004','P-2026-0005','P-2026-0019'
  )
GROUP BY ti.id
ORDER BY ti.supply_date, ti.tax_invoice_no;
```

출력 원문:

```text
 tax_invoice_no | supply_date | partner_code | partner_name | status | invoice_type | direction | supply_amount | vat_amount | total_amount | issued_at | e_tax_external_id | active_lines
----------------+-------------+--------------+--------------+--------+--------------+-----------+---------------+------------+--------------+-----------+-------------------+-------------
(0 rows)
```

대상 거래처의 전체 상태 SQL (`accounting_db`):

```sql
SHOW transaction_read_only;
SELECT status, COUNT(*) AS invoices, COALESCE(SUM(total_amount), 0) AS total_amount
FROM tax_invoices
WHERE NOT is_deleted
  AND (
    partner_code IN (
      'P-2026-0001','P-2026-0002','P-2026-0003',
      'P-2026-0004','P-2026-0005','P-2026-0019'
    )
    OR partner_name IN (
      '(주)서울에어컨','한국공조시스템(주)','부산냉난방테크',
      '광주에어시스템','대구HVAC솔루션','청주공조에너지'
    )
  )
GROUP BY status
ORDER BY status;
```

출력 원문:

```text
 status | invoices | total_amount
--------+----------+-------------
 DRAFT  |        3 |    330000.00
(1 row)
```

즉 DB가 제공하는 명시적 연결과 거래처·일자·상태 보조 대조 양쪽에서 발행 건은 없다. 외부 국세청 시스템을 별도로 조회하지는 않았으며, `e_tax_external_id`가 있는 대상 연결행도 없다.

## accounting_db 전파 여부

결론: **대상 19행을 참조하는 매출/매입 회계전표 allocation 0건, 회계전표 header 0건, journal 직접 참조 0건**이다.

전표번호 기준 SQL (`accounting_db`):

```sql
SHOW transaction_read_only;
WITH targets(slip_no) AS (VALUES
  ('2026/05/31-1'),('2026/05/31-2'),('2026/05/31-3'),('2026/05/31-4'),
  ('2026/05/31-5'),('2026/05/31-6'),('2026/05/31-7'),('2026/05/31-8'),
  ('2026/05/31-9'),('2026/05/31-10'),('2026/07/05-1'),('2026/07/05-2')
)
SELECT 'sales_allocation' AS relation, COUNT(*) AS rows
FROM sales_accounting_slip_allocations a JOIN targets t ON t.slip_no = a.source_slip_no
WHERE NOT a.is_deleted
UNION ALL
SELECT 'purchase_allocation', COUNT(*)
FROM purchase_accounting_slip_allocations a JOIN targets t ON t.slip_no = a.source_slip_no
WHERE NOT a.is_deleted
UNION ALL
SELECT 'sales_accounting_slip_no', COUNT(*)
FROM sales_accounting_slips x JOIN targets t ON t.slip_no = x.slip_no
WHERE NOT x.is_deleted
UNION ALL
SELECT 'purchase_accounting_slip_no', COUNT(*)
FROM purchase_accounting_slips x JOIN targets t ON t.slip_no = x.slip_no
WHERE NOT x.is_deleted
UNION ALL
SELECT 'journal_source_ref', COUNT(*)
FROM journals j JOIN targets t ON t.slip_no = j.source_ref
WHERE NOT j.is_deleted
UNION ALL
SELECT 'orders_linked_slip_no', COUNT(*)
FROM orders o JOIN targets t ON t.slip_no = o.linked_slip_no
WHERE NOT o.is_deleted
UNION ALL
SELECT 'cash_receipts_slip_no', COUNT(*)
FROM cash_receipts c JOIN targets t ON t.slip_no = c.slip_no
WHERE NOT c.is_deleted
UNION ALL
SELECT 'cash_disbursements_slip_no', COUNT(*)
FROM cash_disbursements c JOIN targets t ON t.slip_no = c.slip_no
WHERE NOT c.is_deleted;
```

출력 원문:

```text
          relation           | rows
-----------------------------+-----
 sales_allocation            |    0
 purchase_allocation         |    0
 sales_accounting_slip_no    |    0
 purchase_accounting_slip_no |    0
 journal_source_ref          |    0
 orders_linked_slip_no       |    0
 cash_receipts_slip_no       |    2
 cash_disbursements_slip_no  |    0
(8 rows)
```

전표번호는 서비스별 독립 채번이라 `cash_receipts` 2건은 번호만 우연히 겹쳤다. 원문은 다음과 같다.

```text
slip_no     | amount    | kind           | memo                                 | external_ref               | status
------------+-----------+----------------+--------------------------------------+----------------------------+----------
2026/07/05-1| 123456.00 | MANUAL_RECEIPT | QA라이브 PR730 1783195967609         | MANUAL:2026/07/05-1        | CANCELLED
2026/07/05-2|  50000.00 | BANK_LINKED    | race-condition 시뮬레이션(동시 세션) | BANK_LINKED:2026/07/05-2   | CANCELLED
```

두 행은 모두 취소된 QA 수금전표이고 대상 판매전표 금액·거래처 연결이 아니다. 회계 전파로 세지 않았다.

전표/라인 식별자 기준으로도 재검증했다. SQL A에서 얻은 대상 전표·라인 식별자를 각각 아래 `IN (...)`에 전달했다.

```sql
SELECT 'sales_by_source_slip_id' AS relation, COUNT(*) AS rows
FROM sales_accounting_slip_allocations
WHERE NOT is_deleted AND source_slip_id IN (<대상 slip_id 목록>)
UNION ALL
SELECT 'sales_by_source_line_id', COUNT(*)
FROM sales_accounting_slip_allocations
WHERE NOT is_deleted AND source_line_id IN (<대상 slip_line_id 목록>)
UNION ALL
SELECT 'purchase_by_source_slip_id', COUNT(*)
FROM purchase_accounting_slip_allocations
WHERE NOT is_deleted AND source_slip_id IN (<대상 slip_id 목록>)
UNION ALL
SELECT 'purchase_by_source_line_id', COUNT(*)
FROM purchase_accounting_slip_allocations
WHERE NOT is_deleted AND source_line_id IN (<대상 slip_line_id 목록>);
```

출력 원문:

```text
          relation          | rows
----------------------------+-----
 sales_by_source_slip_id    |    0
 sales_by_source_line_id    |    0
 purchase_by_source_slip_id |    0
 purchase_by_source_line_id |    0
(4 rows)
```

journal의 `source_ref_id`, UUID 문자열 `source_ref`, 전표번호 `source_ref`도 모두 0건이었다.

```text
           relation           | rows
------------------------------+-----
 journal_source_ref_id        |    0
 journal_source_ref_uuid_text |    0
 journal_source_ref_slip_no   |    0
(3 rows)
```

## 같은 넓은 조건에 걸리는 정상·확인불가 행

### 원천 대조 결과 정상인 7행

아래 7행도 `source_order_line_id IS NOT NULL` 조건에 걸리지만, `unit_price_with_vat = partner_order_lines.price_vat`라 VAT 중복 가산 대상이 아니다. **이 결함 기준 정상**이라는 뜻이며, 다른 반올림 오차까지 전부 정상이라고 판정한 것은 아니다.

| 전표번호 | 거래처 | 품목 / 수량 | 원천 VAT포함 단가 | 저장 공급가액 | 저장 부가세 | 저장 VAT포함 단가 | 판정 |
|---|---|---|---:|---:|---:|---:|---|
| 2026/08/01-5 | 인천공조산업 (`P-2026-0006`) | 삼성 DVM-S 3HP / 2 | 900,000원 | 1,636,364원 | 163,636원 | 900,000원 | 중복 가산 아님 |
| 2026/08/01-5 | 인천공조산업 (`P-2026-0006`) | 삼성 DVM-S 10HP / 3 | 3,000,000원 | 8,181,818원 | 818,182원 | 3,000,000원 | 중복 가산 아님 |
| 2026/08/01-5 | 인천공조산업 (`P-2026-0006`) | 삼성 윈드프리 5평형 / 4 | 750,000원 | 2,727,273원 | 272,727원 | 750,000원 | 중복 가산 아님 |
| 2026/08/01-6 | 울산냉난방엔지니어링 (`P-2026-0007`) | 삼성 DVM-S 10HP / 3 | 3,000,000원 | 8,181,818.19원 | 818,181원 | 3,000,000원 | 중복 가산 아님(별도 0.81원 반올림 차이 존재) |
| 2026/08/01-7 | 수원에어컨센터 (`P-2026-0008`) | 삼성 윈드프리 5평형 / 4 | 750,000원 | 2,727,273원 | 272,727원 | 750,000원 | 중복 가산 아님 |
| 2026/08/01-7 | 수원에어컨센터 (`P-2026-0008`) | 삼성 윈드프리 11평형 / 5 | 1,320,000원 | 6,000,000원 | 600,000원 | 1,320,000원 | 중복 가산 아님 |
| 2026/08/01-8 | (주)성남에어시스템 (`P-2026-0010`) | 삼성 윈드프리 15평형 / 1 | 1,800,000원 | 1,636,364원 | 163,636원 | 1,800,000원 | 중복 가산 아님 |

### 원천 소실로 확인불가인 3행

아래 3행은 저장 모양만 보면 `unit_price_with_vat = unit_price × 1.10`이지만, 현재 `partner_order_db`에 원 주문 header와 line이 모두 없어 원천 `price_vat`를 확인할 수 없다. **19행에 포함하지 않았다.** 저장 패턴만으로 정정하면 이 3행까지 건드릴 위험이 있다.

| 전표번호 | 일자 | 거래처 | 품목 / 수량 | 저장 단가 | 저장 공급가액 | 저장 부가세 | 저장 VAT포함 단가 | 판정 |
|---|---|---|---|---:|---:|---:|---:|---|
| 2026/05/30-1 | 2026-05-30 | 대구HVAC솔루션 (`P-2026-0005`) | Product A / AR07TXEAAWKNEU-03 / 1 | 840,000원 | 840,000원 | 84,000원 | 924,000원 | 확인불가 |
| 2026/05/30-2 | 2026-05-30 | 대구HVAC솔루션 (`P-2026-0005`) | Samsung Product A / AR07TXEAAWKNEU-03 / 1 | 840,000원 | 840,000원 | 84,000원 | 924,000원 | 확인불가 |
| 2026/05/30-3 | 2026-05-30 | 대구HVAC솔루션 (`P-2026-0005`) | Samsung Product A / AR07TXEAAWKNEU-03 / 1 | 840,000원 | 840,000원 | 84,000원 | 924,000원 | 확인불가 |

원천 header/line 재조회 출력 원문:

```text
 id | order_no | partner_code | status | is_deleted | line_id | product_name | model_name | quantity | price_vat | line_deleted | deleted_at
----+----------+--------------+--------+------------+---------+--------------+------------+----------+-----------+--------------+-----------
(0 rows)

 id | partner_order_id | product_name | model_name | quantity | price_vat | is_deleted | deleted_at
----+------------------+--------------+------------+----------+-----------+------------+----------
(0 rows)
```

### 저장 모양만으로 좁혀도 23행 — 안전하지 않음

원천 DB를 보지 않고 `slip_db` 안의 중복 가산 모양만 적용한 SQL은 23행을 잡는다.

```sql
SHOW transaction_read_only;
SELECT
    COUNT(*) AS slip_only_pattern_rows,
    COUNT(DISTINCT s.id) AS slips,
    COALESCE(SUM(sl.unit_price_with_vat - sl.unit_price), 0) AS per_unit_gap_sum,
    COALESCE(SUM(sl.supply_amount + sl.vat_amount - sl.unit_price * sl.quantity), 0) AS line_gap_sum
FROM slips s
JOIN slip_lines sl ON sl.slip_id = s.id
WHERE sl.source_order_line_id IS NOT NULL
  AND NOT s.is_deleted
  AND NOT sl.is_deleted
  AND sl.unit_price_with_vat = sl.unit_price * 1.10
  AND sl.supply_amount = sl.unit_price * sl.quantity
  AND sl.vat_amount = TRUNC(sl.supply_amount * 0.10);
```

출력 원문:

```text
 transaction_read_only
-----------------------
 on
(1 row)

 slip_only_pattern_rows | slips | per_unit_gap_sum | line_gap_sum
------------------------+-------+------------------+-------------
                     23 |    16 |       3207000.00 |   6021000.00
(1 row)
```

23행 구성은 **확정 오염 19 + 확인불가 3 + 정상 1**이다. 정상 1행은 `2026/08/01-7`의 삼성 윈드프리 11평형 수량 5행으로, 원천 VAT포함 단가 1,320,000원과 저장 `unit_price_with_vat`가 일치한다. 이 행은 공급단가 1,200,000원이라 우연히 `unit_price_with_vat = unit_price × 1.10`도 만족한다.

따라서 다음 세 조건은 모두 정정 대상 선택자로 불충분하다.

- `source_order_line_id IS NOT NULL`: 29행 → 정상 7행 포함.
- 저장 금액의 1.10배 패턴: 23행 → 정상 1행과 확인불가 3행 포함.
- 날짜만 2026-08-01 이전으로 제한: 22행 → 확인불가 3행 포함.

19행 외를 건드리지 않으려면 본 조사에서 검증된 19개 라인만 식별되어야 한다. 구체적인 정정 방법은 이번 조사 범위 밖이므로 설계하지 않는다.

## 19행 재현용 실행 원문

아래 PowerShell은 파일이나 DB에 쓰지 않고, 두 DB의 SELECT 결과를 메모리에서 조인해 같은 19행과 두 합계를 출력한다. 내부의 `$slipSql`, `$orderSql`이 실제 실행 SQL 원문이다.

```powershell
$slipSql = @"
SELECT
    s.slip_no, s.slip_date, s.partner_code,
    sl.id AS slip_line_id, sl.source_order_line_id,
    sl.product_name, sl.model_name, sl.quantity,
    sl.unit_price, sl.supply_amount, sl.vat_amount,
    sl.unit_price_with_vat
FROM slips s
JOIN slip_lines sl ON sl.slip_id = s.id
WHERE sl.source_order_line_id IS NOT NULL
  AND NOT s.is_deleted
  AND NOT sl.is_deleted
ORDER BY s.slip_date, s.slip_no, sl.created_at, sl.id
"@

$slipRows = (docker exec `
  -e "PGOPTIONS=-c default_transaction_read_only=on" `
  samhan-postgres psql -X -U samhan -d slip_db --csv -c $slipSql) |
  ConvertFrom-Csv

$ids = $slipRows.source_order_line_id | Sort-Object -Unique
$quotedIds = ($ids | ForEach-Object { "'$_'::uuid" }) -join ','

$orderSql = @"
SELECT
    pol.id AS order_line_id,
    po.order_no, po.partner_code,
    pol.product_name AS order_product_name,
    pol.model_name AS order_model_name,
    pol.quantity AS order_quantity,
    pol.price_vat
FROM partner_order_lines pol
JOIN partner_orders po ON po.id = pol.partner_order_id
WHERE pol.id IN ($quotedIds)
  AND NOT po.is_deleted
  AND NOT pol.is_deleted
"@

$orderRows = (docker exec `
  -e "PGOPTIONS=-c default_transaction_read_only=on" `
  samhan-postgres psql -X -U samhan -d partner_order_db --csv -c $orderSql) |
  ConvertFrom-Csv

$orderById = @{}
foreach ($o in $orderRows) { $orderById[$o.order_line_id] = $o }

$result = foreach ($s in $slipRows) {
    $o = $orderById[$s.source_order_line_id]
    if ($null -eq $o) { continue }

    $origin = [decimal]$o.price_vat
    $storedGrossUnit = [decimal]$s.unit_price_with_vat
    $isOvercharged =
        ([decimal]$s.unit_price -eq $origin) -and
        ($storedGrossUnit -eq [decimal]::Round(
            $origin * 1.10, 2, [MidpointRounding]::AwayFromZero)) -and
        ($storedGrossUnit -gt $origin)

    if (-not $isOvercharged) { continue }

    $quantity = [decimal]$s.quantity
    $correctTotal = [decimal]::Round(
        $origin * $quantity, 0, [MidpointRounding]::AwayFromZero)
    $correctSupply = [decimal]::Round(
        $correctTotal / 1.10, 0, [MidpointRounding]::AwayFromZero)
    $correctVat = $correctTotal - $correctSupply

    [pscustomobject]@{
        slip_no       = $s.slip_no
        slip_date     = $s.slip_date
        partner_code  = $o.partner_code
        product_name  = $s.product_name
        model_name    = $s.model_name
        quantity      = $s.quantity
        stored_unit   = $s.unit_price
        stored_supply = $s.supply_amount
        stored_vat    = $s.vat_amount
        correct_supply = $correctSupply
        correct_vat    = $correctVat
        correct_total  = $correctTotal
        unit_delta = $storedGrossUnit - $origin
        line_delta = ([decimal]$s.supply_amount + [decimal]$s.vat_amount) - $correctTotal
    }
}

$result | Format-Table -AutoSize
"count=$($result.Count)"
"unit_delta_sum=$(($result | Measure-Object unit_delta -Sum).Sum)"
"line_delta_sum=$(($result | Measure-Object line_delta -Sum).Sum)"
```

마지막 출력 원문:

```text
count=19
unit_delta_sum=2835000.00
line_delta_sum=5169000.00
```

## 최종 결론

1. 정정 검토 대상은 전표 12개에 포함된 **라인 19행**이다. 전표번호만으로는 복수 품목을 구분할 수 있으므로 라인 단위로 보아야 한다.
2. **2,835,000원은 개당 단가 차이의 단순 합으로 재현된다.** 수량을 반영한 저장 총액 과다계상은 **5,169,000원**이다.
3. 대상에서 발행된 것으로 연결되는 세금계산서는 **0건**이다. 대상 거래처에는 별도 DRAFT 3건만 있고 ISSUED는 없다.
4. `accounting_db`의 매출/매입 accounting allocation, accounting slip, journal 직접 참조는 모두 **0건**이다.
5. 넓은 키 조건은 29행이고 그중 정상 7행이 있다. 저장 1.10배 모양만 좁혀도 23행으로, 정상 1행과 확인불가 3행이 섞인다. **19행 외를 대상으로 삼을 수 없다.**
6. 원천 주문이 소실된 3행은 확인불가로 별도 표시했다. 저장 모양은 의심스럽지만 원천을 확인하지 못했으므로 19행에 넣지 않았다.

이번 라운드에서는 조사와 보고서 작성만 했으며, 정정 방법 설계·코드·마이그레이션·DB 변경을 하지 않았다.
