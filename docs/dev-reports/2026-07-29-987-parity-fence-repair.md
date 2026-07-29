# 2026-07-29 PR #987 parity fence repair

## 1. 기존 단언이 깨진 이유

PR #978과 후속 보완에서 주문 앱의 상업멀티 파생 품목 누락 계약이 바뀌었다.

- 기존 계약: `AR-EH05`와 `방진가대S2중` 카탈로그 행이 없으면 `recomputeCommDerived()`가 예외를 던진다.
- 새 주문 앱 계약: 계산을 중단하지 않고 누락 모델을 `missingModels`에 기록한 뒤, `#commCatalogWarnings` 경고 바에 모델명·사유·금액 미반영 사실을 표시한다. 따라서 `evaluateCase(input, 'order')`는 throw하지 않는다.
- 견적 앱은 이번 PR의 변경 대상이 아니므로 기존 throw 계약을 유지한다.

기존 `clients/web/estimate-app/test/price-parity-s3.test.js:43`은 order와 estimate 네 케이스 모두에 다음 단언을 적용했다.

```js
expect(() => evaluateCase(input, app).quantities).toThrow(new RegExp(model));
```

그 결과 실제 새 계약을 따르는 order의 `AR-EH05`·`방진가대S2중` 두 케이스가 `Received function did not throw`로 실패했다. 단언을 삭제하지 않고 앱별 계약으로 다시 썼다. order는 비예외 계약을, estimate는 기존 예외 계약을 계속 검증한다.

## 2. 새 울타리와 두 실재 모델의 커버리지

합성 `AM030AXVCOOL1`을 만들던 parity 입력을 제거했다. `git ls-files`로 추적되는 다음 실제 bootstrap fixture를 읽는다.

- `clients/web/order-app/src/__tests__/fixtures/commercialMultiBootstrap.fixture.json`
- `clients/web/order-app/src/__tests__/fixtures/homemultiBootstrap.fixture.json`

`clients/web/legacy-quantity-golden/priceParityS3Cases.js:33-66`은 실제 commercial fixture에 `AM130BN6PBH1`, `AM300AXVGHC1`, `AR-EH05`, `방진가대S2중` 행이 모두 있는지 확인하고, 다음 실재 원천 케이스를 사용한다.

- `AM130BN6PBH1` 360 실내기 → 파생 `AR-EH05`
- `AM300AXVGHC1` 냉방전용 상부토출 30HP → 파생 `방진가대S2중`

parity 단언은 `clients/web/estimate-app/test/price-parity-s3.test.js:31-48`에서 두 모델을 order·estimate 각각 네 번의 행으로 고정한다.

```js
test.each([
  ['AR-EH05', remote360Input, 'order'],
  ['AR-EH05', remote360Input, 'estimate'],
  ['방진가대S2중', coolTop30Input, 'order'],
  ['방진가대S2중', coolTop30Input, 'estimate'],
])('카탈로그에 없는 파생 target %s는 앱 계약에 맞게 드러낸다', (model, inputFactory, app) => {
  const input = inputFactory();
  input.catalog = {
    ...input.catalog,
    commercial: input.catalog.commercial.filter((row) => row.model !== model),
  };

  if (app === 'order') {
    expect(() => evaluateCase(input, app).quantities).not.toThrow();
  } else {
    expect(() => evaluateCase(input, app).quantities).toThrow(new RegExp(model));
  }
});
```

비예외가 단순한 silent skip으로 퇴행하지 않도록, 주문 앱의 실제 사용자 신호도 `clients/web/order-app/src/__tests__/catalogMissingSignal.test.ts:199-219`에서 같은 실제 bootstrap 행으로 검증한다.

```ts
it.each([
  ['방진가대S2소', 'AM080AXVHHH1'],
  ['AR-EH05', 'AM130BN6PBH1'],
  ['방진가대S2중', 'AM300AXVGHC1'],
])('실 bootstrap fixture에서 %s가 빠지면 모델명을 사용자 신호로 남긴다', (missingModel, sourceModel) => {
  const fixture = loadBootstrapFixture();
  const bootstrapRows = fixture.rows;
  expect(bootstrapRows.some((row) => row.model === sourceModel)).toBe(true);
  expect(bootstrapRows.some((row) => row.model === missingModel)).toBe(true);

  const catalogWithoutDerived = bootstrapRows.filter((row) => row.model !== missingModel);
  const result = runRecompute(catalogWithoutDerived, sourceModel, missingModel);

  expect(result.hidden).toBe(false);
  expect(`${result.textContent}${result.innerHTML}`).toContain(missingModel);
  expect(result.missingQuantity).toBe(0);
});
```

따라서 `AR-EH05`와 `방진가대S2중` 모두 실제 원천 모델에서 파생되고, 실제 카탈로그 행을 제거하면 사용자 경고가 보이며 누락 품목 수량은 0으로 남는다는 두 층의 울타리가 있다. 정상 bootstrap 행과 기존 `방진가대S2소` 사례도 유지한다.

## 3. 실행한 명령과 출력 원문

### 3.1 수정 전 RED 재현

