# PR #919 CODEX SOL 5.6 적대검증 2차

- 일시: 2026-07-24
- 대상: 축 A LIKE `%`·`_` escape
- 라이브: `http://localhost:8080`, real renderer `http://127.0.0.1:5441`
- 판정 질문: 실 사용자 경로로 재현 가능한 결함이 있는가?

## 1. 도달가능 결함 목록

**0건.**

실행한 사용자 화면과 실제 엔드포인트에서 `%`, `_`, `\`, `\\`, `\%`, 한글+wildcard 및 정상 코드/전표번호를 측정했으나, HTTP 500·전건 오반환·정상 검색 소실·화면/total 불일치를 재현하지 못했다.

## 2. 필수 미측정분 실측

### 2.1 `partnerCode` LIKE 계열 4화면

| 화면 / 실제 endpoint | 기준선 | `%` | `_` | 정상 검색 |
|---|---:|---:|---:|---:|
| 매출전표 `/admin/sales-slips` | 2,512 | 0 | 0 | `1212532234` = 3 |
| 매입전표 `/admin/purchase-slips` | 35 | 0 | 0 | `5621102555` = 14 |
| 수신 세금계산서 `/admin/tax-invoices/inbound` | 기존 0, throwaway 3 | 리터럴 1 | 리터럴 1 | `QA919` = 3 |
| 세금계산서 일괄발행 `/admin/tax-invoices/batch-from-sales-slips/candidates` | 733그룹 | 0 | 0 | `010-4872-2432` = 1그룹·2전표 |

API 실행 원문:

```text
sales input=<none> status=200 count=2512
sales input='%' status=200 count=0
sales input='_' status=200 count=0
sales input='1212532234' status=200 count=3 codes=1212532234
sales input='121253' status=200 count=3 codes=1212532234

purchase input=<none> status=200 count=35
purchase input='%' status=200 count=0
purchase input='_' status=200 count=0
purchase input='5621102555' status=200 count=14 codes=5621102555
purchase input='562110' status=200 count=14 codes=5621102555

inbound input='%' HTTP 200 count=1 codes=QA919PERCENT%CODE
inbound input='_' HTTP 200 count=1 codes=QA919UNDER_CODE
inbound input='\' HTTP 200 count=1 codes=QA919BACK\CODE
inbound input='\\' HTTP 200 count=0 codes=
inbound input='\%' HTTP 200 count=0 codes=
inbound input='QA919' HTTP 200 count=3 codes=QA919UNDER_CODE,QA919PERCENT%CODE,QA919BACK\CODE

batch input=<none> status=200 count=733
batch input='%' status=200 count=0
batch input='_' status=200 count=0
batch input='010-4872-2432' status=200 count=1 codes=010-4872-2432
batch input='010-4872' status=200 count=1 codes=010-4872-2432
```

real renderer 실행 원문:

```text
sales input="%" status=200 화면=매출전표가 없습니다.
sales input="_" status=200 화면=매출전표가 없습니다.
sales input="1212532234" status=200 데이터행=3

purchase input="%" status=200 화면=매입전표가 없습니다.
purchase input="_" status=200 화면=매입전표가 없습니다.
purchase input="5621102555" status=200 데이터행=14

inbound input="%" status=200 화면데이터=QA919-PERCENT 1행
inbound input="_" status=200 화면데이터=QA919-UNDER 1행
inbound input="QA919" status=200 화면데이터=3행

batch input="%" status=200 화면=발행 가능한 매출전표가 없습니다.
batch input="_" status=200 화면=발행 가능한 매출전표가 없습니다.
batch input="010-4872-2432" status=200 화면데이터=2전표
```

스크린샷:

- 매출: `01-sales-percent.png`, `01-sales-underscore.png`, `01-sales-normal.png`
- 매입: `04-purchase-percent.png`, `04-purchase-underscore.png`, `04-purchase-normal.png`
- 수신: `07-inbound-percent.png`, `07-inbound-underscore.png`, `07-inbound-normal.png`
- 일괄발행: `10-batch-percent.png`, `10-batch-underscore.png`, `10-batch-normal.png`

### 2.2 입금보고서 `slipNo`

API·화면·DB 수치가 일치했다.

```text
cash-receipts input=<none> HTTP 200 total=367 pageCount=367
cash-receipts input='2026/07' HTTP 200 total=2 pageCount=2
  slipNos=2026/07/03-2,2026/07/03-1
cash-receipts input='2026/07/03' HTTP 200 total=2 pageCount=2
cash-receipts input='%' HTTP 200 total=0 pageCount=0
cash-receipts input='_' HTTP 200 total=0 pageCount=0
cash-receipts input='\' HTTP 200 total=0 pageCount=0
cash-receipts input='\\' HTTP 200 total=0 pageCount=0
cash-receipts input='\%' HTTP 200 total=0 pageCount=0
cash-receipts input='서울%' HTTP 200 total=0 pageCount=0
```

DB 대조 원문:

```text
 active_total | partial_2026_07 | partial_2026_07_03 | literal_percent | literal_underscore | literal_backslash
