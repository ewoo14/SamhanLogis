# PR #1058 / Issue #1008 라운드 fix — `setName` 옵션 정액 선택 패리티

## 결론

레거시 GAS 일마감의 옵션 정액 선택 토큰을 구성품 집계 행의 `modelToken`에서 부모 세트의 `parentSetModelCode`로 보완했다. 부모 세트를 해소하지 못하는 행은 기존 `modelToken` fallback을 그대로 유지한다.

이번 라운드에서 새로 만든 파일은 다음 1개다.

- `docs/dev-reports/2026-08-02-1008-r3-setname-parity-fix.md`

## 1. 원인

레거시 `Code.js:585-592`는 실내기와 실외기 구성품을 완성 세트로 매칭한 뒤 선택된 `setName`을 `Code.js:621-646` 옵션 selector에 넣는다. 현행 `MonthEndCloseService`는 `axisKey`에 구성품 `modelToken`만 보존하고, `DiscountRevalidator`에도 그 값을 전달했다.

실 원본의 대표 조합은 다음과 같다.

```text
setName    AC060CS4PBH2SY  → 4way
modelToken AC060CXAPBH1    → 옵션 미선택
```

따라서 4way 정액을 보유한 거래처에서는 현행 기대 납품가가 4way 금액만큼 덜 차감됐다.

## 2. RED 원문

실 원본 시트에 존재하는 구성품 모델 `AC060CXAPBH1`, `singleSets` 경로를 사용해 fix 전 테스트를 실행했다.

```text
DailyClosingDetailServiceTest > 레거시 싱글 세트 옵션은 구성품 modelToken이 아니라 매칭된 setName으로 선택한다 FAILED
    org.mockito.exceptions.verification.opentest4j.ArgumentsAreDifferent at DailyClosingDetailServiceTest.java:293

Wanted:
discountRevalidator.revalidate(
    "무풍 4way 냉난방 프레스티지 실외기",
    "AC060CS4PBH2SY",
    110000.0000000000,
    150000,
    100000,
    null,
    <any>,
    MATCHED
)
Actual invocations have different arguments at positions [1, 4]:
discountRevalidator.revalidate(
    "무풍 4way 냉난방 프레스티지 실외기",
    "AC060CXAPBH1",
    110000.0000000000,
    150000,
    100000,
    null,
    GlobalDiscount[available=true, homeRate=0.45, commercialRate=0.45,
      discount360Amount=null, discount4WayAmount=null, discount1WayAmount=null,
      discountStandAmount=null, discountDeluxeAmount=null, discountFirstGradeAmount=null],
    MATCHED
)
```

## 3. fix 설명

- product-service 내부 모델 lookup 요약에 구성품의 부모 세트 `parentSetModelCode`를 추가했다. 기존 `ProductSummaryResponse` 호출 생성자는 호환 유지했다.
- accounting-service는 모델 lookup 결과의 부모 세트 코드가 있을 때만 옵션 selector 토큰으로 사용한다.
- 부모 세트 코드가 없거나 모델 lookup이 실패하면 기존 구성품 `modelToken`을 사용한다. 따라서 일반 품목, 세트 매칭 실패, 기존 비세트 fallback을 막지 않는다.
- 옵션 정액의 우선순위·산술 순서·DC 유형 판정 자체는 변경하지 않았다.

## 4. GREEN 원문

### fix 전 RED 테스트

```text
BUILD SUCCESSFUL in 21s
21 actionable tasks: 2 executed, 19 up-to-date
1 test completed, 1 failed
```

### fix 후 동일 테스트

```text
BUILD SUCCESSFUL in 21s
21 actionable tasks: 2 executed, 19 up-to-date
```

테스트는 `AC060CS4PBH2SY`를 재검증 토큰으로 전달했고, 4way 20,000원 차감 후 `deliveryPrice=80000`을 확인했다.

## 5. 불변식 실측

### 1) 레거시와 같은 옵션 선택

Google Sheets 읽기 전용 API로 실 원본 `싱글 구성품!A1:N1737`을 다시 읽었다. API가 반환한 비공백 데이터 레코드는 1,735행이었다.

```text
sourceRange: 싱글 구성품!A1:N1737
eligibleRows: 200
실내기: rows 100, mismatches 0
실외기: rows 100, mismatches 65
selectorMismatches: 65
```

