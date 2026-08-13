# D-G5 SOL 5.6 코드 검토 — 입출고 예측 `산출 불가` 표시

작성일: 2026-08-11  
대상: PR #1167 / `feat/dg5-forecast-no-baseline`  
검토 기준: 변경 직전 `a7b94bd25987fbd7a0d5798b4dd999718fcfdd54` ↔ 구현 commit `b69a54c7352be59946167b66e26ee28308d953db`

## 1. 판정

**D-G5 구현 논리 결함 0. 병합 차단 없음.**

별도 월 존재성 축 `previousHasData`는 기존 `previous`·`current` 배열과 산식을 바꾸지 않는다. 동일 입력을 변경 전 함수와 변경 후 함수에 직접 넣어 비교한 결과, 전년 월 점이 있는 forecast 숫자와 `forecastRate`·`trend`·`top3`·`bottom3`·`recommendations`·`previousYear`·`currentYear`가 모두 동일했다. 전년 입고-only·출고 0인 월은 `null`이 아니라 숫자 `0`이었다.

검토 도중 PM 자동 commit이 실행되어 SOL의 임시 수치대조 하네스 `dg5SolNumericComparison.temp.test.ts`까지 `b69a54c73`에 포함됐다. 이 파일은 검토 후 삭제했으며 현재 작업트리에 삭제 상태로 남아 있다. **PM 후속 commit은 이 삭제와 본 보고서·SOL 캡처 2장을 함께 포함해야 한다.** 구현 결함 판정에는 영향을 주지 않지만 삭제를 누락하면 임시 파일이 PR에 남는다.

## 2. 최우선 검증 — 바뀌면 안 되는 숫자

보고서의 서술을 재사용하지 않고, 변경 전 SHA의 실제 `inoutAnalysisModel.ts`를 TypeScript로 실행한 함수와 작업트리 함수를 같은 fixture에 호출했다. 검증 하네스는 산출 후 삭제했다.

### 2.1 혼합 존재성 fixture

입력:

- 전년 1월 출고 10
- 전년 4월 입고-only 12, 출고 0
- 전년 5월 출고 합계 40
- 당년 1월 출고 20, 2월 20, 3월 35
- 순위 모집단: A 70, B 20, C 5, 입고-only 0

| 항목 | 변경 전 | 변경 후 | 판정 |
|---|---:|---:|---|
| `forecastRate` | `7.5` | `7.5` | 동일 |
| forecast 4월, 입고-only | `0` | `0` | 동일 — 핵심 표적 통과 |
| forecast 5월, 정상 전년 점 | `300` | `300` | 동일 |
| forecast 6~12월, 전년 점 없음 | 각 `0` | 각 `null` | 의도된 유일 차이 |
| `previousYear` / `currentYear` | `2025` / `2026` | `2025` / `2026` | 동일 |
| `top3` | `A 70, B 20, C 5` | 동일 | 동일 |
| `bottom3` | `C 5, B 20, A 70` | 동일 | 동일 |
| `recommendations` | `A 발주 권장`, `전반적 수요 상승` | 동일 | 동일 |

`trend` 12개월 전체도 객체 동등 비교했다. 값은 전년 `[10,0,0,0,40,0,0,0,0,0,0,0]`, 당년 `[20,20,35,0,0,0,0,0,0,0,0,0]`으로 변경 전후 같았다.

### 2.2 forecast 대상 전월에 전년 점이 있는 fixture

당년 마지막 출고월을 6월로 두고 전년 7~12월을 모두 실제 월 점으로 만들었다. 8월은 입고만 있고 출고는 0이다.

```text
forecastRate  변경 전 2 / 변경 후 2
forecast      변경 전 [42, 0, 54, 60, 66, 72]
              변경 후 [42, 0, 54, 60, 66, 72]
```

이 fixture에서는 반환 객체 전체를 동등 비교했다. `forecast`, `trend`, `top3`, `bottom3`, `recommendations`, `previousYear`, `currentYear`, `forecastRate` 모두 차이가 0이었다.

### 2.3 당해-only fixture

