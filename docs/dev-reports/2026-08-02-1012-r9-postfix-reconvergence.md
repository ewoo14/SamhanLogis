# PR #1047 / Issue #1012 R9 — R8 postfix 머지 전 재수렴

## 0. 판정

**증거 게이트 BLOCK — R8 모집단 변경의 누출은 발견하지 못했지만, 필수 실화면 검증을 수행하지 못했다.**

- 코드·`[DEV-SEED]` 재생 판정: **R8 PASS**. `HEAD^`와 HEAD에 같은 실제 시드 행을 넣어 비교했을 때 목록, 월 점, 추이, 수요예측, Top 3, 추천은 동일했고 Bottom 3만 레거시 기대값으로 바뀌었다.
- 화면 판정: **조사하지 않음**. 인앱 브라우저 런타임의 사용 가능 브라우저가 0개였다. API JSON이나 터미널 출력을 화면 증거로 대체하지 않았다.
- 따라서 R8 코드 결함을 새로 찾은 것은 아니지만, 개발책임자가 요구한 월 차원·칩 실화면 증거가 없으므로 이 라운드만으로 머지 승인하지 않는다.

데이터 출처: 이 보고서의 수치는 모두 로컬 PostgreSQL의 **`[DEV-SEED]` 개발 시드**다. `docs/migration/ecount-data/raw/`에 원본 XLSX가 없으므로 **실데이터 수치는 확인 불가/미검증**이며, 시드와 실데이터의 동일성도 판정하지 않는다.

이번 라운드는 제품 코드, Git 브랜치·인덱스·이력, Docker 이미지·컨테이너, 공유 DB를 변경하지 않았다. 작업트리 변경은 이 새 보고서 1개뿐이다. DB 조회에는 `PGOPTIONS=-c default_transaction_read_only=on`을 강제했다.

## 1. 기준 상태와 배포본 나이

- 브랜치/HEAD: `feat/1012-inout-analysis` / `204a039026fc1dbd3b388c51783d29605656b519`
- HEAD 커밋 시각: `2026-08-02 23:51:43 +0900`
- 공유 `samhan-slip-service` 컨테이너 생성 시각: `2026-08-02T04:30:03.970155657Z` = KST `13:30:03`
- 공유 컨테이너는 HEAD보다 약 10시간 21분 오래됐다. 따라서 공유 스택을 R8 배포본으로 간주하지 않았고, 그 API 응답을 화면 증거로 사용하지 않았다.

배포본 나이 확인 원문:

```text
204a03902 2026-08-02 23:51:43 +0900 [FIX] #1012 순위 모집단을 레거시와 일치 — Bottom 3 가 입고 전용 모델을 빼도록
container_created=2026-08-02T04:30:03.970155657Z
started=2026-08-02T04:30:05.930178495Z
```

## 2. 1순위 — 모집단 변경이 다른 지표로 샜는가

### 2.1 데이터 흐름 추적

R8의 제품 코드 변경은 `deriveLegacyAnalysis()` 안의 `sorted` 생성부 한 곳이다.

```ts
const sorted = [...aggregate.values()]
  .filter((row) => row.outboundQuantity > 0)
  .sort((a, b) => b.outboundQuantity - a.outboundQuantity)
```

이 값의 직접 소비자는 `top3`, `bottom3`, 그리고 `top3[0]`을 사용하는 추천뿐이다.

- 목록: 페이지의 `visible = filterInOutRows(rows, selected)`가 별도로 결정한다. `sorted`를 소비하지 않는다.
- 월 점수: `visible`의 `monthly[]` 길이를 합산한다. `sorted`를 소비하지 않는다.
- 추이·수요예측: `sorted`를 만들기 전에 `rows.flatMap(row.monthly)`에서 계산한다.
- 추천: Top 1을 소비하므로 잠재 영향 경로는 있다. 하지만 양수 출고 모델이 하나라도 있으면 0출고 모델은 기존에도 Top 1이 될 수 없다. 현재 시드의 Top 1과 추천은 R8 전후 동일하다. 양수 출고 모델이 0개인 경계에서만 기존의 가짜 0출고 모델 추천이 `특이사항 없음`으로 바뀌며, 이것이 레거시 동작이다.

### 2.2 같은 `[DEV-SEED]`의 HEAD^ 대 HEAD 직접 비교

화면 기본 기간 `2025-01-01`~`2026-12-31`, 활성 전표·라인, 전표 상태 `CONFIRMED|DELIVERED|COMPLETED`를 SQL로 읽어 두 버전의 실제 `withProfitFields()`와 `deriveLegacyAnalysis()`에 동일하게 재생했다. fixture·mock·합성 행은 만들지 않았다.

