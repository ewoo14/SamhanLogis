# PR #1047 / Issue #1012 R8 — 순위 모집단 고정

## 1. 레거시 원문과 모집단 규칙 확정

레거시 `tools/legacy-gas/입출고 분석/Index.html:388-393` 원문은 다음과 같다.

```js
var sorted = Object.keys(outCounts).sort(function(a, b) {
  return outCounts[b] - outCounts[a];
});

var topRank = sorted.slice(0, 3);
var bottomRank = sorted.slice(-3).reverse();
```

`Object.keys(outCounts)`가 순위 모집단이다. 따라서 `outCounts`에 키가 생기는 **출고량 집계 모델만** Top 3와 Bottom 3에 포함된다. 입고만 있고 출고량이 0인 모델은 `outCounts` 모집단에 없으므로 제외된다. Top과 Bottom은 같은 `sorted` 배열에서 각각 앞 3개·뒤 3개를 선택한다.

이번 결함은 현행이 입고·출고 통합 61행을 모두 `aggregate`에 넣고, 그 61행을 그대로 정렬한 것이었다. 그 결과 입고 전용 모델의 `outboundQuantity=0`이 Bottom 후보가 됐다.

데이터 출처: 아래 운영 수치는 `[DEV-SEED]` 로컬 개발 시드 기준이다. `docs/migration/ecount-data/raw/`에는 원본 XLSX가 없고 `.gitkeep`만 있으므로 실데이터 수치는 **확인 불가/미검증**이며, 시드와 실데이터 동일성도 판정하지 않는다.

## 2. RED — 결함 재현

`clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.test.ts`에 입고 전용 모델 1개와 출고 모델 4개를 넣는 실패 테스트를 먼저 추가했다. 기대값은 레거시와 같은 모집단에서 Top `[5, 2, 1]`, Bottom `[1, 1, 2]`이며 입고 전용 모델은 Bottom에 없어야 한다.

수정 전 실행 원문:

```text
Test Files  1 failed (1)
Tests       1 failed | 10 passed (11)
expected [ +0, 1, 1 ] to deeply equal [ 1, 1, 2 ]
```

즉 현재 구현은 입고 전용 `0`을 Bottom 3에 포함하고 있었다.

## 3. Fix

`deriveLegacyAnalysis()`의 공통 `sorted` 모집단을 다음처럼 변경했다.

```ts
const sorted = [...aggregate.values()]
  .filter((row) => row.outboundQuantity > 0)
  .sort((a, b) => b.outboundQuantity - a.outboundQuantity)
```

이제 `top3`, `bottom3`, Top 1을 사용하는 추천이 모두 같은 출고 모델 모집단을 공유한다. 목록 행·칩 필터·입고 수량 집계는 변경하지 않았다.

Linux 판정: `Array.prototype.filter`, 숫자 비교, `sort`, `slice`는 Node/TypeScript의 플랫폼 독립 동작이며 경로 구분자·셸·Windows API에 의존하지 않는다. 따라서 이 단정은 `ubuntu-latest`에서도 참이다.

## 4. GREEN

RED 테스트는 수정 후 11/11 통과했다.

```text
Test Files  1 passed (1)
Tests       11 passed (11)
```

전체 Desktop Vitest도 192 files / 1733 tests 통과했다.

## 5. 불변식 1~5 실측

| 불변식 | `[DEV-SEED]` 수정 전 | `[DEV-SEED]` R8 수정 후 | 실데이터 |
|---|---:|---:|---:|
| 1. 레거시와 같은 순위 모집단 | 통합 61행, 입고 전용 포함 | 출고량 `> 0` 모델만 | 원본 부재로 미검증 |
| 2. Bottom 3 | `0 · 0 · 0` | **`1 · 1 · 2`** | 원본 부재로 미검증 |
| 3. Top 3 동일 모집단 | 출고수량 `18 · 18 · 12` | **출고수량 `18 · 18 · 12`** | 원본 부재로 미검증 |
| 4. 칩 회귀 | 82라인 → 61행; 미분류 61행; 분류 4행 누락 0/5 | 동일. 순위 필터만 변경 | 원본 부재로 미검증 |
| 5. 추이·수요예측·추천 건수 | `12 · 9 · 1` | **`12 · 9 · 1`** | 원본 부재로 미검증 |

Top/Bottom 배열 건수는 각각 3건으로 유지된다. 테스트 합성 사례에서도 Top `[5,2,1]`, Bottom `[1,1,2]`가 같은 필터 후 모집단에서 나온다.

각 단정의 Linux 여부: 새 회귀 테스트와 `deriveLegacyAnalysis()`는 브라우저·DB·Windows 전용 API를 사용하지 않는 순수 TypeScript 함수이므로 위 코드 수준 단정은 Linux에서 참이다. 단, `[DEV-SEED]` 수치 자체는 로컬 데이터베이스 재생 결과이므로 Ubuntu CI에 시드 DB가 동일하게 존재한다고 단정하지 않는다.

## 6. 테스트 결과

- 대상 Vitest: `11/11 passed` — 기존 10건 + R8 회귀 1건.
- 전체 Desktop Vitest: `192 files / 1733 tests passed`.
- `clients/desktop` `npm run typecheck`: 성공.
- BE 변경 없음: BE 모듈 테스트/빌드 대상 아님.
- 전체 테스트 출력의 기존 React Router future flag 및 중복 key 경고는 이번 변경과 무관하며 실패가 아니었다.
- 공유 DB write, Docker 이미지 재빌드, 레거시 HTML 수정, git commit/push는 수행하지 않았다.

## 7. 파일별 변경량

- `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts`: **+5 / −1**
- `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.test.ts`: **+24 / −0**
- `docs/dev-reports/2026-08-02-1012-ranking-population-fix.md`: **+94 / −0**

## 8. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1012-r8-ranking-population-fix.md`

기존 `docs/dev-reports/2026-08-02-1012-r7-postfix-reconvergence.md`는 읽기만 했고 수정하지 않았다.
