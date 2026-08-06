# #1001 R46 — 이카운트 정본 계정·기초잔액 재수렴

- 검증 일자: 2026-08-05 (Asia/Seoul)
- 대상: PR #1061, 브랜치 `feat/1001-ledger-spec-rest`, 착수 HEAD `f8c5346bc74171f7048c778e831eff9af25843aa`
- 범위: 거래처별 원장이 이카운트 계정 정본, 상대 라인 effect, 기간 경계의 확정수금, 기초-only 거래처를 올바르게 읽도록 수정
- 범위 밖: 앱 생성 경로 전환, 기존 `110`/`401` 68라인 정규화, `chart_of_accounts` 정리, 다른 회계 화면 전환 — 이슈 #1072
- 금지 준수: 컨테이너 재배포·DB 쓰기·commit·push·다른 트랙 파일 수정 없음

## 1. 불변식별 진단

### 불변식 1 — 계정군 전수 인식

현재 `PartnerLedgerReadModelService`와 `PartnerLedgerCollectionContract`가 `110`을 채권, `401`을 매출로 고정한다. 이 때문에 회사 DB에 실재하는 이카운트 정본 `1089`·`4019`·`2519`가 원장 분류에서 빠진다. 전환기 레거시 `110`·`401`도 함께 읽어야 한다.

2026-08-05 read-only SQL로 활성 `chart_of_accounts`를 확인했다. 계정 코드는 하드코딩 후보로 추측하지 않고, `category`와 정확한 `name`을 기준으로 의미군을 세었다.

```sql
SELECT category, name, COUNT(*) AS accounts,
       string_agg(code, ',' ORDER BY code) AS codes
FROM chart_of_accounts
WHERE is_deleted = false
  AND ((category = 'ASSET' AND name = '외상매출금')
    OR (category = 'REVENUE' AND name = '상품매출')
    OR (category = 'LIABILITY' AND name = '외상매입금'))
GROUP BY category, name
ORDER BY category, name;
```

확인 결과:

| category | name | 계정 수 | code |
|---|---|---:|---|
| ASSET | 외상매출금 | 2 | `1089`, `110` |
| LIABILITY | 외상매입금 | 2 | `201`, `2519` |
| REVENUE | 상품매출 | 2 | `401`, `4019` |

동일 조회에서 `1099 외상매출금대손충당금`, `4029 상품매출환입및에누리`, `4039 상품매출할인`은 이름이 다른 별도 계정으로 확인되어 이번 세 의미군에 포함하지 않는다.

활성 `POSTED`·`REVERSED` 분개 라인에서도 같은 계정군을 전수 대조했다.

| account_code | 활성 라인 | 거래처 수 | 차변 합계 | 대변 합계 |
|---|---:|---:|---:|---:|
| `110` | 41 | 37 | 452,430,000 | 10,380,000 |
| `1089` | 2,435 | 746 | 6,730,209,774 | 6,436,930,757 |
| `201` | 0 | 0 | 0 | 0 |
| `2519` | 40 | 13 | 412,500 | 76,145,702 |
| `401` | 27 | 27 | 0 | 411,000,000 |
| `4019` | 2,062 | 710 | 0 | 6,114,572,125 |

따라서 원장 분류 입력에서 버려지던 실제 계정은 `1089`·`4019`이고, `2519`는 다중 거래처 수금 effect의 상대 차변으로 보존되어야 한다. `201`은 chart상 정본 계정이지만 이번 활성 데이터에는 라인이 없으므로 0건으로 확인했다.

### 불변식 2 — 금액 귀속과 effect 판정 분리

`journalEvidence()`는 현재 대상 거래처가 아닌 `2519` 라인의 debit/credit을 0으로 만들어 `PartnerLedgerCollectionContract`에 전달한다. 따라서 고객 원장의 금액 오염은 막지만, 수금 effect에 필요한 상대 차변도 사라진다. 전표 전체 라인은 effect 판정용으로 보존하고, 분류 결과의 amount/debit/credit만 대상 거래처 라인으로 귀속해야 한다.