이는 fix 전 selector 기준 재현 수치다. 코드 테스트의 fix 후 대표 경로는 `setName=AC060CS4PBH2SY`로 4way를 선택한다. 실제 원본의 대표 셀도 동일하다.

동일한 200행에 fix 후 선택 규칙(`parentSetModelCode`가 있으면 setName selector 사용)을 적용해 재계산한 결과는 `실내기 100행 / 0불일치`, `실외기 100행 / 0불일치`, `전체 200행 / 0불일치`다.

```text
AC060CS4PBH2SY / AC060CN4PBH1 / AC060CXAPBH1
```

### 2) 실내기 무회귀

동일 전수 대조에서 실내기 100행의 기존 불일치는 0행이었다. fix 후에도 실내기 selector 경로를 구성품 modelToken 자체로 잘못 덮어쓰지 않으며, 대상 조합 기준 집계값은 `100행 / 0불일치`로 유지된다.

### 3) 영향 없어야 할 모집단의 금액 불변

실 DB read-only 재집계 결과:

```text
dc_config_db 활성 거래처             210곳
옵션 정액 보유 거래처                 46곳
옵션 정액 미보유 거래처              164곳
4way 정액 nonzero 거래처              46곳
sales_accounting_slip_lines            0행
tax_invoice_lines                     22행
tax_invoice_lines 모델명 미보존       22행
tax_invoice_lines category_key null   22행
tax_invoice_lines VAT 포함 합계  17,690,999.00원
```

옵션 미보유 164곳은 `optionDiscountFor`가 계속 null이므로 fix 전후 차감액은 `164곳 / 0원 변화`다. 실제 sales accounting 전표는 `0행 / 0원`이라 세트 아닌 일반 품목 및 세트 매칭 실패 전표의 로컬 발생 모집단도 `0행 / 0원`이다. 남아 있는 tax invoice 22행 역시 모델명·category_key가 모두 없어 부모 세트 해소가 불가능하고 기존 fallback 입력을 그대로 사용한다. 따라서 해당 실제 행의 VAT 포함 원천금액 `17,690,999.00원`은 fix 전후 동일하다.

이번 로컬 DB에는 대표 실외기 발생 전표가 없으므로 46곳의 과거 실제 차감 누락 건수를 가장하지 않았다. 46곳은 실 `dc_config_db`의 현재 옵션 보유 거래처 수이며, 차감액 변화 검증은 실 원본 대표 조합을 사용하는 GREEN 테스트에서 20,000원으로 확인했다.

### 4) 세트 매칭 실패 fallback

부모 `parentSetModelCode`가 null/공백인 경우 `optionToken`은 기존 `modelToken`과 동일하게 유지하도록 구현했다. 기존 `ProductSummary` 호환 생성자를 사용하는 테스트와 tax invoice 실제 22행의 null 모델 경로가 이 fallback 모집단을 고정한다.

## 6. 모듈 전체 테스트 결과

요청대로 다음 accounting 모듈 전체 테스트를 실행했다.

```text
./gradlew :services:accounting-service:test --no-daemon
```

실행은 304초 후 다음 원문으로 timeout 됐다.

```text
command timed out after 304030 milliseconds
```

따라서 accounting 모듈 전체 테스트를 GREEN이라고 주장하지 않는다. Testcontainers skip 여부를 확인할 수 있는 전체 테스트 종료 요약은 얻지 못했다. 대신 변경된 모듈들의 컴파일과 RED 재현 GREEN 단일 테스트는 확인했다.

```text
./gradlew :services:product-service:compileJava :services:product-service:compileTestJava :services:accounting-service:compileJava :services:accounting-service:compileTestJava --no-daemon --console=plain
BUILD SUCCESSFUL in 43s
12 actionable tasks: 2 executed, 10 up-to-date
```

## 7. 변경 파일별 증감

`git diff --numstat` 기준이며 추가분과 삭제분을 섞지 않았다.

```text
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductSummary.java                  +8 / -1
services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java           +19 / -1
services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java +38 / -0
services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java                       +3 / -1
services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java               +30 / -2
docs/dev-reports/2026-08-02-1008-r3-setname-parity-fix.md                                                            +169 / -0
```

커밋, push, checkout, 브랜치 조작, Docker 이미지 재빌드는 수행하지 않았다.
