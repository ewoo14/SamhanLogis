# PR #1061 / 이슈 #1001 R35 SOL 최종 적대검증

- 검증일: 2026-08-04 (Asia/Seoul)
- 역할: CODEX SOL 5.6 적대검증 리뷰어
- 질문: 실 사용자 경로로 재현 가능한 결함이 있는가?
- 저장소 루트: `C:/dev/Samhan-Public/.claude/worktrees/t1001b`
- 브랜치: `feat/1001-ledger-spec-rest`
- 검증 HEAD: `f3b71e2c072db079eaec8fe00160fdb5277cd128`
- 시작 시 기존 미추적 경로: `clients/desktop/playwright/1001-r5-ledger-real-qa/`, `clients/desktop/playwright/1001-r6-ledger-real-qa/` (변경하지 않음)

## 판정 기준

- 개발책임자가 확정한 상태 집합, 잔액 산식, VAT 포함 판매전표 금액, slip 없는 `SALE_SUMMARY` 표시만 기준으로 삼는다.
- 검증 품질 지적은 배제한다. 단, 원문/실측으로 제시된 증거가 재현되지 않는 증거 무결성 문제는 기록한다.
- 결함 판정에는 실 사용자 조작 순서, 잘못된 결과 원문, 실 데이터 영향 건수를 요구한다.

## 진행 기록

### 0. 작업 디렉터리 및 기준점 확인 — PASS

`git -C . rev-parse --show-toplevel`, 현재 브랜치, HEAD를 확인했다. 모두 요청된 기준점과 일치한다.

### 1. 검증 순서 고정

1. 배포 컨테이너 시각·접속 상태와 시드/QA 잔재 혼입 조건
2. 계약 소비·우회·상태·기간 경계·스냅샷 코드 흐름
3. 실 사용자 경로의 정상 차단 건수와 경계 거래처별 세 경로 일치
4. 스냅샷 저장 도달성 및 원문/실측 증거 무결성
5. 미검증 범위와 최종 머지 판정

### 2. 배포본 시각 및 health — PASS

`docker inspect` 원문:

```text
/samhan-accounting-service|Created=2026-08-04T12:37:27.386410354Z|Started=2026-08-04T12:37:31.686844286Z|Image=sha256:cc1c07e74272fc5cc77311f0d0e6f2b54acf3184cebf77397e5d73f506183c07|Health=healthy
/samhan-slip-service|Created=2026-08-04T12:37:27.385400144Z|Started=2026-08-04T12:37:31.685709961Z|Image=sha256:5c9a240a08b14cb7fe62cc76060e3569caae6f988eb66a4aa111e01d7ae65e50|Health=healthy
```

두 이미지 생성 시각도 각각 `2026-08-04T12:37:23.156557671Z`, `2026-08-04T12:37:24.106710915Z`로 확인했다. PM이 제시한 배포본 시각과 일치한다.

### 3. 시드·QA 잔재 혼입 확인

집계 전 read-only SQL로 원천을 분리했다.

- `accounting_db`: `MANUAL / POSTED / SYSTEM_SEED` 19건, `SLIP / system` 29건(POSTED 26 + REVERSED 3)이 실제 조회 원천에 존재한다.
- `slip_db`: 확정 상태 집합의 OUTBOUND는 32전표/93라인/355,861,000원이다. 생성자는 `system` 31전표/89라인/354,121,900원, 개발 사용자 1전표/4라인/1,739,100원이다.
- R13이 사용한 `P-2026-0028`은 `slip_db`의 현행 `INSPECTING` 전표이며, 아래 기초잔액 결함의 32건 영향 산정은 `accounting_db`의 `SYSTEM_SEED` 분개를 합산하지 않고 이 32개 현행 판매전표만 대상으로 했다.

## 도달 결함

### D1. 기간 시작일 이전의 확정 판매전표가 기초잔액으로 이월되지 않아 거래처 행과 채권 전액이 사라진다

#### 실 사용자 조작 순서

1. `dev_manager`로 Gateway `:8080`에 로그인한다.
2. 회계 → 거래처 원장에서 거래처 `P-2026-0028`을 선택한다.
3. 시작일/종료일을 먼저 `2026-01-28`/`2026-01-28`로 설정하고 조회한다.
4. 같은 거래처에서 시작일/종료일을 `2026-01-29`/`2026-01-29`로 하루 이동해 다시 조회한다.
5. 전체 영향 확인은 `2026-08-04`/`2026-08-04`, 거래처 필터 공란으로 조회한다.

