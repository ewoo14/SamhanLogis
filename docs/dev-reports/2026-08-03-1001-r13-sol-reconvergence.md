# PR #1061 머지 전 재수렴 적대검증 R13

- 대상: `feat/1001-ledger-spec-rest`
- 검증 HEAD: `61e2f801f3`
- 검증 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 실행 제약: 소스·DB 읽기 중심, accounting-service 실행 결과는 판정 근거에서 제외, Docker/재배포/코드 수정/commit/push 없음
- 시작 상태: `git pull` → `Already up to date`

## 진행 기록

각 각도 완료 즉시 이 문서에 결과를 추가한다.

## 각도 1 — 정상 경로 과차단·누락

### 결함 1

① 한 줄 요약: 무필터 집계에 나타나는 `partner_code` 공란 판매전표 21건은 모두 `-` 행으로 렌더되고, 사용자가 그 행을 클릭하면 실제 판매 21건·62라인·197,476,400원이 아닌 빈 상세·빈 인쇄가 열린다.

② 실 사용자 재현 절차:

1. PR #1061 화면 `/accounting/partner-ledger`에서 시작일 `2026-01-01`, 종료일 `2026-03-31`, 거래처 필터 공란으로 조회한다.
2. 집계 결과에서 거래처 식별자가 `-`인 판매 행을 클릭한다. 화면 구현은 `handleSelectPartner(row.partnerCode)`로 `-`를 선택값에 넣는다.
3. 상세 요청은 `GET /accounting/journals/partner-ledger?partnerCode=-&from=2026-01-01&to=2026-03-31`가 된다.
4. `PartnerLedgerReadService`는 master에서 `-`를 찾지 못해 판매전표 client에 `partnerCode=-`, `partnerId=null`을 전달한다. 실제 전표의 `partner_code`는 공란이므로 판매전표가 0건이 된다. 같은 기간 확정 입금보고서도 0건이어서 상세는 빈 원장으로 열린다.
5. 이 상태에서 인쇄를 누르면 동일 query 축을 쓰므로 빈 인쇄 원장이 열린다.

③ 관측 원문:

```text
 slips | blank_code_slips | blank_id_slips | active_lines |    amount    |  min_date  |  max_date
-------+------------------+----------------+--------------+--------------+------------+------------
    21 |               21 |              0 |           62 | 197476400.00 | 2026-01-26 | 2026-03-10

 month_start | slips | active_lines |    amount
-------------+-------+--------------+--------------
 2026-01-01  |     3 |            7 |   9934100.00
 2026-02-01  |    16 |           48 | 141320300.00
 2026-03-01  |     2 |            7 |  46222000.00

 receipts | amount
----------+--------
        0 |      0
```

소스 연결 원문:

```text
SalesAggregateService.applyUnfilteredLedgerSalesTotals:
code == null -> groupKey = "slip:" + slipNo, legacy.partnerCode = null
응답 partnerCode = "-"

PartnerLedgerPage:
onClick={() => handleSelectPartner(row.partnerCode)}

PartnerLedgerReadService:
selected == null -> salesPartnerCode = partnerCode
salesClient.find(from, to, salesPartnerCode, partnerId)
```

④ 영향 건수: 활성 원장 대상 OUTBOUND 전표 **21건**, 활성 품목 **62라인**, 합계 **197,476,400원**. 기간별로 2026-01 3건, 2026-02 16건, 2026-03 2건이다.

실행 판정 주의: 실행 중 `samhan-accounting-service`는 #1057 빌드이므로 화면/API 응답을 판정 근거로 사용하지 않았다. 위 재현은 PR HEAD 소스 분기와 현재 실 DB read-only 실측을 결합한 사용자 도달 경로다. Docker 재배포는 하지 않았다.

## 각도 2 — 집계 ↔ 상세 ↔ 인쇄 금액 일치

### 결함 2

① 한 줄 요약: `2026-01-01~2026-03-31` 무필터 조회에서 고아 `SLIP` 분개와 실제 판매전표가 겹치는 거래처 7곳은 집계가 고아 분개 금액을, 상세·인쇄가 실제 전표 금액을 사용해 7곳 모두 어긋난다.

② 실 사용자 재현 절차:

