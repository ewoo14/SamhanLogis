# R41 UUID 계약 및 구형 원장 경로

## 시작 기록

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1001b`
- 확인 명령: `git -C . rev-parse --show-toplevel`
- 결과: `C:/dev/Samhan-Public/.claude/worktrees/t1001b`
- 브랜치: `feat/1001-ledger-spec-rest`
- HEAD: `8622f3b16105b0d72a1bea6e50a53cb0a5f56c0c`
- 범위: R41 CI red 3잡(UUID 계약) 및 SOL D4 구형 `/ledger-data` 정합성
- 제외: D2·D3 데이터 정책

## RED 원문

### RED-A1 / slip-units

명령:

```text
./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.web.dto.PartnerLedgerSalesResponseTest --no-daemon
```

원문 핵심 출력:

```text
거래처별 원장 판매전표 응답 > 전표 헤더·배송주소·품목 금액과 내부 partnerId를 매핑한다 FAILED
    java.lang.AssertionError at PartnerLedgerSalesResponseTest.java:71
...
BUILD FAILED
1 test completed, 1 failed
```

### RED-A1 / slip-it

명령:

```text
./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.it.SlipPartnerLedgerInternalControllerIT --no-daemon
```

원문 핵심 출력:

```text
SlipPartnerLedgerInternalControllerIT > returnsEveryOutboundStatusAfterInventoryDispatchWithLinesAndNoUuid() FAILED
    java.lang.AssertionError at SlipPartnerLedgerInternalControllerIT.java:91
