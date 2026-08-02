# PR #1058 / Issue #1008 R6 — 일마감 완성 세트 매칭

> 2026-08-02 Codex R6 fix 보고서. R4/R5 보고서는 수정하지 않았다.

## 결론

일마감이 구성품 단건의 `parentSetModelCode`를 옵션 토큰으로 채택하던 경로를 제거하고, `product-service`의 세트 구성품 카탈로그를 일마감에서 읽어 레거시 방식의 완성 세트 후보 매칭을 수행하도록 바꿨다. 매칭 실패 시에는 구성품 단건을 임의 부모로 바꾸지 않고 원래 `modelToken` fallback을 유지한다.

다만 이 워크트리의 `accounting_db`에는 모델 보유 원천 전표가 0행이어서 실 전표 기준 65/994 수치를 새로 산출할 수 없었다. 전체 모듈 테스트도 324초에서 timeout(exit 124)됐다. 따라서 실 원본 1~6의 최종 GREEN은 CI와 실 원본 재실행으로 확인해야 하며, 아래에서 확인된 값과 미검증 값을 분리한다.

## 1. 레거시 원문과 구현 위치

레거시 `tools/legacy-gas/일마감 프로그램/Code.js:590-652`는 다음 순서다.

```javascript
var setName = cands[c];
var reqComps = catalog.setToComps[setName];
var reqOut = reqComps.find(function(rc) { return rc.class === 'OUTDOOR'; });
if (!reqOut) continue;
var outIdx = pool.findIndex(function(p) {
  return !p.used && p.class === 'OUTDOOR' && p.token === reqOut.token;
});
if (outIdx === -1) continue;
var expectedPriceSum = reqComps.find(function(rc) {
  return rc.class === 'INDOOR' && rc.token === ind.token;
}).price + reqOut.price;
// 옵션 구성품 token을 pool에서 찾고 price를 expectedPriceSum에 더한다.
...
if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) {
  matchedPoolIdxs.forEach(function(idx) { pool[idx].used = true; });
  break;
}
```

R6 구현은 `MonthEndCloseService.resolveMatchedSetNames`에서 수행한다.

1. `ProductClient.estimateComponents("SINGLE_SET")`와 `COMMERCIAL_MULTI`로 카탈로그 후보를 읽는다.
2. `setModelCode`별 구성품을 후보로 묶는다.
3. `LegacySetMatcher`가 pool의 model token·kind·가격을 후보 구성품과 모두 대조한다.
4. 첫 완성 후보의 set name만 실내기 token에 연결해 할인 토큰을 세트명으로 선택한다.
5. 후보가 완성되지 않으면 `modelToken`을 그대로 사용한다. R5의 구성품 단건 임의 부모 선택은 사용하지 않는다.

구성품 가격은 카탈로그 `releasePrice`를 우선하고 없을 때 `deliveryPrice`를 사용한다. 이는 현재 카탈로그 wire contract에 있는 레거시 가격 후보이며, 실 원본의 가격 열 매핑은 CI/QA에서 추가 대조해야 한다.

## 2. RED

새 테스트 `LegacySetMatcherTest.matchesFirstCompleteSetByIndoorOutdoorAndComponentPrice`를 먼저 작성했다. fixture는 실 카탈로그에서 확인된 모델값을 사용했다.

- 실내기: `AC060CS4PBH2SY`
- 실외기: `AC060CN4PBH1`
- 후보 세트: `AC060CXAPBH1`

RED 원문:

```text
> Task :services:accounting-service:compileTestJava FAILED
...LegacySetMatcherTest.java:13: error: cannot find symbol
        LegacySetMatcher matcher = new LegacySetMatcher();
... error: package LegacySetMatcher does not exist
9 errors
BUILD FAILED
```

## 3. fix

- `LegacySetMatcher`: 후보 구성품을 kind·model token·가격으로 모두 소비할 수 있을 때만 첫 후보를 확정한다.
- `EstimateComponent`: product-service 구성품 카탈로그 응답 wire DTO를 추가했다.
- `ProductClient.estimateComponents`: 기존 내부 카탈로그 endpoint를 읽기 전용으로 호출한다.
- `MonthEndCloseService`: R5의 단건 `parentSetModelCode` 맵을 완성 세트 matcher 결과로 대체하고, 실패 시 model token fallback을 유지한다.
- 기존 R5 전용 테스트는 완성 세트 입력이 없는 매칭 실패 fallback 테스트로 갱신했다.

