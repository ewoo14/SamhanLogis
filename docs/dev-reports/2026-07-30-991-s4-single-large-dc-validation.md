# PR #991 슬4 — 싱글중대형 DC액 검증 신설

## 1. 슬라이스 정의와 확정 전제

PR #991 코멘트의 슬라이스 정의를 그대로 적용했다.

> 4 | 🔴 싱글중대형 DC액 검증 신설 — `DiscountRevalidator:123-126` 이 `AC|AP|AR|AF|PC|AWR|ARR` 를 `OUT_OF_SCOPE` 로 버리고 `DailyClosingDetailResponse` 에 DC액 필드 자체가 없음

이번 라운드의 기준은 다음과 같다.

- 정본 축은 `model_name`에서 보존·정규화된 GAS 모델 토큰이다. `product_code`는 사용하지 않았다.
- 싱글중대형은 할인율이 아니라 DC액을 검증한다.
- 일마감은 회계 원장을 수정하지 않는 read-time 검증이다.
- 품목 고정DC는 `products.fixed_discount_rate`, 전역DC는 `dc_configs`와 옵션 정액 6종, 기본 할인율은 `partners`의 의미를 유지한다.
- 전표 자유 입력 `agreeTerm`를 할인 기준으로 사용하지 않았다. 기존 오염 주석도 함께 정정했다.
- 기존 price-history가 제공하는 기준 납품가를 과거 거래의 참조값으로 사용한다. 일마감에서 현재 전역 설정을 재조회해 과거 전표를 재작성하지 않는다. 이 선택이 멱등성과 과거 단가 검증을 보존한다.

## 2. 원인

기존 `DiscountRevalidator`는 모델 토큰이 `AC|AP|AR|AF|PC|AWR|ARR`로 시작하면 `OUT_OF_SCOPE`와 `verified=null`을 반환했다. 따라서 싱글중대형의 실제 DC액은 계산되지 않았고, `DailyProductLine`과 desktop 표에도 전달할 필드가 없었다.

현대 회계 경로에서 계산 가능한 동일 기준은 다음이다.

```text
VAT 포함 실제 단가 = (공급가액 + 세액) / 수량
실제 DC액         = 출고가 - VAT 포함 실제 단가
기대 DC액         = 출고가 - 기준 납품가
판정              = 두 DC액을 원 단위 HALF_UP으로 비교
```

싱글중대형에서는 `expectedRate`를 만들지 않고, `actualRate`는 기존과 같이 참고값으로만 남긴다. 가격·수량·라벨을 확인할 수 없으면 `NOT_FOUND`, `MISSING_REFERENT`, `NOT_MEASURABLE`과 `verified=null`을 유지한다.

## 3. RED 원문

수정 전 정상 싱글중대형 가격을 기대하는 회귀 테스트를 먼저 추가하고 실행했다.

```text
명령:
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t23'
.\gradlew.bat :services:accounting-service:test \
  --tests 'com.samhanair.logis.accounting.service.DiscountRevalidatorTest.singleSetDependentValidatesDiscountAmount' \
  --rerun-tasks --no-build-cache

DiscountRevalidatorTest > 싱글중대형은 실제 DC액이 기준 납품가와 맞으면 확인한다 FAILED
    org.opentest4j.AssertionFailedError at DiscountRevalidatorTest.java:208

1 test completed, 1 failed

FAILURE: Build failed with an exception.
Execution failed for task ':services:accounting-service:test'.
> There were failing tests.
```

RED의 원인은 기대대로 기존 `OUT_OF_SCOPE` 반환이었다.

## 4. 수정 내용

### 백엔드

- `DiscountRevalidator.Revalidation`에 `discountAmount`를 추가했다.
- 싱글중대형 7개 정본 접두가 실제 DC액 검증 분기로 진입한다.
- 정상 DC액은 `VERIFIED/true`, 오입력은 `VERIFIED/false`, 측정 불가는 `NOT_MEASURABLE/null`이다.
- 멀티·구형·액세서리·운임·기타 default 분기의 기존 판정은 바꾸지 않았다. 다른 분기의 `discountAmount`는 null이다.
- `DailyClosingDetailResponse.DailyProductLine`과 desktop `closingApi` 계약에 `discountAmount`를 연결했다.
- desktop 일마감 표에 `DC액` 열을 추가했다. 음수는 `-X` 빨강, 0/null은 `—`, 코드 prefix는 없다.

### 주석 오염 정정

`DiscountRevalidator.java`의 기존 싱글 분기 주석 2곳을 다음 의미로 정정했다.

- enum 설명: “싱글중대형 기준값을 확인할 수 없어 범위 밖으로 남겨야 하는 분기.”
- 분기 설명: “싱글중대형 본체/부속: 출고가와 기준 납품가의 차액을 DC액으로 검증한다.”

할인과 무관한 `agreeTerm`를 할인 기준처럼 읽게 하는 표현은 남기지 않았다.

## 5. 양방향 검증

