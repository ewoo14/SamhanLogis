# PR #1061 R37 SOL 재수렴 적대검증

- 검증일: 2026-08-04 (Asia/Seoul)
- 작업 트리: `C:/dev/Samhan-Public/.claude/worktrees/t1001b`
- 브랜치: `feat/1001-ledger-spec-rest`
- 검증 HEAD: `0560d83847b294b7bfd16a5695e5f8bf8ba9c5b0`
- 역할: CODEX SOL 5.6 적대검증 리뷰어
- 제약: 코드 수정 없음, DB 직접 쓰기 없음, 컨테이너 중지·재빌드 없음, 배포 없음
- 실행 환경 주의: 게이트웨이 `:8080`의 가동 배포본은 R36 이전(`2026-08-04T12:37:27Z`)이므로 HEAD 코드 판정과 라이브 실행 판정을 분리한다.

## 검증 범위와 판정 기준

개발책임자 확정 기준만 사용한다.

- 채권 잔액: `기초 + 기간매출 - 기간수금`
- 판매전표 금액: VAT 포함 문서금액
- slip 없는 매출: `SALE_SUMMARY` 문서로 표시
- 상태 집합: `CONFIRMED`, `DELIVERED`, `COMPLETED`, `INSPECTING`, `SHIPPING`

우선 검증 표면:

1. `JOURNAL_ONLY` 금액 소실
2. 매출·수금 외 차변/대변 문서의 잔액 소실
3. 기초잔액 이월 경계 중복
4. 구형 snapshot 재계산 호환
5. 집계·상세·인쇄 세 경로 일치

## 조사 기록

### 1. 측정 환경과 실행/코드 판정 분리

- 측정 PC 식별자: `DESKTOP-8SO2GTL` (`user`, Windows, Korea Standard Time). 이 PC가 집/회사 중 어느 쪽인지는 시스템 정보만으로 단정하지 않는다.
- 측정 시각: `2026-08-04T22:36:56+09:00`
- PostgreSQL: 실행 중인 `samhan-postgres`에 `SET default_transaction_read_only=on`을 건 `SELECT`만 수행했다.
- accounting-service 실행본: `Created=2026-08-04T12:37:27.386410354Z`, image `sha256:cc1c07e...`, healthy.
- slip-service 실행본: `Created=2026-08-04T12:37:27.385400144Z`, image `sha256:5c9a240a...`, healthy.
- 따라서 Gateway 실행 원문은 R36 이전 동작의 기준선이며, R36 결과는 HEAD 코드의 분기와 동일 DB 집계를 결합한 결정적 산출값으로 판정한다. R36 라이브 응답이라고 위장하지 않는다.

### 2. R36 변경 흐름

HEAD의 핵심 분기는 다음과 같다.

```text
opening = accounting 110 누계 + 1900-01-01..from-1 canonical sale 전액

기간 group:
  canonical SALE 하나라도 있으면 salesSeen=true
  !salesSeen && journalSales != 0  -> SALE_SUMMARY 1건
  !salesSeen && journalSales == 0 -> JOURNAL_ONLY 전 라인

fold:
  sales = SALE + SALE_SUMMARY
  payments = CASH_RECEIPT
  closing = opening + sales - payments
```

`salesSeen`은 문서 단위가 아니라 거래처+조회기간 그룹 단위다. 또한 `SALE_SUMMARY.amount`는 해당 판매 분개의 110 금액이 아니라, 같은 거래처·기간의 모든 비-CASH_RECEIPT 분개에서 모은 110 차변 총액이다.

## 도달 결함

### D1. 같은 거래처에 canonical SALE이 하나라도 있으면 별도 slip 없는 매출 12건이 SALE_SUMMARY 전환 전에 통째로 소실된다

#### 사용자 조작 순서

1. `dev_manager`로 Gateway `:8080`에 로그인한다.
2. 회계 → 거래처 원장에서 `2026-01-01~2026-08-03`, 거래처 `P-2026-0028`을 조회한다.
3. 집계 행을 선택해 상세를 열고 인쇄 미리보기를 연다.
4. 같은 거래처를 `2026-01-28` 단일일, `2026-03-23` 단일일로 각각 조회한 뒤 전체 기간 결과와 합계를 비교한다.

