# PR #1061 R44 거래처 귀속 계약 보완 보고서

- 검증 일자: 2026-08-05 (Asia/Seoul)
- 작업 루트: D:/dev/Samhan-Public/.claude/worktrees/w1061
- 브랜치: feat/1001-ledger-spec-rest
- 착수 HEAD: 65296fe2068c6bd1606935b7a57ed4245b9dcafc
- 범위: R43-D1 다중 거래처 journal 귀속 중복, R43-D2 기초/기간 collection contract 불일치
- 제외: 다중 거래처 journal 생성 차단 정책, 컨테이너 재배포, DB 직접 쓰기, docs/handoff 수정

## 1. SOL 인용과 불변식

R43 SOL 원문:

> CreateJournalLineRequest는 각 line마다 독립 partnerId를 허용한다. JournalService.create()는 서로 다른 partnerId가 한 journal에 들어오는 것을 금지하지 않는다. R42 findJournalLinesInRangeForPartner()는 대상 거래처 line이 하나라도 있으면 그 journal의 **모든 line**을 반환한다. collection contract는 반환된 모든 line의 차변을 더하고, 호출 대상 거래처로 다시 제한하지 않는다.
> 유효한 단일 journal에 110 차변 A=100, 110 차변 B=200, 상대 대변 합계 300이 있으면 A 조회와 B 조회 모두 receivableDebit=300인 SALE로 분류된다. 실제 채권 300이 두 원장 합계 600으로 부푼다.

R43-D2 원문:

> R42는 기간 document 수집만 findJournalLinesInRangeForPartner()로 바꿨다. 기초잔액은 여전히 findPartnerLinesUpTo()로 거래처 연결 line만 읽는다.
> 원분개 110 차변 777(거래처 연결) / 401 대변 777(미연결) 과 역분개 110 대변 777(거래처 연결) / 401 차변 777(미연결) 쌍이 기간 안에 있으면 상쇄되지만, 조회 시작일 이전으로 넘어가면 기초 수집이 110 line 만 보아 원분개는 SALE +777, 역분개는 NONE이 되어 기초가 777로 남는다.

이번 구현은 다음 불변식을 모두 유지하는 방향으로 진행했다.

1. 조회 대상 거래처 line의 금액만 그 거래처 원장에 귀속한다. 다른 거래처 line은 전표에 함께 있어도 금액을 보태지 않는다.
2. 기간과 기초가 모두 “대상 거래처가 연결된 journal의 전체 line”을 수집하고 같은 PartnerLedgerCollectionContract.classify()를 사용한다.
3. 미연결 상대 line(401·현금 등)은 effect 판정에 계속 공급한다. 다중 거래처 journal을 생성 단계에서 금지하지 않는다.

## 2. 원인 진단

R42의 기간 쿼리 변경 자체는 유효했다. 401 대변이나 현금 차변 같은 거래처 미연결 상대 line을 보지 않으면 SALE/PAYMENT과 역분개 상쇄를 판정할 수 없기 때문이다.

문제는 두 가지였다.

- PartnerLedgerReadModelService.journalDocumentsFromContract()가 대상 partner의 journal 전체 line을 Evidence로 만들면서 다른 partnerId line도 실제 debit/credit 금액 그대로 전달했다. 공통 collection contract에는 line 귀속 대상 정보가 없으므로 110 차변 A=100과 B=200이 모두 A·B 분류에 들어갔다.
- openingBalances()는 findPartnerLinesUpTo()를 호출해 대상 partnerId line만 읽었다. 같은 journal의 미연결 401 상대 line이 기초에는 없으므로 기간 조회와 기초 조회의 분류 결과가 달라졌다.

## 3. 양방향 RED — 수정 전

PartnerLedgerReadModelServiceTest에 RED-A 4건과 RED-B 2건을 먼저 추가했다. RED-A는 R42 정상 동작이 그대로 통과해야 하는 묶음이고, RED-B는 결함을 실패로 고정하는 묶음이다.

작성한 테스트:

- RED_A1_singlePartnerJournalSaleRemainsAReceivableSale
- RED_A2_unconnectedCounterLineStillClassifiesTheJournalAsPayment
- RED_A3_openingPlusSalesMinusPaymentEqualsClosing
- RED_A4_aggregateDetailAndPrintPathsExposeTheSameClosingBalance
- RED_B1_eachPartnerOwnsOnlyItsReceivableLinesInOneJournal
- RED_B2_reversalPairBeforePeriodUsesTheSameCollectionContractAsThePeriod

수정 전 실행 원문:

~~~text
> Task :services:accounting-service:test

PartnerLedgerReadModelServiceTest > RED_B1_eachPartnerOwnsOnlyItsReceivableLinesInOneJournal() FAILED
    org.opentest4j.AssertionFailedError at PartnerLedgerReadModelServiceTest.java:442

PartnerLedgerReadModelServiceTest > RED_B2_reversalPairBeforePeriodUsesTheSameCollectionContractAsThePeriod() FAILED
    org.opentest4j.AssertionFailedError at PartnerLedgerReadModelServiceTest.java:472

