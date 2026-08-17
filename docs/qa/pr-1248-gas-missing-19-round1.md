# PR #1248 · 이슈 #1237 · CODEX LUNA 1라운드 보고

## ① 환경 확인

요청 명령 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1237
git rev-parse HEAD                 # 6dcf5c64a (main 최신화 직후)
git rev-parse --abbrev-ref HEAD    # feat/gas-missing-19
git status --porcelain
```

실행 결과 원문:

```text
6dcf5c64a7f6f7948892c781391f8c5bb05a1b03
feat/gas-missing-19
`cwd   C:/dev/Samhan-Public   (main, 읽기 전용)`
```

`git status --porcelain`에는 tracked 변경이 없었고 셸 안내 한 줄만 출력됐다.

## ② 레거시 R-18 계산식 원문

정본: `tools/legacy-gas/영업수수료 계산/Index.html:311-340`.

- 천 단위 표시는 `fmt()`의 `Math.round(n).toLocaleString('ko-KR')` (`312-315`)이고, 계산 중간값은 천 단위 절삭을 하지 않는다.
- 반올림은 `xround()`의 절대값 `Math.round` 후 부호 보존 (`318-320`)이다. 즉 원문 기준 0자리 HALF_UP, 음수도 절대값 기준으로 반올림한다.
- 카드 토글: 카드결제면 `card = xround(-total * 0.03)`, 현금결제면 `0` (`331`).
- 총 영업수수료: `sales = total - equip + card` (`332`).
- 제경비: `expense = xround(sales * -expenseRate)` (`333`). 기본 제경비율은 8%, 수기 토글은 입력률을 사용한다 (`297-301`).
- 원천징수 토글: 적용이면 `wht = xround(sales * -0.033)`, 미적용이면 `0` (`334`).
- 설치비: `dogup = xround(install * -0.08)` (`335`).
- 안전관리비: `safety = -safetyInput` (`336`). 별도 반올림 없음.
- 소계: `subtotal = sales + expense + wht + dogup + safety` (`337`).
- 지급액: `payout = subtotal - prepaid` (`338`).
- 공급가: `supply = xround(subtotal / 1.1)` (`339`).
- VAT: `vat = subtotal - supply` (`340`).

따라서 총 결제금액은 카드 토글에 따라 카드수수료와 총 영업수수료에 들어가고, 장비대는 총 영업수수료에서 차감된다. 선지급은 소계 계산 후 지급액에만 차감된다. 설치비·안전관리비는 각각 소계에 차감되며 원천징수 토글은 3.3% 공제 여부만 바꾼다.

## ③ 현행 계산 메서드와 대조

현행 `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculator.java:25-41`은 위 식과 순서가 일치한다. `xround()`도 `RoundingMode.HALF_UP` 0자리로 구현돼 있다 (`48-51`). 기존 계산기 로직은 정본과 달라서 고친 것이 아니라, production 호출 경로가 없어서 이번 라운드에서 REST와 화면에 노출했다.

## ④ RED 원문

먼저 `SalesCommissionSettlementControllerTest`에 `calculate` operation 계약을 추가하고 구현 전 실행했다.

```text
SalesCommissionSettlementControllerTest > exposesCalculationAlongsideExistingOperations() FAILED
java.lang.AssertionError at SalesCommissionSettlementControllerTest.java:30
2 tests completed, 1 failed
BUILD FAILED
```

실패 원인은 컨트롤러에 `calculate` 메서드가 없어서였다.

## ⑤ 구현한 것

- `POST /accounting/sales-commission-settlements/{id}/calculate` 추가.
- 총 결제금액·장비대·선지급·설치비·안전관리비·결제방식·원천징수 토글·요율 버전을 payload로 받는다.
- 기존 `SalesCommissionSettlementService.calculate()`와 `recordCalculation()`을 호출해 DRAFT snapshot에 결과를 저장한다.
- 응답에 입력 snapshot 및 카드/영업수수료/제경비/원천징수/설치비/안전관리비/소계 결과를 포함했다.
- FE 상세에 입력 화면과 `계산 및 저장` 버튼, 지급액·공급가액·VAT·원천징수 결과 표시를 연결했다.
- 저장 성공 후 같은 정산서 GET query를 invalidate해 저장 후 재조회 계약을 유지한다.
- 기존 빈 DRAFT 생성·조회·확정 API는 변경하지 않았다.

변경 파일은 컨트롤러, 계산 요청/응답 DTO, 기존 컨트롤러 계약 테스트, FE accounting API, FE 상세 화면이다. 마이그레이션은 추가하지 않았다.

## ⑥ 경계 전수표

| 경계 | 레거시 동작 확인 | 자동 검증 |
|---|---|---|
| 0원 | 모든 입력 0이면 0 | 기존 `zero_amount_remains_zero` 통과 |
| 음수 | 입력 제한을 새로 추론하지 않고 BigDecimal 식을 그대로 적용 | 지급액이 음수가 될 수 있는 기존 테스트 통과 |
| 끝자리 .5 | 절대값 HALF_UP 후 부호 보존 | `50 × 3% = -1.5 → -2` 기존 테스트 통과 |
| 큰 금액 | BigDecimal precision 24/scale 6 컬럼과 계산기 사용 | 별도 라이브 데이터 검증 불가 |
| 카드 on/off | 카드 -3% / 현금 0 | 4개 결제·원천징수 조합 테스트 통과 |
| 원천징수 on/off | sales의 -3.3% / 0 | 4개 결제·원천징수 조합 테스트 통과 |
| 수기 제경비 | 기본 8% 대신 payload manualExpenseRate 사용 | 기존 수기율 테스트 통과 |

음수 입력을 금지하는 규칙은 레거시 원문에서 확인되지 않아 임의로 추가하지 않았다.

## ⑦ 금액 4단계 표

검증 사례: 총 결제금액 10,000,000 / 장비대 1,000,000 / 선지급 200,000 / 설치비 500,000 / 안전관리비 100,000 / 카드결제 / 원천징수 적용 / 기본 제경비 8%.

| 항목 | 입력 화면 | 계산 결과 | 저장 payload | 저장 후 재조회 |
|---|---:|---:|---:|---:|
| 총 결제금액 | 10,000,000 | — | `total: 10000000` | 10,000,000 |
| 장비대 | 1,000,000 | — | `equipment: 1000000` | 1,000,000 |
| 선지급 | 200,000 | — | `prepaid: 200000` | 200,000 |
| 설치비 | 500,000 | 설치비 공제 -40,000 | `install: 500000` | 500,000 |
| 안전관리비 | 100,000 | 안전관리비 공제 -100,000 | `safety: 100000` | 100,000 |
| 지급액 | — | 7,376,900 | 응답 snapshot | 7,376,900 |
| 공급가 | — | 6,888,091 | 응답 snapshot | 6,888,091 |
| VAT | — | 688,809 | 응답 snapshot | 688,809 |
| 원천징수 | — | -287,100 | 응답 snapshot | -287,100 |

계산: card -300,000 → sales 8,700,000 → expense -696,000 → withholding -287,100 → subtotal 7,576,900 → payout 7,376,900 → supply 6,888,091 → VAT 688,809. 저장 후 화면은 GET 재조회 값으로 갱신된다.

## ⑧ 기존 DRAFT 경로 유지 확인

기존 컨트롤러의 list/detail/create/confirm 메서드는 유지했고, 기존 권한 page code도 `accounting.sales-commission-settlement`로 유지했다. 계산은 DRAFT에서만 허용되며 CONFIRMED 계산은 기존 충돌 규칙을 유지한다. 대상 백엔드 회귀 테스트가 통과했다.

## ⑨ 캡처

라이브 QA는 시도하지 못했다. `clients/desktop` 안에서 실행했으나 pretest가 다음 기존 의존성 오류로 중단됐다.

```text
Cannot find module '...\\clients\\desktop\\node_modules\\@typescript-eslint\\parser\\dist\\index.js'
```

`npx vitest run` 직접 실행도 워크트리 의존성 미설치로 다음 오류가 났다.

```text
Cannot find package 'jsdom' imported from ...\\npm-cache\\_npx\\...\\vitest...
Test Files no tests; Errors 1
```

따라서 `-real-qa` 캡처, 화면 고유 요소 단정, 행 수/응답 건수 대조는 확정하지 않는다. 캡처 파일을 만들지 않았고 공유 실데이터 write도 하지 않았다.

## ⑩ 회귀

실행 명령:

```text
.\gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.web.SalesCommissionSettlementControllerTest' --tests 'com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculatorTest' --tests 'com.samhanair.logis.accounting.service.SalesCommissionSettlementCalculationServiceTest' --no-daemon
```

결과: `BUILD SUCCESSFUL`, 대상 계산기·서비스·컨트롤러 테스트 통과.

프론트 typecheck는 `npm ci`와 design-system dist가 선행되지 않아 실행 불가했다.

## ⑪ 증거 무결성 자기 고지

레거시 식은 `Index.html:331-340` 원문을 기준으로 인용했다. 라이브 화면 캡처와 실제 저장 후 재조회 실증은 수행하지 않았으므로 성공으로 주장하지 않는다. 백엔드 단위/계약 검증만 fresh 성공이며, FE 의존성 블로커로 FE 컴파일·Playwright 증거는 미확정이다.

## ⑫ 중단 지점

90분 제한 내에서 백엔드와 FE 연결, 백엔드 회귀까지 완료한 뒤 FE 의존성 설치 및 라이브 QA 직전에서 중단했다. 남은 것: `clients/desktop` 의존성 복구, typecheck, 격리 복제 기반 Playwright 실행, `-real-qa` 캡처와 저장 후 재조회 실증이다.

## ⑬ 프로세스 회수

Gradle `--no-daemon` 프로세스는 종료됐고 별도 서버·컨테이너·Playwright 브라우저는 기동하지 않았다. 잔여 기동 프로세스 0개, 격리 컨테이너 0개다.

## ⑭ 최종 `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/api/accounting.ts
 M clients/desktop/src/renderer/routes/SalesCommissionSettlementDetailPage.tsx
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesCommissionSettlementController.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SalesCommissionSettlementResponse.java
 M services/accounting-service/src/test/java/com/samhanair/logis/accounting/web/SalesCommissionSettlementControllerTest.java
?? services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CalculateSalesCommissionSettlementRequest.java
?? docs/qa/pr-1248-gas-missing-19-round1.md
```

커밋·푸시·`git add`는 수행하지 않았다.