검증 대상은 `20260504-177` 대한공조 33,000원, `20260504-178` 올인원공조 165,000원, `20260506-204` 클릭시스템에어컨 165,000원, `20260513-203` 빅히트시스템공조 49,500원이며 합계는 412,500원이다. 네 전표의 상대 `2519` 거래처는 새한신용정보(주) 에이스전략본부다.

### 불변식 3 — 기간 밖 확정수금의 기초 이월

기간 수금은 확정 `cash_receipts`에서 읽지만, 기초는 채권 계정 분개와 판매전표만 읽고 시작일 이전 확정수금을 읽지 않는다. `journalEvidence()`가 `CASH_RECEIPT` 분개를 제외하므로, 시작일 이전 확정수금은 기초에 별도 투영해야 한다.

### 불변식 4 — 기초-only 거래처 집합 보존

기초 계산은 현재 `110` aggregate에 나타난 거래처만 대상으로 하고, 계산된 기초 map으로 결과 group을 만들지 않는다. 따라서 기간 중 분개·수금·판매가 없는 기초-only 거래처가 목록과 상세에서 사라진다. 기초가 비영이면 결과 집합의 후보로 편입되어야 한다.

## 2. RED 원문 — 수정 전 보존해야 하는 것

```text
RED-A  되돌리면 안 되는 것
  A1  기초 + 기간매출 − 기간수금 = 기말 산식이 성립한다
  A2  집계·상세·인쇄 세 경로가 같은 값을 낸다
  A3  R44 의 라인별 귀속이 유지된다 (다른 거래처 금액이 내 원장에 들어오지 않는다)
  A4  단일 거래처 journal 의 분류가 그대로다
  A5  이미 표시되던 거래처가 사라지지 않는다

RED-B  결함이 재발하지 않는다
  B1  실 데이터의 채권·매출 계정이 전부 분류에 들어간다 (버려지는 금액이 없다)
  B2  위 수수료 4건이 각 고객 원장에 수금으로 잡힌다 (합계 412,500원)
  B3  기말일을 고정하고 시작일만 옮겨도 기말이 달라지지 않는다
  B4  기간 중 활동이 없고 기초만 있는 거래처가 목록·상세에 나온다
```

이 파일의 RED 원문은 제품 코드 수정 전에 기록했다.

## 3. 조치

### 3.1 계정 정본과 전환기 alias

`PartnerLedgerReadModelService`가 `ChartOfAccountRepository.findAllByOrderByCodeAsc()`로 활성 chart를 읽고, `category`·정확한 `name`·leaf 여부로 계정 코드를 구성한다.

- `ASSET / 외상매출금` → `110`, `1089`
- `REVENUE / 상품매출` → `401`, `4019`
- `LIABILITY / 외상매입금` → `201`, `2519`

분류 contract에는 계정 코드를 전달하고, chart를 사용할 수 없는 구형 단위 adapter에서만 `110`·`401` 호환 fallback을 사용한다. 앱 생성 경로·chart master 데이터는 변경하지 않았다.

### 3.2 귀속 금액과 effect evidence 분리

`PartnerLedgerCollectionContract.Evidence`에 `effectDebit`·`effectCredit`를 추가했다. 기존 `debit`·`credit`은 대상 거래처 귀속 금액으로 유지한다.

`journalEvidence()`는 전표 전체 라인의 effect 금액을 보존하면서, 대상 거래처가 아닌 라인의 귀속 금액은 0으로 투영한다. 따라서 `2519` 상대 차변은 수금 effect에는 남고 고객 원장 금액에는 들어가지 않는다. 단일 거래처 journal, `CASH_RECEIPT` 제외 정책, 역분개 전체 라인 fold는 유지했다.

### 3.3 기간 밖 확정수금과 기초-only group