#### 잘못된 결과 원문

R36 이전 배포본의 전체 기간 Gateway 기준선은 다음과 같다. R36에서도 이 기간은 `salesSeen=true`가 되어 동일한 canonical SALE 1건만 남는다.

```json
{"partner":"P-2026-0028","period":"2026-01-01~2026-08-03","opening":0,"sales":30567900.00,"payments":0,"closing":30567900.00,"docs":1,"types":"SALE","amounts":"30567900.00"}
```

그러나 같은 DB의 별도 날짜에는 활성 slip이 존재하지 않는 `SLIP/system` 분개가 있다.

```text
2026/03/23-1 | source_ref_id=eeeb7889-... (slip_db 활성 slip 일치 0)
110 debit 29,700,000 | 401 credit 27,000,000 | 220 credit 2,700,000
```

HEAD 분기상 `2026-03-23` 단일일에는 canonical SALE이 없어 이 분개가 `SALE_SUMMARY 29,700,000`으로 바뀌지만, `2026-01-01~2026-08-03`에는 1월 28일의 다른 canonical SALE 때문에 `salesSeen=true`가 되어 3월 23일 문서 전체가 사라진다. 즉 같은 원천을 날짜별로 나눠 조회하면 `30,567,900 + 29,700,000 = 60,267,900원`, 한 기간으로 조회하면 `30,567,900원`이다.

#### 실 데이터 영향 건수

- `accounting_db`의 `SLIP/system` 분개 29건(POSTED 26, REVERSED 3)은 `source_ref_id`와 일치하는 활성 `slip_db.slips.id`가 **0건**이다.
- 이 중 R35가 집계한 17건/293,700,000원은 해당 기간에 다른 canonical SALE이 없는 거래처라 R36에서 SALE_SUMMARY 후보가 된다.
- 나머지 **12거래처 / 12분개 / 36라인 / VAT 포함 209,000,000원**은 같은 거래처에 다른 canonical SALE이 있다는 이유만으로 SALE_SUMMARY 전환 전 소실된다. 공급가액 합계는 190,000,000원이다.
- `P-2026-0028`의 소실액은 VAT 포함 **29,700,000원**이다.

이는 `slip 없는 매출은 SALE_SUMMARY 문서로 표시`라는 확정 기준을 문서 단위가 아닌 거래처 단위로 적용한 도달 결함이다.

### D2. SALE_SUMMARY가 판매 문서금액이 아니라 다른 MANUAL 110 차변까지 합쳐 3거래처를 7,700,000원 부풀린다

#### 사용자 조작 순서

1. `dev_manager`로 로그인한다.
2. 회계 → 거래처 원장에서 `2026-01-01~2026-08-03`, `P-2026-0001`을 조회한다.
3. 집계 → 상세 → 인쇄를 순서대로 연다.

#### 잘못된 결과 원문

R36 이전 실행본은 `P-2026-0001`의 실제 매출 분개를 다음처럼 반환한다.

```json
{"partner":"P-2026-0001","period":"2026-01-01~2026-08-03","opening":0,"sales":18000000.00,"payments":0,"closing":0.00,"docs":10,"types":"JOURNAL_ONLY,..."}
```

DB 원문은 서로 다른 두 110 차변이다.

```text
P-2026-0001 | 2026/01/01-1 | SLIP/system        | 110 debit 19,800,000 | 외상매출금 (부가세포함)
P-2026-0001 | 2026/04/05-1 | MANUAL/SYSTEM_SEED | 110 debit  2,200,000 | [DEV-SEED] 외상매출금 — 미수 잔액
```

HEAD의 `saleSummaryDocument()`는 `journalReceivableDebit`가 양수이면 이를 그대로 문서금액으로 사용한다. 따라서 R36 결정적 산출은 다음과 같다.