--------------+-----------------+--------------------+-----------------+--------------------+-------------------
          367 |               2 |                  2 |               0 |                  0 |                 0
```

화면은 `2026/07`에서 두 전표와 `총 2건`, `%`·`_`에서 `총 0건`을 표시했다.

스크린샷: `13-cash-receipt-partial.png`, `13-cash-receipt-percent.png`, `13-cash-receipt-underscore.png`

### 2.3 `ledger-partners`

기존 세금계산서에는 검색 가능한 `partnerCode`가 없어 throwaway 3건을 만들었다.

```text
QA919PERCENT%CODE
QA919UNDER_CODE
QA919BACK\CODE
```

API 실행 원문:

```text
ledger-partners input='%' HTTP 200 count=1 codes=QA919PERCENT%CODE
ledger-partners input='_' HTTP 200 count=1 codes=QA919UNDER_CODE
ledger-partners input='\' HTTP 200 count=1 codes=QA919BACK\CODE
ledger-partners input='\\' HTTP 200 count=0 codes=
ledger-partners input='\%' HTTP 200 count=0 codes=
ledger-partners input='QA919' HTTP 200 count=3 codes=QA919UNDER_CODE,QA919BACK\CODE,QA919PERCENT%CODE
```

real renderer 실행 원문:

```text
input="%" status=200 optionCount=1 option=QA919PERCENT%CODE
input="_" status=200 optionCount=1 option=QA919UNDER_CODE
input="QA919" status=200 optionCount=3
```

스크린샷:

- 전체 화면: `16-ledger-partners-percent.png`, `16-ledger-partners-underscore.png`, `16-ledger-partners-normal.png`
- 실제 옵션: `16-ledger-partners-percent-options.png`, `16-ledger-partners-underscore-options.png`, `16-ledger-partners-normal-options.png`

## 3. 라이브QA 로그

1. `POST /auth/login`을 실제 실행해 HTTP 200·`MASTER`를 확인했다. 토큰 원문은 보고서에서 삭제했다.
2. API에서 매출·매입·수신 세금계산서·일괄발행·입금보고서·거래처원장 검색에 `%`, `_`, `\`, `\\`, `\%`, `서울%`, 정상 코드/부분 전표번호를 전송했다.
3. real renderer의 HashRouter 화면으로 매출전표·매입전표·수신 세금계산서·세금계산서 발행 묶음·입금보고서·결재 작성의 거래처원장 picker를 조작했다.
4. 각 조작에서 실제 대상 응답 HTTP 상태, 화면 데이터행/옵션, empty state, 페이징 total을 관측하고 캡처했다.
5. 정상 값 속에 `%`, `_`, `\`가 들어간 throwaway 코드의 정확 검색도 각각 1건으로 확인했다.
6. partner-order Criteria는 데스크톱 병합 전환 모달의 `includeDeleted:false` 경로가 존재하지만, `partnerCode`는 자유입력이 아니라 확정 선택한 거래처 코드만 전달한다. 따라서 `%`·`_` 자유입력으로 Criteria의 `partnerCode` LIKE까지 도달하는 실 사용자 경로는 확인되지 않았다.

## 4. throwaway 생성 및 원복

생성: `tax_invoices` 3건, `created_by='qa919-sol-round2'`, 고정 UUID 3개.

정리 원문:

```text
BEGIN
DELETE 3
COMMIT
 qa919_remaining
-----------------
               0

cleanup-verify .../admin/tax-invoices/inbound?...partnerCode=QA919 HTTP 200 count=0 raw=[]
cleanup-verify .../admin/accounting/ledgers/partners/search?q=QA919&limit=20 HTTP 200 count=0 raw={"success":true,...,"data":[]}
```

공유 실데이터는 수정하지 않았다. throwaway 3건은 물리 삭제했고 DB·양 endpoint에서 0건을 재확인했다.

## 5. 정직 고지

- 재빌드·재배포·컨테이너 재시작·Gradle·git 명령은 실행하지 않았다.
- PR 이전 jar를 띄울 수 없었으므로 입금보고서의 배포 전/후 A/B 실행은 못 했다. 대신 현재 API 2건, 화면 2건, DB 기대 2건을 교차검증했다.
- 측정 화면들에는 검색 결과와 직접 대응하는 Excel export가 없어 화면/Excel parity는 실행하지 않았다.
- backslash 계열은 실제 API에서 전부 실행했으나 각 화면별 스크린샷은 `%`·`_`·정상값에 한정했다.
- 결재 작성 화면의 다른 초기 API에서 발생한 403/500 콘솔 로그는 대상 검색 응답이 아니고 검색 결과에 사용자 증상을 만들지 않아 본 판정에 포함하지 않았다.