1. 원장 화면에서 `2026-01-01~2026-03-31`, 거래처 필터 공란으로 조회한다.
2. 예를 들어 집계에서 사업자번호 `334-26-10558`인 강릉HVAC솔루션 행을 찾는다. 이 행의 내부 API 식별자는 `P-2026-0018`이다.
3. 집계 매출은 고아 `SLIP` 분개의 401 계정 합계인 `7,000,000원`이다. 무필터 join은 실제 전표의 `partner_code`가 공란이라 이 값을 실제 전표 합계로 교체하지 못한다.
4. 같은 행을 클릭하면 상세는 `partnerCode=P-2026-0018`을 master UUID로 해소한 뒤 실제 판매전표를 `partnerId`로 조회하므로 `24,646,600원`을 표시한다.
5. 인쇄 버튼은 상세와 동일한 `getLedgerData(partnerCode, from, to)`를 다시 호출하므로 상세와 같은 `24,646,600원`을 표시한다. 따라서 집계 `7,000,000원` ↔ 상세·인쇄 `24,646,600원` 불일치가 재현된다.

③ 관측 원문:

```text
overlap_count=7
P-2026-0019 | aggregate=24000000.00 | detail/print=21575400.00 | delta=  2424600.00
P-2026-0026 | aggregate=23000000.00 | detail/print= 5656200.00 | delta= 17343800.00
P-2026-0008 | aggregate=17000000.00 | detail/print=12679700.00 | delta=  4320300.00
P-2026-0009 | aggregate= 4000000.00 | detail/print= 4683800.00 | delta=  -683800.00
P-2026-0007 | aggregate=30000000.00 | detail/print=17209500.00 | delta= 12790500.00
P-2026-0030 | aggregate= 1000000.00 | detail/print= 4048000.00 | delta= -3048000.00
P-2026-0018 | aggregate= 7000000.00 | detail/print=24646600.00 | delta=-17646600.00
sum_abs_delta=58257600.00
```

원인 경계 원문:

```text
SalesAggregateService 무필터:
실제 전표 partnerCode == null -> journal partner UUID 행과 join 불가 -> journal salesTotal 유지

PartnerLedgerReadService 상세/인쇄:
표 행의 P-2026-* code -> master UUID resolve -> salesClient.find(..., partnerId)
```

④ 영향 건수: 거래처 **7곳**, 각 거래처 모두 불일치, 집계와 상세·인쇄 간 절대 차이 합계 **58,257,600원**. 상세와 인쇄끼리는 동일 API를 사용해 서로 일치한다.

## 각도 3 — 화면 사업자번호 ↔ API partnerCode 축

### 결함 3

① 한 줄 요약: 집계 표가 사업자번호를 “거래처코드”로 보여 주지만 필터는 내부 `P-2026-*` 코드만 받아, 사용자가 화면에 보이는 값을 다시 검색하면 방금 보던 거래처가 0건으로 사라진다.

② 실 사용자 재현 절차:

1. R4와 같이 `2026-07-01~2026-07-31`에서 `P-2026-0005`를 조회하면 대구HVAC솔루션 한 행이 표시된다.
2. 집계 표의 “거래처코드” 셀에 보이는 값 `1653510155`를 복사한다.
3. 거래처 코드 필터에 `1653510155`를 붙여 넣고 다시 조회한다.
4. `getSalesAggregate`는 이 값을 그대로 `partnerCode` query param으로 보내고, `SalesAggregateService`는 `PartnerLookupClient.byCode(..., "1653510155")`로만 찾는다. 실제 master code는 `P-2026-0005`라 lookup 실패 후 빈 목록을 반환한다.

③ 관측 원문:

```text
 partner_code |    biz_no    | displayed_code |      name
--------------+--------------+----------------+----------------
 P-2026-0005  | 165-35-10155 | 1653510155     | 대구HVAC솔루션

 p_code_partners | visible_axis_diff
-----------------+------------------
              50 |                50
```

R4 캡처 원문: `docs/qa/1001-ledger-real-qa/05-aggregate-detail-p0005-same-screen.png`에서 입력값은 `P-2026-0005`, 결과 표의 “거래처코드”는 `1653510155`로 서로 다르다.

소스 원문:

```text
PartnerLedgerPage 집계 셀:
{row.bizNo?.replace(/\D/g, '') || '-'}

getSalesAggregate:
params['partnerCode'] = partnerCode.trim()
```

④ 영향 건수: 현재 활성 `P-2026-*` master **50곳 중 50곳**에서 표시값과 API code 축이 다르다. R4 발화 조건에서 즉시 재현되는 현재 결과 행은 **1곳(P-2026-0005, 수금 277,000원)**이다.

