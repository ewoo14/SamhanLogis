# D-G5 구현 보고서 — `previous` 월 존재 여부 판별축 확인

작성일: 2026-08-11  
대상: PR #1167 / `clients/desktop` 입출고 분석 수요예측  
상태: **구현 중단 — 사용자 지정 중단 조건 충족**

## 1. 결론

현행 `previous` 배열은 월 점이 없는 달도 `0`으로 미리 채워진다.

```text
clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts:91
const previous = Array(12).fill(0) as number[]
const current = Array(12).fill(0) as number[]
```

따라서 현재 자료 구조에서는 다음 두 상태가 모두 `0`으로 합쳐진다.

```text
전년 해당 월에 거래 점이 없음                 → 0
전년 해당 월에 입고 거래 점은 있으나 출고 0    → 0
```

개발책임자께서 지정하신 조건인 “배열이 미리 0으로 채워져 있으면 고치지 말고 보고”에 해당하므로, 이번 라운드에서는 타입·산출식·소비자·테스트·QA를 변경하지 않았다. `totalPrevious === 0`을 자료 없음 판별에 사용하지도 않았다.

## 2. 백엔드 월 점 생성 확인

확인 파일: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/InOutAnalysisService.java`

```text
57  row.addMonthly(slip.getSlipDate(), slip.getSlipType() == SlipType.INBOUND, line.getQuantity())
129 private void addMonthly(LocalDate date, boolean inbound, int quantity)
130     MonthlyMutable point = monthly.computeIfAbsent(YearMonth.from(date), ignored -> new MonthlyMutable())
131     if (inbound) point.inboundQuantity += quantity
132     else point.outboundQuantity += quantity
```

월 점은 입고·출고 모두 생성된다. 입고만 있는 달은 `inboundQuantity > 0`, `outboundQuantity = 0`인 점으로 응답된다.

응답 DTO도 입고·출고 수량을 함께 전달한다.

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/InOutAnalysisResponse.java:19
MonthlyPoint(int year, int month, int inboundQuantity, int outboundQuantity)
```

즉, 백엔드의 월 점 의미는 개발책임자께서 정정한 설계와 일치한다. 현재 판별 불가의 직접 원인은 백엔드 점 생성이 아니라, 프런트 배열 초기화가 월 점의 부재를 보존하지 않는 것이다.

## 3. 현행 RED-A 원문

현행 산출부:

```text
86  const points = rows.flatMap((row) => row.monthly ?? [])
88  const currentYear = years.at(-1) ?? null
89  const previousYear = currentYear === null ? null : currentYear - 1
91  const previous = Array(12).fill(0) as number[]
92  const current = Array(12).fill(0) as number[]
98  if (point.year === previousYear) previous[point.month - 1] = (previous[point.month - 1] ?? 0) + point.outboundQuantity
113 const forecastRate = totalPrevious > 0 ? totalCurrent / totalPrevious : 1
116 quantity: Math.round((previous[monthIndex] ?? 0) * forecastRate)
```

현행 테스트의 재현 입력은 전년 2·3월과 당년 2·3월만 있다.

```text
전년: 2월 10, 3월 20
당년: 2월 20, 3월 30
마지막 당년 출고월: 3월
forecastRate: (20 + 30) / (10 + 20) = 1.666...
```

예측 4~12월은 전년 월 점이 없다. 그러나 `previous`가 `fill(0)`이므로 각 월은 `0`이고, 현재 테스트는 다음 숫자를 고정한다.

```text
inoutAnalysisModel.test.ts:118-121
[
  { month: 4, quantity: 0 }, { month: 5, quantity: 0 }, { month: 6, quantity: 0 },
  { month: 7, quantity: 0 }, { month: 8, quantity: 0 }, { month: 9, quantity: 0 },
  { month: 10, quantity: 0 }, { month: 11, quantity: 0 }, { month: 12, quantity: 0 },
]
```

이는 RED-A의 현행 원문이다. 동시에 전년 입고만 있고 출고가 0인 달도 동일한 `0`이 되므로 RED-B의 핵심 구분을 현재 배열만으로는 표현할 수 없다.

## 4. `forecast` 소비자 전수 확인

`git grep -n -I -E 'forecast|Forecast' -- clients/desktop` 결과에서 회계 수금예측 계약을 제외하고 입출고 분석 예측의 `forecast` 소비자는 다음과 같다.