```text
DATA_SOURCE=[DEV-SEED]
LIST_ROWS_HEAD=61 LIST_ROWS_PRE=61 ZERO_OUTBOUND_ROWS=15
MONTHLY_POINTS_HEAD=79 MONTHLY_POINTS_PRE=79
TREND_COUNTS_HEAD=12 PRE=12 EQUAL=true
FORECAST_COUNTS_HEAD=9 PRE=9 EQUAL=true
TOP_HEAD=18,18,12 TOP_PRE=18,18,12 EQUAL=true
BOTTOM_HEAD=1,1,2 BOTTOM_PRE=0,0,0
RECOMMENDATIONS_HEAD=1 PRE=1 EQUAL=true
REC_HEAD=TEST-MODEL-0070 발주 권장
```

판정: **다른 지표로 새지 않았다.** 시드 61행 중 15개 0출고 모델을 순위에서만 제외했고, 목록 61행·월 점 79·추이 12·예측 9·Top 3·추천 1은 R8 전후 동일하다. 변경된 것은 Bottom 3뿐이다.

## 3. 각도 2 — Top 3·Bottom 3 및 경계의 레거시 대조

### 3.1 레거시 재현 원문

`tools/legacy-gas/입출고 분석/Index.html:388-393`:

```js
var sorted = Object.keys(outCounts).sort(function(a, b) {
  return outCounts[b] - outCounts[a];
});

var topRank = sorted.slice(0, 3);
var bottomRank = sorted.slice(-3).reverse();
```

`outCounts`의 키는 같은 파일 `:350-358`에서 출고 행을 순회할 때만 만들어진다. 또한 `Code.js:174`는 수량이 `<= 0`인 원천 행을 제거한다. 현행 `slip_lines`에도 `quantity > 0` CHECK가 있다. 따라서 현재 데이터 계약에서 `outboundQuantity > 0`은 레거시 `Object.keys(outCounts)`와 같은 출고 모델 모집단이다.

### 3.2 시드 실측

| 항목 | `[DEV-SEED]` R8 전 | `[DEV-SEED]` HEAD | 실데이터 |
|---|---:|---:|---|
| 순위 모집단 | 61행(0출고 15행 포함) | 46행(양수 출고만) | 원본 부재로 미검증 |
| Top 3 수량 | `18 · 18 · 12` | **`18 · 18 · 12`** | 원본 부재로 미검증 |
| Bottom 3 수량 | `0 · 0 · 0` | **`1 · 1 · 2`** | 원본 부재로 미검증 |

수량 기준으로 R8 결과는 레거시 기대와 일치한다.

### 3.3 경계 대조

- 동률: 양쪽 모두 보조 정렬 키가 없다. 안정 정렬에서 입력 순서를 보존하고 Bottom은 그 마지막 구간을 다시 뒤집는다. R8 필터는 남은 양수 출고 모델의 상대 순서를 바꾸지 않으므로 새 동률 회귀는 없다. 다만 레거시 CSV 출고 순서와 현행 BE `LinkedHashMap` 삽입 순서가 같다는 계약은 없고 원본 CSV도 부재하므로, 동률 모델의 **정확한 식별자 순서**까지 레거시와 같다고 판정하지 않는다.
- 출고 1건뿐인 모델: 레거시는 첫 출고 처리 때 `outCounts` 키를 만들며, 현행은 합계가 양수라 포함한다. 일치한다.
- 모델 3개 미만: 양쪽 모두 `slice(0,3)`과 `slice(-3).reverse()`를 그대로 사용한다. 0개면 양쪽 빈 배열, 1개면 같은 1개가 Top/Bottom 모두에 나오고, 2개면 같은 2개가 Top에는 정순·Bottom에는 역순으로 나온다. 일치한다.
- 출고 모델 0개: 레거시는 Top/Bottom이 비고 추천은 `특이사항 없음`이다. HEAD도 필터 후 같은 결과다. R8 전 구현만 입고 전용 모델을 Top/Bottom 및 추천에 넣을 수 있었다.

판정: 수량과 배열 경계는 레거시와 일치한다. 동률 모델 식별자의 정확한 순서는 레거시 원본 입력 순서 부재로 미판정이다.

## 4. 각도 3 — 산출 건수 유지

`[DEV-SEED]` 직접 재생 결과:

| 산출 | HEAD 건수 | R8 전과 동일 |
|---|---:|---|
| 전년·당년 추이 | **12** | 예 |
| 수요예측 | **9** | 예 |
| 추천·알림 | **1** | 예 |

추가로 Top 3와 Bottom 3 배열은 각각 3건이다. 수요예측 9건은 기존 R7과 같이 4~12월 값이 모두 0이며, 이는 시드에 2025년 출고가 없기 때문이다. 산출 경로 미도달로 해석하지 않는다.

## 5. 각도 4 — 칩 회귀

### 5.1 기본 화면 모집단

`[DEV-SEED]` 82라인을 61모델로 집계한 뒤 HEAD의 실제 `modelChips()`와 `filterInOutRows()`를 호출했다.

