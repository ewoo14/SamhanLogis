# R42 시산표 상쇄 및 Playwright 회귀 보고서

## 1. 작업 기준

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1001b`
- 브랜치: `feat/1001-ledger-spec-rest`
- 시작 HEAD: `47b0080de97f67de96fbd82aba85c071aaf442bd`
- 상태: 조사 시작

## 2. 실패 원인 확정

PM 추정은 **틀렸다**. `TrialBalanceService`/`TrialBalanceSummaryService`는
`PartnerLedgerReadService`나 `PartnerLedgerCollectionContract`를 호출하지 않고,
자체 `journal_lines` 조회에서 `POSTED+REVERSED`를 집계한다. 시산표 상쇄는 실제 실행에서도
`110`/`401` 각각 `debitTotal=777`, `creditTotal=777`, `closingBalance` 기초값으로 GREEN이었다.

실패 지점은 같은 테스트의 마지막 `/accounting/journals/ledger-data` 호출이다.
R41이 `AccountingReportController.ledger()`를 `partnerLedgerReadService.read()`로 전환했고,
이 경로의 신규 `PartnerLedgerReadModelService`가 `PartnerLedgerSalesClient`를 통해
`slip-service`를 호출한다. 독립 accounting IT에는 이 client mock이 없으므로
`PARTNER_IDENTITY_LOOKUP_UNAVAILABLE` 502가 발생한다. REVERSED 원분개 필터링 결함이 아니다.

재현 명령:

```text
./gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.it.TrialBalanceControllerIT' --no-daemon --console=plain
...
TrialBalanceControllerIT > 리포트 전층은 REVERSED 원분개와 POSTED 역분개를 함께 읽어 잔액을 상쇄한다 FAILED
    java.lang.AssertionError at TrialBalanceControllerIT.java:307
...
7 tests completed, 1 failed
BUILD FAILED
```

실패 응답 원문:

```text
Request URI = /accounting/journals/ledger-data
Resolved Exception = com.samhanair.logis.common.exception.BusinessException
Status = 502
Body = {"success":false,"code":"PARTNER_IDENTITY_LOOKUP_UNAVAILABLE","message":"판매전표 원장 조회에 실패했습니다","data":null,...}
```

`TrialBalanceControllerIT`의 상쇄 응답 원문(실패 직전)은 다음과 같다.

```text
/accounting/balances: 110 balance=0, 401 balance=0
/accounting/reports/trial-balance/summary: 110 debitTotal=777.00, creditTotal=777.00,
closingBalance=baselineReceivableClosing
```

사용자 지시의 “전제가 틀리면 고치지 말고 중단·보고”에 따라 이 라운드에서는
Spring 생산 코드와 `TrialBalanceControllerIT`를 수정하지 않았다.

## 3. 원장과 시산표 계약 차이

계약 차이를 코드 경계로 확인했다.

| 표면 | 수집/계산 요구 | 현재 경계 |
|---|---|---|
| 거래처 원장 (`partner-ledger`, legacy `ledger-data`) | SALE/PAYMENT/NONE `Effect`로 문서를 접고 기초+기간 채권 잔액 계산. R39 `PartnerLedgerCollectionContract` 사용 | `PartnerLedgerReadModelService` → `PartnerLedgerReadService`; legacy는 `toLegacyLedgerResponse`로 shape만 투영 |
| 시산표 (`balances`, `trial-balance/summary`) | 원분개 `REVERSED`와 역분개 `POSTED`를 모두 읽어 차·대변 총액과 잔액을 상쇄 | `TrialBalanceService`, `TrialBalanceSummaryService`의 journal line 직접 집계 |

새 조합을 열거하면 `SALE + slip-service 정상`은 SALE 문서, `SALE + slip-service 장애`는
현재 원장 전체가 502, `JOURNAL_ONLY + slip-service 정상/장애`는 회계 journal evidence가
원장에 포함되어야 하는 조합, `REVERSED 원분개 + POSTED 역분개`는 시산표에서만 반드시
양쪽을 읽는 조합이다. 특히 `REVERSED`/역분개는 원장에서는 `Effect` 분류의 원천이 되는
journal evidence로 업무 효과를 판단하며, 시산표처럼 단순 상태 제외를 하면 안 된다.
이 라운드에서는 이 조합의 생산 정책을 새로 결정하지 않았다.

## 4. 참조 전수 조사

명령:

```text
rg -l --hidden --glob '!**/build/**' --glob '!**/node_modules/**' --glob '!docs/**' \
  'AccountingReportController|PartnerLedgerReadService|ledger-data' services clients shared qa scripts | Sort-Object