> Task :services:accounting-service:test FAILED
21 actionable tasks: 2 executed, 19 up-to-date
Note: D:\dev\Samhan-Public\.claude\worktrees\w1061\services\accounting-service\src\test\java\com\samhanair\logis\accounting\service\PartnerLedgerReadModelServiceTest.java uses unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes

18 tests completed, 2 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:accounting-service:test'.
> There were failing tests. See the report at: file:///D:/dev/Samhan-Public/.claude/worktrees/w1061/services/accounting-service/build/reports/tests/test/index.html
~~~

실패 값 원문:

~~~text
expected: 100
 but was: 300

expected: 0
 but was: 777
~~~

RED-A 4건은 수정 전 실행에서 실패 목록에 없었다. 즉 단일 거래처 매출, 미연결 상대 line을 통한 수금 분류, 산식, 집계·상세·인쇄 공통값은 먼저 보존된 상태로 고정됐다. RED-B 2건만 각각 R43-D1과 R43-D2를 재현했다.

## 4. 구현

### 4.1 대상 거래처 귀속 투영

PartnerLedgerReadModelService.journalEvidence()에 대상 partnerId를 전달하도록 바꿨다.

- 모든 journal line은 계속 evidence에 남겨 전표 단위 effect를 판정한다.
- 대상과 다른 partnerId line은 debit/credit을 0으로 투영한다.
- partnerId == null인 401·현금 등 상대 계정은 effect 판정을 위해 실제 금액을 보존한다.
- partnerId == null인 110은 어느 거래처에도 귀속되지 않았으므로 대상 원장 금액에서 0으로 투영한다.

따라서 예시 journal은 A evidence에서 110 차변 100만 실제 금액이고, B의 110 차변 200은 0이다. 401 대변 300은 두 evidence 모두 분류에 남지만 receivableDebit는 각각 100과 200으로 계산된다.

### 4.2 기초/기간 query contract 통일

JournalLineRepository.findPartnerLinesUpTo()를 findJournalLinesUpToForPartner()로 개명하고, 기간 query와 같은 EXISTS 조건을 적용했다.

~~~java
WHERE l.journal.journalDate <= :asOf
  AND l.journal.status IN (POSTED, REVERSED)
  AND EXISTS (
        SELECT linked.id FROM JournalLine linked
        WHERE linked.journal.id = l.journal.id
          AND linked.partnerId = :partnerId)
~~~

openingBalances()도 이 전체 line query를 사용하고, 기간과 같은 귀속 투영을 거쳐 PartnerLedgerCollectionContract.classify()와 PartnerLedgerContract.fold()를 호출한다. 기간 안의 원분개/역분개와 기간 밖의 원분개/역분개가 같은 effect 결과를 낸다.

다중 거래처 journal 생성 차단이나 정책 변경은 하지 않았다.

## 5. RED → GREEN

최종 지정 백엔드 검증 원문:

~~~text
./gradlew :services:accounting-service:test --tests '*PartnerLedger*' --tests '*TrialBalance*'

> Task :services:accounting-service:test

2026-08-05T09:19:32.370+09:00  INFO 23684 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-05T09:19:32.375+09:00  INFO 23684 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown initiated...
2026-08-05T09:19:32.405+09:00  INFO 23684 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown completed.

BUILD SUCCESSFUL in 1m 42s
21 actionable tasks: 2 executed, 19 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes
~~~

최종 데스크톱 영향 테스트는 사용자가 지정한 PowerShell 명령의 &&가 현재 PowerShell 버전에서 파싱되지 않아 동일 작업을 PowerShell 문법으로 실행했다. 명시한 네 영향 파일의 실행 원문은 다음과 같다.

~~~text
npx vitest run src/renderer/api/partnerLedgerApi.test.ts src/renderer/api/partnerLedgerHistory.test.ts src/renderer/print/PartnerLedgerView.test.tsx src/renderer/routes/PartnerLedgerPage.print.test.tsx

 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1061/clients/desktop

 ✓ src/renderer/api/partnerLedgerApi.test.ts (7 tests)
 ✓ src/renderer/api/partnerLedgerHistory.test.ts (4 tests)
 ✓ src/renderer/print/PartnerLedgerView.test.tsx (6 tests)
 ✓ src/renderer/routes/PartnerLedgerPage.print.test.tsx (8 tests)

 Test Files  4 passed (4)
      Tests  25 passed (25)
 Start at 09:19:42
   Duration  4.99s
~~~

사용자 지정 데스크톱 명령의 PowerShell 파서 원문:

~~~text
cd clients/desktop && npx vitest run src/renderer/**/*artnerLedger*
At line:2 char:20
+ cd clients/desktop && npx vitest run src/renderer/**/*artnerLedger*
+                    ~~
The token '&&' is not a valid statement separator in this version.
~~~

