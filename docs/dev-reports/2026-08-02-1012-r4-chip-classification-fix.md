# PR #1047 / Issue #1012 R4 — 입출고 분석 분류 칩 필터 fix

## 결론

분류 원천을 임의로 채우지 않고 `미분류`를 명시적인 칩으로 추가했다. 분류 근거가 없는 행은 기존처럼 모든 분류 칩에 통과하지 않고 `미분류` 칩에서만 반환된다. 따라서 화면이 현재 데이터의 불완전한 분류 상태를 숨기지 않으면서, 각 분류 칩은 실제로 모집단을 좁힌다.

## 1. 방향과 대안 검토

### 선택한 방향

- `MODEL_CHIPS`에 `미분류`를 추가했다.
- `modelChips()`가 빈 집합을 반환하는 행은 선택된 칩에 `미분류`가 있을 때만 통과시킨다.
- 분류 칩별 건수도 동일한 필터 함수를 사용해 계산한다.
- 무필터 상태는 기존처럼 전체 행을 그대로 반환한다.

### 근거

- R3 실측에서 product DB 매칭 실패는 0개였지만, 실 품목 2,143라인 중 분류된 라인은 4개(0.19%)뿐이었다.
- `product_category`, 라인 `category_key`, 품목명 패턴이 대부분 결손되어 있어 이번 라운드에 분류를 추론하면 근거 없는 허위 분류가 된다.
- 미분류 행을 전용 칩으로 보존하면 사용자는 “분류 칩으로 분류된 행”과 “현재 분류되지 않은 행”을 구분할 수 있다.

### 버린 대안

- **분류 원천 보강/마이그레이션**: 실 API 경로가 실제로 어떤 값을 생성하는지 확인되지 않은 상태에서 raw SQL 또는 seed로 값을 넣으면 실재하지 않는 세계를 검증하게 된다. 또한 이번 요청은 공유 DB write/DDL 금지다. 이번 fix에서는 선택하지 않았다.
- **기존 `chips.size === 0 -> return true` 유지**: 모든 분류 칩이 미분류 행을 공통으로 반환하여 R3에서 99.81~99.91%가 통과했다. PM 판정인 “있는데 안 되는” 상태를 해소하지 못하므로 폐기했다.

## 2. RED

기존 blanket 구현에서 기대 동작을 먼저 명시하도록 테스트를 바꾼 뒤 실행했다.

```text
Test Files  1 failed (1)
Tests       2 failed | 5 passed (7)

분류 근거가 없는 행은 분류 칩 선택에서 제외된다
expected ... to have a length of +0 but got 1

분류 근거가 없는 61행은 미분류 칩에서만 보인다
expected ... to have a length of +0 but got 61
```

RED는 기존 구현이 분류 근거 없는 행을 분류 칩 선택에서도 통과시키는 결함을 재현했다.

## 3. Fix

- `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts`
  - `미분류` 칩을 모델 칩 목록에 추가했다.
  - 빈 분류 집합을 `selectedChips.has('미분류')`일 때만 통과하도록 변경했다.
- `clients/desktop/src/renderer/routes/warehouse/InOutAnalysisPage.tsx`
  - `미분류` 건수를 화면 칩 건수에 포함했다.
- `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.test.ts`
  - 빈 분류 행이 분류 칩에서 제외되고 미분류 칩에서만 보이는 계약으로 변경했다.

신규 마이그레이션은 없다. 공유 DB write/DDL도 수행하지 않았다.

## 4. GREEN

### 대상 테스트

```text
src/renderer/routes/warehouse/inoutAnalysisModel.test.ts
Test Files  1 passed (1)
Tests       7 passed (7)
```

### 전체 프론트 테스트

```text
npm test
Vitest 전체 실행 성공 — failed 0
```

초기 재실행에서 사용한 `npm test -- --runInBand`는 Vitest가 지원하지 않는 Jest 옵션 때문에 실행 자체가 중단되었고, 올바른 `npm test`로 재검증했다.

## 5. 불변식 실측

기준은 R3에서 확정한 QA 테스트 데이터 제외 실 품목 모집단이다.

- 실 품목 라인: 2,143
- 실 품목 모델: 35
- 분류 근거가 있는 라인: 4
- 분류 근거가 없는 라인: 2,139

### 5-1. 칩이 실제로 거르는가

새 필터 semantics를 R3 실측 모집단에 재적용한 반환 건수다. 모든 칩의 반환 건수는 2,143보다 작다.

| 칩 | 반환 건수 | 전체 대비 |
|---|---:|---:|
| 실외기 | 1 | 0.05% |
| 실내기 | 1 | 0.05% |
| 홈멀티 | 2 | 0.09% |
| 싱글중대형 | 0 | 0.00% |
| 상업멀티 | 0 | 0.00% |
| 판넬 | 1 | 0.05% |
| 미분류 | 2,139 | 99.81% |

분류 칩은 더 이상 미분류 2,139행을 공통 반환하지 않는다. `미분류` 칩은 그 행을 정확히 표현하는 전용 칩이다.

### 5-2. false-negative 0

분류된 4라인을 원래 근거가 있는 칩으로 다시 조회했을 때 누락 0라인이다. `PC1NWSK3NW`처럼 복수 근거가 있는 모델은 해당 칩들 모두에서 반환된다. 미분류 2,139라인은 분류 칩에서 제외되지만 미분류 칩에서 2,139라인 모두 반환된다.

결과: **false-negative 0 유지**.

### 5-3. 실 API 경로 가능성

이번 fix는 DB 값을 만들거나 변경하지 않는다. 현재 API 응답의 `categoryKey`와 `productName`으로 계산되는 빈 분류 집합을 그대로 `미분류`로 표시하므로 실 API 경로에서 재현 가능하다.

### 5-4. 행 집계 불변

무필터 `selected.size === 0` 경로는 기존과 동일하게 원본 `rows`를 반환한다. 실측 기준 무필터 행 수는 **2,143 → 2,143**, 변동 0이다.

### 5-5. DB·마이그레이션 안전성

- 공유 DB write: 없음
- DDL: 없음
- 신규 Flyway 파일: 없음
- 적용된 Flyway 파일 수정: 없음
- Docker 이미지 재빌드: 없음

## 6. 검증 명령

- `clients/desktop`: `npm run typecheck` — 성공
- `clients/desktop`: `npm test` — 전체 성공, failed 0
- targeted: `npm exec vitest run src/renderer/routes/warehouse/inoutAnalysisModel.test.ts` — 7/7 성공

## 7. 파일별 변경량

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts` | +4 | -4 |
| `clients/desktop/src/renderer/routes/warehouse/InOutAnalysisPage.tsx` | +1 | -1 |
| `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.test.ts` | +7 | -5 |
| `docs/dev-reports/2026-08-02-1012-r4-chip-classification-fix.md` | +143 | -0 |

코드·테스트 합계: **+12 / -10**. 보고서 포함 전체 변경: **+155 / -10**.

## 8. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1012-r4-chip-classification-fix.md`

이번 라운드에서 신규로 만든 파일은 위 보고서 1개이며, 신규 마이그레이션은 없다.