```

그 경로를 타는 소비처 목록:

```text
clients/desktop/playwright/929-r6-normalize-before-judge-real-qa/929-r6-normalize-before-judge-real-qa.spec.ts
clients/desktop/playwright/sp-08-6-5-accounting-daily-ledger/sp-08-6-5-accounting-daily-ledger.spec.ts
clients/desktop/playwright/sp-sas/sp-sas.spec.ts
clients/desktop/src/renderer/api/mock.test.ts
clients/desktop/src/renderer/api/mock.ts
clients/desktop/src/renderer/print/PartnerLedgerView.tsx
clients/desktop/src/renderer/routes/index.tsx
services/accounting-service/src/main/java/.../LedgerSnapshotService.java
services/accounting-service/src/main/java/.../PartnerLedgerReadService.java
services/accounting-service/src/main/java/.../AccountingReportController.java
services/accounting-service/src/main/java/.../LedgerController.java
services/accounting-service/src/main/java/.../TaxInvoiceBatchController.java
services/accounting-service/src/test/java/.../AccountingPermissionControllerIT.java
services/accounting-service/src/test/java/.../HometaxExportPreviewIT.java
services/accounting-service/src/test/java/.../TrialBalanceControllerIT.java
services/accounting-service/src/test/java/.../LedgerSnapshotServiceTest.java
services/accounting-service/src/test/java/.../PartnerLedgerReadServiceTest.java
```

실제 endpoint 소비자는 Desktop `partnerLedgerApi`/`PartnerLedgerView`와
`AccountingReportController.ledger()`이며, `LedgerSnapshotService`도 신규 read service를
소비한다. 시산표 controller/service는 이 원장 경로를 소비하지 않는다.

## 5. RED 원문 및 A/B 판정

### RED-A1 — 시산표/원장 통합 IT

```text
TrialBalanceControllerIT > 리포트 전층은 REVERSED 원분개와 POSTED 역분개를 함께 읽어 잔액을 상쇄한다 FAILED
java.lang.AssertionError: Status expected:<200> but was:<502>
at TrialBalanceControllerIT.java:307
code=PARTNER_IDENTITY_LOOKUP_UNAVAILABLE
message=판매전표 원장 조회에 실패했습니다
```

판정: `B`에 가까운 실제 회귀이나 원인은 시산표 상쇄가 아니다. 사용자 지시에 따라
생산 코드/회귀 테스트 수정 전 중단한다. `TrialBalanceControllerIT` 테스트를 고쳐 통과시키지 않았다.

### RED-A2 — Playwright

첫 실행 명령:

```text
$env:CI='1'; npx playwright test playwright/sp-sas/sp-sas.spec.ts playwright/sp-08-6-5-accounting-daily-ledger/sp-08-6-5-accounting-daily-ledger.spec.ts --reporter=list
```

실패 원문:

```text
1) ... sp-08-6-5-accounting-daily-ledger.spec.ts:76:3 ... T2 BE 원장 계약
Expected substring: "ledgerImageService.getLedger(partnerCode, from, to, parseUuid(userId))"
Received string: ...
1 failed
19 passed
```

판정: `A` — R41 이전 계약을 정적으로 단언한 스펙 드리프트. 해당 스펙의 assertion만
`partnerLedgerReadService.read(partnerCode, from, to)` 및 `toLegacyLedgerResponse`로 갱신했다.

## 6. 종료조건 검증 명령·출력 원문

### 6.1 새 조합 열거

```text
rg -n -C 5 'REVERSED|POSTED|Effect|PartnerLedgerCollectionContract' \
  services/accounting-service/src/main/java/com/samhanair/logis/accounting/service \
  shared/common/src/main/java/com/samhanair/logis/common/ledger
