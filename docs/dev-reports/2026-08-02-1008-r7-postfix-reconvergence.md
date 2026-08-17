# PR #1058 / Issue #1008 R7 — R6 postfix 재수렴 리뷰

> 대상: `feat/1008-daily-closing`, HEAD `5615f8540`  
> 제약 준수: 코드 수정, commit/push/checkout, Docker 이미지 재빌드, 공유 DB write/DDL, 합성 데이터 생성 없음. DB 명령은 `BEGIN TRANSACTION READ ONLY`만 사용했다.

## 결론

**BLOCK — 머지 불가.** R6은 R5가 제거한 “구성품 단건의 임의 부모 선택”을 되살리지는 않아 종전 확정 과차감 기준 **994 partner×catalog행 / 42,200,000원은 0행 / 0원으로 유지**한다. 그러나 R6의 핵심 목표인 실외기 미차감은 해결되지 않았다.

이번 라운드에는 원본 Google Sheet에 접근했다. `싱글 구성품!A1:N1737`의 현재 비공백 데이터는 1,735행이며, 옵션 세트 실내기·실외기 비교 대상은 각각 97행이다. 시트 자체가 앞선 라운드의 100쌍에서 97쌍으로 바뀌어 과거 65행 기준은 현재 **63행**이지만, 동일한 현재 원본에 R5 fallback과 R6 현행 매핑을 각각 적용하면 실외기 불일치는 **63 → 63행**이다. 0행이 아니다.

직접 원인은 `MonthEndCloseService.resolveMatchedSetNames`가 매칭된 부모 세트명을 `INDOOR` 구성품 토큰에만 기록하는 데 있다. 앞선 결함 모집단은 `OUTDOOR` 행이므로 실외기는 계속 자기 `modelToken`을 사용한다.

더 근본적으로 `LegacySetMatcher`는 `Code.js:590-652`의 이식이 아니다. 후보 제한·정렬, 옵션 구성품 처리, 가격 비교 단위, 할인 반영, 수량 전개, 반복 매칭과 동점 처리가 모두 다르다. 특히 레거시는 두 번째 `납품가`를 합산하고 세트 할인 1회를 뺀 합계를 비교하지만, 현행은 `releasePrice`를 우선하여 모든 구성품의 개별 단가가 정확히 같을 것을 요구한다. 실 DB 구성품 링크 **1,584/1,584행**에서 `release_price != delivery_price`여서 이 차이는 실데이터에 도달한다.

## 1. 각도 1 — 실외기 미차감 65행이 실제 0인가

### 판정: FAIL — 현재 원본 기준 63행이 그대로 남음

원본 접근 원문:

```text
status=200 contentType=text/csv; charset=utf-8 bytes=290247 dataRows=1735 sourceRange=싱글 구성품!A1:N1737

A : 360 CST UV 실외기
C : AC060CXAPBH1
D : 실외기
I :   910,000
M : AC060CS6PBH1SY
```

접근 경로는 다음 읽기 전용 공개 CSV endpoint였다.

```text
https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=싱글%20구성품&range=A1:N1737
```

참고로 자격증명 없는 Sheets v4 API 직접 호출은 다음처럼 거부됐지만, 같은 시트의 공개 GViz 읽기는 성공했다.

```text
GVIZ status=200 contentType=text/csv; charset=utf-8 bytes=290247
API ERROR: 원격 서버에서 (403) 사용할 수 없음 오류를 반환했습니다.
status=403
```

전수 집계 원문:

```text
sourceRowsIncludingHeader=1736 dataRows=1735 relevant=194
kind=실내기 rows=97 r5_mismatch=0 r6_mismatch=0 r6_new_option=0
kind=실외기 rows=97 r5_mismatch=63 r6_mismatch=63 r6_new_option=0
total_r5_mismatch=63 total_r6_mismatch=63 total_r6_new_option=0
```

실외기 63행의 선택기 차이:

```text
4way, none=27
stand, none=25
360, none=10
deluxe, none=1
```

과거 65행과 현재 63행의 차이는 R6 효과가 아니라 원본 시트 모집단이 `100+100`행에서 `97+97`행으로 바뀐 결과다. 동일한 현재 1,735행에 전후 규칙을 적용한 값은 **63 → 63**이다.

