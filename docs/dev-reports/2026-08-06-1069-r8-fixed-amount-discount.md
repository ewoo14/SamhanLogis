# R8 싱글중대형 세트 카테고리별 정액 할인 적용

일자: 2026-08-06  
브랜치: `feat/1069-bundle-expansion-in-form`  
기준 HEAD: `db1db4916`  
범위: #1069 PR 내부 수정. Docker 재빌드·재배포·migration·commit·push는 수행하지 않았다.

## 1. 판별 위치와 기존 구현 재사용

PM 조사와 코드가 일치했다. `dc-config-service`의 `PriceCalculationService`는 이미 여섯 boolean을 합산하지만, `slip-service`의 `DiscountPriceClient.toRequestLine()`이 해당 값을 보내지 않고 있었다. 또한 추가 조사에서 이 클라이언트는 현재 production `SlipService`에 주입되어 있지 않고, 실제 데스크톱 전표 화면은 `SlipFormPage` → `slipDiscount.ts` 경로를 사용한다는 셋째 가능성을 확인했다. wire만 고치면 실제 화면 결함은 남으므로 양쪽을 수정했다.

기존 `accounting-service/DiscountRevalidator.GlobalDiscount.optionDiscountFor()`에 있던 모델코드 규칙을 새로 복제하지 않고 다음 공용 판별기로 추출해 재사용했다.

- `shared/common/src/main/java/com/samhanair/logis/common/discount/LegacyModelFlags.java`
  - 레거시 `종합견적서/index.html`의 `getModelFlags(model)`를 분기·순서 그대로 재현한다.
  - `DiscountRevalidator`는 이 공용 판별기의 결과를 사용한다.
  - `DiscountPriceClient`도 같은 판별기 결과를 `is360`, `is4Way`, `is1Way`, `isStand`, `isDeluxe`, `isFirstGrade`로 요청 body에 넣는다.
- 프런트는 Java 공용 모듈을 직접 사용할 수 없으므로 `clients/desktop/src/renderer/utils/slipDiscount.ts`에 동일한 레거시 규칙을 유지한다.
- `SlipFormPage`의 세트 전개 결과 각 구성품에 `component.modelCode`를 넣어 정액을 계산하고, `catalogUnitPrice`도 보존해 거래처 변경 bulk 재조회에서도 동일 계산을 재사용한다.
- `products.discount_flags`는 실행 코드의 판별 근거로 사용하지 않았다. 변경 범위 grep 결과 해당 컬럼을 읽는 코드는 없고, 새 공용 클래스의 설명 주석에서만 “사용하지 않음”을 명시한다.

## 2. 레거시 `getModelFlags` 분기 대조표

테스트는 `shared/common/.../LegacyModelFlagsTest.java`와 `slipDiscount.test.ts`에 분기별로 고정했다. 아래 표의 “우리 결과”는 Java 공용 판별기와 프런트 계산기가 동일하다.

| 레거시 입력 분기 | 레거시 결과 | 우리 결과 |
|---|---|---|
| `AC`, 길이 9 이상, `[7]=6 [8]=P` | `is360=true` | `is360=true`, 나머지 false |
| `AC`, `[7]=4 [8]=P` | `is4way=true` | `is4Way=true`, 나머지 false |
| `AC`, `[7]=4 [8]=D` | `is4way=true` | `is4Way=true`, 나머지 false |
| `AC`, `[7]=1 [8]=P` | `is1way=true` | `is1Way=true`, 나머지 false |
| `AC`, `[7]=1 [8]=D` | `is1way=true` | `is1Way=true`, 나머지 false |
| `AP`, 길이 11 이상, `[8]=D [10]=C` | `isStand=true` | `isStand=true`, 나머지 false |
| `AP`, 길이 9 이상, `[8]=P` | `isStand=true` | `isStand=true`, 나머지 false |
| `AP`, 길이 11 이상, `[8]=D [10]=H` | `isDeluxe=true` | `isDeluxe=true`, 나머지 false |
| `AP230...` | `isStand=true`, `isDeluxe=false` | 동일 |
| `AP290...` | `isStand=true`, `isDeluxe=false` | 동일 |
| `AC` 또는 `AP`, 길이 9 이상, `[8]=F` | `isGrade1=true` | `isFirstGrade=true` |
| `AC/AP` 아님, 또는 길이 9 미만 | 여섯 값 모두 false | 여섯 값 모두 false |