당년 2월 출고 12만 있는 입력에서는 forecast 3~12월이 변경 전 `0`에서 변경 후 `null`로 바뀌었다. 그 외 필드는 모두 동일했다.

```text
previousYear=2025, currentYear=2026, forecastRate=1
top3=bottom3=CURRENT-ONLY 12
recommendations=CURRENT-ONLY 발주 권장
```

## 3. PM 1차 설계 오류 핵심 표적

다음 입력을 단위 테스트와 브라우저 fixture 양쪽에서 직접 밟았다.

```text
전년 2025-04: inboundQuantity=3, outboundQuantity=0
당년 2026-03: outboundQuantity=25
```

결과:

```text
previousHasData[3] = true
previous[3] = 0
forecast 4월 = Math.round(0 × 1) = 0
화면 4월 = "0"
```

따라서 “거래 점은 존재하지만 출고 실적이 진짜 0”인 월을 `산출 불가`로 오인하지 않는다. `totalPrevious === 0` 또는 `previous[m] === undefined`는 존재성 판별에 사용되지 않았다.

## 4. `null` 소비자 전수조사

`rg`로 `forecast`, `LegacyAnalysis`, `deriveLegacyAnalysis`, `point.quantity`, `inout-analysis`를 `clients/desktop` 전체에서 다시 조사했다. 회계 수금예측 `/accounting/collection-plans/forecast`는 이름만 같은 별도 계약이라 제외했다.

| 소비자 | 좌표 | `null` 처리 | 실제 영향 |
|---|---|---|---|
| 반환 타입 | `inoutAnalysisModel.ts:55` | `number \| null` | 타입 계약 확장 |
| 생성부 | `inoutAnalysisModel.ts:93-125` | 존재 월만 기존 숫자식, 부재 월 `null` | 의도된 변경 |
| 모델 회귀 테스트 | `inoutAnalysisModel.test.ts:118-168` | 부재 `null`, 입고-only `0`, 정상 숫자 단정 | 통과 |
| 화면 표 | `InOutAnalysisPage.tsx:24,69-71` | `null → —`, 숫자는 `toLocaleString` | Chromium 실측 통과 |

다음 소비자는 존재하지 않는다.

- forecast 합계·평균·`reduce`
- forecast 차트
- forecast CSV/엑셀 내보내기
- forecast 숫자 정렬 또는 숫자 필터
- forecast API 재전송·저장

현재 forecast 표는 일반 `<table>`이며 정렬 헤더, `aria-sort`, 필터 입력, 내보내기 버튼이 없다. Playwright에서도 forecast 카드의 `[aria-sort]`와 버튼 수를 각각 0으로 단정했다. 따라서 `—`가 숫자 정렬 순서를 깨거나 `null`이 합계에 들어가 `NaN`을 전파할 현재 경로가 없다.

상단 모델 칩 필터는 forecast 값을 소비하지 않는다. 먼저 원본 `rows`를 거른 뒤 `deriveLegacyAnalysis(visible)`을 다시 호출하므로 `null`의 정렬·필터 의미를 정의하는 표면이 아니다.

## 5. SOL 라이브 QA 재실행

### 5.1 Chromium 실측

```text
npx playwright --version
Version 1.59.1

npx playwright install --dry-run chromium
Chrome for Testing 147.0.7727.15 (playwright chromium v1217)
Install location: C:\Users\user\AppData\Local\ms-playwright\chromium-1217

npx playwright install chromium
EXIT_CODE=0
```

데스크톱 renderer를 별도 Vite 포트에서 실행하고 정확한 입출고 분석 API 응답을 Playwright route fixture로 주입했다. 인증·권한은 MASTER 화면 진입에 필요한 최소 계약만 격리했다. 공유 DB write는 없었다.

최종 실행:

```text
npx playwright test --config=playwright.dg5-sol-review.temp.config.ts \
  --project=chromium-1217 --reporter=line

Running 2 tests using 1 worker
2 passed (5.0s)
EXIT_CODE=0
```