인앱/Chrome 브라우저 discovery 결과가 0개여서 이번 세션에서 신규 GUI 클릭 캡처는 만들지 못했다. 조작이 호출하는 것과 동일한 Desktop API(`getSalesAggregate`, `getLedgerData`)를 같은 계정의 Bearer 인증으로 Gateway에서 호출했다. R13의 실제 GUI 클릭 경로·화면이 이 두 API를 사용한다는 것은 코드와 R13 원문으로 교차 확인했다.

#### 잘못된 결과 원문

거래일 당일에는 기간매출로 정상 분류된다.

```json
{"period":"2026-01-28~2026-01-28","aggRows":1,"aggSales":30567900.00,"aggReceivable":30567900.00,"opening":0,"detailSales":30567900.00,"closing":30567900.00,"docs":1}
```

시작일을 하루 뒤로 이동하면 기초로 이월되지 않고 집계 행까지 사라진다.

```json
{"period":"2026-01-29~2026-01-29","aggRows":0,"aggSales":null,"aggReceivable":null,"opening":0,"detailSales":0,"closing":0,"docs":0}
```

`2026-08-04` 단일일 필터의 Gateway 원문:

```json
{"success":true,"code":"OK","message":"성공","data":[],"timestamp":"2026-08-04T13:00:21.913396556Z"}
{"success":true,"code":"OK","message":"성공","data":{"partnerCode":"P-2026-0028","partnerName":null,"partnerBusinessNo":null,"periodFrom":"2026-08-04","periodTo":"2026-08-04","openingBalance":0,"salesTotal":0,"paymentTotal":0,"closingBalance":0,"documents":[]},"timestamp":"2026-08-04T13:00:21.982256363Z"}
```

#### 실 데이터 영향 건수

확정 상태 집합 5개의 현행 판매전표 32건은 모두 2026-08-03까지 발생했다. `2026-08-04` 단일일 조회에서:

```json
{"canonicalSalePartners":32,"priorSales":355861000,"priorClosing":355861000,"futureAggregateRows":0,"futureDetailOpeningNonzero":0,"futureDetailClosingNonzero":0,"affected":32,"missingOpening":355861000}
```

즉 정상 거래처 **32/32건**이 집계에서 사라지고, 상세·인쇄가 소비할 기초/기말잔액도 모두 0이 된다. 누락 금액은 **355,861,000원**이다.

#### 원인 역추적

`PartnerLedgerReadModelService.openingBalances(from)`은 `accounting_db`의 110 계정 분개만 `from.minusDays(1)`까지 읽는다. 반면 현재 기간 판매는 `PartnerLedgerSalesClient`를 통해 `slip_db`에서 읽는다. 기간 이전 `slip_db` 판매를 기초잔액으로 접는 경로가 없다. 집계의 `SalesAggregateService`도 선택 기간의 판매만 읽으므로 기초잔액만 있는 거래처 행을 만들지 않는다.

판정: **도달 결함**. 정상 경로 차단과 기간 경계 누락이 동시에 재현된다.

### D2. slip 없는 매출 17건이 `SALE_SUMMARY`가 아닌 균형 분개 `JOURNAL_ONLY`로 접혀 VAT와 채권 불변식을 깨뜨린다

#### 실 사용자 조작 순서

1. `dev_manager`로 로그인한다.
2. 회계 → 거래처 원장에서 `2026-01-01`~`2026-08-03`, 거래처 `P-2026-0004`를 조회한다.
3. 집계 행을 선택해 상세를 열고, 이어 인쇄 미리보기를 연다. 상세·인쇄·CSV·snapshot은 동일 `PartnerLedgerResponse`를 소비한다.

#### 잘못된 결과 원문

Gateway가 반환한 핵심 원문은 다음과 같다.

```json
{"partnerCode":"P-2026-0004","partnerName":"광주에어시스템","periodFrom":"2026-01-01","periodTo":"2026-08-03","openingBalance":0,"salesTotal":9000000.00,"paymentTotal":0,"closingBalance":0.00,"documents":[{"type":"JOURNAL_ONLY","accountCode":"110","amount":0,"debit":9900000.00,"credit":0.00},{"type":"JOURNAL_ONLY","accountCode":"401","amount":9000000.00,"debit":0.00,"credit":9000000.00},{"type":"JOURNAL_ONLY","accountCode":"220","amount":0,"debit":0.00,"credit":900000.00}]}
```

확정 기준대로라면 이 slip 없는 매출은 VAT 포함 문서금액 9,900,000원의 `SALE_SUMMARY` 1건이어야 하고, 기말잔액은 `0 + 9,900,000 - 0 = 9,900,000`이어야 한다. 실제는 `JOURNAL_ONLY` 3행, 기간매출 9,000,000원(공급가액), 기말잔액 0원이다.