작업 디렉토리: `clients/web/estimate-app`

명령:

```text
npm test -- --runInBand test/price-parity-s3.test.js
```

종료 코드: `1`

출력:

```text

> @samhan/estimate-app@2.0.0 test
> jest --passWithNoTests --runInBand test/price-parity-s3.test.js

FAIL test/price-parity-s3.test.js
  #896 슬3 라이브 가격 정합 — order/estimate parity
    √ 360 실내기는 두 앱 모두 라이브 target AR-EH05를 수량 1로 선택한다 (152 ms)
    √ 냉방전용 상부토출 30HP는 두 앱 모두 라이브 target 방진가대S2중을 수량 1로 선택한다 (95 ms)
    × 카탈로그에 없는 파생 target AR-EH05는 조용히 스킵하지 않고 드러낸다 (9 ms)
    √ 카탈로그에 없는 파생 target AR-EH05는 조용히 스킵하지 않고 드러낸다 (354 ms)
    × 카탈로그에 없는 파생 target 방진가대S2중는 조용히 스킵하지 않고 드러낸다 (12 ms)
    √ 카탈로그에 없는 파생 target 방진가대S2중는 조용히 스킵하지 않고 드러낸다 (125 ms)
    √ 라이브 product_db 납품가를 두 앱의 상업 단가 계산이 동일하게 반환한다 (128 ms)

  ● #896 슬3 라이브 가격 정합 — order/estimate parity › 카탈로그에 없는 파생 target AR-EH05는 조용히 스킵하지 않고 드러낸다

    expect(received).toThrow(expected)

    Expected pattern: /AR-EH05/

    Received function did not throw

    [0m [90m 41 |[39m     }[33m;[39m
    [0m [90m 42 |[39m
    [31m[1m>[22m[39m[90m 43 |[39m     expect(() [33m=>[39m evaluateCase(input[33m,[39m app)[33m.[39mquantities)[33m.[39mtoThrow([36mnew[39m [33mRegExp[39m(model))[33m;[39m
    [0m [90m    |[39m                                                       [31m[1m^[22m[39m
    [0m [90m 44 |[39m   })[33m;[39m
    [0m [90m 45 |[39m
    [0m [90m 46 |[39m   test([32m'라이브 product_db 납품가를 두 앱의 상업 단가 계산이 동일하게 반환한다'[39m[33m,[39m () [33m=>[39m {[0m

      at toThrow (test/price-parity-s3.test.js:43:55)

  ● #896 슬3 라이브 가격 정합 — order/estimate parity › 카탈로그에 없는 파생 target 방진가대S2중는 조용히 스킵하지 않고 드러낸다

    expect(received).toThrow(expected)

    Expected pattern: /방진가대S2중/

    Received function did not throw

    [0m [90m 41 |[39m     }[33m;[39m
    [0m [90m 42 |[39m
    [31m[1m>[22m[39m[90m 43 |[39m     expect(() [33m=>[39m evaluateCase(input[33m,[39m app)[33m.[39mquantities)[33m.[39mtoThrow([36mnew[39m [33mRegExp[39m(model))[33m;[39m
    [0m [90m    |[39m                                                       [31m[1m^[22m[39m
    [0m [90m 44 |[39m   })[33m;[39m
    [0m [90m 45 |[39m
    [0m [90m 46 |[39m   test([32m'라이브 product_db 납품가를 두 앱의 상업 단가 계산이 동일하게 반환한다'[39m[33m,[39m () [33m=>[39m {[0m

      at toThrow (test/price-parity-s3.test.js:43:55)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 5 passed, 7 total
Snapshots:   0 total
Time:        2.121 s
Ran all test suites matching /test\\price-parity-s3.test.js/i.
```

### 3.2 수정 후 estimate-app Jest 전체 스위트

작업 디렉토리: `clients/web/estimate-app`

명령:

```text
npm test -- --runInBand
```

종료 코드: `0`

출력:

```text

> @samhan/estimate-app@2.0.0 test
> jest --passWithNoTests --runInBand

PASS test/legacy-quantity-golden.test.js
PASS test/calc-fidelity.test.js
  ● Console

    console.log
      [AppsScript] >> 🧊 홈멀티 인덱스 iCoolKw=%s iCoolKcal=%s iPowKw=%s iEff=%s coolCols=%s 11 12 13 14 [11,12]

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 📌 스펙상세맵 생성 완료 count=%s 2

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 🧊 홈멀티 인덱스 iCoolKw=%s iCoolKcal=%s iPowKw=%s iEff=%s coolCols=%s 11 12 13 14 [11,12]

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 📌 스펙상세맵 생성 완료 count=%s 2

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 🧊 홈멀티 인덱스 iCoolKw=%s iCoolKcal=%s iPowKw=%s iEff=%s coolCols=%s 11 12 13 14 [11,12]

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 🔥 상업멀티 ERV=%s coolCols=%s heatCols=%s powCols=%s groups=%s false [3,4] [7,8] [5,6] [[3,4],[5,6],[7,8]]

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 📌 스펙상세맵 생성 완료 count=%s 3

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 🧊 홈멀티 인덱스 iCoolKw=%s iCoolKcal=%s iPowKw=%s iEff=%s coolCols=%s 11 12 13 14 [11,12]

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 🔥 상업멀티 ERV=%s coolCols=%s heatCols=%s powCols=%s groups=%s true [2,3] [5,6] [4,7] [[2,3],[4],[5,6],[7]]

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] >> 📌 스펙상세맵 생성 완료 count=%s 3

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] [initDcConfigFromNotion] DC 설정 기본값 사용 (유효하지 않은 사업자번호) 123

      at Object.log (lib/apps-script-shim.js:60:13)

PASS test/price-parity-s3.test.js
PASS test/code.test.js
  ● Console

    console.log
      [AppsScript] [slip-bridge] POST http://localhost:8086/internal/slips/from-estimate (lines=1)

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] 📤 slip-service POST 시작

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] [slip-bridge] POST http://localhost:8086/internal/slips/from-estimate (lines=2)

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] 📤 slip-service POST 시작

      at Object.log (lib/apps-script-shim.js:60:13)

    console.log
      [AppsScript] [slip-bridge] POST http://localhost:8086/internal/slips/from-estimate (lines=1)

      at Object.log (lib/apps-script-shim.js:60:13)

PASS test/default-component-baseline.test.js
PASS test/db-catalog.test.js
PASS test/version-check.test.js
PASS test/directory.test.js
PASS test/version-gate.test.js

Test Suites: 9 passed, 9 total
Tests:       182 passed, 182 total
Snapshots:   0 total
Time:        8.531 s, estimated 11 s
Ran all test suites.
```

### 3.3 수정 후 order-app Vitest 전체 스위트

작업 디렉토리: `clients/web/order-app`

명령:

```text
npm run test
```

종료 코드: `0`

출력:

```text

> @samhan/order-app@0.4.0 test
> vitest run

 RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/t10-987/clients/web/order-app

 ✓ src/__tests__/priceChangeSchedule.test.ts (10 tests) 75ms
 ✓ src/__tests__/legacyConfigMapping.test.ts (2 tests) 12ms
 ✓ src/__tests__/bootstrapFailure.test.ts (2 tests) 18ms
 ✓ src/__tests__/catalogMissingSignal.test.ts (7 tests) 94ms
 ✓ src/__tests__/sol2QuantityFix.test.ts (9 tests) 142ms
 ✓ src/__tests__/samhanApi.test.ts (5 tests) 8ms
 ✓ src/__tests__/homeManualLockRestore.test.ts (16 tests) 228ms
 ✓ src/__tests__/homeOptionAndZeroLockRestore.test.ts (10 tests) 106ms
 ✓ src/__tests__/commManualLockRestore.test.ts (24 tests) 353ms
 ✓ src/version/versionCheck.test.ts (5 tests) 9ms
 ✓ src/__tests__/commSetIndex.test.ts (1 test) 8ms
 ✓ src/__tests__/legacy-quantity-golden.test.ts (73 tests) 794ms
 ✓ src/__tests__/legacyPreexistingFix.test.ts (2 tests) 22ms
 ✓ src/__tests__/commercialManualSymmetry.test.ts (9 tests) 137ms
 ✓ src/version/versionGate.test.ts (2 tests) 6ms
 ✓ src/__tests__/sanity.test.ts (2 tests) 3ms
 ✓ src/__tests__/priceParityS3.test.ts (7 tests) 1075ms

 Test Files  17 passed (17)
      Tests  186 passed (186)
   Start at 15:07:01
   Duration 2.11s (transform 606ms, setup 0ms, collect 954ms, tests 3.09s, environment 5ms, prepare 3.29s)
```

### 3.4 estimate-app CI 후속 typecheck/build

작업 디렉토리: `clients/web/estimate-app`

명령:

```text
npm run typecheck
```

종료 코드: `0`

출력:

```text

> @samhan/estimate-app@2.0.0 typecheck
> node scripts/typecheck.cjs

typecheck OK: 14 JavaScript files
```

명령:

```text
npm run build
```

종료 코드: `0`

출력:

```text

> @samhan/estimate-app@2.0.0 build
> npm run typecheck


> @samhan/estimate-app@2.0.0 typecheck
> node scripts/typecheck.cjs

typecheck OK: 14 JavaScript files
```

## 4. 이 라운드가 보지 않은 것

- GitHub Actions의 실제 원격 CI 재실행 결과와 PR 상태는 확인하지 않았다. 최종 권위는 CI에 남아 있다.
- `services/**` 백엔드와 `clients/desktop/**`은 읽거나 수정하지 않았다.
- 실제 브라우저·실 API bootstrap 재호출·라이브 QA는 실행하지 않았다. 이번 회귀 울타리는 저장소에 추적된 bootstrap fixture를 사용했다.
- 모노레포 전체 스위트와 다른 워크스페이스는 실행하지 않았다. 지정 범위인 estimate-app Jest 및 order-app Vitest, estimate-app typecheck/build만 실행했다.
- 커밋, push, PR 생성·머지, 브랜치 조작은 수행하지 않았다.
