# PR #1248 라운드 fix 보고서

## ① 환경 확인

요청 명령 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1237
git rev-parse HEAD                 # 3d2c306b7
git rev-parse --abbrev-ref HEAD    # feat/gas-missing-19
git status --porcelain
```

실행 결과 원문:

```text
3d2c306b754747e1ee302fd2216073810ae77696
feat/gas-missing-19
?? docs/qa/pr-1248-sol-adversarial-round1-report.md
```

커밋·푸시·`git add`는 수행하지 않았다. 기존 미추적 SOL 보고서는 보존했다.

## ② 레거시 R-18 입력 항목 전수 vs 화면 대조

정본은 `tools/legacy-gas/영업수수료 계산/Index.html`이다.

| 레거시 원문 | 입력/결과 | 현행 화면 | 대조 |
|---|---|---|---|
| `Index.html:123-128` | 결제방식 카드/현금 토글 | 결제방식 select | 있음 |
| `Index.html:132-133` | 총 결제금액, 장비대 공제 | 같은 2개 입력 | 있음 |
| `Index.html:136-143` | 제경비 8%/수기 토글, 수기 제경비율 | `SalesCommissionSettlementDetailPage.tsx:196-197` | 이번 fix로 복원 |
| `Index.html:145-152` | 원천징수 적용/미적용 토글 | 원천징수 select | 있음 |
| `Index.html:153-156` | 설치비, 산업안전관리비 입력 | 같은 2개 입력 | 있음 |
| `Index.html:158-159` | 선지급, 차인지급액 | 선지급 입력·지급액 결과 | 있음 |
| `Index.html:162-164` | 공급가, 부가세, 합계 | 공급가액·부가세 결과 | 합계는 소계와 동일한 계산 결과 영역으로 보존 |

계산 정본 원문(`Index.html:304-340`): 빈/문자 숫자 변환은 `parseNum`에서 빈 값과 `NaN`을 0으로 처리(`305-309`), 표시 반올림은 `fmt`의 `Math.round(n).toLocaleString`(`311-315`), 중간 계산 반올림은 절대값 기준 `xround`(`317-320`)이다. 계산 순서는 카드 수수료 `331` → 판매금액 `332` → 제경비 `333` → 원천징수 `334` → 설치비 공제 `335` → 안전관리비 `336` → 소계 `337` → 지급액 `338` → 공급가 `339` → VAT `340`이다. 현행 계산기 `SalesCommissionSettlementCalculator.java:25-41`의 순서는 변경하지 않았다. 수기 입력은 레거시 `f_exp_manual`이 퍼센트이므로 화면은 `%`를 받고 `7`을 payload `0.07`로 변환한다.

## ③ RED 원문 5건

RED 테스트는 구현 전에 작성했다. 첫 실행 원문 요약은 다음과 같다.

```text
src/renderer/routes/SalesCommissionSettlementDetailPage.test.tsx (6 tests | 5 failed)
입력값이 바뀌는 즉시 계산 결과를 다시 계산한다 FAILED
레거시의 제경비율 8%/수기 토글과 수기 비율 입력을 제공한다 FAILED
빈 금액은 0으로 보내되 문자는 거부한다 FAILED
18자리 금액은 문자열 정밀도를 그대로 표시한다 FAILED
19자리 금액은 서버로 보내기 전에 명시적으로 거부한다 FAILED
```

실패는 테스트 부재가 아닌 기존 구현의 동작 부재를 가리켰다. 특히 기존 화면은 `계산 및 저장` 버튼을 눌러야만 mutation을 호출했고, 판매비 UI가 없었으며, `amountLabel`이 `Number(value)`를 사용했다.

## ④ 고친 것

- 입력 변경 및 결제/원천징수/제경비 토글 변경 시 현재 입력 snapshot으로 즉시 calculate mutation을 호출한다(`SalesCommissionSettlementDetailPage.tsx:90-127`).
- 레거시 제경비 8%/수기 토글과 수기 제경비율 입력을 복원했다(`:196-197`).
- 빈 금액은 화면에서 `'0'`으로 정규화하고, 문자·소수 7자리 초과·정수부 19자리 이상은 차단한다(`:30-38`).
- 서버 요청 금액을 `BigDecimal` JSON 직접 역직렬화하지 않고 문자열로 받아 빈 값은 0으로 변환한다(`CalculateSalesCommissionSettlementRequest.java:11-32`). `@Pattern`으로 형식 오류와 정수부 19자리 이상을 Bean Validation 단계에서 400으로 거부한다.
- 결과 표시는 `Number()`를 제거하고 문자열 그룹화로 18자리 정밀도를 보존한다(`SalesCommissionSettlementDetailPage.tsx:19-27`). 값의 조용한 반올림은 하지 않는다.

## ⑤ 자릿수 경계 전수표

정수 금액 기준이며 DB 계약 `precision=24, scale=6`에 맞춰 정수부 최대 18자리로 확정했다.

| 정수부 | 화면 입력 | 계산/표시 | payload/서버 |
|---:|---|---|---|
| 15 | 허용 | 문자열 그대로 표시 | 허용 |
| 16 | 허용 | 문자열 그대로 표시 | 허용 |
| 17 | 허용 | 문자열 그대로 표시 | 허용 |
| 18 | 허용 | `999,999,999,999,999,999` 그대로 표시 | 허용 |
| 19 | 18자리 상한 안내 | 계산 호출 안 함 | `@Pattern` 400 |
| 20 | 18자리 상한 안내 | 계산 호출 안 함 | `@Pattern` 400 |

소수는 정수부 최대 18자리·소수부 최대 6자리까지 허용한다. 19·20자리 값을 반올림하거나 잘라서 보내지 않는다.

## ⑥ 금액 4단계 표

대표 계산 입력: 총 결제금액 10,000,000 / 장비대 0 / 선지급 0 / 설치비 0 / 안전관리비 0 / 카드 / 원천징수 적용 / 제경비 8%.

| 금액 | 입력 화면 | 계산 결과 | 저장 payload | 저장 후 재조회 |
|---|---:|---:|---|---|
| 총 결제금액 | 10,000,000 | 판매금액 9,700,000 | `total: "10000000"` | `totalAmount: "10000000"` |
| 장비대 | 0 | 판매금액에서 차감 | `equipment: "0"` | `equipmentAmount: "0"` |
| 선지급 | 0 | 지급액에서 차감 | `prepaid: "0"` | `prepaidAmount: "0"` |
| 설치비 | 0 | 설치비 공제 0 | `install: "0"` | `installInputAmount: "0"` |
| 안전관리비 | 0 | 안전관리비 공제 0 | `safety: "0"` | `safetyInputAmount: "0"` |
| 지급액 | — | 8,603,900 | 응답 snapshot | 8,603,900 |
| 공급가액 | — | 7,821,727 | 응답 snapshot | 7,821,727 |
| VAT | — | 782,173 | 응답 snapshot | 782,173 |

## ⑦ 즉시 재계산 캡처

`clients/desktop` 패키지 안에서 Chromium `headless: true`로 `1248-r2-fix-real-qa` 스펙을 기동했다. 해시 URL과 화면 고유 요소 단정은 스펙에 포함되어 있다. 다만 실제 직원 로그인 후 앱이 아래 URL로 되돌아가 계산 화면에 도달하지 못했다.

```text
Error: expect(page).not.toHaveURL(expected) failed
Expected pattern: not /\/login/
Received string: "http://127.0.0.1:5943/login#/login"
```

따라서 `01-before-input-real-qa.png`, `02-after-input-real-qa.png`는 생성되지 않았다. 이는 Chromium launch 실패가 아니며, 현재 로컬 게이트웨이와 웹 httpOnly 세션 경계의 QA blocker다. 공유 실데이터 POST는 수행하지 않았다. 스펙과 전용 설정 파일명·디렉터리에는 모두 `-real-qa` 접미사를 사용했고, 출력 경로는 `resolveQaShotsDir()`를 경유했다.

## ⑧ 잃으면 안 되는 것 유지

- 계산기 레거시 식과 원 단위 반올림 순서는 변경하지 않았다.
- 권한 컨트롤러와 page code는 변경하지 않았다. 기존 권한 회귀 대상은 이번 diff에서 손대지 않았다.
- 빈 DRAFT 생성·조회·상세·확정 경로는 기존 코드와 테스트를 유지했다.
- 저장 API는 입력 snapshot과 결과 snapshot을 계속 저장하며, 계산 성공 후 상세 GET invalidate 경로를 유지했다.
- UUID를 화면에 표시하지 않았다.

## ⑨ 회귀

성공한 fresh 검증:

```text
clients/desktop: targeted Vitest 2 files / 9 tests passed
services/accounting-service: BUILD SUCCESSFUL
  CalculateSalesCommissionSettlementRequestTest
  SalesCommissionSettlementCalculatorTest
  SalesCommissionSettlementControllerTest
  SalesCommissionSettlementCalculationServiceTest
