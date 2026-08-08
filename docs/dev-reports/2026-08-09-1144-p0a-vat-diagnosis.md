# #1144 P0-A — 회계전표 VAT 표시 진단

> 진단 시각: 2026-08-09 04:14:06~04:15:40 KST
> 작업 브랜치/HEAD: `feat/1144-accounting-slip-spec` / `be55cb8dd`
> 범위: 코드·마이그레이션·배포 변경 없음. PostgreSQL은 모든 쿼리를 `BEGIN TRANSACTION READ ONLY`로 실행했다. 기존 전표 상태 전이·수정·삭제, Docker 재배포, git commit/push를 하지 않았다.

## 0. 결론 — 계획서 수치는 지금도 계산식 수준에서 정확히 재현된다

`330,000 저장 / 363,000 표시`는 **이미 해결된 결함이 아니다. 현재 매출·매입 회계전표 작성 폼 양쪽에 같은 계산식이 남아 있어 재현된다.** 다만 실 DB의 해당 저장 표본 `2026/07/26-1027`은 소프트삭제 상태이고 활성 회계전표는 매출·매입 모두 0건이다.

따라서 판정은 다음처럼 나눠야 한다.

| 판정축 | 결과 |
|---|---|
| 현재 코드에서 330,000 → 363,000 | **재현됨** |
| 계획서가 인용한 실 DB 표본 | **존재함**. 저장 300,000/30,000/330,000, 배분 330,000. 단 `is_deleted=true` |
| 현재 활성 저장 회계전표의 오표시 | **0건 / 0원**. 활성 매출·매입 회계전표가 모두 0건 |
| 작성 폼의 현재 발화 가능성 | **있음**. 저장 가능 원천 2건 중 양수 금액 1건, 100% 배분 시 173,910원 과대표시 |
| 이미 고친 커밋/PR | **없음**. 최초 폼 식은 `57b3cc315`(#269), 공통 VAT 함수로 바꾼 `b9597c423`(#893)도 입력 의미를 바꾸지 않아 결함 존속 |

## 1. 재현 결과 — 실행 원문

### 1.1 현재 프런트 식 직접 실행

현재 폼의 식은 `allocatedAmount → totalSupply`, `VAT=totalSupply×10%`, `합계=totalSupply+VAT`다.

```powershell
node -e "const allocatedAmount=330000; const totalSupply=allocatedAmount; const totalVat=Math.trunc(totalSupply*0.1); console.log(JSON.stringify({allocatedAmount,totalSupply,totalVat,displayedTotal:totalSupply+totalVat}))"
```

원문 출력:

```text
{"allocatedAmount":330000,"totalSupply":330000,"totalVat":33000,"displayedTotal":363000}
```

직접 근거:

- 매출 폼: `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx:41-47,143-148`
- 매입 폼: `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx:41-47,143-148`
- `vatFromSupply`: `clients/desktop/src/renderer/utils/vatRounding.ts:8-11`

화면 라벨도 계산값을 각각 `공급가`, `부가세`, `합계`라고 명시한다. 즉 단순 변수명 문제만이 아니라 사용자가 보는 라벨과 숫자가 함께 어긋난다.

### 1.2 서버 계약과 같은 VAT 포함 분리 실행

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -X -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT 330000::numeric AS vat_inclusive_input, trunc(330000::numeric * 100 / 110) AS stored_supply, 330000::numeric - trunc(330000::numeric * 100 / 110) AS stored_vat, 330000::numeric AS stored_total; COMMIT;"
```

원문 출력:

```text
BEGIN
 vat_inclusive_input | stored_supply | stored_vat | stored_total
---------------------+---------------+------------+-------------
              330000 |        300000 |      30000 |       330000
(1 row)
COMMIT
```

이는 `VatCalculator.java:7-16,24-31`의 “출고/입고전표 단가는 VAT-inclusive”, `supply=절사(qty×unitPrice÷1.1)`, `vat=lineTotal-supply` 계약과 같다.

### 1.3 실 DB 역사 표본

측정 시각 `2026-08-09 04:14:20.395043 KST`:

실행 SQL 원문(바깥 `psql` 명령은 1.2와 같은 형식):

```sql
BEGIN TRANSACTION READ ONLY;
SELECT clock_timestamp() AT TIME ZONE 'Asia/Seoul' AS measured_at_kst;
SELECT 'sales' AS kind,
       s.slip_no, s.tax_type, s.status,
       s.total_supply_amount, s.total_vat_amount, s.total_amount,
       sum(a.allocated_amount) AS allocated_amount,
       s.is_deleted, s.created_at
FROM sales_accounting_slips s
LEFT JOIN sales_accounting_slip_lines l ON l.slip_id = s.id
LEFT JOIN sales_accounting_slip_allocations a ON a.sales_slip_line_id = l.id
GROUP BY s.id
ORDER BY s.slip_no;
COMMIT;
```

```text
 kind  |     slip_no     | tax_type | status | total_supply_amount | total_vat_amount | total_amount | allocated_amount | is_deleted
-------+-----------------+----------+--------+---------------------+------------------+--------------+------------------+-----------
 sales | 2026/07/26-1027 | TAXABLE  | POSTED |           300000.00 |         30000.00 |    330000.00 |        330000.00 | t
```

저장값은 계약과 일치한다. 잘못된 것은 이 VAT 포함 배분액 330,000원을 다시 공급가액으로 취급한 작성 폼 미리보기다.

### 1.4 배포 중 API의 활성 회계전표 조회

로컬 테스트 `ACCOUNTANT` 계정으로 로그인한 뒤 GET만 실행했다. 비밀번호와 JWT는 기록하지 않았다.

```text
login: success / role: ACCOUNTANT
GET /admin/sales-slips?from=2026-07-26&to=2026-07-26: success / rows=0
GET /admin/purchase-slips?from=2026-01-01&to=2026-12-31: success / rows=0
```

따라서 삭제된 역사 표본이 일반 목록에 보이지 않는 것은 정상이며, 이를 근거로 결함이 해결됐다고 판정하면 안 된다.

## 2. 어느 값이 맞는가

### 2.1 확정된 계약

개발책임자 명세는 “회계전표는 총금액과 총금액의 공급가액, 부가세액 등이 표시”되는 것이다. 코드·저장값도 같은 방향으로 일치한다.

| 항목 | 확정 의미 | 근거 |
|---|---|---|
| 원천 `lineTotal` / 폼 `allocatedAmount` | VAT 포함 합계 | `SlipSummary.java:26-34,37-48` — 저장된 공급가액+부가세 합계. `SlipDisplayAmount.java:7-12,24-37` — 표시용 금액은 VAT 포함 |
| 요청 `qty × unitPrice` | 회계전표 계산 입력인 VAT 포함 합계 | `VatCalculator.java:7-16,24-31`; 생성 호출 `SalesAccountingSlipCreateAttemptService.java:88-96`, `PurchaseAccountingSlipCreateAttemptService.java:87-93` |
| `total_supply_amount` | VAT 포함 총액을 분리한 공급가액 합계 | `SalesAccountingSlip.java:96-100`, `PurchaseAccountingSlip.java:95-99` |
| `total_vat_amount` | 분리된 부가세액 합계 | 같은 엔티티 줄 및 `VatCalculator.java:27-29` |
| `total_amount` | 공급가액+부가세액인 총금액 | `SalesAccountingSlip.java:96-100`, `PurchaseAccountingSlip.java:95-99` |
| DB 컬럼 3개 | 위 세 금액의 영속 컬럼 | `V18__add_sales_accounting_slips.sql:13-15,47-49`; `V19__add_purchase_accounting_slips.sql:13-15,47-49` |
| API 응답 3개 | 저장된 세 금액을 그대로 반환 | `SalesAccountingSlipResponse.java:18-20,55-57`; `PurchaseAccountingSlipResponse.java:18-20,55-57` |

따라서 330,000원 VAT 포함 과세 금액의 정답은 다음이다.

```text
공급가액 300,000원
부가세액  30,000원
총금액   330,000원
```

`330,000 / 33,000 / 363,000`은 `330,000`을 공급가액으로 해석할 때만 성립하지만, 원천 DTO·서버 계산기·실 저장값이 모두 이를 VAT 포함 총액으로 규정한다.

### 2.2 계약의 약한 지점

마이그레이션은 컬럼명만 있고 별도 `COMMENT ON COLUMN`은 없다. 생성 요청 DTO의 `unitPrice`와 `allocatedAmount`에도 Javadoc이 없다(`CreateSalesAccountingSlipRequest.java:22-36`, Purchase 동형). 의미는 `VatCalculator`와 원천 DTO Javadoc에서 명확하지만, 경계 DTO 자체만 읽으면 공급가/총액을 혼동할 여지가 있다. 이번 결함도 그 경계에서 발생했다.

## 3. 영향 범위 — 건수와 금액

### 3.1 저장된 회계전표

측정 시각 `2026-08-09 04:14:20 KST`, `accounting_db`:

| 범위 | 건수 | 저장 총금액 | 현재 폼 식으로 환산한 합계 차이 |
|---|---:|---:|---:|
| 활성 매출 회계전표 | 0 | 0원 | 0원 |
| 활성 매입 회계전표 | 0 | 0원 | 0원 |
| 소프트삭제 역사 매출 표본 | 1 | 330,000원 | 33,000원 |
| 소프트삭제 역사 매입 표본 | 0 | 0원 | 0원 |

기존 저장값 300,000/30,000/330,000은 맞으므로 저장 데이터의 금액 오염은 확인되지 않았다.

### 3.2 작성 폼에 노출되는 실 DB 원천

측정 시각 `2026-08-09 04:15:26~04:15:40 KST`, `slip_db`. 폼과 같은 `/slips/by-period`는 상태 필터 없이 활성 OUTBOUND/INBOUND를 전부 반환한다(`SlipRepository.java:229-241`). 아래 차이는 각 원천전표를 **각각 100% 배분**했을 때 현재 폼이 총금액에 다시 10%를 더하는 금액이다. 실제 사용자가 일부 배분하면 선택 비율에 따라 달라진다.

| 범위 | 원천전표 | VAT 포함 원천금액 | 100% 배분 시 합계 과대표시 |
|---|---:|---:|---:|
| OUTBOUND 전체 표시 후보 | 398건 | 924,461,814원 | 92,446,175원 |
| INBOUND 전체 표시 후보 | 61건 | 336,063,635원 | 33,606,363원 |
| 합계 | **459건** | **1,260,525,449원** | **126,052,538원** |
| 서버 저장 조건 충족(`CONFIRMED`+거래처 완비) | **2건** | **1,739,100원** | **173,910원** |
| 그중 양수 금액 | **1건** (`2026/08/03-6`) | **1,739,100원** | **173,910원** |
| 기본 날짜 2026-08-09 화면 | 14건(모두 OUTBOUND) | 437,635원 | 43,763원 |
| 기본 날짜 중 저장 조건 충족 | 0건 | 0원 | 0원 |

여기서 126,052,538원은 회계장부 오염액이 아니라 **상태 필터 없는 폼이 잠재적으로 보여 줄 수 있는 최대 화면 차이 기준선**이다. 현재 실제 저장까지 갈 수 있는 확정 위험액은 173,910원이다. 서버는 `CONFIRMED`만 허용한다(`SalesAccountingSlipCreateAttemptService.java:124` 이하, `PurchaseAccountingSlipCreateAttemptService.java:119-125`).

배포 API의 읽기 결과도 DB 집계와 일치했다.

```text
OUTBOUND 2000-01-01..2100-12-31: slips=398, lines=769, total=924461814, saveEligibleConfirmed=2
INBOUND  2000-01-01..2100-12-31: slips=61,  lines=137, total=336063635, saveEligibleConfirmed=0
OUTBOUND 2026-08-09: slips=14, lines=14, total=437635, saveEligibleConfirmed=0
INBOUND  2026-08-09: slips=0,  lines=0,  total=0,      saveEligibleConfirmed=0
```

영향액 집계 SQL의 핵심 원문:

```sql
BEGIN TRANSACTION READ ONLY;
WITH per_slip AS (
  SELECT s.slip_type, s.status, s.slip_date, s.slip_no,
         (s.partner_id IS NOT NULL
          AND nullif(btrim(s.partner_code), '') IS NOT NULL
          AND nullif(btrim(s.partner_name), '') IS NOT NULL) AS partner_complete,
         sum(CASE
           WHEN l.supply_amount IS NOT NULL
             THEN l.supply_amount + coalesce(l.vat_amount, 0)
           WHEN l.line_total IS NULL
             THEN coalesce(l.unit_price_with_vat * l.quantity, 0)
           ELSE l.line_total + coalesce(l.vat_amount, 0)
         END) AS source_total
  FROM slips s
  JOIN slip_lines l ON l.slip_id = s.id
  WHERE s.is_deleted = false
    AND l.is_deleted = false
    AND s.slip_type IN ('OUTBOUND', 'INBOUND')
  GROUP BY s.id
)
SELECT slip_type,
       count(*) AS slip_count,
       sum(source_total) AS source_total,
       sum(trunc(source_total * 0.1)) AS full_allocation_form_overstatement
FROM per_slip
GROUP BY slip_type
ORDER BY slip_type;
COMMIT;
```

### 3.3 이 값을 소비하는 화면·보고서 전수

| 소비처 | 소비 값/경로 | 일관성 판정 |
|---|---|---|
| 매출 회계전표 작성 | `allocatedAmount`를 공급가로 라벨링하고 10% 가산 | **불일치 — 본 결함** |
| 매입 회계전표 작성 | 매출과 동형 | **불일치 — 본 결함** |
| 매출/매입 mock 저장 응답 | `qty×unitPrice`를 공급가로 두고 10% 가산 (`salesAccountingSlipApi.ts:139-173`, purchase `:127-161`) | **불일치 — 같은 결함** |
| 매출 회계전표 목록 | 저장 `totalSupplyAmount`, `totalAmount` 표시 (`SalesAccountingSlipPage.tsx:72-85`) | 저장값과 일치. 단 VAT 열 없음 |
| 매입 회계전표 목록 | 저장 `totalSupplyAmount`, `totalAmount` 표시 (`PurchaseAccountingSlipPage.tsx:72-85`) | 저장값과 일치. 단 VAT 열 없음 |
| 세금계산서 묶음 후보/발행 | 저장 전표의 공급가·VAT·총액을 복사/합산 (`TaxInvoiceBatchCandidateResponse.java:32-56`; `TaxInvoiceBatchFromSalesSlipsService.java:91-120`) | 일치 |
| 수신 세금계산서 | 매입전표 저장 3금액을 합산 (`TaxInvoiceInboundService.java:83-96,112-119`) | 일치 |
| 세금계산서 작성·상세·목록 | 단가×수량을 공급가로 명시하고 VAT 10% 가산 (`TaxInvoiceFormPage.tsx:9-10,319-325,634-640`; `TaxInvoice.java:118-128`) | 자체 계약과 일치. 본 결함과 입력 의미가 다름 |
| 일마감 | POSTED 회계전표의 저장 3금액을 각각 합산 (`DailyClosingService.java:335-356`), 화면도 3값 표시 (`DailyClosingPage.tsx:169-171,1102`) | 일치 |
| 월마감 일별 상세 | POSTED 회계전표의 저장 3금액을 각각 합산 (`MonthEndCloseService.java:261-329`), 화면 3값 표시 (`MonthEndClosingPage.tsx:622-624`) | 일치 |
| 총계정원장 | 회계전표 3금액이 아니라 journal line 차변/대변 소비 (`GeneralLedgerPage.tsx:8,210-227`) | 본 값 직접 소비 안 함 |
| 거래처 원장/채권채무 | 원천 판매전표 또는 journal 집계이며 회계전표 3금액 직접 소비 아님 | 본 값 직접 소비 안 함 |

## 4. 인접 계열 전수 표

검색식: `vatFromSupply`, `supplyFromVatInclusive`, `splitVatInclusive`, `* 0.1`, `/ 11`, `/ 1.1`의 desktop·service main 코드 전수 검색 후 입력 라벨/계약을 대조했다.

| 계열 | 경로 | 입력 의미 | 결과 |
|---|---|---|---|
| 매출 회계전표 폼 | `SalesAccountingSlipFormPage.tsx:46-48` | VAT 포함 배분액 | **VAT 재가산 결함** |
| 매입 회계전표 폼 | `PurchaseAccountingSlipFormPage.tsx:46-48` | VAT 포함 배분액 | **VAT 재가산 결함** |
| 매출 mock draft | `salesAccountingSlipApi.ts:139-173` | 실 서버에서는 VAT 포함인 `qty×unitPrice` | **서버와 반대** |
| 매입 mock draft | `purchaseAccountingSlipApi.ts:127-161` | 동형 | **서버와 반대** |
| 원천전표 작성 | `SlipFormPage.tsx:169-182` | VAT 포함 단가×수량 | `/11`로 공급가 분리 | 일치 |
| 공통 회계 서버 | `VatCalculator.java:7-31` | VAT 포함 단가×수량 | `splitVatInclusive` | 일치 |
| 세금계산서 작성 | `TaxInvoiceFormPage.tsx:319-325,647-648` | 라벨상 공급가 단가×수량 | VAT 10% 가산 | 일치 |
| 세금계산서 도메인 | `TaxInvoice.java:118-128` | 공급가액 | VAT 10% 가산 | 일치 |
| 일마감/월마감 | 위 3.3 | 저장된 3금액 | 재계산 없이 각각 합산 | 일치 |
| 총계정원장 | journal 차변/대변 | 분개금액 | VAT 재가산 없음 | 해당 없음 |

`SlipDetailPage.tsx:470-519`의 legacy fallback은 별도의 과거 데이터 도메인 판정과 ±1원 정책을 갖고 있어 이번 330,000 재가산과 같은 단순 패턴으로 확정하지 않았다. 저장된 `supplyAmount/vatAmount`가 있으면 이를 우선하므로 이번 활성 권위 금액 경로와는 다르다.

## 5. 고치는 방향 제안 — 구현하지 않음

### 5.1 권고

1. **저장은 고치지 않는다.** 서버 분리식과 DB 저장값은 명세와 일치한다.
2. **매출·매입 작성 폼 표시를 고친다.** `allocatedAmount` 합을 `totalAmount`로 보고 `supplyFromVatInclusive`와 나머지로 300,000/30,000/330,000을 표시한다. 변수명도 `totalSupply`가 아니라 `vatInclusiveTotal` 등 계약을 드러내게 한다.
3. **매출·매입 mock draft도 함께 고친다.** 현재 mock은 잘못된 폼 식을 저장 응답으로 재현하여 실 BE와 반대다.
4. **목록에 VAT 열을 추가할지 별도 결정한다.** 현재 목록은 공급가·합계만 보여 개발책임자 명세의 “부가세액 등이 표시”를 완전히 충족하지 못한다. 상세 화면이 없는 현재 구조에서는 목록 VAT 열이 가장 작은 보완이다.
5. 경계 DTO의 `unitPrice`, `allocatedAmount`에 “VAT 포함” Javadoc/주석을 보강해 같은 혼동을 막는다.

### 5.2 기존 데이터 소급 변경

**필요 없음.** 확인된 유일 역사 표본의 저장값은 이미 정확하고, 활성 회계전표는 0건이다. 330,000을 363,000으로 바꾸는 migration/backfill은 오히려 정확한 데이터를 훼손한다.

향후 별도 조사에서 저장 3금액의 항등식 `supply + vat = total` 또는 VAT 포함 분리 계약을 위반한 행이 발견되면 그때의 소급 보정은 되돌리기 어려운 금액 변경이므로 개발책임자 판단 사항이다. 이번 측정에서는 그런 대상이 확인되지 않았다.

### 5.3 RED-A / RED-B 초안

**RED-A — 실 모드 작성 폼 계약**

```text
Given TAXABLE 매출/매입 원천의 VAT 포함 lineTotal=330,000을 100% 배분
When 작성 폼이 요약을 렌더하고 제출 body를 만든다
Then 공급가액=300,000, 부가세액=30,000, 총금액=330,000을 표시한다
And qty×unitPrice 및 allocatedAmount의 VAT 포함 총액은 330,000으로 유지한다
And 저장 응답의 세 금액과 화면 세 금액이 일치한다
```

경계값은 1원·10원·11원·100원 및 소수 수량×단가를 서버 `VatAmountCalculator.splitVatInclusive`와 같은 fixture로 고정한다.

**RED-B — mock/실 BE 동등성**

```text
Given 같은 TAXABLE create request(qty×unitPrice=330,000)
When mock buildMockDraft와 실 BE VatCalculator 계약을 각각 적용한다
Then 양쪽 모두 supply=300,000, vat=30,000, total=330,000이다
And sales/purchase 두 계열 결과가 같다
```

추가 음성 단정:

```text
ZERO_RATED/EXEMPT는 supply=330,000, vat=0, total=330,000이며 1.1 분리를 하지 않는다.
```

## 6. 개발책임자 판단이 필요한 질문

### Q1. 회계전표 목록에서 부가세액을 바로 보이게 할 것인가

- **(a) 공급가액·부가세액·총금액 3열을 목록에 모두 표시 — 권고.** 현재 상세 화면이 없으므로 명세를 직접 충족한다. 대가: 데스크톱 목록 폭 증가와 모바일 우선순위 조정 필요.
- (b) P0에서는 작성 폼만 정정하고 VAT 열은 후속 상세 화면에서 제공. 대가: 저장 전 오표시는 즉시 제거하지만 목록에서는 계속 부가세액을 확인할 수 없다.

### Q2. 원천 후보 상태 필터를 P0-A에 같이 다룰 것인가

- **(a) P0-A는 VAT 표시·mock 계약에만 한정 — 권고.** 금액 의미 수정과 후보 정책을 분리한다. 대가: 저장 불가 상태도 폼에 계속 보이며 현재 459건이 노출된다.
- (b) `CONFIRMED`+거래처 완비 후보만 조회/표시. 대가: 노이즈와 잠재 오표시 범위는 2건으로 줄지만, 기존 “상태 필터 없음” 동작과 회계 원천 선택 정책을 함께 바꾸므로 별도 계약·회귀가 필요하다.

## 7. 신규 파일

- `docs/dev-reports/2026-08-09-1144-p0a-vat-diagnosis.md`

그 밖의 파일은 생성·수정하지 않았다.