#### 실 데이터 영향 건수와 시드 분리

- 현재 무필터 51행 중 신규 상세가 `JOURNAL_ONLY`만 반환하는 거래처는 19건이다.
- 이 중 매출이 0인 2건을 제외한 **17건**에서 동일 불변식 위반을 재현했다.
- 17건의 원천은 모두 `accounting_db`의 `SLIP / system` 17분개다. `MANUAL / SYSTEM_SEED` 금액은 영향 합계에서 제외했다.
- 17건의 401 공급가액 합계는 **267,000,000원**, 110 VAT 포함 채권 합계는 **293,700,000원**, VAT는 **26,700,000원**이다.
- API 전수 결과: 불변식 실패 17/51, 집계·상세의 잘못된 숫자끼리의 일치는 51/51이었다. 즉 “세 경로 일치”만으로는 이 결함을 검출하지 못한다.

#### 원인 역추적 및 R33 계약 강제 여부

- `PartnerLedgerContract.DocumentType`에는 `SALE_SUMMARY`가 없다.
- `PartnerLedgerReadModelService`는 신규 read model에서 `SALE_SUMMARY`를 사용하지 않는다고 명시하고 slip 없는 매출을 `JOURNAL_ONLY`로 만든다.
- `fold`는 `JOURNAL_ONLY.amount`를 `salesTotal`에 더하면서 기말잔액은 원시 `debit-credit` 합으로 계산한다. 110/401/220의 균형 분개는 합계가 0이므로 `salesTotal > 0`인데 `closingBalance = openingBalance`인 값을 정상 반환한다.
- 따라서 R33의 계약은 `기말 = 기초 + 기간매출 - 기간수금`을 강제하지 않는다. 실제 사용자 응답으로 재현되므로 검증 품질 지적이 아니라 도달 결함이며, 동시에 “계약에 불변식을 도입했다”는 증거 무결성도 성립하지 않는다.

판정: **도달 결함**.

## 추가 도달성 확인

### 4. 필터·권한 조합 — 추가 결함 없음

`dev_manager`, `dev_accountant` 각각으로 아래 세 필터를 Gateway에 적용했다.

```text
P-2026-0028
4649610868
464-96-10868
```

6조합 모두 집계 HTTP 200/1행, 상세 HTTP 200, 반환 거래처 코드 `P-2026-0028`, 매출 `30,567,900원`이었다. 필터 해석 또는 두 역할의 VIEW 권한 때문에 정상 건이 추가로 차단되는 현상은 재현되지 않았다.

### 5. 상태 집합 5개 — 선택 기간 소비 PASS

실 `slip_db`에서 `CONFIRMED`, `DELIVERED`, `COMPLETED`, `INSPECTING`, `SHIPPING` 각각이 존재하며 합계 32전표/93라인/355,861,000원이다. `2026-01-01`~`2026-08-03` Gateway 조회의 `SALE` 문서 32개 합계도 355,861,000원으로 일치했다. 선택 기간 안에서는 다섯 상태 중 특정 상태가 집계·상세에서 누락되는 현상은 재현되지 않았다.

CSV·인쇄·snapshot은 상태를 다시 필터링하지 않고 상세의 공통 `documents`를 소비한다. 따라서 D1/D2의 잘못된 공통 결과는 그대로 전파되지만, 별도의 상태 집합 불일치는 확인되지 않았다.

### 6. 스냅샷 저장·이력·복원 — PASS

실 사용자 저장 버튼과 동일한 `POST /accounting/journals/ledger-snapshots`를 `dev_accountant` 권한으로 1회 실행했다. DB 직접 쓰기는 하지 않았다.

```json
{"before":13,"after":14,"delta":1,"captureSuccess":true,"captureSales":30567900.00,"captureClosing":30567900.00,"historyTotal":1,"latestBatchNo":"LED-20260804-000001","latestSavedAt":"2026-08-04T22:03:25.336153","restoreSuccess":true,"restoreSales":30567900,"restoreClosing":30567900,"restoreDocs":1}
```

- `tax_invoice_batches`의 활성 `PARTNER_LEDGER` 건수가 13→14로 정확히 1 증가했다.
- 이력 조회에 사용자 노출 배치번호 `LED-20260804-000001`이 나타났다.
- 복원 결과의 매출/기말 30,567,900원과 문서 1건이 저장 직전 응답과 일치했다.