| 케이스 | 출고가 | VAT 포함 실제 단가 | 기준 납품가 | 표시 DC액 | 판정 |
|---|---:|---:|---:|---:|---|
| 싱글 정상 | 100,000 | 70,000 | 70,000 | 30,000 | `VERIFIED`, `true` |
| 싱글 오입력 | 100,000 | 80,000 | 70,000 | 20,000 | `VERIFIED`, `false` |
| 싱글 측정 불가 | 100,000 | null | 70,000 | null | `NOT_MEASURABLE`, `null` |

추가로 다음을 테스트로 고정했다.

- `AC|AP|AR|AF|PC|AWR|ARR` 7개 접두 모두 싱글 DC 검증 분기로 진입한다.
- 멀티의 품목 고정DC `30%`가 전역 기본 `45%`보다 우선한다.
- 같은 싱글 입력을 두 번 검증해 결과 record가 동일하다.
- 기존 멀티 정상 라인의 `discountAmount`는 null이고 기존 `expectedRate/actualRate/verified` 판정은 유지된다.

## 6. GREEN 원문

### 싱글·응답 서비스 회귀

```text
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t23'
.\gradlew.bat :services:accounting-service:test \
  --tests 'com.samhanair.logis.accounting.service.DiscountRevalidatorTest' \
  --tests 'com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest' \
  --rerun-tasks --no-build-cache

BUILD SUCCESSFUL
21 actionable tasks: 21 executed
```

### desktop 화면

```text
npm test -- --run src/renderer/routes/DailyClosingPage.test.tsx

Test Files  1 passed (1)
Tests       25 passed (25)
```

`DC액` 열, 양수 표시, 음수 `-200,000` 빨강, 0/null `—`을 화면 테스트로 확인했다.

신규 fixture는 `DiscountRevalidator`와 `DailyClosingDetailService`가 실제 서비스 경로에서 받는
가격·수량·매칭 결과를 mock으로 구성한 테스트 입력이다. raw SQL로 API가 만들 수 없는 상태를 주입하지 않았고,
DB fixture 행을 생성하지 않았으므로 별도 삭제 대상도 없다.

### 전체 accounting 모듈

다음 명령을 `--rerun-tasks --no-build-cache --no-daemon`으로 실행했다.

```text
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-build-cache --no-daemon
```

최종 실행은 `BUILD SUCCESSFUL`로 종료되었고 9분 41초가 걸렸다. 캐시 성공이나 `UP-TO-DATE`를 GREEN으로 세지 않았다.

```text
test suites  142
tests        1,162
failures     0
errors       0
skipped      10

```text
BUILD SUCCESSFUL in 9m 41s
21 actionable tasks: 21 executed
```

최종 테스트 파일 추가 후에는 변경된 `DiscountRevalidatorTest` 전체도 별도 강제 실행 대상으로 다시 확인했다.

### desktop 타입체크

```text
npm run typecheck

exit code 0
real-QA cleanup scope: 2 passed
real-QA scope: 50 passed, 0 failed
```

## 7. 실 데이터 15행 읽기 전용 측정

공유 DB에는 write를 하지 않았고 다음 SELECT만 실행했다.

### 스키마 확인

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('tax_invoice_lines','tax_invoices')
ORDER BY table_name, ordinal_position;
```

현재 `accounting_db.tax_invoice_lines`에는 `item_name`, `quantity`, `unit_price`, `supply_amount`, `vat_amount`는 있으나 `model_name`, `category_key`는 없다. 따라서 이 DB의 과거 15행에는 슬2에서 보존한 정본 축 snapshot이 없다.

### 행 수·금액 정합

```sql
SELECT ti.status, COUNT(*) AS invoices, COUNT(til.id) AS lines
FROM tax_invoices ti
LEFT JOIN tax_invoice_lines til
  ON til.tax_invoice_id = ti.id AND til.is_deleted = FALSE
WHERE ti.is_deleted = FALSE
GROUP BY ti.status
ORDER BY ti.status;
```

```text
status       invoices  lines
CANCELLED    3         3
DRAFT        4         4
ISSUED       13        8
```

비삭제 세금계산서 라인은 총 15행이고, 그중 현재 ISSUED 조회 대상은 8행이다.

```sql
SELECT COUNT(*) AS lines,
       COUNT(*) FILTER (
         WHERE til.supply_amount = ROUND(til.quantity * til.unit_price, 2)
       ) AS supply_arithmetic_match,
       COALESCE(SUM(til.supply_amount), 0) AS stored_supply,
       COALESCE(SUM(ROUND(til.quantity * til.unit_price, 4)), 0) AS recomputed_supply
FROM tax_invoice_lines til
JOIN tax_invoices ti ON ti.id = til.tax_invoice_id
WHERE ti.is_deleted = FALSE AND til.is_deleted = FALSE;
```

```text
lines  supply_arithmetic_match  stored_supply  recomputed_supply
15     15                        20060000.00    20060000.0000
```

### DC 판정 가능성

`model_name/category_key`가 없는 상태에서 `item_name`만 GAS 모델 토큰 정규식으로 보수적으로 세면 다음과 같다.