```

결과: `TrialBalanceService`는 `POSTED+REVERSED`, 원장은 `PartnerLedgerCollectionContract`
분류(`SALE/PAYMENT/NONE`)를 각각 사용함을 확인했다. 서로 다른 요구를 같은 상태 필터로
덮지 않았다.

### 6.2 참조 전수

위 §4의 `rg -l ...` 명령 결과가 전체 소비처 목록이다. 핵심 결론은 `ledger-data` 외에도
Desktop print/mock 정적 계약, snapshot, 권한 IT, hometax IT가 `AccountingReportController`
또는 `PartnerLedgerReadService`를 참조하며, `TrialBalanceService`는 소비처 목록에 없다.

### 6.3 영향 테스트

Spring 시산표 재현:

```text
./gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.it.TrialBalanceControllerIT' --no-daemon --console=plain
7 tests completed, 1 failed
BUILD FAILED
```

영향 accounting 단위 + Spring context IT:

```text
./gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest' --tests 'com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest' --tests 'com.samhanair.logis.accounting.it.AccountingPermissionControllerIT' --no-daemon --console=plain
BUILD SUCCESSFUL
```

좁힌 Playwright — `CI=1`로 기존 5173 재사용을 막아 새 Vite 서버를 기동:

```text
$env:CI='1'; npx playwright test playwright/sp-sas/sp-sas.spec.ts playwright/sp-08-6-5-accounting-daily-ledger/sp-08-6-5-accounting-daily-ledger.spec.ts; node scripts/assert-playwright-ran.mjs
20 passed (3.4s)
[guard] expected=20 unexpected=0 skipped=0 flaky=0
```

## 7. 변경·미추적 파일

수정:

- `clients/desktop/playwright/sp-08-6-5-accounting-daily-ledger/sp-08-6-5-accounting-daily-ledger.spec.ts` — A 계약 스펙 갱신
- `docs/dev-reports/2026-08-05-1001-r42-trialbalance-and-playwright.md` — 본 보고서

신규 미추적(시작 전부터 존재, 손대지 않음):

- `clients/desktop/playwright/1001-r14-real-qa-result.json`
- `clients/desktop/playwright/1001-r14-real-qa.mjs`
- `clients/desktop/playwright/1001-r5-ledger-real-qa/`
- `clients/desktop/playwright/1001-r6-ledger-real-qa/`

`git add`/commit/push는 수행하지 않았다. R42는 Playwright A를 닫았지만,
TrialBalance 통합 IT의 502는 사용자 지시상 중단되어 RED-A1이 남아 있다.

추가 R41 응답/UUID 회귀:

```text
npm test -- --run src/renderer/api/partnerLedgerApi.test.ts
Test Files 1 passed (1)
Tests 7 passed (7)
```

최종 위생:

```text
git diff --check
Exit code: 0
```

## 8. 사용자 정정 후 R42 재개 — 확정 원인과 A/B 판정

앞선 §5의 “중단” 기록은 사용자 정정 전 상태다. 사용자가 허용한 범위에 따라
회계 상쇄 단언은 유지하고, 새 slip-service 경계만 IT에 mock 배선했다.

### 8.1 시산표가 slip-service를 부르는지 실측

가설 A(컨트롤러 수준 의존이 시산표까지 전파)는 거짓이다. `TrialBalanceController`와
`TrialBalanceReportController`는 `TrialBalanceService`/`TrialBalanceSummaryService`를
사용하며 `AccountingReportController`나 `PartnerLedgerReadService`를 참조하지 않는다.
따라서 시산표는 slip 식별자 해석을 필요로 하지 않는다.

가설 B(시산표 자체가 slip 식별자를 필요로 함)도 거짓이다. 실제 의존은 다음과 같다.

```text
TrialBalanceController/TrialBalanceReportController
  -> TrialBalanceService/TrialBalanceSummaryService
  -> journal line POSTED + REVERSED 직접 집계