clients/desktop: npm run typecheck exit 0
real-QA scope contract: 51 tests passed
```

`npm test -- --config vitest.config.ts` 전체 명령은 기존 pretest 파생물 신선도 게이트에서 중단됐다.

```text
[로컬 파생물 신선도 확인 실패]
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다: out\main\index.js. npm run build
```

이는 이번 변경 테스트 실패가 아니며, 전체 Vitest 본체까지 진입하지 못한 blocker로 기록한다. typecheck 출력에는 기존 미추적 로컬 real-QA 스펙 경고가 있었으나 exit code는 0이었다.

## ⑩ 증거 무결성 자기 고지

코드 테스트와 DTO 경계 테스트는 fresh 성공으로 주장할 수 있다. 실제 직원 계정 기반 화면 캡처와 실제 저장 후 재조회는 인증 세션 blocker로 확정하지 않는다. real-QA 스펙은 write route를 격리 응답으로 차단하도록 작성해 공유 실데이터를 변경하지 않는다. 46/46 CI, 실제 권한 역할별 200/403, 실제 저장 재조회 일치는 이 워크트리에서 새로 재검증하지 않았으므로 통과했다고 주장하지 않는다.

## ⑪ 프로세스 회수

이번 라운드에서 기동한 로컬 Vite `127.0.0.1:5943` 프로세스와 자식 `npx/cmd/node`를 PID 기준으로 모두 종료했다. 확인 결과 해당 포트 listener 0개, 이번 스펙의 Chromium 프로세스 0개, 격리 컨테이너 0개다. Docker Desktop의 기존 프로세스와 다른 세션의 프로세스는 건드리지 않았다.

## ⑫ 최종 `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/routes/SalesCommissionSettlementDetailPage.test.tsx
 M clients/desktop/src/renderer/routes/SalesCommissionSettlementDetailPage.tsx
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CalculateSalesCommissionSettlementRequest.java
?? clients/desktop/playwright/1248-r2-fix-real-qa/
?? docs/qa/pr-1248-gas-missing-19-round2-fix-report.md
?? docs/qa/pr-1248-sol-adversarial-round1-report.md
?? services/accounting-service/src/test/java/com/samhanair/logis/accounting/web/dto/CalculateSalesCommissionSettlementRequestTest.java
```

커밋·푸시·`git add`는 수행하지 않았다.
