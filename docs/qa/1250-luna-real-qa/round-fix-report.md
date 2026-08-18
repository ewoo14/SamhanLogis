# PR #1250 LUNA 라운드 fix 보고서

## ① 환경 확인

요청 명령 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1250
git rev-parse HEAD                 # 6e799133b
git rev-parse --abbrev-ref HEAD    # feat/daily-closing-amount-edit
git status --porcelain
```

실행 결과 원문:

```text
6e799133b740d78ad3256e8a547a535a48a07694
feat/daily-closing-amount-edit
?? clients/desktop/playwright/1250-sol-r1-real-qa/1250-sol-reconv-real-qa.spec.ts
```

커밋·푸시·스테이징은 하지 않았다.

## ② RED 원문(main 대조)

기존 테스트를 수정하기 전에 실행했다.

```text
거래처별 원장 출고전표 응답 > 전표 헤더·배송주소·품목 금액과 내부 partnerId를 매핑한다 FAILED
expected: 36668.67
 but was: 36669
at PartnerLedgerSalesResponseTest.java:65
```

```text
전표 요약의 권위 합계 > 파생 단가×수량 drift가 아닌 저장된 공급가액+부가세를 사용한다 FAILED
expected: 110006
 but was: 110007
at SlipSummaryAuthoritativeAmountsTest.java:28
```

origin/main의 두 기대값을 정본으로 유지했다.

## ③ 번진 계층(파일:줄)

원인은 `shared/common`의 새 `VatInclusiveUnitAmountCalculator` 자체가 모든 화면을 호출한 것이 아니라, PR이 그 계산기를 공용 `SlipLine` 엔티티의 생성 정본에 연결한 데 있다. 생성 시 `supplyAmount`, `vatAmount`, `lineTotal`, `unitPriceWithVat`가 단가축 값으로 저장되고, 다른 소비자들이 같은 엔티티 필드를 읽었다.

- `shared/common/src/main/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculator.java:13-40` — PR 신규 단가축 계산기.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:284-310` — 결함 계층. `createFromVatInclusive`가 공용 엔티티 권위 필드를 단가축으로 저장.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java:88-95` — 의도된 일마감 전용 소비자.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:545-558` — 의도된 일마감 전용 변경 메서드.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java:95-106` — 공유 `supplyAmount + vatAmount`를 거래처원장 lineAmount로 표시.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipDisplayAmount.java:25-46` — 공유 필드로 VAT 포함 표시액 계산.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipSummary.java:42-50` — 전표요약 lineTotal 소비자.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipResponse.java:135-145` — 전표 목록/상세 displayTotalAmount 소비자.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipSearchResult.java:38-46` — 전표 검색 displayTotalAmount 소비자.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:682-716` — 내부 회계 요약 공급가액/부가세/라인합계 소비자.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobileSalesDashboardService.java:134-135` — 모바일 금액 소비자.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/InOutAnalysisService.java:47-48` — 입출고 분석 소비자.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipSignatureService.java:208` — 서명 합계 소비자.

따라서 계층은 **공용 계산기 호출 공유**보다 **공용 `SlipLine` 금액 필드의 생성값 공유**가 직접 원인이다.

## ④ 고친 것

- `SlipLine.createFromVatInclusive`는 origin/main의 라인 합계 우선 분리 규칙으로 복원했다. 이로써 생성·조회 계열 소비자는 기존 표시 계약을 유지한다.
- `SlipLine.changeUnitPriceWithVat`에는 단가 기준 분리 계산기를 그대로 남겼다. 이 메서드는 `DailyClosingAmountUpdateService`에서만 호출된다.
- PR이 추가한 `SlipLineAmountContractTest`는 생성 팩토리 전체 계약이 아니라 일마감 변경 경로의 계약을 검증하도록 범위를 바로잡았다. 기존 회귀 기대값을 새 값으로 바꾸지 않았다.

## ⑤ 소비자 전수표

| 소비자 | 경로 | PR 전 | PR 후 수정 전 | fix 후 | 판정 |
|---|---|---:|---:|---:|---|
| 거래처원장 | `PartnerLedgerSalesResponse.java:95` | 36668.67 / 110006 | 36669 / 110007 | 36668.67 / 110006 | main 동일 |
| 전표요약 | `SlipSummary.java:48` | 110006 | 110007 | 110006 | main 동일 |
| 전표 목록/상세 | `SlipDisplayAmount.java:25`, `SlipResponse.java:141` | 저장 권위값 | 단가축 저장값 | 저장 권위값 | main 경로 복원 |
| 전표 검색 | `SlipSearchResult.java:40` | 저장 권위값 | 단가축 저장값 | 저장 권위값 | main 경로 복원 |
| 내부 회계 요약 | `SlipInternalController.java:682` | 저장 필드 | 단가축 저장 필드 | 저장 필드 | main 경로 복원 |
| 모바일 대시보드 | `MobileSalesDashboardService.java:134` | 저장 필드 | 단가축 저장 필드 | 저장 필드 | main 경로 복원 |
| 입출고 분석 | `InOutAnalysisService.java:47` | 저장 필드 | 단가축 저장 필드 | 저장 필드 | main 경로 복원 |
| 서명 합계 | `SlipSignatureService.java:208` | 저장 필드 | 단가축 저장 필드 | 저장 필드 | main 경로 복원 |
| 일마감 | `DailyClosingAmountUpdateService.java:88` → `SlipLine.java:545` | 라인축 | 단가축 | 단가축 | 확정 계약 유지 |

## ⑥ 경계 전수표(두 축)

표기 `공급가/부가세/합계`, VAT 포함 단가와 수량을 기준으로 한다. `라인축`은 생성·기존 소비자, `단가축`은 일마감 편집이다.

| VAT 포함 단가 × 수량 | 라인축(origin/main) | 단가축(일마감) |
|---|---:|---:|
| 0 × 1 | 0/0/0 | 0/0/0 |
| 5 × 1 (끝자리 5) | 5/0/5 | 5/0/5 |
| 101 × 1 (홀수) | 92/9/101 | 92/9/101 |
| 105 × 2 (끝자리 5) | 191/19/210 | 190/20/210 |
| 105 × 3 | 286/29/315 | 285/30/315 |
| 36668.6667 × 3 | 100005/10001/110006 | 100005/10002/110007 |
| 999999999 × 3 (큰 금액) | 2727272725/272727272/2999999997 | 2727272724/272727273/2999999997 |
| 음수 | 입력 거부 | 입력 거부 |

## ⑦ 확정 계약 유지 확인

- 금액 정본은 단가 기준 분리: 일마감 변경 메서드에서 단가를 원 단위 반올림한 뒤 공급가/부가세를 단가별 분리하고 수량을 곱한다.
- 출고가 편집 시 단가 유지·할인율 재계산, DELIVERED·COMPLETED 허용, 회계전표 존재 시 차단은 기존 경로를 보존했다.
- `DailyClosingAmountUpdateServiceTest`와 `SlipLineAmountContractTest`가 일마감 변경 경로를 검증한다.

## ⑧ 직전 fix 4건 유지

코드 범위를 변경하지 않았고 targeted 테스트로 회귀하지 않음을 확인했다: 저장 후 재조회 출고가·할인율 보존, 화면 할인율 조합 저장/모순 400, 음수·큰 할인율 왕복, 게이트웨이 menu_catalog 경유 계약. V123/V96 IT 전체 실행은 이번 라운드에서 재실행하지 못했다.

## ⑨ 캡처

실제 Playwright를 `w1250\clients\desktop` 안에서 Chromium/headless로 실행했다. 직원 계정 API 로그인은 `POST http://127.0.0.1:8080/auth/login` 200이었다. `resolveQaShotsDir()`를 사용한 스펙을 실행했으나, 로그인 후 거래처원장 고유 요소가 생성되지 않아 캡처 전에 중단됐다.