AccountingReportController ledger-data
  -> PartnerLedgerReadService
  -> PartnerLedgerReadModelService
  -> PartnerLedgerSalesClient (slip-service)
```

결론은 A/B 어느 쪽도 아닌 C다. R41이 원장 endpoint에 새 read model을 도입하면서
독립 `TrialBalanceControllerIT`가 같은 Spring context에서 생성한 원장 호출을 함께
검증했고, 그 외부 경계 mock이 빠져 `502 PARTNER_IDENTITY_LOOKUP_UNAVAILABLE`가
발생했다. IT에는 `PartnerLedgerSalesClient`만 빈 결과를 반환하도록 배선했다.
이는 시산표 계산이나 상쇄 단언을 변경하지 않는다.

### 8.2 mock 배선 후 드러난 실제 원장 회귀

mock 배선 직후 502는 사라졌으나 원장 assertion은 2행 대신 1행을 받았다.
원분개의 110 차변에는 `partnerId`가 있지만 401 대변에는 없고, 역분개도 반대
구조이므로 기존 `findPartnerLinesInRange`는 각 전표의 거래처 연결 라인만 반환했다.
그 결과 원분개는 SALE로 읽혔지만 POSTED 역분개는 110 대변만 남아 NONE으로
필터링됐다.

해결은 기존 메서드의 의미를 바꾸지 않고 신규 `findJournalLinesInRangeForPartner`를
추가한 것이다. 거래처 라인이 하나라도 연결된 전표의 모든 라인을 읽어
`PartnerLedgerCollectionContract`에 넘긴다.

```text
원분개(REVERSED 상태 포함): 110 차변 + 401 대변 -> Effect.SALE -> 채권 +777
역분개(POSTED):             110 대변 + 401 차변 -> Effect.PAYMENT -> 채권 -777
원장 legacy projection balance: 0
시산표 POSTED+REVERSED balance: 0
```

즉 원장에서도 REVERSED 원분개와 POSTED 역분개를 모두 읽되, 원장 업무 효과는
SALE/PAYMENT로 분류한다. 시산표의 회계 집계 계약을 원장 계약으로 덮지 않았고,
R39의 `Effect` 분류 및 기초/기간 동일 알고리즘은 유지했다.

## 9. `AccountingReportController` 전 endpoint 의존 전수

```text
GET  /accounting/sales/aggregate
  -> SalesAggregateService -> PartnerLedgerReadModelService -> PartnerLedgerSalesClient
GET  /accounting/journals/ledger-data
  -> PartnerLedgerReadService -> PartnerLedgerReadModelService -> PartnerLedgerSalesClient
POST /accounting/journals/ledger-snapshots
  -> LedgerSnapshotService.capture -> PartnerLedgerReadService -> read model -> slip-service
GET  /accounting/journals/partner-ledger
  -> PartnerLedgerReadService -> PartnerLedgerReadModelService -> PartnerLedgerSalesClient
GET  /accounting/journals/ledger-history
  -> LedgerSnapshotService.history (저장 snapshot read; 신규 read model 호출 없음)
GET  /accounting/journals/ledger-history/{batchNo}/restore
  -> LedgerSnapshotService.restore (저장 snapshot read; 신규 read model 호출 없음)
POST /accounting/journals/ledger-history/{batchNo}/copy
  -> LedgerSnapshotService.copy (저장 payload 복사; 신규 read model 호출 없음)
기타 sales 외 aggregate, statements, hometax-export, closings endpoint
  -> 각 전용 service; PartnerLedgerReadService 호출 없음