현행 원문:

```java
Set<String> indoorTokens = grouped.getOrDefault(matched.get(), List.of()).stream()
        .filter(c -> "INDOOR".equals(c.kind()))
        .map(EstimateComponent::componentModelCode)
        .collect(java.util.stream.Collectors.toSet());
Map<String, String> result = new HashMap<>();
indoorTokens.forEach(token -> result.put(token, matched.get()));
```

따라서 문제의 `OUTDOOR` 토큰은 `parentSetNames`에 들어가지 않고 아래 fallback을 그대로 탄다.

```java
String optionToken = parentSetNames.getOrDefault(modelToken, modelToken);
```

## 2. 각도 2 — 과차감 994행 / 42,200,000원이 돌아왔는가

### 판정: PASS — 종전 확정 과차감 기준은 0행 / 0원 유지

현재 실 원본 194행에서 R6가 fallback에 없던 옵션을 새로 붙인 행은 다음처럼 **0행**이다.

```text
total_r6_new_option=0
```

이유는 R6가 매칭 결과를 실내기에만 붙이고, 현재 원본의 실내기 97행은 원래 `modelToken` 선택기와 `setName` 선택기가 모두 같기 때문이다. R3의 임의 부모처럼 옵션 미보유 구성품에 다른 부모의 옵션을 붙이는 경로는 사용하지 않는다.

현재 거래처 설정 재측정 원문:

```text
BEGIN
 active_configs | c360 |    s360    | c4way |   s4way    | optionless
----------------+------+------------+-------+------------+------------
            210 |   45 | 1900000.00 |    46 | 2000000.00 |        164
(1 row)

COMMIT
```

따라서 앞선 동일 benchmark의 `18×45 + 4×46 = 994행`, `18×1,900,000 + 4×2,000,000 = 42,200,000원`은 R6에서 다시 생기지 않는다. 이번 라운드의 현재 원본에서도 신규 옵션 선택 0행이므로 확정 과차감은 **0행 / 0원**이다.

현재 영속 전표는 모델 보유 행이 0이라 실제 발생액 측정 모집단은 없다.

```text
BEGIN
 sales_rows | sales_rows_with_model
------------+-----------------------
          1 |                     0
(1 row)

 tax_rows | tax_rows_with_model |  tax_total
----------+---------------------+-------------
       22 |                   0 | 17690999.00
(1 row)

COMMIT
```

즉 **catalog×설정 benchmark 과차감 0**과 **현재 영속 전표 모델 보유 0행**을 분리해 판정했다.

## 3. 각도 3 — 매칭 실패 fallback

### 판정: PASS(후보 불일치), 단 catalog 호출 실패는 예외 전파

후보가 완성되지 않으면 `findFirstCompleteSet`이 `Optional.empty()`를 반환하고, 호출부는 빈 Map을 반환하여 기존 `modelToken`을 사용한다. 관련 실제 테스트 재실행 원문:

```text
.\gradlew.bat :services:accounting-service:test --tests '*LegacySetMatcherTest' --tests '*DailyClosingDetailServiceTest.dailyDetailKeepsModelTokenFallbackWhenSetMatchFails' --no-daemon --console=plain

> Task :services:accounting-service:test

BUILD SUCCESSFUL in 27s
21 actionable tasks: 1 executed, 20 up-to-date
```

해당 fallback 테스트는 실 원본 모델 `AC060CXAPBH1` 단건을 사용하며, 4way 20,000원 설정이 있어도 재검증 토큰을 `AC060CXAPBH1`로 유지하고 `deliveryPrice=100000`을 확인한다. 후보 불일치가 예외나 금액 변화로 새지는 않는다.

다만 이는 “matcher가 빈 결과를 반환하는 경우”에 한정한다. `estimateComponents`의 HTTP/포맷 실패는 `BusinessException(INTERNAL_ERROR)`로 전파하므로 product-service 장애까지 fail-soft인 것은 아니다.

## 4. 각도 4 — 조회 +2가 상수인가 / bulk 상한

### 판정: HTTP +2는 상수, 100건 제한 없음; 무제한 IN 청킹은 없음

현행 호출부에는 모델 수와 무관하게 아래 두 호출이 각각 한 번만 있다.