### 결함 4

① 한 줄 요약: 집계에서 보이던 사업자번호가 상세와 인쇄에서는 항상 `-`로 사라진다.

② 실 사용자 재현 절차:

1. R4 조건 `P-2026-0005 / 2026-07-01~2026-07-31`로 조회한다.
2. 집계 행에는 사업자번호 숫자 `1653510155`가 보인다.
3. “원장 보기”로 상세를 열면 상단 사업자번호가 `-`다.
4. “인쇄 미리보기”를 열어도 인쇄 양식의 사업자번호가 `-`다.

③ 관측 원문:

```text
partner_db: P-2026-0005 biz_no = 165-35-10155

partnerLedgerApi.getLedgerData:
partnerBusinessNo: '',

PartnerLedgerPage:
<span>{data.partnerBusinessNo || '-'}</span>

PartnerLedgerView:
businessRegNo: source.partnerBusinessNo
... {data.businessRegNo || '-'}
```

R4 실 캡처도 동일하다.

- `docs/qa/1001-ledger-real-qa/05-aggregate-detail-p0005-same-screen.png`: 집계 `1653510155`, 상세 사업자번호 `-`.
- `docs/qa/1001-ledger-real-qa/06-print-p0005-opened.png`: 인쇄 사업자번호 `-`.

④ 영향 건수: 상세·인쇄 데이터 변환은 조건 없이 빈 문자열을 넣으므로 master-backed 원장을 연 모든 사용자 경로 **100%**. 실 캡처로 확인된 현재 거래처는 **1곳(P-2026-0005)**이고, 활성 `P-2026-*` master 모집단은 **50곳**이다.

## 각도 4 — QA·시드 잔재의 업무 금액 유입

### 결함 5

① 한 줄 요약: `slip_db`에 참조 전표가 하나도 없는 `system` 생성 `SLIP` 분개 29건이 거래처 원장의 업무 매출 457,000,000원·채권 502,700,000원으로 그대로 집계된다.

② 실 사용자 재현 절차:

1. 원장 화면에서 `2026-01-01~2026-03-31`, 거래처 필터 공란으로 조회한다.
2. `P-2026-0001~0030` 계열(0011 제외) 29개 master 거래처 행에 매출·채권 금액이 표시된다.
3. 이 금액의 원천은 `accounting_db.journals(source_type='SLIP', created_by='system')` 29건이다.
4. 각 분개의 `source_ref_id` 29개를 현재 `slip_db.slips.id`와 대조하면 대응 전표는 0건이다.
5. `SalesAggregateService`/`JournalLineRepository.aggregatePostedByPartnerAccount`는 참조 전표 존재 여부를 보지 않고 `POSTED|REVERSED` 분개 라인을 집계하므로 이 금액을 업무 매출·채권으로 표시한다.

③ 관측 원문:

```text
 journals | posted | reversed | refs |        min_created         |        max_created         | min_journal_date | max_journal_date
----------+--------+----------+------+----------------------------+----------------------------+------------------+-----------------
       29 |     26 |        3 |   29 | 2026-06-23 12:48:21.023023 | 2026-06-23 12:48:21.242421 | 2026-01-01       | 2026-03-29

 matching_slips
----------------
              0

 journals | partners | lines |  sales_401   |    ar_110
----------+----------+-------+--------------+--------------
       29 |       29 |    87 | 457000000.00 | 502700000.00

 month_start | journals | partners |  sales_401   |    ar_110
-------------+----------+----------+--------------+--------------
 2026-01-01  |       10 |       10 | 165000000.00 | 181500000.00
 2026-02-01  |        9 |        9 | 147000000.00 | 161700000.00
 2026-03-01  |       10 |       10 | 145000000.00 | 159500000.00
```

④ 영향 건수: 분개 **29건**, 분개 라인 **87개**, 거래처 **29곳**, 업무 매출 오염 **457,000,000원**, 채권 오염 **502,700,000원**.

### 나열된 다른 QA 잔재의 현재 집계 여부

```text
active QA-GATE-* slips                              = 0
active 2026/08/03-QA-1013-* slips                  = 0
2026-08-03 OUTBOUND + CONFIRMED/DELIVERED/COMPLETED = 0
```