```json
{"partnerCode":"P-2026-0001","salesTotal":22000000,"closingBalance":22000000,"documents":[{"type":"SALE_SUMMARY","amount":22000000}]}
```

확정 기준의 판매전표 VAT 포함 문서금액은 `SLIP/system` 분개의 **19,800,000원**이다. 별도 MANUAL 미수 잔액 2,200,000원이 판매 문서로 위장되어 22,000,000원이 된다.

#### 실 데이터 영향 건수

R35의 `SLIP/system` 17거래처/293,700,000원 cohort 안에서:

```text
P-2026-0001  19,800,000 -> 22,000,000  (+2,200,000)
P-2026-0002   5,500,000 ->  9,020,000  (+3,520,000)
P-2026-0003  24,200,000 -> 26,180,000  (+1,980,000)
```

즉 **3/17거래처, +7,700,000원**이다. 세 `MANUAL/SYSTEM_SEED` 행은 사용자 경고대로 시드 잔재로 분리해 센 값이다. 이 잔재를 제외한 R35 정본 금액은 293,700,000원인데, HEAD는 같은 17거래처에 301,400,000원을 투영한다.

추가로 개발 사용자 생성 `SLIP` 분개 3거래처/3,960,000원도 활성 slip이 없어 SALE_SUMMARY 후보가 된다. 이를 포함한 HEAD 전체 후보는 20거래처/305,360,000원이지만, PM의 17건 정본 영향과 섞지 않았다.

### D3. CASH_RECEIPT가 아닌 실제 외상매출금 회수 7건/7,600,000원이 기간수금과 잔액에서 빠진다

#### 사용자 조작 순서

1. `dev_manager`로 로그인한다.
2. `P-2026-0032`를 `2026-01-01~2026-08-03`으로 조회한다.
3. `2026-04-04` 단일일(회수일), `2026-04-05` 단일일(회수 다음 날)로 옮겨 집계·상세·인쇄의 수금과 잔액을 비교한다.

#### 잘못된 결과 원문

가동 배포본의 전체 기간 기준선:

```json
{"period":"2026-01-01~2026-08-03","opening":0,"sales":1633500.00,"payments":0,"closing":1633500.00,"docs":1,"types":"SALE"}
```

회수일 DB 원문:

```text
2026/04/04-1 | MANUAL/system | 거래처 P-2026-0032 외상매출금 회수
102 debit 700,000 | 110 credit 700,000
```

R36 fold는 `CASH_RECEIPT` 문서만 payments에 포함하고 `JOURNAL_ONLY`와 문서화되지 않은 110 credit을 모두 제외한다. 따라서 전체 기간 HEAD 결과도 `paymentTotal=0`, `closingBalance=1,633,500`이다. 확정 산식에 실제 회수를 적용하면 `0 + 1,633,500 - 700,000 = 933,500원`이어야 한다.

#### 실 데이터 영향 건수

- `MANUAL/system`에 설명과 memo가 모두 `외상매출금 회수`인 **7거래처 / 7분개 / 14라인**이 있다.
- 110 credit 합계는 **7,600,000원**이다.
- 해당 7거래처에는 각각 canonical SALE이 있어 `salesSeen=true`이고, 회수 분개는 상세 문서 생성 전 통째로 억제된다.
- 저장 원천이 seed/QA임은 분리 표기한다. 다만 API가 이 저장 원천을 조회하고 화면에 반영해야 하는 코드 경로는 실제 도달 가능하며, CASH_RECEIPT가 아닌 회수·상계·조정이 fold에서 빠지는 일반 조건을 그대로 충족한다.

### D4. 기간 경계의 단일 거래일 테스트는 통과하지만, 기간 합치기/분할 불변식이 깨지고 기초로 넘어가는 순간 숨은 금액이 되살아난다

R36 이전 가동본 원문:

```json
{"partner":"P-2026-0028","period":"2026-01-28~2026-01-28","opening":0,"sales":30567900.00,"closing":30567900.00}
{"partner":"P-2026-0028","period":"2026-01-29~2026-01-29","opening":0,"sales":0,"closing":0}
{"partner":"P-2026-0028","period":"2026-03-23~2026-03-23","opening":0,"sales":27000000.00,"closing":0.00,"types":"JOURNAL_ONLY,JOURNAL_ONLY,JOURNAL_ONLY"}
{"partner":"P-2026-0028","period":"2026-03-24~2026-03-24","opening":0,"sales":0,"closing":0}
```

HEAD 코드와 같은 DB를 적용하면 경계값은 다음으로 결정된다.

```text
01-28 단일일: opening 0          + SALE 30,567,900                    = 30,567,900
01-29 단일일: opening 30,567,900 + period 0                           = 30,567,900
03-23 단일일: opening 30,567,900 + SALE_SUMMARY 29,700,000            = 60,267,900
03-24 단일일: opening 60,267,900 + period 0                            = 60,267,900
01-01~08-03: opening 0           + SALE 30,567,900, journal 억제       = 30,567,900  (오답)
08-04 단일일: opening 29,700,000(accounting)+30,567,900(canonical)     = 60,267,900
```

시작일 당일 판매의 opening/period 이중계상 자체는 없다. 그러나 긴 기간에서는 29,700,000원이 숨고, 같은 자료를 분할하거나 모두 기초로 넘기면 60,267,900원으로 되살아난다. D1의 그룹 단위 문서 억제가 만든 경계 불연속이다.

## 추가 도달성 판정

### 3. JOURNAL_ONLY 잔존 수와 금액

`2026-01-01~2026-08-03` HEAD 분기에서 최종 `JOURNAL_ONLY`로 남는 그룹은 **2거래처**다.

- `P-2026-0011`: MANUAL/SYSTEM_SEED 매입·미지급 2라인.
- `P0-6-C001`: 상쇄된 QA 분개를 포함해 `journalDocuments()`가 반환하는 10라인.
- 합계: **12 JOURNAL_ONLY 문서**, 문서 `amount` 합 0원, 110 net 0원, 전체 debit-credit net 0원.

따라서 “최종 JOURNAL_ONLY amount가 fold에서 빠져 직접 판매금액이 소실”되는 건은 현재 DB에서 0건이다. 대신 판매금액이 있는 12건/209,000,000원은 JOURNAL_ONLY로 남지도 못하고 `salesSeen` 분기에서 문서 생성 전에 소실된다(D1).

### 4. 구형 snapshot `LED-20260804-000001`

가동 배포본 복원 원문:

```json
{"batchNo":"LED-20260804-000001","partnerCode":"P-2026-0028","periodFrom":"2026-01-01","periodTo":"2026-08-03","lineCount":3,"ledger":{"openingBalance":0,"salesTotal":30567900,"paymentTotal":0,"closingBalance":30567900,"documents":[{"type":"SALE","amount":30567900}]}}
```

HEAD의 `LedgerSnapshotService.restorePayload()`도 저장 JSON을 `PartnerLedgerResponse`로 역직렬화한 뒤 `LedgerSnapshotResponse`로 복사할 뿐 `PartnerLedgerContract.fold()`를 다시 호출하지 않는다. 따라서 이 구형 snapshot은 R36에서도 **30,567,900원 그대로**이며 값이 바뀌지 않는다. `JOURNAL_ONLY`/`SALE_SUMMARY` enum 역직렬화도 유지된다.

판정: 역직렬화·불변 snapshot 복원 PASS. 단, “새 fold로 다시 계산”되는 경로 자체가 없다.

### 5. 집계·상세·인쇄 세 경로

- 집계: `SalesAggregateService`가 `PartnerLedgerReadModelService.read()`의 frozen totals를 사용한다.
- 상세: `PartnerLedgerReadService`가 같은 read model의 totals/documents를 사용한다.
- 인쇄: `PartnerLedgerView`가 상세와 같은 `getLedgerData()`(`/partner-ledger`)를 사용한다.
- snapshot 인쇄: 저장 당시 동일 상세 payload를 복원한다.