```text
DATA_SOURCE=[DEV-SEED]
DEFAULT_UNFILTERED=61
DEFAULT_실외기=0
DEFAULT_실내기=0
DEFAULT_홈멀티=0
DEFAULT_싱글중대형=0
DEFAULT_상업멀티=0
DEFAULT_판넬=0
DEFAULT_미분류=61
```

### 5.2 분류 실 4행

한글 파이프 인코딩 오판정을 피하려고 `product_db`의 실 상품명만 SQL에서 UTF-8 base64로 전달한 뒤 메모리에서 복원했다. 값 자체는 DB의 기존 행이며 합성하지 않았다.

```text
DATA_SOURCE=[DEV-SEED]
CLASSIFIED_ROWS=4
AC023CN1DBC1 CHIPS=실내기
AC023CX1DBC1 CHIPS=실외기
PC1NWSK3NW CHIPS=판넬+홈멀티
AR-EC05 CHIPS=홈멀티
OWN_CHIP_MEMBERSHIPS=5 OWN_CHIP_MISSING=0
CLASSIFIED_미분류=0
```

판정: **82라인 → 61행, 미분류 61행, 분류 실 4행의 자기 칩 membership 누락 0/5**가 유지된다. 다만 브라우저가 없어 칩을 실제로 클릭한 화면 회귀는 조사하지 않았다.

## 6. 각도 5 — `monthly[]`의 화면 표현

**실화면은 조사하지 않음.** 브라우저 연결을 초기화한 뒤 가용 브라우저 목록을 조회했지만 `[]`였고, 지시대로 standalone Playwright·API JSON·터미널 출력으로 화면 증거를 대체하지 않았다.

정적 경로에서만 확인한 사실:

- `[DEV-SEED]` 응답 조립과 HEAD 함수에 도달하는 모델·연·월 점은 **79점**이다.
- `InOutAnalysisPage.tsx`는 `visible.reduce(... row.monthly.length ...)`로 79를 계산하고 `data-testid="inout-month-point-count"`에 **점 개수 1개**를 렌더하도록 작성돼 있다.
- 개별 79점의 모델·연·월·입고·출고 값은 표로 렌더하지 않는다. 전년·당년 추이 표는 이를 월 전체 12행으로 집약한다.

따라서 “화면에 79라는 카운트가 보인다”는 실화면 통과 판정을 내리지 않는다. 또한 요구 의미가 개별 79점의 상세 표현이라면 현재 소스는 그 요구를 충족하지 않는다.

## 7. 검증

신선한 대상 Vitest:

```text
Test Files  1 passed (1)
Tests       11 passed (11)
```

신선한 `clients/desktop npm run typecheck`: exit 0. 내부 real-QA scope 계약 테스트도 `2/2`, `50/50` 통과했다. 출력의 LF→CRLF 경고와 의도적으로 차단 상태를 검증하는 메시지는 기존 하네스 테스트 출력이며 typecheck 실패가 아니다.

R8 커밋에 기록된 전체 Vitest `192 files / 1,733 tests` 성공은 이번 라운드에 재실행하지 않았으므로 **직전 R8 기록**으로만 인용하며 신선한 R9 증거로 간주하지 않는다.

최종 재생 전에 실패한 세 시도는 판정에서 제외했다: 루트에서 TypeScript 모듈 해석 실패 1회, SQL 별칭 구문 오류 1회, PowerShell 파이프의 한글 인코딩으로 분류명이 유실된 1회. 각각 `NODE_PATH` 지정, SQL 별칭 변경, DB 문자열 UTF-8 base64 전달로 원인을 제거한 뒤 위 최종 원문을 얻었다.

## 8. 이 라운드가 보지 않은 것

- 월 점수 79, 분석 카드, 칩 클릭 결과의 실제 DOM·픽셀: 가용 브라우저 0개로 조사하지 않음.
- 공유 스택 API/E2E: 배포본이 HEAD보다 오래되어 조사하지 않음.
- 실 원본 XLSX·운영 DB와 `[DEV-SEED]`의 동일성: 원본 부재 및 실데이터 접근 부재로 미검증.
- 동률 모델의 정확한 레거시 식별자 순서: 레거시 CSV 원본·입력 순서 부재로 미판정.
- 분류 4행을 `SENT`에서 화면 포함 상태로 바꾸는 E2E: 공유 DB write 금지로 조사하지 않음.
- 전체 Desktop Vitest, 전체 Playwright, BE 전체 테스트, Ubuntu CI, 권한·메뉴 active 상태, 모바일·웹 클라이언트: 조사하지 않음.
- 개별 79점 상세를 화면에 표시해야 하는지, 카운트 79만으로 충분한지에 대한 제품 요구 해석: 별도 결정이 없어 판정하지 않음.

## 9. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1012-r9-postfix-reconvergence.md`

이번 라운드에서 새로 만든 파일은 위 보고서 1개다. 기존 보고서는 수정하거나 축약하지 않았다.