PowerShell 이동 문법으로 같은 Vitest positional glob을 재시도한 원문:

~~~text
RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1061/clients/desktop
filter: src/renderer/**/*artnerLedger*
include: src/**/*.test.ts, src/**/*.test.tsx
No test files found, exiting with code 1
~~~

## 6. 자기 표면 닫기 1 — 새 상태·조합 전수

| 조합 | 밟은 경로 | 기대/결과 |
|---|---|---|
| 기초 + 단일 거래처 원분개 | RED_A3, 기초 journal 110/401 | 기초 50 유지 |
| 기간 + 단일 거래처 매출 | RED_A1, TrialBalanceControllerIT 기존 매출/역분개 경로 | SALE 금액 유지 |
| 기간 + 단일 거래처 수금 | RED_A2, 110 대변 + 미연결 102 차변 | PAYMENT 금액 유지 |
| 기초 + 기간 매출 − 기간 수금 + 기말 | RED_A3 | 50 + 100 - 30 = 120 |
| 기간 + 다중 거래처 | RED_B1, partnerLedgerAttributesMultiPartnerJournalByLinePartner | A=100, B=200 |
| 기간 안 원분개/역분개 | TrialBalanceControllerIT.reportsIncludeReversedCompensationPair | 원분개/역분개 110·401 상쇄 |
| 기간 밖 원분개/역분개 기초 | RED_B2, partnerLedgerOpeningUsesFullJournalCollectionContract | 기초 777이 0으로 상쇄 |
| 집계·상세·인쇄 | RED_A4 | 세 경로 closing balance 동일 |

기말은 RED_A3, RED_A4, 두 IT의 closingBalance assertion으로 확인했고, 기간 안/밖 원분개·역분개는 각각 기존 same-period IT와 R44 boundary IT로 분리해 확인했다.

## 7. 자기 표면 닫기 2 — 개명 식별자 전수 조사

워크트리에서 다음 명칭을 검색했다.

~~~text
findPartnerLinesUpTo
~~~

source/test 코드에는 남아 있지 않다. 검색 결과는 수정하지 않은 역사적 보고서 2건의 인용뿐이다.

- docs/dev-reports/2026-08-05-1001-r43-sol-final-review.md
- docs/dev-reports/2026-08-04-1001-r39-collection-contract.md

두 보고서는 해당 라운드의 당시 구현을 기록한 증거 문서이므로 변경하지 않았다. 현재 source/test 식별자는 모두 findJournalLinesUpToForPartner이며, docs/handoff/ 및 다른 트랙 문서는 건드리지 않았다.

## 8. 자기 표면 닫기 3 — 변경 파일 참조 테스트

- PartnerLedgerReadModelService.java 참조: PartnerLedgerReadModelServiceTest의 RED-A/RED-B와 PartnerLedgerReadService 공통 read-model 경로를 실행했다.
- JournalLineRepository.java 참조: 실제 JPA query를 통과하는 TrialBalanceControllerIT의 boundary·multi-partner IT를 추가하고 실행했다.
- TrialBalanceControllerIT.java와 PartnerLedgerReadModelServiceTest.java: 최종 지정 백엔드 명령에 포함해 실행했다.
- 데스크톱 집계·상세·인쇄 영향 파일 4개: Vitest 4 files / 25 tests를 실행했다.
- 생성자·빈 배선은 변경하지 않았다. 별도 생성자 교체로 인한 컨텍스트 장애는 없으며, 그래도 Spring 컨텍스트 IT를 실행해 실제 repository wiring을 확인했다.

## 9. 안 본 것

- ./gradlew :services:accounting-service:test 전체 suite는 5분 제한까지 결과 파일 없이 Gradle test worker가 남아 완료되지 않았다. 해당 실행의 잔류 test worker만 종료했고 공유 Gradle daemon은 종료하지 않았다. 최종 판정은 요청된 *PartnerLedger* + *TrialBalance* 지정 집합과 실제 영향 Vitest 집합에 근거한다.
- 사용자가 준 데스크톱 명령 cd clients/desktop && npx vitest run src/renderer/**/*artnerLedger*은 PowerShell의 && 파서 오류와 Vitest 2.1.9의 해당 positional glob No test files found로 그대로는 테스트를 수행하지 못했다. 실제 파일 4개를 명시한 동등 범위는 통과했다.
- 컨테이너 재배포, 운영 DB 직접 쓰기, 실제 production journal 생성, 다중 거래처 정책 차단 여부는 수행하지 않았다.
- R43가 이미 기록한 운영 데이터 0건 대조, 저장소 밖 외부 소비자, 물리 인쇄 출력은 재검증하지 않았다.

## 10. 최종 판정

R44 불변식 1·2·3을 구현했고, 양방향 RED-B가 각각 300 → 100/200, 777 → 0으로 GREEN이 됐다. R42의 미연결 상대 line을 effect 분류에 공급하는 발견과 집계·상세·인쇄 공통 read model 경로는 유지했다.

머지 trigger는 수행하지 않았다.