판정: 저장 경로 자체는 실제 도달 가능하다. 이번 검증으로 신규 snapshot 1건이 공유 개발 DB에 남았다.

### 7. 경계 거래처 추가 확인

- **수금만 있는 기간**: `P-2026-0005`를 2026-07-04 단일일로 조회하면 기초 28,600,000원, 수금 200,000원, 기말 28,400,000원이었다. 2026-07-07은 기초 28,400,000원, 수금 77,000원, 기말 28,323,000원이었다. 두 경우 집계·상세가 일치했다.
- **시작일 당일 거래**: `P-2026-0028`의 2026-01-28 판매는 기초가 아니라 기간매출에 1회만 포함되었다. 당일 중복은 없었다. 하루 뒤 기초로 넘어갈 때 전액 사라지는 문제는 D1이다.
- **기초만 있는 기간**: `P-2026-0004`도 거래 다음 날인 2026-01-11 조회 시 집계 0행, 상세 기초/기말 0원이었다. 기간 활동이 없으면 `openingBalances`만으로 그룹을 만들지 않는 D1 원인이 `slip_db`뿐 아니라 기존 회계 110 잔액에서도 재현됨을 확인했다.

### 8. R13·CI 증거 무결성

- R13의 PNG 4장을 원본 해상도로 직접 열었다. 무필터 51행, `P-2026-0028` 상세의 10,167,300 + 11,627,000 + 8,773,600 = 30,567,900원, 인쇄 미리보기 합계/기말 30,567,900원이 보고서와 일치했다.
- 동일 Gateway 재호출에서도 무필터 51행과 `P-2026-0028` 30,567,900원이 재현됐다.
- `gh pr checks 1061`의 현재 출력은 49개 check 모두 `pass`다.
- 따라서 R13의 **해당 거래처·해당 기간** 원문은 무결하다. 다만 그 한정된 사실은 D1의 기간 경계와 D2의 slip 없는 매출 불변식을 포함하지 않는다.

## 최종 판정

실 사용자 경로로 재현 가능한 결함은 **2계열**이다.

1. 기간 이전 확정 판매가 기초잔액으로 이월되지 않아 정상 거래처 32/32행과 355,861,000원이 사라진다.
2. slip 없는 매출 17행이 `SALE_SUMMARY`가 아니라 `JOURNAL_ONLY` 균형 분개로 접혀 VAT 포함 금액과 `기초 + 매출 - 수금 = 기말` 불변식을 깨뜨린다. 17행의 VAT 포함 채권 원천은 293,700,000원이다.

R33이 “계약 fold가 VAT 포함 판매·수금·기초잔액을 강제한다”고 기록한 출력은 정상 `SALE` fixture에는 맞지만, 현재 실 사용자에게 노출되는 `JOURNAL_ONLY`와 기간 이전 `slip_db` 판매에는 강제되지 않는다. D2는 계약이 `salesTotal > 0`, `openingBalance = 0`, `paymentTotal = 0`, `closingBalance = 0`을 정상 생성한 원문으로 이를 반증한다.

**머지 비권고.** CI green과 R13 단일 거래처 라이브QA PASS는 유지되지만, 게이트 ① “도달 결함 0”은 충족되지 않았다.

## 이 라운드가 보지 않은 것

- 인앱/Chrome 브라우저가 이 세션에 연결되어 있지 않아 D1/D2의 신규 GUI 캡처를 만들지 못했다. 동일 계정·Gateway·Desktop API 호출과 기존 R13 실제 GUI 캡처/코드 소비 경로로 도달성을 확인했다.
- OS 인쇄 대화상자, 실제 프린터 출력, CSV 파일의 로컬 저장 결과, 여러 거래처 일괄 인쇄의 최종 렌더는 새로 조작하지 않았다. 이 표면들이 소비하는 공통 상세/snapshot 데이터까지는 추적했다.
- snapshot 복사, 동시 채번 경합, soft-delete 이력 이후 재채번은 실행하지 않았다. 명시 저장 1회·이력 조회·복원은 실제 DB에서 확인했다.
- `dev_manager`와 `dev_accountant` 외 역할의 권한 조합은 계정이 제공되지 않아 확인하지 않았다.
- 코드 수정, 컨테이너 중지·재빌드, DB 직접 INSERT/UPDATE/DELETE는 수행하지 않았다.

## 신규 파일 및 외부 상태 변화

- 신규 파일: `docs/dev-reports/2026-08-04-1001-r35-sol-final-review.md`
- 공유 개발 DB: 사용자 경로 검증으로 `PARTNER_LEDGER` snapshot `LED-20260804-000001` 1건 생성