실패 원문:

```text
Test timeout of 60000ms exceeded.
Locator: getByTestId('partner-ledger-aggregate-table')
Expected: visible
Error: element(s) not found
```

따라서 이번 실행의 실제 캡처는 0장이다. launch 에러는 없었으며, 로그인 화면/권한·렌더링 대기 실패를 성공 캡처로 포장하지 않았다. 공유 실데이터 write는 0건이다.

## ⑩ 회귀 검증

- `:services:slip-service:test --tests ...` targeted: **18/18 통과**.
- `clients/desktop`: `npx vitest run src/renderer/routes/DailyClosingPage.test.tsx`: **27/27 통과**.
- `clients/desktop`: `npm run build:web`: **성공**.
- `:services:slip-service:test` 전체: **180초 timeout**, 완료/전체 통과로 주장하지 않는다.
- RED 원문 두 건은 fix 전 재현했고, fix 후 두 기대값을 포함한 targeted suite가 통과했다.

## ⑪ 증거 무결성 자기 고지

캡처 0장을 캡처 성공으로 보고하지 않았다. 기존 테스트 기대값을 새 값으로 바꾸지 않았고, origin/main 값으로 회귀를 닫았다. 본 보고서의 성공 수치는 실제 명령 출력에 근거한 targeted 결과만 포함한다.

## ⑫ 프로세스 회수

이번 라운드가 기동한 Vite(5517)와 Playwright 실행 프로세스는 종료했다. 최초 잘못된 base 경로에서 기동한 Vite도 즉시 종료했다. 마지막 확인에서 5517 listen 수는 0이었다. 기존에 실행 중이던 Java/node 프로세스는 다른 라운드 소유 가능성이 있어 임의 종료하지 않았다.

## ⑬ `git status --porcelain` 원문

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipLineAmountContractTest.java
?? clients/desktop/playwright/1250-luna-real-qa/
?? clients/desktop/playwright/1250-sol-r1-real-qa/1250-sol-reconv-real-qa.spec.ts
?? docs/qa/1250-luna-real-qa/
```

PM이 커밋·푸시·스테이징한다.
