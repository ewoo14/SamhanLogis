# PR #1058 / Issue #1008 R5 — 다중 부모 부모 선택 규칙 안전화

## 결론

**부모 선택 규칙: 레거시 GAS는 구성품 단건의 첫 부모를 고르지 않고, 실내기 후보 세트를 구성품·가격까지 모두 맞춘 뒤 그 첫 일치 후보의 `setName`을 선택한다.**

레거시 원문은 `tools/legacy-gas/일마감 프로그램/Code.js:590-652`이다.

```javascript
var cands = catalog.indoorToSets[ind.token] || [];
cands.sort(function(a, b) { return catalog.setToComps[b].length - catalog.setToComps[a].length; });

for (var c = 0; c < cands.length; c++) {
  var setName = cands[c];
  var reqComps = catalog.setToComps[setName];
  var reqOut = reqComps.find(function(rc) { return rc.class === 'OUTDOOR'; });
  if (!reqOut) continue;
  var outIdx = pool.findIndex(function(p) {
    return !p.used && p.class === 'OUTDOOR' && p.token === reqOut.token;
  });
  if (outIdx === -1) continue;
  // 구성품과 가격을 모두 맞춘 뒤
  if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) {
    matchedPoolIdxs.forEach(function(idx) { pool[idx].used = true; });
    break;
  }
}
```

구성품→부모가 1:N인데 현재 `lookupSummaryByModelName`이 거래 라인 묶음 없이 부모를 단건 반환하므로, R5는 복수 활성 BUNDLE 부모를 임의 확정하지 않고 `parentSetModelCode=null`을 반환한다. accounting-service는 부모가 없을 때 기존 `modelToken` fallback을 사용한다.

이번 R5는 불변식 1·2를 완성하고, 레거시의 완성 세트 컨텍스트가 없는 API 경계 때문에 불변식 3은 미완화로 남겼다.

## 1. RED — 22행 과차감 재현

실 카탈로그 값을 사용한 fixture다. `AC060CXAPBH1`은 실 `product_db`에서 `AC060CS6PBH1SY`, `AC060CS4PBH2SY`, `AP060CAPPBH1S` 세 활성 BUNDLE 부모에 연결되어 있다.

추가한 실패 테스트:

```text
ProductServiceTest > findByModelName_multipleParents_doesNotChooseAnArbitraryParent() FAILED
    org.opentest4j.AssertionFailedError at ProductServiceTest.java:589

1 test completed, 1 failed
```

RED 원인은 기존 `findParentComponentLink`가 `created_at, id` 순 첫 링크를 즉시 반환했기 때문이다.

실 카탈로그 + `dc_config_db` 읽기 전용 재집계 원문:

```text
 multi_parent_components | no_option_actual_links_with_arbitrary_option | selector_mismatch_links
-------------------------+----------------------------------------------+-------------------------
                     202 |                                           22 |                     243
```

22 링크는 `360` 실제 부모 옵션 미보유 18행과 `4way` 실제 부모 옵션 미보유 4행이다. 활성 설정은 다음과 같다.

```text
 active_configs | c360 | c4way
----------------+------+-------
            210 |   45 |    46
```

따라서 기존 확정 과차감은 `18×45 + 4×46 = 994행`, `42,200,000원`이었다.

## 2. fix

### product-service

`findParentComponentLink`가 활성 BUNDLE 부모 후보를 모두 모은 뒤 다음 규칙을 적용한다.

- 유효 부모가 0개: `null` 반환.
- 유효 부모가 1개: 기존 부모 selector 반환.
- 유효 부모가 2개 이상: 부모를 임의 선택하지 않고 `null` 반환.

이 계약은 레거시 GAS가 요구하는 거래 라인 단위 세트 매칭을 단건 model lookup이 가장하지 않도록 한다.

### accounting-service

`resolveProductModels`와 `resolveParentSetNames`가 같은 모델을 각각 조회하던 구조를 하나의 `resolveProductSummaries` 결과로 통합했다. 첫 응답에서 model match와 parent selector를 함께 만들므로 동일 모델당 HTTP는 `2N → N`이 된다.