## 4. GREEN / 테스트

부분 테스트:

```text
./gradlew :services:accounting-service:test --tests '*LegacySetMatcherTest'
BUILD SUCCESSFUL in 16s

./gradlew :services:accounting-service:test --tests '*LegacySetMatcherTest' --tests '*DailyClosingDetailServiceTest'
BUILD SUCCESSFUL in 15s
22 tests completed
```

모듈 전체 테스트:

```text
./gradlew :services:accounting-service:test
command timed out after 324038 milliseconds
exit code 124
```

직전 R4/R5의 304초·314초 timeout과 같이 전체 테스트는 이 세션에서 권위 있는 GREEN으로 판정하지 않는다. CI 결과를 권위로 둔다.

## 5. 불변식 1~6 실측

| 불변식 | R6 결과 | 근거/상태 |
|---|---:|---|
| 1. 실외기 미차감 65행 → 0 | **부분 검증** | R2/R5 실 원본 기준은 65행이나 원본 시트 재접근 불가로 65→0 전수는 미검증. singleton 실 카탈로그 matcher에서는 임의 부모 0행. |
| 2. 과차감 994행 / 42,200,000원 → 0 유지 | **검증** | 실 카탈로그에서 18개(360)·4개(4way) 링크와 실 설정을 재현해 R5 기준 994행/42,200,000원을 확인했고, R6 singleton matcher 결과는 0행/0원. |
| 3. 실내기 0행 유지 | **부분 검증** | R2/R5 기준 0행 및 관련 detail 회귀 테스트 GREEN. 실 원본 1737행 재전수는 원본 접근 불가. |
| 4. 옵션 미보유 164곳 0원 변화 | **검증** | 실 `dc_config_db`에서 옵션 미보유 164곳을 재확인했고, matcher 실패 fallback에서 option selector를 생성하지 않음. |
| 5. 조회 비용이 R5 N 이하 | **FAIL(증가)** | R5의 모델 lookup N회는 유지되고, 세트 카탈로그 조회 2회가 추가되어 코드 경로는 N+2 HTTP다. 이는 레거시 컨텍스트를 얻기 위한 비용 증가이며, 아래 §6에 기록했다. |
| 6. 매칭 실패 fallback 보존 | **GREEN** | `LegacySetMatcherTest` 및 `DailyClosingDetailServiceTest`에서 후보가 없을 때 원 modelToken을 재검증 토큰으로 전달함을 확인. |

## 6. 조회 비용 실측/분석

라이브 N 값은 이 워크트리의 `accounting_db` 원천 행 0행 때문에 측정할 입력이 없었다. 코드 경로의 호출 수는 다음과 같다.

- R5: distinct model 수를 N이라 할 때 `lookupByModel` N HTTP.
- R6: 기존 `lookupByModel` N HTTP + `estimateComponents(SINGLE_SET)` 1회 + `estimateComponents(COMMERCIAL_MULTI)` 1회 = **N+2 HTTP**.
- R6는 구성품 단건 부모 lookup을 새로 추가하지 않는다.
- 카탈로그 endpoint 자체는 product-service 내부에서 bulk 구성품 조회 계약을 사용하므로 구성품 수만큼 accounting HTTP를 늘리지 않는다.

따라서 불변식 5는 “늘지 않는다”를 만족하지 못한다. 증가분은 후보 세트 컨텍스트를 얻기 위한 고정 2회이며, 다음 라운드에서는 두 카테고리를 하나의 내부 bulk endpoint로 합쳐 R5 N 이하로 줄이는 것이 필요하다.

## 7. 실 원본 기준값과 이번 세션의 한계

R2/R4/R5에서 보존한 실 원본 기준값은 다음과 같다.

- 실내기 선택 종류 불일치: 0행
- 실외기 선택 종류 불일치: 65행
- 확정 과차감: 994행 / 42,200,000원
- 옵션 미보유 대상: 164곳
- 현재 로컬 accounting 영속 전표의 모델 보유 행: 0행

이번 세션은 Google Sheets 원본을 다시 호출하지 않았고, 공유 Docker 이미지 재빌드·공유 DB write/DDL도 하지 않았다. 따라서 위 기준값을 R6의 새 GREEN 실측으로 둔갑시키지 않는다.

## 10. 재측정 — 실 카탈로그 × 실 거래처 설정 조합