AP230/AP290 예외는 레거시 바깥 조건인 `AP && length >= 9` 안에서만 평가된다. 기존 accounting 테스트의 `AP230123`(길이 8)은 이 조건을 충족하지 않아 `AP230123P`로 fixture를 보정했다. 규칙을 완화하거나 개선한 것이 아니다.

## 3. 율 기반 할인과 정액 할인 결합 근거

`dc-config-service/.../PriceCalculationService.java`의 실제 순서는 다음과 같다.

1. `pickCategoryRate()`가 품목 고정율을 우선 선택하고, 없으면 `HOMEMULTI`/`COMMERCIAL_MULTI`의 전역율을 선택한다.
2. `sumOptionDc()`는 `HOMEMULTI`와 `COMMERCIAL_MULTI`에서는 즉시 0을 반환한다.
3. 그 외 카테고리에서만 여섯 플래그에 대응하는 정액을 합산한다.
4. `afterRate - optionDc`, 0 미만 방지, 단위 반올림 순서로 최종 단가를 만든다.

프런트도 동일하게 구성했다.

- 세트 구성품은 `OTHER`로 계산하므로 모델코드 플래그의 정액이 적용된다.
- `HOMEMULTI`/`COMMERCIAL_MULTI`는 정액 합계를 0으로 만들고 기존 전역율만 적용한다.
- 품목 고정율과 싱글 정액이 동시에 존재하는 `OTHER`는 율 적용 후 정액 차감 후 반올림한다.

따라서 홈멀티·상업멀티의 율과 싱글 정액이 이중 적용되지 않으며, `dc-config-service` 계산 로직 자체는 변경하지 않았다.

## 4. RED-A / RED-B 원문과 GREEN 결과

### RED 원문

```text
RED-A (기능이 동작한다)
· 정액 보유 거래처 + 판별에 걸리는 모델코드 → 정액이 실제로 차감된다
· 세트 전개 구성품에도 적용된다
· 레거시 getModelFlags 의 각 분기(AC 6P/4P/4D/1P/1D · AP D+C / P · AP D+H · AP230/AP290 · F)가 같은 결과를 낸다

RED-B (결함이 재발하지 않는다 — 반대급부)
· 정액 미보유 거래처의 금액이 이 변경 전후로 동일하다
· 율 기반 할인이 정액과 이중 적용되지 않는다
· AC·AP 가 아닌 모델코드가 잘못 판별되지 않는다
```

### RED 실제 실행

```text
.\gradlew :shared:common:test --tests "*LegacyModelFlags*" --console=plain
Exit code: 1
error: cannot find symbol LegacyModelFlags

.\gradlew :services:slip-service:test --tests "*DiscountPriceCalculator*" --console=plain
Exit code: 1
error: toRequestLine(Line) has private access in DiscountPriceClient

npm run test -- --run src/renderer/utils/slipDiscount.test.ts
Exit code: 1
[로컬 파생물 신선도 확인 실패]
- Electron main 빌드 산출물 out\main\index.js이(가) 없습니다
```

첫 두 실패는 새 RED 계약이 아직 구현되지 않은 상태의 컴파일 RED였다. 프런트 첫 실행은 코드 assertion이 아니라 fresh worktree의 `out` 사전조건 RED였다.

### GREEN 실제 결과