기초 산출은 chart의 모든 외상매출금 코드(`110`·`1089`)별 aging 후보를 모아 각 거래처 전표 전체 라인을 같은 collection contract로 분류한다. 여기에 `from` 이전 확정 `cash_receipts`를 `-amount` payment effect로 추가한다. 기간 중 확정수금은 기존처럼 기간 문서로만 추가해 이중 집계하지 않는다.

기초 결과가 비영이면 기간 중 activity가 없어도 `groups`를 먼저 만들고, 목록·상세·인쇄가 공유하는 동일 read model에 편입한다.

## 4. 수수료 4건 전후 대조

DB read-only 확인 결과 네 journal은 아래처럼 모두 대상 고객의 `1089` 대변과 새한신용정보(주) 소유 `2519` 차변이 같은 금액으로 존재한다.

| journal | 고객 금액 | 현재 R45 귀속 evidence | R46 effect evidence | R46 effect |
|---|---:|---|---|---|
| `20260504-177` | 33,000 | `1089 C33,000`, 상대 `2519 D0` → `NONE` | 귀속 `1089 C33,000`, effect 상대 `2519 D33,000` | `PAYMENT 33,000` |
| `20260504-178` | 165,000 | `1089 C165,000`, 상대 `2519 D0` → `NONE` | 귀속 `1089 C165,000`, effect 상대 `2519 D165,000` | `PAYMENT 165,000` |
| `20260506-204` | 165,000 | `1089 C165,000`, 상대 `2519 D0` → `NONE` | 귀속 `1089 C165,000`, effect 상대 `2519 D165,000` | `PAYMENT 165,000` |
| `20260513-203` | 49,500 | `1089 C49,500`, 상대 `2519 D0` → `NONE` | 귀속 `1089 C49,500`, effect 상대 `2519 D49,500` | `PAYMENT 49,500` |
| **합계** | **412,500** | **수금 0** | **대상 귀속 합계 412,500** | **PAYMENT 412,500** |

회귀 테스트 `fourEcountFeeSettlementsArePaymentsForEachCustomer`가 네 금액을 각각 고객 원장 수금으로 검증하고, `ecountCanonicalAccountsKeepSalesAndMultiPartnerPaymentSeparate`가 `1089`·`4019` 매출과 `2519` 상대 차변의 분리를 검증한다.

## 5. GREEN 원문

### 5.1 양방향 RED 항목 결과

```text
RED-A
  A1 PASS — PartnerLedgerContract.fold() 산식 유지
  A2 PASS — 집계·상세·인쇄가 동일 PartnerLedgerReadModel 소비
  A3 PASS — 대상 거래처 귀속 debit/credit만 표시, 상대 effect만 별도 보존
  A4 PASS — 단일 거래처 journal 분류 회귀 테스트 통과
  A5 PASS — 기존 기간 거래처와 비영 기초 거래처 group 보존

RED-B
  B1 PASS — chart 기준 110/1089·401/4019 분류, 201/2519 상대 계정 effect 보존
  B2 PASS — 수수료 4건 33,000 + 165,000 + 165,000 + 49,500 = 412,500원 PAYMENT
  B3 PASS — 기간 밖 확정수금을 기초 payment로 fold
  B4 PASS — 기간 중 activity가 없어도 비영 기초 거래처 목록·상세 편입
```

### 5.2 지정 검증 원문

```text
./gradlew :services:accounting-service:test --tests '*PartnerLedger*' --tests '*TrialBalance*'
BUILD SUCCESSFUL in 34s
PartnerLedgerReadModelServiceTest: 21 tests, failures=0, errors=0
PartnerLedgerReadServiceTest: 4 tests, failures=0, errors=0
TrialBalanceControllerIT: 9 tests, failures=0, errors=0
```

```text
cd clients/desktop && npx vitest run src/renderer/api/partnerLedgerApi.test.ts src/renderer/api/partnerLedgerHistory.test.ts src/renderer/print/PartnerLedgerView.test.tsx src/renderer/routes/PartnerLedgerPage.print.test.tsx
4 test files passed, 25 tests passed
```