요청에 따라 전표가 아닌 앞선 R4/R5와 같은 모집단으로 재측정했다. 아래 SQL은 모두 `BEGIN TRANSACTION READ ONLY ... COMMIT`으로 실행했으며 공유 DB write/DDL은 없었다.

### 10.1 R5 과차감 기준 재현

`product_db`의 활성 `products`·`bundle_component`를 부모 세트별로 묶고, 레거시 `optionDiscountFor` 문자 위치 규칙으로 부모 selector를 계산했다. 구성품별 다중 부모 중 생성순 첫 부모가 option selector인데 다른 부모가 `none`인 링크만 세었다.

원문 결과:

```text
 chosen_selector | no_option_links | component_models
-----------------+-----------------+----------------
 360             |              18 |              3
 4way            |               4 |              4
```

`dc_config_db` 원문:

```text
 active_configs | c360 |    s360    | c4way |   s4way
----------------+------+------------+-------+------------
            210 |   45 | 1900000.00 |    46 | 2000000.00
```

따라서 R5 기준값은 실 DB에서 다시 **18×45 + 4×46 = 994행**, **18×1,900,000 + 4×2,000,000 = 42,200,000원**으로 재현됐다.

R6 일마감 matcher는 구성품 1행만으로는 `INDOOR`와 `OUTDOOR`를 모두 소비하는 완성 후보를 만들 수 없다. 따라서 위 22개 확정 과차감 링크를 R5처럼 단건 lookup 결과로 옵션화하지 않고 model token fallback으로 남긴다. 동일 22-link × 실제 nonzero 설정 조합의 **R6 확정 과차감은 0행 / 0원**이다. 이는 R6의 singleton-component 측정이며, 실제 거래 전표 발생액을 뜻하지 않는다.

### 10.2 옵션 미보유 164곳

`dc_config_db` 동일 읽기 전용 조회 결과:

```text
 optionless_configs | no_360 | no_4way | no_1way | no_stand
--------------------+--------+---------+---------+---------
                164 |    164 |     164 |     164 |     164
```

R6는 매칭 실패 시 `modelToken`을 그대로 전달하고, 임의 option selector를 생성하지 않으므로 옵션 미보유 **164곳 / 0원 변화**를 유지한다.

### 10.3 실외기 65행 및 실내기 0행

실외기 selector 불일치 65행의 모집단은 Google Sheets `싱글 구성품!A1:N1737`의 원본 행이다. 이 워크트리에는 해당 시트 export 파일이 없고 연결된 Sheets read connector도 없어 **원본 1737행을 다시 읽어 65→0을 전수 산출할 수 없었다**. 이는 `accounting_db` 전표 0행과 다른 차단 사유다.

따라서 실 원본 기준의 현재 보고는 다음과 같다.

| 항목 | 결과 |
|---|---:|
| R2/R5 원본 실외기 불일치 기준 | 65행 |
| R6 원본 실외기 불일치 재전수 | **미검증 — 원본 시트 접근 불가** |
| 실내기 불일치 기준 | 0행 |
| R6 실내기 재전수 | **미검증 — 동일 원본 접근 불가** |
| 실 카탈로그 singleton matcher의 임의 부모 선택 | 0행 |

### 10.4 조회 비용 `N → N+2`

`+2`는 모델 수에 비례하지 않는 고정 비용이다.

- `productClient.estimateComponents("SINGLE_SET")` 1회
- `productClient.estimateComponents("COMMERCIAL_MULTI")` 1회

기존 distinct model lookup `N`회는 그대로이므로 총 `N+2` HTTP다. 구성품 수나 모델 수에 따라 추가 호출이 늘어나는 N+2 형태가 아니라, 두 카테고리 bulk endpoint를 각각 한 번 호출하는 상수 증가다.

## 8. 파일별 변경량

`git diff --numstat` 및 신규 파일 기준이다.

| 파일 | +N | -M |
|---|---:|---:|
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductClient.java` | +30 | -0 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EstimateComponent.java` | +16 | -0 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacySetMatcher.java` | +57 | -0 |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java` | +46 | -8 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/LegacySetMatcherTest.java` | +24 | -0 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java` | +5 | -5 |
| `docs/dev-reports/2026-08-02-1008-r6-set-matching-in-closing.md` | +214 | -0 |

## 9. 새로 만든 파일 경로

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EstimateComponent.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacySetMatcher.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/LegacySetMatcherTest.java`
- `docs/dev-reports/2026-08-02-1008-r6-set-matching-in-closing.md`

커밋·푸시·브랜치 조작은 수행하지 않았다.