```sql
SELECT COUNT(*) AS lines,
       COUNT(*) FILTER (WHERE til.item_name ~* '(^|[^A-Z])(AC|AP|AR|AF|PC|AWR|ARR)[A-Z0-9-]{4,}')
         AS single_token_candidates,
       COUNT(*) FILTER (WHERE til.item_name ~* '(^|[^A-Z])(AM|AJ)[A-Z0-9-]{4,}')
         AS multi_token_candidates,
       COUNT(*) FILTER (WHERE til.quantity IS NULL OR til.quantity = 0) AS not_measurable,
       COUNT(*) FILTER (WHERE til.unit_price IS NULL) AS missing_unit_price
FROM tax_invoice_lines til
JOIN tax_invoices ti ON ti.id = til.tax_invoice_id
WHERE ti.is_deleted = FALSE AND til.is_deleted = FALSE;
```

```text
lines  single_token_candidates  multi_token_candidates  not_measurable  missing_unit_price
15     0                        1                       0                0
```

결론은 **싱글 DC 판정 가능 0행, 정본 축 부재로 미검증/UNKNOWN 15행**이다. 이것은 조용한 통과가 아니다. 한 건의 멀티 후보는 이번 싱글 DC 범위가 아니며, 전체 15행의 금액 산술 자체는 15/15 정합이다. V67이 아직 적용되지 않은 공유 DB에 backfill하거나 쓰기를 하지 않았다.

## 8. 마이그레이션 판정

- working tree: accounting `V67`, slip `V60`.
- `origin/main`: accounting `V66`, slip `V59`.
- V67/V60은 슬2의 기존 category-axis migration이며 이번 슬4는 DTO·read-time 계산·화면 표시만 추가한다.
- 이번 변경에는 DB 컬럼·테이블 변경이 없으므로 새 migration은 만들지 않는다.
- `origin/main`과 전체 remote history를 대조했을 때 각 서비스의 다음 번호 사이에 미적용 하위 번호 gap은 없다. 서비스별 적용 순서는 accounting `V66 → V67`, slip `V59 → V60`이며, 두 서비스 사이에 하나의 전역 순서를 강제하지 않는다. 슬4에서 새 번호를 선점하지 않는다.

## 9. 8개 불변식 확인표

| # | 불변식 | 확인 근거 | 결과 |
|---:|---|---|---|
| 1 | 싱글중대형 DC액 검증 | 7개 접두 분기 테스트 + 정상/오입력 테스트. 더 이상 싱글을 무조건 `OUT_OF_SCOPE`로 반환하지 않음 | 통과 |
| 2 | 응답·화면 표시 | `Revalidation.discountAmount` → `DailyProductLine` → `closingApi` → `DC액` 표 열 연결, desktop 25건 통과 | 통과 |
| 3 | 오입력 거부·정상 승인 양방향 | 30,000 정상 `true`, 20,000 오입력 `false`를 각각 고정 | 통과 |
| 4 | 판정 불가를 UNKNOWN/미검증 표시 | 측정 불가 `NOT_MEASURABLE/null`; 실 DB 15행은 축 snapshot 부재로 미검증 | 통과 |
| 5 | 고정DC 우선 | 품목 고정DC 30%가 전역 기본 45%보다 우선하는 기존 멀티 테스트 유지 | 통과 |
| 6 | Journal 수정·backfill 금지 | diff에 journal/domain/migration write 없음; DB는 SELECT만 실행 | 통과 |
| 7 | 다른 회계 화면·보고서·기존 계열 무변경 | 기존 분기 코드와 원장 경로를 수정하지 않고, accounting 전체 결과 0 failures 확인 | 통과 |
| 8 | 멱등 | 동일 싱글 입력 2회 결과 record equality 테스트, 계산은 순수 read-time | 통과 |

## 10. 변경 범위와 남긴 파일

최종 `git diff --numstat` 기준 변경 파일은 9개이며, 신규 파일은 별도로 1개다. 아래 수치는 파일별 `추가/삭제` 줄 수다.

변경 파일:

- `clients/desktop/src/renderer/api/closingApi.ts` — `+2/-0`
- `clients/desktop/src/renderer/api/mock.ts` — `+2/-0`
- `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx` — `+14/-0`
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx` — `+21/-0`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java` — `+39/-8`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java` — `+1/-0`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/DailyClosingDetailResponse.java` — `+3/-1`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java` — `+13/-8`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DiscountRevalidatorTest.java` — `+76/-3`

변경 파일 합계: `+171/-20`

신규 파일:

- `docs/dev-reports/2026-07-30-991-s4-single-large-dc-validation.md` — `+277/-0`

이번 작업이 남긴 파일 전체 목록은 위 10개다. 빌드 산출물은 ignored 상태이고, 별도 생성·보존하지 않았다.

수행하지 않은 것: git add/commit/push/checkout, `CURRENT-WORK.md` 수정, Docker 재배포, 공유 DB write, Journal 변경, backfill, 계산서 발행, 국세청 업로드 엑셀 생성.