```java
catalog.addAll(productClient.estimateComponents("SINGLE_SET"));
catalog.addAll(productClient.estimateComponents("COMMERCIAL_MULTI"));
```

따라서 기존 distinct model lookup `N`회에 더해 accounting→product HTTP는 **N+2**다. 모델 수가 늘어도 `+2` 자체는 늘지 않는다.

현재 실행 중 product-service의 같은 bulk endpoint 실호출 원문:

```text
category=SINGLE_SET status=200 rows=1447
category=COMMERCIAL_MULTI status=200 rows=137
```

DB 모수 원문:

```text
 product_category | parents
------------------+---------
 COMMERCIAL_MULTI |     342
 SINGLE_SET       |     276

 product_category | components | component_codes
------------------+------------+-----------------
 COMMERCIAL_MULTI |        137 |              43
 SINGLE_SET       |       1447 |             357
```

부모 342건·구성품 1,447행을 한 호출에서 실제 반환했으므로 `IN 100건` 제한은 없다. endpoint 내부는 카테고리당 부모 1회, 구성 링크 1회, 구성품 제품 1회, 사양 1회의 bulk 조회여서 현재 구현 기준 DB 조회도 카테고리당 4회, 합계 **8회 고정**이다.

다만 `findByBundleProductIdIn`, `findByModelCodeInAndIsDeletedFalse`, `findByProductIdInOrderByDisplayOrderAsc`는 청킹이나 application-level 최대 크기 검증이 없다. PostgreSQL에는 Oracle식 100/1000 `IN` 제한은 없고 현재 342/357 key는 통과했지만, 매우 큰 카탈로그에서 JDBC bind/SQL 크기 상한에 도달할 때의 보호는 없다.

## 5. 각도 5 — `Code.js:590-652` 원문 대조

### 판정: FAIL — 순서·동점·가격·소비 규칙이 다름

레거시 실제 순서는 다음과 같다.

```javascript
var cands = catalog.indoorToSets[ind.token] || [];
cands.sort(function(a, b) { return catalog.setToComps[b].length - catalog.setToComps[a].length; });
for (var c = 0; c < cands.length; c++) {
  var setName = cands[c];
  var reqComps = catalog.setToComps[setName];
  var reqOut = reqComps.find(function(rc) { return rc.class === 'OUTDOOR'; });
  if (!reqOut) continue;
  ...
  var finalExpectedPrice = expectedPriceSum - discount;
  ...
  if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) {
    matchedPoolIdxs.forEach(function(idx) { pool[idx].used = true; });
    break;
  }
}
```

대조 결과:

| 항목 | 레거시 | 현행 R6 | 결과 |
|---|---|---|---|
| 후보 범위 | 현재 실내기 토큰의 `indoorToSets`만 | 두 카테고리의 모든 세트 | 다름 |
| 후보 순서 | 구성품 수 내림차순 | endpoint/group 삽입 순서 | 다름 |
| 동점 | 기존 `indoorToSets` 원본 순서를 보존하는 stable sort | DB의 `bundleProductId`/응답 순서 | 다름 |
| 필수 구성 | 실내기·실외기 필수, 옵션은 pool에 있는 것만 합산 | 후보의 모든 구성품 필수 | 다름 |
| 가격 | 구성품 기대가 합계 - 거래처 세트 정액 1회와 invoice 합계 비교 | 각 구성품 `price == unitPrice` | 다름 |
| 가격 원천 | 두 번째 `납품가` (`pCols[1]`) | `releasePrice`, null일 때만 `deliveryPrice` | 다름 |
| 수량 | `abs(qty)`만큼 pool 행 전개 | `AxisKey`별 1행으로 집계, 수량 미전개 | 다름 |
| 반복 | 모든 실내기를 순회하고 성공한 pool만 `used=true` | 전체 pool에서 첫 완성 세트 1개만 반환 | 다름 |
| 격리 | 레거시 처리 중인 items/pool | 하루 전체 `byModel`; matcher는 partnerCode를 보지 않음 | 다름 |
| 결과 적용 | 성공 세트 구성의 pool 행을 소비 | 성공 세트의 실내기 token에만 setName 기록 | 다름 |