## 3. GREEN

```text
./gradlew :services:product-service:test --tests ...findByModelName_multipleParents_doesNotChooseAnArbitraryParent --tests ...findByModelName_existing_returnsProduct :services:accounting-service:compileJava --no-daemon --console=plain
BUILD SUCCESSFUL in 35s

./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest --no-daemon --console=plain
BUILD SUCCESSFUL in 25s
```

RED 테스트는 복수 부모에서 `parentSetModelCode=null`을 확인하며 GREEN이 됐다. 기존 단일 부모의 `AC060CS4PBH2SY` selector 테스트도 유지되어 4way 정액 계산 회귀 없이 통과했다.

## 4. 불변식 실측

### 1) 부모 선택 규칙

PASS. `Code.js:590-652`의 `cands → reqComps → reqOut → price equality → break` 원문을 보고서 첫 문장과 함께 인용했다. 단건 API는 복수 부모를 임의 선택하지 않는다.

### 2) 확정 과차감 994행 → 0행

PASS(계산상). 실 카탈로그에서 확정 과차감 원인이던 22 링크는 모두 복수 부모이며, R5 후 `lookupSummaryByModelName`의 parent selector가 null이다. 따라서 활성 `dc_config_db`의 `360=45`, `4way=46` 설정과 결합할 부모 selector가 없어:

```text
no_option_parent_wrong_rows   : 0
no_option_parent_wrong_amount : 0원
```

기존 기준의 제거량은 `18×45 + 4×46 = 994행`, `42,200,000원`이다. 이는 과거 발행 전표가 아니라 실 카탈로그 링크×활성 거래처 설정 1회 조합 실측이다.

### 3) 실외기 65행 → 0, 실내기 0

**미완화 / FAIL.** 단건 lookup에서 임의 부모를 제거하면 실외기 65행을 레거시의 완성 세트 후보로 결정할 입력이 현재 accounting API에 없다. 실내기 0행은 기존 상태를 유지하지만, 실외기 65행을 0으로 재수렴했다고 주장하지 않는다.

### 4) 옵션 미보유 164곳 0원 변화

PASS. 실 `dc_config_db` 활성 설정은 210곳이며 옵션 정액 미보유 모집단은 164곳이다. `optionDiscountFor`에 null이 전달되는 경로를 유지하므로 금액 변화는 `164곳 / 0원`이다.

### 5) 조회 비용

PASS(현재 R5 변경 기준). 동일 모델 N개에 대해 기존 R4 코드의 `2N HTTP`를 `N HTTP`로 줄였다. product-service 단건 endpoint 자체는 부모가 없는 모델에서 제품 1쿼리+부모 링크 1쿼리, 단일 부모 모델에서 여기에 부모 제품 1쿼리가 추가되는 기존 비용이 남아 있다. R5가 그 비용을 늘리지는 않았다.

## 5. 모듈 전체 테스트

요청한 accounting-service 모듈 전체 테스트:

```text
./gradlew :services:accounting-service:test --no-daemon --console=plain
command timed out after 314042 milliseconds
```

전체 테스트는 timeout이다. 따라서 모듈 전체 GREEN을 주장하지 않으며, CI를 권위 결과로 둔다. 변경 관련 compile, product-service 회귀 테스트, accounting 상세 테스트는 위 GREEN 원문처럼 통과했다.

## 6. 변경 파일별 증감

`git diff --numstat` 및 신규 보고서 기준이다. 추가·삭제를 분리했다.

```text
services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java +19 / -20
services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java                 +18 / -7
services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java             +30 / -0
docs/dev-reports/2026-08-02-1008-r5-parent-selection-rule-fix.md                                                +98 / -0
```

## 7. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1008-r5-parent-selection-rule-fix.md`

커밋, push, checkout, 브랜치 조작, Docker 이미지 재빌드, 공유 DB write/DDL은 수행하지 않았다.
