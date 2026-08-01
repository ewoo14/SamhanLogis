# PR #991 슬라이스 1 — 카테고리 축 분류 계약

- 작성일: 2026-07-30
- 브랜치: `fix/monthend-detail-price-variant`
- 범위: 슬라이스 1만 구현
- 원칙: A-2. 아는 값만 정식 축으로 인정하고, 나머지는 `UNKNOWN`으로 남긴다.
- 금지 준수: Docker 실행 없음, git 쓰기 없음, 주문→전표→회계전표→세금계산서 파이프라인 변경 없음, backfill 없음.

## 1. 슬라이스 1 정의

PR 코멘트의 슬라이스 정의를 그대로 따른다.

> **분류 계약** — GAS `currentZone` ↔ 네 schedule 키 대응을 명시하고, `UNKNOWN`·비정식 키를 정상/미상으로 구분하는 테스트 계약을 먼저 고정

이번 슬라이스는 판매 라인의 원천 보존(슬2), 집계 축 전달·분리(슬3), 기존 전표의 미상 표시 계층(슬4)을 구현하지 않는다.

## 2. RED-first 원문

### 실행 명령

```powershell
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t23'
.\gradlew :services:accounting-service:test `
  --tests 'com.samhanair.logis.accounting.service.GasCategoryAxisTest' `
  --rerun-tasks --no-build-cache
```

구현 전에 `GasCategoryAxisTest.java`만 추가하고 실행했다. 계약 타입이 아직 없어 컴파일 단계에서 실패했다.

```text
...\GasCategoryAxisTest.java:17: error: cannot find symbol
        assertThat(GasCategoryAxis.fromGasZone("HOME_MULTI").scheduleKey())
                   ^
  symbol:   variable GasCategoryAxis
  location: class GasCategoryAxisTest
...
...\GasCategoryAxisTest.java:53: error: package GasCategoryAxis does not exist
        assertThat(GasCategoryAxis.UNKNOWN.scheduleKey()).isNull();
                                  ^

29 errors

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:accounting-service:compileTestJava'.
> Compilation failed; see the compiler error output for details.

BUILD FAILED in 3m 6s
```

이 RED는 분류 계약이 타입·테스트로 존재하지 않는 현재 상태를 재현한다. 특히 정식 schedule 키와 `UNKNOWN`을 구별할 호출 계약이 없었다.

## 3. 구현 내용

### 3.1 `GasCategoryAxis`

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/GasCategoryAxis.java`에 다음 계약을 추가했다.

| GAS 표현 | 정식 schedule 키 | 축 |
|---|---|---|
| `HOME_MULTI` | `homemulti` | `HOME_MULTI` |
| `SINGLE` | `singleSets` | `SINGLE` |
| `COMM_MULTI` | `commercialMulti` | `COMM_MULTI` |
| `OLD` 가격표 우선 조회 | `oldProducts` | `OLD` |
| 공란·`UNKNOWN`·비정식 값 | 없음 | `UNKNOWN` |

- 양방향 변환을 제공한다: `fromGasZone`, `fromScheduleKey`.
- 입력의 바깥 공백과 대소문자만 정규화한다.
- `HOME_MULTI`, `AIR_CONDITIONER`, `product_code`, 숫자형 `010001` 같은 값은 정식 schedule 키로 변환하지 않는다.
- `UNKNOWN.scheduleKey()`는 `null`이다. 미상 값을 정식 가격 schedule로 가장하지 않는다.
- 상품 master의 `product_category` 또는 숫자형 `product_code`를 판매 카테고리로 추정하지 않는다. GAS 모델 축의 보존축은 `model_name`에서 정규화한 모델 토큰이어야 한다.

### 3.2 기존 단가 조회 경로의 계약 소비

`MonthEndCloseService.priceHistoryDate`의 기존 문자열 집합 검사를 `GasCategoryAxis.fromScheduleKey`로 교체했다.

- 네 정식 키의 기존 동작은 유지한다.
- `null`, 공란, 비정식 키, schedule 미등록 키는 기존과 같이 가격 조회를 생략한다.
- 이 변경은 표시 단가의 합계·원장·전표 데이터를 쓰지 않는다.

## 4. 테스트 및 GREEN

### 계약 테스트

`GasCategoryAxisTest`가 다음을 고정한다.

1. 네 GAS zone의 schedule 키 정확한 대응.
2. 정식 키의 양방향 round-trip.
3. 공란·`UNKNOWN`·`AIR_CONDITIONER`·`HOME_MULTI`·`product_code`의 `UNKNOWN` 수렴.
4. 숫자형 이카운트 `product_code=010001`이 GAS 모델 토큰·카테고리가 되지 않음.
5. 공백·대소문자 정규화 후에도 정식 키만 인정.

### 실행 결과

```text
.\gradlew :services:accounting-service:test
  --tests GasCategoryAxisTest
  --tests DailyClosingDetailServiceTest
  --tests ModelTokenExtractorTest
  --tests DiscountRevalidatorTest
  --rerun-tasks --no-build-cache

BUILD SUCCESSFUL in 39s
21 actionable tasks: 21 executed