| 파일 | 사용 지점 | 현재 null 수용 상태 |
|---|---|---|
| `inoutAnalysisModel.ts:55` | `forecast: { month: number; quantity: number }[]` | `number`만 허용 |
| `inoutAnalysisModel.ts:114-116` | 예측 배열 생성 | 현재 항상 숫자 생성 |
| `inoutAnalysisModel.test.ts:118-121` | 예측 결과 기대값 | 현재 `0` 숫자 기대 |
| `InOutAnalysisPage.tsx:71` | 예측 표 셀의 `number(point.quantity)` | number 전용 함수라 null 미수용 |

추가 확인:

- 입출고 분석 예측에 대한 합계 계산은 없다.
- CSV/엑셀 내보내기 소비자는 없다.
- 차트 소비자는 없다.
- `clients/desktop/src/renderer/api/accounting.ts`와 `CollectionPlanPage.tsx`의 `forecast`는 회계 수금예측의 별도 계약이며 본 변경 범위가 아니다.

## 5. 표시 관례

입출고 분석 화면은 숫자 미산출·미존재 값에 `—`를 사용한다.

```text
InOutAnalysisPage.tsx:70  previousYear ?? '—', currentYear ?? '—'
InOutAnalysisPage.tsx:83  purchaseAmount === null ? '—' : ...
InOutAnalysisPage.tsx:83  profitAmount === null ? '—' : ...
inoutAnalysisModel.ts:78  profitRate === null ? '—' : ...
```

따라서 재개 시 `quantity: null`은 표의 숫자 칸에서 `—`로 표현해야 하며, 긴 문장을 셀에 넣으면 안 된다. 이번 라운드에는 표시 변경을 적용하지 않았다.

## 6. 조합표 — 현재 판별축의 한계

| 조합 | 현재 배열 값 | D-G5 월별 `undefined` 판별 가능 여부 |
|---|---:|---|
| 전년 전무 | 모든 월 `0` | **불가** — `fill(0)`이 부재를 제거 |
| 전년 일부 달만 거래 있음 | 거래 월은 숫자, 나머지는 `0` | **불가** — 입고-only 월과 부재 월 모두 `0` |
| 전년 거래 있고 출고 0 | 해당 월 `0` | **불가** — 부재 월과 동일 |
| 전년 정상 | 출고 수량 숫자, 나머지 `0` | **불가** — 월 존재성은 배열에서 소실 |
| 당해만 있음 | `previousYear`는 연도 값, `previous`는 전부 `0` | **불가** — `previousYear === null`만으로는 전년 거래 없음과 구분되지 않음 |
| 둘 다 없음 | `previousYear === null`, forecast 빈 배열 | 전년도 전체 부재는 표현 가능하지만 월별 판별 대상 자체가 없음 |

## 7. 불변식 확인

이번 라운드에는 생산 코드 변경이 없으므로 다음 항목은 현행 상태 그대로 보존됐다.

- `forecastRate` 계산식: `totalPrevious > 0 ? totalCurrent / totalPrevious : 1`
- `trend`, `top3`, `bottom3`, `recommendations`
- `previousYear`, `currentYear`
- 기존 숫자 예측값
- 입출고 분석 모델 테스트 원문

다만 RED-B를 충족하려면 먼저 월 점 존재성을 유지하는 배열 표현 또는 동등한 별도 존재성 축을 결정해야 한다. 이 보고서는 그 결정을 대신하지 않는다.

## 8. 테스트·라이브 QA 상태

새 워크트리에서 `clients/desktop/node_modules`와 Electron/Vite 산출물 존재 여부를 확인해야 하나, 배열 초기화 중단 조건이 먼저 충족되어 이번 라운드에는 `npm install`, 테스트 실행, Playwright Chromium 설치/실행을 진행하지 않았다. 따라서 `docs/qa/2026-08-11-dg5/`에는 이번 라운드 스크린샷을 생성하지 않았다.

코드 및 `package-lock.json`은 변경하지 않았다. 다음 구현 라운드에서 월 존재성 표현 방식이 확정된 뒤에만 의존성 설치·RED-GREEN 테스트·입출고 분석 라이브 QA를 진행한다.

---

# 3차 구현 결과 — 별도 존재성 축 반영

작성일: 2026-08-11  
대상: PR #1167 / `clients/desktop` 입출고 분석 수요예측  
상태: **구현·단위 검증·라이브 QA 완료**

## 9. 확정 설계 반영 지점