`2026/08/03-1~-4`는 현재 DB에 존재하지만 원장 대상 OUTBOUND 상태는 `DRAFT` 또는 `SENT`이고, `COMPLETED`인 동번호 전표는 INBOUND다. 따라서 이 항목들은 현재 원장 판매 집계에 들어오지 않는다.

### 증거 무결성 차이

제시된 문구 `accounting_db source_type='SLIP' 분개 29건 (2026-06-19 'system' 생성)` 중 건수 29와 `created_by='system'`은 재현됐으나 생성일은 재현되지 않았다.

```text
실 DB created_at 범위:
2026-06-23 12:48:21.023023 ~ 2026-06-23 12:48:21.242421

created_at::date / created_by / status:
2026-06-23 | system | POSTED   | 26
2026-06-23 | system | REVERSED |  3
```

현재 DB 기준 실제 생성일은 **2026-06-23**이며 인용의 **2026-06-19**와 다르다.

## R4 인용 재확인

### 2026-07 전체 journals 상태별 수치

인용과 일치한다.

```text
 source_type  |  status  | count
--------------+----------+------
 CASH_RECEIPT | POSTED   |    20
 CASH_RECEIPT | REVERSED |    17
 MANUAL       | DRAFT    |     4
 MANUAL       | POSTED   |     4
 MANUAL       | REVERSED |     3
 SLIP         | POSTED   |     2
 SLIP         | REVERSED |     2
```

### P-2026-0005 / 2026-07-01~07-31

인용의 발화 조건과 금액은 재현됐다.

```text
전체 상태 포함, partner line 기준:
journal_count = 38
line_count    = 73

업무 집계 상태 POSTED|REVERSED, CASH_RECEIPT 제외:
journal_count = 35
line_count    = 70
noncash_sales = 0
noncash_ar    = 0

확정 입금보고서:
receipts = 3
payment  = 277000.00

원장 대상 판매전표:
sales_slips = 0
sales       = 0
```

확정 입금보고서의 화면 문서번호도 인용과 같다.

```text
2026/07/04-28 | 120000.00
2026/07/04-31 |  80000.00
2026/07/07-1  |  77000.00
합계          | 277000.00
기말          | -277000.00
```

따라서 R4의 집계 `매출 — · 수금 277,000 · 채권 -277,000`, 상세 3건·277,000원, 인쇄 동일 3라인·기말 -277,000원은 현재 DB와 캡처에서 모두 재현된다. 상세 `245,612,215원`은 이 조건에서 재현되지 않는다.

### R4 증거에서 추가로 확인된 사실

R4 수치 인용은 맞지만 동일 캡처가 결함 3·4도 직접 보여 준다.

- 집계 “거래처코드” 셀 `1653510155` ↔ 실제 API code 입력 `P-2026-0005`.
- 상세 사업자번호 `-`.
- 인쇄 사업자번호 `-`.

## 최종 판정

**실 사용자 경로로 재현 가능한 결함이 있다: 5건.**

1. `partner_code` 공란 판매전표 21건의 `-` 집계 행에서 상세·인쇄가 비어 실제 197,476,400원이 도달 불가.
2. 같은 거래처에 고아 분개와 실제 판매전표가 겹치는 7곳에서 집계 ↔ 상세·인쇄 금액 불일치(절대 차이 합 58,257,600원).
3. 화면의 사업자번호를 거래처코드 필터에 재사용하면 0건이 되는 표시/API 축 불일치.
4. 상세·인쇄에서 사업자번호가 항상 `-`로 사라짐.
5. 참조 전표 없는 system `SLIP` 분개 29건이 업무 매출 457,000,000원·채권 502,700,000원으로 집계됨.

별도 증거 무결성 차이: 인용의 system `SLIP` 분개 생성일 `2026-06-19`는 현재 DB에서 재현되지 않으며 실제 `created_at`은 `2026-06-23`이다.

## 이 라운드가 보지 않은 것

- 실행 중 accounting-service가 #1057 빌드이므로 PR #1061의 live API/GUI를 호출해 판정하지 않았다. PR HEAD 소스와 현재 DB read-only 결과, 이미 커밋된 R4 캡처만 사용했다.
- Docker 재배포·build·up·restart, DB mutation, 코드 수정, 전체 Playwright/Gradle 스위트는 수행하지 않았다.
- 거래처 원장 밖의 다른 회계 화면과 2026년 외 기간은 조사하지 않았다.