tests=38 failures=0 errors=0 skipped=0
```

세부 테스트 수:

| 테스트 클래스 | 테스트 수 | 실패 | 오류 | skip |
|---|---:|---:|---:|---:|
| `GasCategoryAxisTest` | 5 | 0 | 0 | 0 |
| `DailyClosingDetailServiceTest` | 12 | 0 | 0 | 0 |
| `ModelTokenExtractorTest` | 8 | 0 | 0 | 0 |
| `DiscountRevalidatorTest` | 13 | 0 | 0 | 0 |
| 합계 | 38 | 0 | 0 | 0 |

추가 확인: `git diff --check` 이상 없음.

## 5. 불변식별 확인 결과

| # | 확인한 것 | 결과 및 경계 |
|---:|---|---|
| 1 | `GasCategoryAxisTest`의 네 zone↔schedule 매핑, 숫자형 `product_code` 거부, `ModelTokenExtractorTest`의 모델 토큰 정규화 | **슬1 계약 통과.** 실제 판매 라인이 `model_name` 축으로 보존·집계되는 것은 슬2·슬3에서 연결해야 하므로 이번 슬라이스에서 전체 통과를 주장하지 않는다. 현재 `byModel`의 원천 key 변경은 하지 않았다. |
| 2 | 공란·`UNKNOWN`·비정식 키를 `GasCategoryAxis.UNKNOWN`으로 수렴시키고 정식 축과 분리하는 테스트 | **슬1 계약 통과.** 실제 일마감 행에 `UNKNOWN`을 표시하고 정상 집계와 분리하는 전달 경로는 슬2·슬4 범위다. |
| 3 | `DiscountRevalidatorTest`의 현재 싱글 본체/부속 케이스 | **미충족·후속 경계.** 기존 `OUT_OF_SCOPE` 동작은 이번 슬1에서 변경하지 않았다. 판매 라인 카테고리 축과 DC액 필드가 연결되어야 실제 싱글중대형 DC액 검증을 수행할 수 있다. |
| 4 | enum 변환이 입력 외부 상태를 변경하지 않으며, 정식 키 round-trip 테스트를 통과 | **슬1 변환 함수 멱등성 확인.** 전체 임포트·집계 재실행의 멱등성은 원천/집계 슬라이스에서 별도 검증해야 한다. |
| 5 | `DailyClosingDetailServiceTest`의 인상 전 기준일·정가결측 회귀와 기존 모델 토큰 테스트 | **이번 변경으로 표시 금액을 만들거나 바꾸지 않음을 확인.** 실제 전표 원천 값과 화면의 전건 대조는 판매전표 원천 연결 후 수행한다. |
| 6 | 변경 파일에 journal/domain/migration/repository 쓰기 없음, `git diff --check`, 선택 테스트 통과 | **통과.** 회계 원장과 전표 데이터를 수정하지 않았다. |
| 7 | 변경 범위를 `accounting-service`의 분류 helper와 기존 일마감 단가 key 검증으로 제한하고 clients·다른 service·schema를 수정하지 않음 | **이번 diff 기준 통과.** 다른 회계 화면·보고서의 전건 회귀는 CI 권위로 남긴다. |

## 6. `UNKNOWN` 비율 실측치

이번 값은 새 합성 fixture가 아니라 정찰에서 읽기 전용 SELECT로 확인한 현재 데이터다.

| 실측 범위 | 전체 | 정식 GAS 카테고리 확인 | `UNKNOWN`/카테고리 미확인 | 비율 |
|---|---:|---:|---:|---:|
| `accounting_db.tax_invoice_lines` 활성 22행 | 22 | 0 | 22 | **100.00%** |
| `slip_db` 활성 `OUTBOUND` + 활성 parent | 2,659 | 22행은 주문 역조회 후보 | 2,637 | **99.17%** |
| 그중 `source_type=MANUAL` | 2,636 | 0 | 2,636 | **100.00%** |

`tax_invoice_lines` 22행은 품목명에 GAS의 `AM`/`AJ` 모델 토큰이 없어 모두 `UNKNOWN`이었다. `slip_lines`의 2,637행은 `source_order_line_id`가 없고 원본 XLSX 행 순서도 보존하지 않아 GAS zone을 정직하게 복원할 수 없다. 상품 master나 `product_estimate_exposure`로 이 값을 채우지 않았다.

따라서 현재 직접 확인 가능한 기본 일마감 원천의 `UNKNOWN` 비율은 **22/22 = 100.00%**다. 이 수치가 과반이므로, A-1을 재검토할 판단 근거로 남긴다. 다만 A-1은 파이프라인 저장·backfill이 필요한 별도 결정이며 이번 슬라이스에서 착수하지 않는다.

## 7. 변경 범위와 파일별 수치

### 변경 파일

`git diff --numstat` 기준이다.

| 파일 | +N | −M |
|---|---:|---:|
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java` | 5 | 6 |

### 신규 파일

신규 파일은 아직 git add하지 않았으므로 일반 `git diff --numstat`에는 나타나지 않는다. 각 파일에 대해 `git diff --no-index --numstat /dev/null <파일>`로 확인했다.

| 파일 | +N | −M |
|---|---:|---:|
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/GasCategoryAxis.java` | 86 | 0 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/GasCategoryAxisTest.java` | 61 | 0 |
| `docs/dev-reports/2026-07-30-991-s1-category-axis.md` | 175 | 0 |

## 8. 다음 슬라이스 경계

- 슬2: 판매전표 원천과 `model_name`/`categoryKey` 보존 계약. `slip_lines`의 2,637개 미연결 행을 추정하지 않는다.
- 슬3: `byModel` 단일 품목명 key를 제거하고 최소 모델 토큰·라인 원천·카테고리 축으로 분리 집계한다.
- 슬4: A-2에 따라 모르는 라인을 `UNKNOWN`으로 표시하고 정상 축 집계에 섞지 않는다.
- 싱글중대형 DC액 검증과 고정DC·전역DC·기본 할인율 우선순위는 카테고리 축이 연결된 뒤 별도 RED-first 테스트로 다룬다.

이번 산출물에는 commit, push, checkout, Docker 실행이 없다.