생산 계산은 `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts`에만 최소 변경했다.

| 지점 | 반영 내용 | 기존 산식 영향 |
|---|---|---|
| `LegacyAnalysis.forecast` | `quantity: number \| null` 계약으로 확장 | 타입만 확장 |
| `deriveLegacyAnalysis` 배열 초기화 | `previous`·`current`의 `Array(12).fill(0)` 유지 | 기존 월 집계 보존 |
| points 순회 | `previousHasData = Array(12).fill(false)` 추가, `point.year === previousYear`일 때 해당 월을 `true`로 기록 | `previous` 누적식 그대로 유지 |
| forecast 산출 | `previousYear !== null && previousHasData[monthIndex]`일 때만 기존 `Math.round(previous × forecastRate)`, 아니면 `null` | `forecastRate` 식 불변 |
| 화면 숫자 소비자 | `number(number \| null)`에서 `null`을 `—`로 표시 | 합계·변환 없음 |

금지 조건 확인:

- `totalPrevious === 0`은 자료 없음 판별에 사용하지 않았다.
- `forecastRate = totalPrevious > 0 ? totalCurrent / totalPrevious : 1`을 변경하지 않았다.
- `trend`, `top3`, `bottom3`, `recommendations`, `previousYear`, `currentYear`를 변경하지 않았다.
- `previous`·`current`를 sparse 배열로 바꾸지 않았다.

## 10. forecast 소비자 null 수용 판정

입출고 분석 예측 계약에 대한 소비자를 다시 전수 확인했다. 회계 수금예측의 별도 `forecast` 계약은 제외했다.

| 소비자 | 위치 | `null` 수용 | 판정·조치 |
|---|---|---:|---|
| 반환 타입 | `inoutAnalysisModel.ts:55` | 예 | `quantity: number \| null`로 확장 |
| 예측 생성부 | `inoutAnalysisModel.ts:114-126` | 예 | 존재성 없는 월만 `null` 반환 |
| 예측 회귀 테스트 | `inoutAnalysisModel.test.ts:118-168` | 예 | 부재 월 `null`, 입고-only `0`, 자료 있는 월 숫자 고정 |
| 화면 예측 표 | `InOutAnalysisPage.tsx:24, 71` | 예 | 공용 숫자 표시 함수가 `null → —` 처리 |
| 합계 계산 | 입출고 분석 소비자 없음 | 해당 없음 | `null`을 더해 `NaN`이 되는 경로 없음 |
| 차트·CSV/엑셀 내보내기 | 입출고 분석 소비자 없음 | 해당 없음 | 추가 조치 없음 |
| `CollectionPlanPage`의 회계 forecast | 별도 API/타입 | 범위 외 | 본 변경에 포함하지 않음 |

화면 표에는 긴 문장을 넣지 않고 기존 빈 값 관례인 `—`만 사용했다.

## 11. RED 원문 및 GREEN

### RED-A / RED-B 재현 원문

생산 코드 변경 전, 기대값만 `null`로 바꾼 targeted 테스트를 실행했다.

```text
FAIL ... 레거시 수요예측 규칙은 마지막 당년 출고월 이후를 전년 월량×증감률로 산출한다
AssertionError: expected [ { month: 4, quantity: +0 }, …(8) ] to deeply equal [ { month: 4, quantity: null }, …(8) ]
- Expected: quantity: null
+ Received: quantity: 0

FAIL ... 전년도가 없는 분석은 모든 예측 수량을 null로 반환한다
AssertionError: expected [ { month: 1, quantity: +0 }, …(11) ] to deeply equal [ { month: 1, quantity: null }, …(11) ]
- Expected: quantity: null
+ Received: quantity: 0
```

즉 현행 `fill(0)` + `Math.round((previous[monthIndex] ?? 0) * forecastRate)`가 자료 없음과 실적 0을 모두 숫자 `0`으로 내보내는 것을 먼저 재현했다.

### 수정 전후 숫자 대조

| 입력 조합 | 수정 전 | 수정 후 | 판정 |
|---|---:|---:|---|
| 전년 4월 입고 3, 출고 0; 당년 3월 출고 2 | 4월 `0` | 4월 `0` | 입고-only 월의 존재성 보존, RED-B 통과 |
| 전년 5월 출고 10; 당년 3월 출고 20 | 5월 `10` (`forecastRate=1`) | 5월 `10` | 기존 숫자 완전 동일 |
| 전년 점이 없는 6~12월 | 각 월 `0` | 각 월 `null` | RED-A 통과 |
| 기존 회귀 입력: 전년 2월 10·3월 20, 당년 2월 20·3월 30 | 4~12월 각 `0`, `forecastRate=1.666...` | 4~12월 각 `null`, `forecastRate=1.666...` | rate와 true-data 산식 불변 |