두 테스트 모두 `pageerror=[]`, `requestfailed=[]`를 단정했다. 실행용 임시 spec·config는 제거했다.

### 5.2 캡처

1. `docs/qa/2026-08-11-dg5-sol/01-forecast-mixed-dash-and-numbers.png`
   - forecast 4월 `0`, 5월 `10`, 6~12월 `—`
   - 입고-only 0과 정상 숫자, 산출 불가가 한 화면에 공존
2. `docs/qa/2026-08-11-dg5-sol/02-forecast-all-known-numbers.png`
   - forecast 4~12월 `4, 5, 6, 0, 8, 9, 10, 11, 12`
   - forecast 카드 안 `—` 0개

## 6. 테스트·빌드 재검증

| 명령 | 결과 |
|---|---|
| `npx vitest run src/renderer/routes/warehouse/inoutAnalysisModel.test.ts --reporter=verbose` | 1 file / 14 tests passed |
| `npm test -- --reporter=dot` | exit 0, 244 files / 2140 passed / 1 skipped |
| `npm run typecheck` | exit 0, TypeScript + real-QA 자체검사 50 passed |
| `npm run build` | exit 0, main 7 modules / preload 3 modules / renderer 734 modules |

build의 기존 폰트 경로·동적 import 경고는 출력됐지만 실패는 없었다. `clients/desktop/package-lock.json` 변경은 없다.

전체 수치를 독립 재계수한 JSON reporter 최종 결과도 `success=true`, test result 파일 `244 passed`, 테스트 `2140 passed / 1 pending / 0 failed`, exit 0이었다. 보조 재계수 1차는 같은 `0 failed` JSON을 쓰고도 프로세스만 exit 1을 반환했으나 오류 원문이 없었고, 코드·환경 변경 없이 같은 명령을 즉시 재실행하자 exit 0으로 재현되지 않았다. 공식 `npm test`와 최종 JSON 재계수는 모두 exit 0이다.

## 7. 새로 밟은 조합

| 조합 | 기대 | 실측 |
|---|---|---|
| 전년 입고-only·출고 0 + 당년 출고 있음 | 숫자 `0` | `0` |
| 전년 정상 월 + 당년 출고 있음 | 기존 산식 숫자 | `300`, 변경 전후 동일 |
| 전년 점 없는 forecast 월 | `null` / 화면 `—` | 일치 |
| forecast 대상 전월에 전년 점 존재 | 배열 전체 기존 숫자 | `[42,0,54,60,66,72]`, 완전 동일 |
| 당해-only | forecast만 전부 `null` | 일치 |
| 정상 숫자와 `—` 혼재 | 숫자 보존, 부재만 `—` | Chromium 일치 |
| 정상 숫자만 존재 | `—` 0개 | Chromium 일치 |

## 8. 이 라운드가 보지 않은 표면

- 공유 DB의 실제 `/slips/query/inout-analysis` 응답은 조회하지 않았다. 핵심 입고-only 조합은 결정적 API fixture로 재현했다.
- 패키징된 Electron 창 자체는 열지 않았다. 동일 renderer를 Chromium 1217에서 검증했다.
- 백엔드 서비스 테스트와 DB 집계 구현은 다시 실행하지 않았다. 이번 diff는 데스크톱 3개 파일에 한정되고 백엔드 코드는 바뀌지 않았다.
- forecast 정렬·필터·합계·차트·내보내기는 현재 제품 표면이 없어 동작 검증 대상이 없었다. 향후 추가될 때 `null` 정책을 별도 계약으로 정의해야 한다.
- 모델 칩별 모든 분류 조합을 브라우저에서 클릭하지 않았다. 필터 모델 자체의 기존 단위 테스트는 전체 테스트에서 통과했다.

## 9. PM 전달

구현 로직은 이 라운드 기준 결함 0이다. PM은 다음 네 항목을 한 commit에 포함하면 된다.

1. `dg5SolNumericComparison.temp.test.ts` 삭제
2. 본 SOL 검토 보고서
3. 혼합 `0`·숫자·`—` 캡처
4. 전월 정상 숫자 캡처