```

따라서 `ledger-data` 외에 `/sales/aggregate`, `/ledger-snapshots`,
`/partner-ledger`도 새 read model을 타며, 이 네 endpoint는 slip-service 가용성
계약을 공유한다. 시산표 두 endpoint는 이 목록 밖이다. 보고서/원장 경계가 다시
섞이지 않도록 신규 전체 전표 bundle query와 별도 IT mock 경계를 명시했다.

## 10. R42 최종 종료 조건 — 명령·출력 원문

### RED-A1: TrialBalanceControllerIT

```text
./gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.it.TrialBalanceControllerIT' --no-daemon --console=plain
...
> Task :services:accounting-service:test
BUILD SUCCESSFUL in 42s
```

상쇄 assertion을 약화하거나 삭제하지 않았다. 실패 원문은 §5의 초기 502 및 §8.2의
1행 회귀로 보존되어 있고, 최종 구현은 두 단계를 모두 닫았다.

### RED-A2: Playwright 좁힌 mock 회귀 gate

```text
$env:CI='1'; npx playwright test playwright/sp-sas/sp-sas.spec.ts playwright/sp-08-6-5-accounting-daily-ledger/sp-08-6-5-accounting-daily-ledger.spec.ts; node scripts/assert-playwright-ran.mjs
Running 20 tests using 2 workers
20 passed (3.3s)
[guard] expected=20 unexpected=0 skipped=0 flaky=0
```

실패 스펙은 R41 이전 `ledgerImageService.getLedger(...)`를 요구하던 T2였고,
새 계약의 `partnerLedgerReadService.read(...)`와 `toLegacyLedgerResponse`를
단언하도록만 갱신했다. Playwright 구현 변경은 없다.

### RED-B1: R41/R39 영향 및 Spring context IT

```text
./gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest' --tests 'com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest' --tests 'com.samhanair.logis.accounting.it.AccountingPermissionControllerIT' --no-daemon --console=plain
BUILD SUCCESSFUL in 21s

./gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.PartnerLedgerCollectionContractTest' --tests 'com.samhanair.logis.accounting.service.SalesAggregateServiceTest' --tests 'com.samhanair.logis.accounting.it.TrialBalanceControllerIT' --no-daemon --console=plain
BUILD SUCCESSFUL in 33s

npm test -- --run src/renderer/api/partnerLedgerApi.test.ts
Test Files 1 passed (1)
Tests 7 passed (7)

git diff --check
Exit code: 0
```

위 실행으로 collection/read service, R39 분류, sales aggregate, TrialBalance
상쇄, Spring context 로드, UUID 비노출 원장 API 회귀 범위를 확인했다. 커밋은 하지
않았다.

## 11. 최종 변경·미추적 파일

수정:

- `services/accounting-service/src/main/java/.../JournalLineRepository.java` — 거래처 연결 전표 전체 라인 조회 계약 추가
- `services/accounting-service/src/main/java/.../PartnerLedgerReadModelService.java` — 신규 bundle query 사용
- `services/accounting-service/src/test/java/.../TrialBalanceControllerIT.java` — slip-service client mock 배선만 추가
- `services/accounting-service/src/test/java/.../PartnerLedgerReadModelServiceTest.java` — 신규 repository 계약에 맞춘 fixture
- `clients/desktop/playwright/sp-08-6-5-accounting-daily-ledger/sp-08-6-5-accounting-daily-ledger.spec.ts` — R41 신규 계약 정적 assertion
- `docs/dev-reports/2026-08-05-1001-r42-trialbalance-and-playwright.md` — 본 보고서

신규 미추적(작업 시작 전부터 존재, 변경하지 않음):

- `clients/desktop/playwright/1001-r14-real-qa-result.json`
- `clients/desktop/playwright/1001-r14-real-qa.mjs`
- `clients/desktop/playwright/1001-r5-ledger-real-qa/`
- `clients/desktop/playwright/1001-r6-ledger-real-qa/`

이 라운드에서 새로 생성한 미추적 파일은 보고서 1개다. `git add`/commit/push는
수행하지 않았다.