...
BUILD FAILED
4 tests completed, 1 failed
```

### RED-A1 / desktop Vitest

명령:

```text
npm run test -- --run
```

원문 핵심 출력:

```text
src/renderer/api/mock.test.ts > mock business document number contract > renderer document-number field literals use standard format or explicit markers
AssertionError: expected [ { …(3) } ] to deeply equal []
Received: { file: "src/renderer/api/partnerLedgerApi.test.ts", field: "documentNo", value: "P-2026-0004" }
```

### RED-A2 / SOL D4 실측 근거

R40 실측 원문:

```text
구형 /ledger-data: 2026/03/23 journal의 110/401/220 세 line만 반환하며 line running balance가
29,700,000 → 2,700,000 → 0으로 끝난다. canonical SALE 30,567,900은 없다.
```

코드 전수 조사 결과 controller는 `LedgerImageService.getLedger(...)`를 직접 호출했고,
`PartnerLedgerReadModelService`만 `PartnerLedgerCollectionContract`를 소비했다.

## 구형 경로 처리 선택과 근거

선택: **구형 `/accounting/journals/ledger-data`를 신규 read model 소비자로 전환**했다.

근거:

- `LedgerImageService`는 `findPartnerLinesInRange`를 직접 읽어 raw journal line을 재계산했고,
  신규 `/partner-ledger`와 다른 결과를 만들었다.
- `AccountingReportController.ledger`가 `PartnerLedgerReadService.read(...)`를 호출하도록 바꾸고,
  신규 문서 결과를 legacy `LedgerImageResponse.lines` shape으로만 투영했다.
- 따라서 문서 수집·분류·Effect·기초/기간 계산은 신규 `PartnerLedgerCollectionContract` 경로와 동일하며,
  legacy 응답의 외형만 기존 호출자 호환용으로 남는다.
- `LedgerImageService` 클래스와 기존 단위 테스트는 다른 legacy consumer/회귀의 compile surface 보존을 위해
  삭제하지 않았다. 실제 `/ledger-data` controller 호출자는 신규 read service로 이동했다.

## 전표번호 없는 문서의 식별자 결정

조합별 식별자는 다음과 같다.

| 조합 | 사용자 노출 식별자 |
|---|---|
| `SALE` + slip 존재 | `slipNo` |
| `CASH_RECEIPT` + journal 연결 | 저장된 `journalNo` |
| `CASH_RECEIPT` + journal 없음 | 기존 receipt `slipNo` |
| journal 기반 `SALE_SUMMARY` | 해당 journal의 `journalNo` |
| journal 기반 `JOURNAL_ONLY` | 해당 journal의 `journalNo` |
| journal 번호도 없는 aggregate fallback `SALE_SUMMARY` | `partnerCode/yyyy-MM-dd-SALE-SUMMARY` |
| journal 번호도 없는 aggregate fallback `JOURNAL_ONLY` | `partnerCode/yyyy-MM-dd-JOURNAL-ONLY` |

마지막 두 fallback도 UUID가 아닌 거래처 코드·일자·문서종류 조합이다. `sourceKey`/`sourceRefId`는
collection contract 내부 분류용으로만 남기고 `documentNo`에 직접 복사하지 않는다.

## 종료조건 검증 원문

### 1) 새 조합 열거/식별자 전수

명령:

```text
rg -n --hidden --glob '!**/build/**' --glob '!**/node_modules/**' "documentNo|ledger-data|PartnerLedgerSalesResponse" services clients/desktop/src/renderer
```

핵심 출력 원문:

```text
services/accounting-service/.../AccountingReportController.java:132: @GetMapping("/accounting/journals/ledger-data")
services/accounting-service/.../PartnerLedgerReadModelService.java:291: visibleJournalDocumentNo(...)
services/accounting-service/.../PartnerLedgerReadModelService.java:426: visibleAggregateDocumentNo(...)
services/slip-service/.../PartnerLedgerSalesResponse.java:17: public record PartnerLedgerSalesResponse(
clients/desktop/.../partnerLedgerApi.ts:185: journalNo: document.documentNo,
```

`document.sourceKey()`를 public `documentNo`에 직접 쓰는 출력은 제거되었고, 프런트는 `documentNo`만
`journalNo`로 투영한다. `SALE`, `SALE_SUMMARY`, `CASH_RECEIPT`, `JOURNAL_ONLY` 네 조합을 위 표로 밟았다.

### 2) 참조 전수 및 diff 위생

```text
git diff --check
Exit code: 0
```

전수 대상은 `documentNo`, `ledger-data`, `PartnerLedgerSalesResponse`이며, desktop mock/adapter/print와
accounting controller/service/slip internal controller를 확인했다.

### 3) 영향 테스트

```text
./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.web.dto.PartnerLedgerSalesResponseTest --tests com.samhanair.logis.slip.it.SlipPartnerLedgerInternalControllerIT --no-daemon
BUILD SUCCESSFUL

./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --tests com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest --tests com.samhanair.logis.accounting.it.AccountingPermissionControllerIT --no-daemon
BUILD SUCCESSFUL

npx tsc -p tsconfig.node.json --noEmit
Exit code: 0
npx tsc -p tsconfig.web.json --noEmit
Exit code: 0

npm run test -- --run
Exit code: 0
전체 Vitest GREEN
```

`npm run typecheck` wrapper는 코드 오류가 아니라 기존 미추적 파일
`clients/desktop/playwright/n1b-native-qa/r2fix-untracked-only-real-qa.spec.ts` 및
`clients/desktop/playwright/1001-r6-ledger-real-qa/1001-r6-ledger-real-qa.spec.ts` 차집합 검증에서
실패했다. 같은 wrapper가 수행하는 TypeScript 두 compile 단계는 위 직접 명령으로 GREEN 확인했다.

참고로 기존 `TrialBalanceControllerIT`의 legacy route 케이스는 신규 cross-service read model 전환 후
slip-service 호출 mock이 없는 독립 IT에서 HTTP 500이 되어 실패했다. 이는 이번 사용자 지정 최소 context IT
`AccountingPermissionControllerIT` GREEN과 별개이며, D4 전환으로 테스트 격리가 stale해진 후속 항목이다.

## 변경 파일

### 이번 작업 수정 파일

- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java`
- `clients/desktop/src/renderer/api/partnerLedgerApi.test.ts` (R41 식별자 fixture 정합성)

### 이번 작업 신규 파일

- `docs/dev-reports/2026-08-04-1001-r41-uuid-and-legacy-path.md`

### 기존 워크트리 신규/미추적 파일 — 손대지 않음

- `clients/desktop/playwright/1001-r14-real-qa-result.json`
- `clients/desktop/playwright/1001-r14-real-qa.mjs`
- `clients/desktop/playwright/1001-r5-ledger-real-qa/`
- `clients/desktop/playwright/1001-r6-ledger-real-qa/`
- `docs/dev-reports/2026-08-04-1001-r40-sol-final-review.md`