## 12. 조합표

| 조합 | `previousYear` | `previousHasData` | forecast 결과 |
|---|---:|---|---|
| 전년 전무(당년 점은 있음) | 연도 값 | 12개월 모두 `false` | 전 항목 `null` |
| 전년 일부 달만 거래 | 연도 값 | 거래 점이 있는 월만 `true` | 존재 월은 기존 숫자, 나머지는 `null` |
| 전년 거래 있고 출고 0 | 연도 값 | 해당 월 `true` | 해당 월 `0` |
| 전년 정상 | 연도 값 | 해당 거래 월 `true` | 해당 월은 기존 식과 동일한 숫자 |
| 당해만 | 연도 값 | 12개월 모두 `false` | 전 항목 `null` |
| 둘 다 없음 | `null` | 판별 대상 없음 | `previousYear === null` 가드로 전 항목 `null` |

`previousYear === null`인 빈 입력은 1~12월 전부 `null`을 반환하는 테스트로 고정했다. `previousYear`가 연도 값이지만 전년 점이 없는 당해-only 입력도 `previousHasData`가 모두 `false`이므로 동일하게 `null`이다.

## 13. 테스트·라이브 QA 결과

### 의존성·파생물 준비

새 워크트리에서 다음을 실행했다.

```text
clients/desktop: npm install
clients/web/design-system: npm install && npm run build
clients/desktop: npm run build
```

`npm install` 후 변경된 `clients/desktop/package-lock.json`은 원상 복구했고, 최종 확인 결과 `LOCKFILE_CHANGED=none`이다.

### 테스트 결과

```text
npx vitest run src/renderer/routes/warehouse/inoutAnalysisModel.test.ts
Test Files  1 passed (1)
Tests       14 passed (14)

npm test -- --reporter=dot
Test Files  244 passed (244)
Tests       2140 passed | 1 skipped (2141)
EXIT_CODE=0

npm run typecheck
EXIT_CODE=0
real-QA typecheck 자체 검사: 50 passed, 0 failed
```

첫 `npm test` 시도는 코드 오류가 아니라 새 워크트리 파생물 가드에서 중단됐다.

```text
[로컬 파생물 신선도 확인 실패]
- file: 의존 design-system dist이(가) 없습니다: ..\web\design-system\dist\index.d.ts
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다
```

### Playwright headless Chromium 실측

Chromium 설치 명령을 실행한 뒤, 데스크톱 Vite renderer와 API fixture를 연결한 headless Chromium으로 `/inventory/inout-analysis`를 열었다. 최종 실행 결과:

```text
npx playwright test ...dg5-inout-analysis-live-qa.spec.ts ... --project=chromium --reporter=line
1 passed (4.5s)
```

실측 화면 확인:

- 수요예측 4월 `0`, 5월 `10`, 6~12월 `—`.
- 전년·당년 출고 추이, Top 3·Bottom 3, 추천·알림, 품목 목록이 함께 렌더링됨.
- 캡처: `docs/qa/2026-08-11-dg5/inout-analysis-forecast-null.png`

라이브 QA 과정에서 발생한 환경·테스트 조정 원문도 기록한다.

```text
1차: No tests found — 기존 playwright.config.ts가 **/manual/**을 testIgnore함.
2차: Unexpected Application Error — (query.data ?? []).map is not a function
     mock의 기존 GET /slips/query 포괄 handler가 입출고 endpoint를 먼저 소비함.
3차: Test timeout of 60000ms exceeded — networkidle이 지속 요청으로 종료되지 않음.
4차: strict mode violation — 헤더 제목과 본문 h1 두 요소가 같은 이름을 가짐.
최종: 1 passed (4.5s)
```

최종 캡처 전용 스펙·config는 임시 파일로 실행 후 제거했다. 저장된 QA 증거는 위 PNG 한 장이다.

구현 코드 반영 후 최종 `npm run build`도 종료 코드 0으로 통과했다. 기존 Vite의 동적 import 경고와 폰트 경로 경고는 출력됐지만 build 실패는 없었다.