따라서 R36 후 `P-2026-0028`, `2026-01-01~2026-08-03`의 세 경로는 모두 **30,567,900원으로 서로 일치**한다. R13 값은 유지된다. 그러나 세 경로가 동일한 그룹 억제 결과를 공유하므로 D1의 29,700,000원 소실도 세 곳에 똑같이 전파된다. “세 곳 일치”는 PASS지만 “확정 산식과 문서 완전성”은 FAIL이다.

### 6. 영향 테스트와 CI

HEAD에서 재실행한 영향 테스트:

```text
PartnerLedgerContractTest + accounting 영향 4클래스
BUILD SUCCESSFUL in 15s
23 actionable tasks: 1 executed, 22 up-to-date

partnerLedgerApi.test.ts
1 file / 7 tests passed
```

GitHub PR #1061의 head는 로컬과 같은 `0560d83847b294b7bfd16a5695e5f8bf8ba9c5b0`이다. `2026-08-04 22:36 KST` 조회 결과는 **SUCCESS 46 / FAILURE 1 / IN_PROGRESS 2**다.

```text
FAILURE    Frontend Desktop (typecheck + lint + build)
IN_PROGRESS Desktop Playwright (mock 회귀 hard gate)
IN_PROGRESS GitGuardian Security Checks
```

따라서 이 HEAD는 현재 CI green이 아니다. CI 원인 분석은 이번 도달성 범위에 포함하지 않았다.

## 최종 판정

R36은 두 가지를 부분적으로 닫았다.

- 기간 이전 canonical 판매를 opening에 넣어 시작일 다음 날 0원이 되는 R35 D1의 단순 사례를 닫는다.
- 같은 기간에 canonical SALE이 없는 R35의 `SLIP/system` 17건을 SALE_SUMMARY 후보로 만든다.

그러나 도달 결함은 0이 아니다.

1. 같은 거래처에 다른 canonical SALE이 있으면 별도 slip 없는 매출 12건/209,000,000원이 SALE_SUMMARY 전환 전에 소실된다.
2. R35 정본 17건 중 3건의 SALE_SUMMARY가 다른 MANUAL 110 차변을 합쳐 7,700,000원 부풀려진다.
3. CASH_RECEIPT가 아닌 명시적 외상매출금 회수 7건/7,600,000원이 기간수금과 기말잔액에서 빠진다.
4. 기간을 합치면 숨고 분할하거나 기초로 넘기면 되살아나는 비연속성이 있다.

**머지 비권고.** 게이트 ① `도달 결함 0`을 충족하지 못했고, 게이트 ②도 현재 `46 success / 1 failure / 2 in progress`로 green이 아니다. R13 배포본의 세 경로 `P-2026-0028 = 30,567,900원` 일치는 보존되지만, 그 동일성이 누락된 원천을 복구하지 않는다.

## 이 라운드가 보지 않은 것

- R36 이미지는 공유 서버에 배포하지 않았다. 따라서 R36 결과는 HEAD 코드 분기와 읽기 전용 DB 집계로 산출했으며, R36 라이브 HTTP 원문은 없다. 재배포 후 PM이 동일 조작으로 실행 원문을 확인해야 한다.
- 컨테이너 중지·재빌드·재기동, DB INSERT/UPDATE/DELETE, snapshot 신규 저장·복사, 코드 수정은 수행하지 않았다.
- OS 인쇄 대화상자와 실제 프린터 출력은 새로 열지 않았다. 인쇄 데이터 소비 경로가 상세와 동일함을 코드로 추적했다.
- `dev_manager` 외 역할별 화면 차이는 새로 반복하지 않았다. R35에서 확인한 `dev_accountant` 권한 결과를 재검증하지 않았다.
- `MANUAL/SYSTEM_SEED`, `MANUAL/system`, 개발 사용자 생성 `SLIP` 잔재는 원천별로 분리 집계했으며 운영 실데이터라고 단정하지 않았다. 다만 현재 공유 DB의 실제 사용자 조회 경로에 포함되는 도달성은 확인했다.
- CI 실패의 원인과 GitGuardian 대기 내용은 조사하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-04-1001-r37-sol-reconvergence.md`
