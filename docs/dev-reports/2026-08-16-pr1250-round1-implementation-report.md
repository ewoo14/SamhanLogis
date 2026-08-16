# PR #1250 / Issue #1239 — CODEX LUNA 1단계 구현 보고서

## ① 환경 확인

요청된 원문 명령과 결과:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1250
git rev-parse HEAD                 # 93211cb65 (main 최신화 직후)
git rev-parse --abbrev-ref HEAD    # feat/daily-closing-amount-edit
git status --porcelain             # 비어 있어야 한다
```

실행 결과:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1250
git rev-parse HEAD
93211cb65a667212c780de193e80b2c26484c3c6
git rev-parse --abbrev-ref HEAD
feat/daily-closing-amount-edit
git status --porcelain
```

작업 중 마지막 상태는 변경 파일이 있으므로 빈 결과가 아니다. 커밋·푸시·git add는 수행하지 않았다.

## ② RED 원문

먼저 저장 도메인의 수량축 불일치를 재현했다. VAT 포함 단가 105원·수량 2에서 기존 코드는 라인 합계를 먼저 분리하므로 화면 계약과 달랐다.

```text
SlipLineAmountContractTest > VAT포함_단가를_먼저_원단위_반올림한_뒤_수량을_곱한다() FAILED
org.opentest4j.AssertionFailedError at SlipLineAmountContractTest.java:19

SlipLineAmountContractTest > 단가_변경도_저장_후_재조회할_금액을_같은_계약으로_계산한다() FAILED
org.opentest4j.AssertionFailedError at SlipLineAmountContractTest.java:34
18 actionable tasks: 12 executed, 6 from cache
2 tests completed, 2 failed
```

클라이언트 RED 실행은 최초 `npm test`가 기존 pretest의 의존성 누락(`@typescript-eslint/parser`)과 파생물 게이트에서 중단됐다. 의존성을 복구한 뒤 동일 화면 테스트를 Vitest 직접 실행해 27/27 통과시켰다.

## ③ 근원(파일:줄)

- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:282-283, 533-535` — VAT 포함 생성·변경의 계산 진입점을 단일 계산기로 변경했다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java:88-95` — 서버 검증 직후 같은 계산 계약을 실행하고 SlipLine 저장으로 전달한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java:100-108` — 공급가액·부가세·합계 파생값을 감사로그에 함께 남긴다.
- `shared/common/src/main/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculator.java:20` — 단가 선반올림, 단가별 분리, 수량 누적의 공통 Java 계약이다.
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:456-490` — 화면의 단일 계산 함수가 단가별 분리 결과를 수량만큼 누적한다.
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:679-688` — 저장 payload 할인율을 현재 draft의 할인율에서 직접 전송한다.

## ④ 금액 계약 고정

정본은 VAT 포함 단가 기준이다. 단가를 원 단위 HALF_UP으로 먼저 반올림하고, 단가별 공급가액/부가세를 분리한 뒤 수량을 곱한다. `SlipLine` 생성·단가 변경·서버 검증·감사로그가 공통 Java 계산기를 사용하고, 화면과 payload는 같은 순서를 TypeScript로 사용한다.

## ⑤ 경계 전수표

| VAT 포함 단가 | 수량 | 공급가액 | 부가세 | 합계 | 결과 |
|---:|---:|---:|---:|---:|---|
| 0 | 1 | 0 | 0 | 0 | 통과 |
| 5(끝자리 5) | 1 | 5 | 0 | 5 | 통과 |
| 101(홀수 원) | 1 | 92 | 9 | 101 | 통과 |
| 105(끝자리 5) | 2 | 190 | 20 | 210 | 통과 |
| 105(끝자리 5) | 3 | 285 | 30 | 315 | 통과 |
| 999,999,999 | 3 | 2,727,272,724 | 272,727,273 | 2,999,999,997 | 통과 |
| -1(음수) | 1 | - | - | - | IllegalArgumentException/입력 거부 |

수량 1·2·3, 끝자리 5, 홀수 원, 0원, 음수, 큰 금액을 `SlipLineAmountContractTest`에 고정했다.

## ⑥ 금액 4단계 비교표

검증 기준: VAT 포함 단가 105원, 수량 2, 출고가 200원, 할인율 47.5%.

| 단계 | 단가 | 공급가액 | 부가세 | 합계 | 할인율/상태 |
|---|---:|---:|---:|---:|---|
| 편집 전 화면 | 100 | 182 | 18 | 200 | 50% |
| 편집 중 화면 | 105 | 190 | 20 | 210 | 47.5% |
| 저장 payload | 105 | 계약 파생 | 계약 파생 | 계약 파생 | `discountRate: 0.475` |
| 저장 후 재조회 | 105 | 190 | 20 | 210 | 47.5% |

화면과 저장 도메인의 단가·공급가액·부가세·합계가 저장 후 재조회에서 동일해진다.

## ⑦ 잃으면 안 되는 것 유지 확인

- 직접 편집 3열(단가·출고가·할인율)과 계산 전용 열을 유지했다.
- 회계전표가 있으면 상태와 무관하게 수정 거부하는 기존 가드를 유지했다.
- 출고가 원본과 할인율은 payload 및 감사로그 경로에 유지했다.
- 선결제 할인 표기, 구제품 할인율 0.5, 카드 수수료 3% 관련 코드는 건드리지 않았다.
- 금지된 명칭은 추가하지 않았다.
- 운임·절삭을 품목명으로 제외하는 필터를 추가하지 않았다. 서버는 요청 라인을 순서대로 처리한다.
- #1230의 정렬·필터·다중선택 회귀 코드는 이번 라운드에서 변경하지 않았다.
- 금액 편집 허용 상태는 CONFIRMED뿐 아니라 DELIVERED·COMPLETED까지 테스트로 고정했다.

## ⑧ 스크린샷 / 라이브 QA

라이브 스펙은 `clients/desktop/playwright/1250-daily-closing-amount-real-qa/`에 만들었고, headless chromium으로 실행했다. 해시 라우터 경로를 사용했다.

- 시도 1 기동 원문: `CACError: Unknown option \`--host\``
- 시도 2 기동 원문: renderer Vite `http://localhost:5173/` 준비 후 `Error: Electron uninstall`
- `npm rebuild electron` 후 재시도 시 Electron/Vite는 기동했으나 실제 Playwright 페이지는 로그인 화면의 `NETWORK / 업데이트 서버와 연결하지 못했습니다` 상태에 머물렀다.
- Playwright 실패 원문: `Test timeout of 60000ms exceeded.` / `locator.fill: ... waiting for getByTestId('daily-closing-filter-date')`
- 행 수 비교와 금액 4단계 비교는 로그인 화면으로 진입하지 못해 실행 불가했다.
- 저장·편집·PUT payload 요청은 보내지 않았다.
- 실패 캡처: `clients/desktop/test-results/1250-daily-closing-amount--5977b--금액-계약-라이브-화면을-읽기-전용으로-검증한다-chromium/test-failed-1.png`, 37,185 bytes. 로그인 화면과 NETWORK 상태를 육안 확인했다.

## ⑨ 회귀

- targeted slip-service: `SlipLineAmountContractTest` + `DailyClosingAmountUpdateServiceTest` 통과. 마지막 실행 `BUILD SUCCESSFUL`, 11 tests completed.
- desktop DailyClosingPage: Vitest `27 tests`, `1 test file` 통과.
- desktop typecheck: `npm run typecheck` exit 0.
- desktop build: `npm run build` exit 0.
- slip-service 전체: 환경변수 주입 전 184053ms timeout, `SAMHAN_GATEWAY_ATTESTATION` 주입 후에도 244051ms timeout. 전체 회귀는 미완료로 기록한다.
- `git diff --check`: 출력 없음(exit 0).

## ⑩ 증거 무결성 자기 고지

이 보고서는 targeted 테스트와 build/typecheck의 실제 출력, Playwright의 실제 실패 캡처를 구분해 기록했다. 라이브 QA 성공, 전체 slip-service 성공, 저장 후 실제 DB 재조회 성공을 주장하지 않는다. 캡처를 만들기 위해 공유 실데이터에 write하지 않았다.

## ⑪ 프로세스 회수

이 워크트리에서 시작한 Electron/Vite, Playwright, Gradle 프로세스를 명시 PID로 종료했다. 마지막 확인 결과:

```text
REMAINING_W1250_PROCESSES=0
```

다른 워크트리의 프로세스는 건드리지 않았다.

## ⑫ 마지막 `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx
 M clients/desktop/src/renderer/routes/DailyClosingPage.tsx
 M services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateServiceTest.java
?? clients/desktop/playwright/1250-daily-closing-amount-real-qa/
?? services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipLineAmountContractTest.java
?? shared/common/src/main/java/com/samhanair/logis/common/financial/VatInclusiveUnitAmountCalculator.java
```

커밋·푸시·스테이징은 하지 않았다. PM이 이 워크트리 변경을 인계받아 커밋한다.