가격 원천 차이의 실 DB 전수 원문:

```text
 product_category | component_links | release_delivery_diff | release_null_delivery_present
------------------+-----------------+-----------------------+-------------------------------
 COMMERCIAL_MULTI |             137 |                   137 |                             0
 SINGLE_SET       |            1447 |                  1447 |                             0
```

즉 현재 구성품 링크 **1,584/1,584행**에서 현행 matcher의 우선 가격과 레거시 가격 원천이 다르다. 또한 레거시는 `discount`를 합계에서 차감하지만 현행 matcher는 거래처 설정을 입력으로 받지 않으므로 할인된 정상 세트의 price equality를 같은 방식으로 판단할 수 없다.

현행 단위 테스트는 구성품 2개, 후보 1개, 각 개별 가격이 정확히 같은 fixture 한 건만 검증한다. 후보 정렬, 동점, 선택 옵션, 할인 후 합계, 수량 2 이상, 복수 세트 반복, partner 격리, 실외기 결과 적용은 검증하지 않는다.

## 6. 종합 판정

| 각도 | 실측 | 판정 |
|---|---:|---|
| 1. 실외기 미차감 | 과거 65; 현재 원본 63 → R6 63 | **FAIL / BLOCK** |
| 2. 확정 과차감 | 994행/42,200,000원 기준 → 0행/0원 유지 | PASS |
| 3. matcher 실패 fallback | 관련 테스트 BUILD SUCCESSFUL, 금액 변화 0 | PASS(후보 불일치 범위) |
| 4. 조회 증가 | N+2 HTTP, product endpoint 2회; 1,447/137행 반환 | PASS(상수), 무청킹 위험 기록 |
| 5. 레거시 이식 | 핵심 비교 항목 10개 모두 차이 | **FAIL / BLOCK** |

최종 판정은 **BLOCK**이다. 과차감 진자운동은 멈췄지만, R6은 실외기 미차감을 해결하지 못했고 레거시 매칭 계약을 정확히 이식하지 않았다.

## 7. 재현 원문 요약

이번 라운드에서 직접 실행한 핵심 명령은 다음과 같다.

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=싱글%20구성품&range=A1:N1737"

docker exec samhan-postgres psql -U samhan -d dc_config_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT ... FROM dc_configs WHERE NOT is_deleted; COMMIT;"

docker exec samhan-postgres psql -U samhan -d product_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT ... FROM bundle_component ...; COMMIT;"

docker exec samhan-postgres psql -U samhan -d accounting_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT ...; COMMIT;"

.\gradlew.bat :services:accounting-service:test --tests '*LegacySetMatcherTest' --tests '*DailyClosingDetailServiceTest.dailyDetailKeepsModelTokenFallbackWhenSetMatchFails' --no-daemon --console=plain
```

## 8. 이 라운드가 보지 않은 것

- 공유 accounting DB에는 모델 보유 영속 전표가 0행이라, 실제 과거 일마감 전표에서의 63건 발생 횟수·금액은 측정하지 않았다.
- Docker 이미지를 재빌드하지 않았으므로 HEAD `5615f8540` accounting-service를 공유 스택에 배포해 HTTP E2E로 일마감 화면을 재실행하지 않았다.
- 전체 accounting-service 테스트, GitHub CI, PR checks는 이번 제한된 재수렴 라운드에서 실행·조회하지 않았다.
- 상업멀티 원본 Google Sheet의 레거시 후보 매칭 전수는 조사하지 않았다. product-service bulk 응답 137행과 코드 구조만 확인했다.
- PostgreSQL/JDBC의 극단적 parameter 상한까지 부하를 만들어 시험하지 않았다. 현재 실 모수 342 parents / 357 component codes / 1,447 rows까지만 실호출했다.
- product-service 장애·timeout·잘못된 envelope에서 일마감 전체가 실패하는 실제 E2E는 실행하지 않았다. 코드상 예외 전파만 확인했다.
- 후보 동점에서 실제로 서로 다른 세트가 선택되는 실 전표는 영속 데이터 부재로 재현하지 않았다. 원문 순서 차이는 확정했지만 발생 건수는 미측정이다.

## 9. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1008-r7-postfix-reconvergence.md`