- `LegacyModelFlagsTest`: 레거시 각 분기와 짧은/비 AC·AP 음성 케이스 통과.
- `DiscountPriceCalculatorTest`: 전표 요청 body의 여섯 flag 실값 및 비 AC/AP 전부 false 통과.
- `SlipFormPage.test.tsx`: 확장 구성품 `AC123456P`, 판매가 100,000원, 360 정액 30,000원 → 70,000원과 설명 표시 통과.
- `slipDiscount.test.ts`: 25 tests passed. 360, 4way P/D, 1way P/D, stand D+C/P, deluxe D+H, AP230, AP290, AC/AP F, 음성 모델, no-config, multi 이중 적용 방지를 모두 포함한다.
- `SlipFormPage.test.tsx`: 101 tests passed.
- 두 프런트 파일 합계: `Test Files 2 passed`, `Tests 126 passed`.

## 5. 정액 미보유 거래처 금액 불변

정액 설정이 없거나 여섯 amount가 모두 null이면 `parseAmount()` 합계가 0이고, 기존 `Math.round(listPrice)` 경로로 수렴한다. `slipDiscount.test.ts`의 다음 케이스가 이를 고정한다.

```text
싱글 정액이 없는 거래처는 종전 정가를 유지한다
AC123456P + 여섯 amount null -> unitPrice 1000000, source NONE
config null -> unitPrice listPrice
```

또한 Java 계산기 원문도 `config == null`이면 `sumOptionDc()`가 0이다. 따라서 정액 미보유 209/259 거래처에는 계산 경로상 변화가 없다. 기존 QA 표본 `1012555999`의 정액이 비어 있다는 PM 측정도 이 결과와 일치한다.

두 표본 코드의 현재 `partner_db` 실재 여부는 Docker 금지 조건 때문에 DB 접속/기동으로 재조회하지 않았다. 저장소 grep으로는 `1068689215`가 기존 `partner_db.partners` live QA 보고서에 실제 행으로 기록되어 있고, `1060818309`는 기존 QA 표에 등장하지만 이 worktree 안의 seed/직접 SQL 결과로는 확정하지 못했다. 이 부분은 코드 수정의 전제가 아니라 후속 실측 항목으로 남긴다.

## 6. 실행 명령과 종료 코드 원문

```text
.\gradlew :services:slip-service:test --tests "*Discount*" --tests "*Price*" --console=plain
Exit code: 0
BUILD SUCCESSFUL in 1m 52s

.\gradlew :services:dc-config-service:test --tests "*PriceCalculation*" --console=plain
Exit code: 0
BUILD SUCCESSFUL in 13s

.\gradlew :services:accounting-service:test --tests "*Discount*" --tests "*Price*" --console=plain
Exit code: 0
BUILD SUCCESSFUL in 16s

.\gradlew :shared:common:test --tests "*LegacyModelFlags*" --console=plain
Exit code: 0
BUILD SUCCESSFUL

npx vitest run src/renderer/routes/SlipFormPage.test.tsx src/renderer/utils/slipDiscount.test.ts --reporter=dot
Exit code: 0
Test Files 2 passed
Tests 126 passed

npx tsc -p tsconfig.node.json --noEmit
Exit code: 0

npx tsc -p tsconfig.web.json --noEmit
Exit code: 0

npm run build
Exit code: 0
빌드 성공. 기존 폰트 경로 및 dynamic import warning만 출력.

npm run typecheck
Exit code: 124
command timed out after 244044 milliseconds
원인: typecheck:real-qa 내부 node --test scripts/real-qa-scope.test.cjs 프로세스가 종료되지 않음.

git diff --check
Exit code: 0
출력 없음
```

`npm run typecheck`의 TypeScript 본체는 위의 node/web `tsc` 각각 exit 0으로 확인했으며, 변경 경로 Vitest와 production build도 exit 0이다. timeout으로 남은 real-QA child process는 세션에서 시작한 PID만 정리했다.

## 신규 파일

- `docs/dev-reports/2026-08-06-1069-r8-fixed-amount-discount.md`
- `shared/common/src/main/java/com/samhanair/logis/common/discount/LegacyModelFlags.java`
- `shared/common/src/test/java/com/samhanair/logis/common/discount/LegacyModelFlagsTest.java`

기존 QA 증거 `docs/qa/1069-bundle-expansion-real-qa/`는 수정하지 않았다. commit/push도 수행하지 않았다.