공통 contract 테스트와 accounting compile도 별도로 통과했다. `TrialBalanceControllerIT`가 새 `ChartOfAccountRepository` 생성자 배선을 포함한 Spring context를 로드했다.

## 6. 자기 표면 닫기

### 6.1 새로 가능해진 조합을 열거하고 각각 밟음

| 조합 축 | 검증 경로 | 결과 |
|---|---|---|
| `110/401` legacy 계정 | `RED_A1_singlePartnerJournalSaleRemainsAReceivableSale`, 기존 contract 테스트 | PASS |
| `1089/4019/2519` 이카운트 계정 | `ecountCanonicalAccountsKeepSalesAndMultiPartnerPaymentSeparate` | PASS |
| 기초·기간·기말 | `RED_A3_openingPlusSalesMinusPaymentEqualsClosing`, 기간 경계 테스트 | PASS |
| 단일·다중 거래처 | 단일 journal sale/payment 및 `RED_B1_eachPartnerOwnsOnlyItsReceivableLinesInOneJournal` | PASS |
| 원분개·역분개 | `RED_B2_reversalPairBeforePeriodUsesTheSameCollectionContractAsThePeriod` | PASS |
| 기간 안·기간 밖 확정수금 | `confirmedReceiptBeforePeriodBecomesOpeningAndOpeningOnlyPartnerRemainsVisible`, 기존 기간 수금 테스트 | PASS |
| 기초-only 목록·상세 | 위 opening-only 테스트의 `selected != null`, 빈 period documents, 비영 opening 검증 | PASS |

### 6.2 상수·식별자 전수 grep

워크트리 전체에서 아래를 검색했다.

```text
PartnerLedgerCollectionContract.classify
PartnerLedgerCollectionContract.Evidence
effectDebit / effectCredit
new PartnerLedgerReadModelService
```

결과: 새 evidence 필드는 공통 contract와 accounting 원장 산출기·회귀 테스트에서만 사용되고, 생성자 호출은 5-argument 호환 생성자 또는 Spring 6-argument 생성자로 모두 닫혔다. chart 조회 method는 원장 서비스와 기존 `AccountService`·`TrialBalanceSummaryService`에서만 참조되며, 기존 시산표 계정 상수는 변경하지 않았다.

`git diff --name-only` 결과도 원장 공통 contract, accounting 원장 산출기, 해당 회귀 테스트 2개, 이 보고서뿐이다. #1072 대상인 앱 생성 경로·68라인 정규화·다른 회계 화면은 수정하지 않았다.

### 6.3 바꾼 파일 참조 테스트

- `shared:common` PartnerLedger contract 테스트: PASS
- `services:accounting-service` PartnerLedger service/read service/TrialBalance 테스트: PASS
- Spring context 최소 IT: `TrialBalanceControllerIT` 9건 PASS
- 지정 desktop API/history/detail/print 테스트: 25건 PASS
- `git diff --check`: PASS

## 7. 안 본 것

- 컨테이너 재배포와 live 화면 GET은 하지 않았다. 현재 배포 이미지에 이 코드가 반영되었는지 확인하지 않았다.
- DB write, snapshot 저장 실데이터 변경, 앱 생성 경로 전환, 110/401 68라인 정규화는 하지 않았다.
- `chart_of_accounts` 정리와 시산표·재무상태표·매출집계·세금계산서의 전역 계정 전환은 하지 않았다. 해당 화면의 기존 상수는 grep으로 존재만 확인했고 변경하지 않았다.
- 개발책임자 결정으로 종결된 `created_by='system'` SLIP 포함 정책과 다중 거래처 journal 생성 정책은 재판정하지 않았다.
- 전체 모노레포 테스트와 운영 데이터에 대한 live 원장 API 재조회는 실행하지 않았다.
