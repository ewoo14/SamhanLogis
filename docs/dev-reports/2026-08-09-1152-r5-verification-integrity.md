# PR #1152 R5 — 검증 장치 무결성 재수렴

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tnongoods`
- 기준 HEAD: `dfebd5cda`
- 커밋/푸시: 하지 않음
- 실 DB 직접 쓰기: 하지 않음

## ① 공식 real-QA 하네스 선택

R4의 문제 파일은 디렉터리만 `-real-qa`이고 파일명이 `1152-r3-non-goods-live-qa.spec.ts`였다. 해당 파일을 삭제하고 다음 파일로 개명했다.

`clients/desktop/playwright/1152-r3-non-goods-real-qa/1152-r3-non-goods-live-real-qa.spec.ts`

실행 명령:

```text
cd clients/desktop
npx playwright test --config=playwright.real-qa.config.ts --list --reporter=line playwright/1152-r3-non-goods-real-qa
```

원문:

```text
Listing tests:
  [renderer] › 1152-r3-non-goods-real-qa\1152-r3-non-goods-live-real-qa.spec.ts:38:1 › PR #1152 R5 라이브 — 지정·견적 라인·저장·견적서 인쇄
Total: 1 test in 1 file
```

따라서 공식 `testMatch: **/*-real-qa.spec.ts`가 이 파일을 1건 선택한다. 설정의 `headless: true`를 사용하고 mock 전용 설정은 사용하지 않는다.

스펙의 범위:

1. `${BASE_URL}/#/products/estimate-items`에서 품목 확정 화면 도달 단언
2. NON_GOODS 지정 및 견적 포함 확정
3. `${BASE_URL}/#/sales/estimates/new`에서 실제 검색 API 응답의 `goodsType=NON_GOODS` 단언
4. NON_GOODS 납품가 입력 후 수량 `7 → 1`
5. 실제 검색 API 응답의 `goodsType=GOODS` 단언 및 GOODS 수량 `3` 유지
6. 견적 임시저장 후 상세 화면 도달 단언
7. 저장 상세의 인쇄 버튼으로 팝업을 열고 `data-testid="quote-print-area"` 도달 단언
8. `resolveQaShotsDir` 경유 캡처
9. 마지막에 품목 확정 상태 원복

모든 라우팅은 `${BASE_URL}/#/경로` 형식이다.

라이브 실행은 하지 않았다. 현재 renderer `:5175`가 listen 중이 아니고, 저장·PATCH는 실 DB 쓰기에 해당하므로 사용자 불변식과 충돌한다. 따라서 실제 저장·견적서 인쇄 발화 표본은 **판정 불가**다. 스펙 코드는 해당 범위를 공식 하네스가 선택하도록 보강했다.

## ② fixture 주입 제거와 mutation

기존 Java 테스트는 다음 두 구조였다.

- `from(NON_GOODS)`의 Java accessor만 확인
- 별도 직렬화 테스트는 legacy 생성자로 `goods=true` DTO를 직접 구성

수정 후 하나의 테스트가 다음 사슬을 잇는다.

```text
mock Product.goodsType = NON_GOODS
  → ProductSummaryResponse.from(product)
  → ObjectMapper.writeValueAsString(response)
  → JSON goodsType = NON_GOODS
```

테스트:

`services/product-service/src/test/java/com/samhanair/logis/product/web/dto/ProductSummaryResponseTest.java`

mutation 절차 원문:

```text
@JsonProperty("goodsType") 제거
.\gradlew.bat :services:product-service:test --tests 'com.samhanair.logis.product.web.dto.ProductSummaryResponseTest' --rerun-tasks

ProductSummaryResponseTest > from_nonGoods_isSerializedAsNonGoodsInSearchResponseContract() FAILED
    java.lang.AssertionError at ProductSummaryResponseTest.java:53

5 tests completed, 1 failed
...
BUILD FAILED
```

즉 `@JsonProperty("goodsType")` 제거 mutation은 RED다. annotation을 복구한 뒤 원문 결과:

```text
> Task :services:product-service:test

BUILD SUCCESSFUL in 42s
```

복구 상태에서 추가 확인:

```text
npx vitest run src/renderer/api/productApi.search-modal.test.ts

✓ src/renderer/api/productApi.search-modal.test.ts (2 tests)
Test Files 1 passed (1)
Tests 2 passed (2)
```

```text
npx tsc -p tsconfig.node.json --noEmit
npx tsc -p tsconfig.web.json --noEmit

exit 0
```

## ③ fixture 주입 테스트 전수

PR #1152가 추가·수정한 관련 테스트와 이번 R5 판정은 다음과 같다.

| 테스트 파일 | fixture로 주입한 것 | 실 경로를 건너뛰나 | mutation에 RED인가 |
|---|---|---:|---:|
| `services/product-service/src/test/java/com/samhanair/logis/product/web/dto/ProductSummaryResponseTest.java` | 수정 전에는 직접 생성한 DTO의 기본 `goods=true`를 주입했음. R5에서 제거하고 `Product` → `from` → Jackson으로 변경 | R5 수정 후 아니오 | 예 — `@JsonProperty` 제거 시 AssertionError |
| `clients/desktop/src/renderer/api/productApi.search-modal.test.ts` | R4가 추가한 `apiClient.get` 응답 객체에 `goodsType: NON_GOODS`를 직접 주입했음 | 예 | R4 형태라면 사실상 GREEN — R5에서 해당 오탐 테스트를 삭제 |
| `clients/desktop/playwright/1152-r3-non-goods-real-qa/1152-r3-non-goods-live-real-qa.spec.ts` | goodsType 응답 fixture 없음. 실제 `GET /api/products` JSON을 읽고 NON_GOODS/GOODS를 단언 | 아니오 | 실 API 실행 시 RED 예상. 현재 renderer 미기동·실 DB 쓰기 금지로 실행 판정 불가 |

따라서 현재 남은 신규 회귀 테스트에는 직렬화 전 응답을 직접 만들어 `goodsType`을 채우는 테스트가 없다. FE 단위 테스트를 삭제한 이유는 Jackson 경계를 재현하지 못하는 테스트를 보존하면 같은 결함을 다시 가리기 때문이다. FE의 API 응답→프런트 타입→수량 판정은 공식 real-QA의 실제 HTTP 응답과 화면 결과가 담당한다.

## ④ 기존 불변식 유지

R4 보고서의 측정값을 기준선으로 유지했고, R5는 inventory production 코드·migration·게이트 테스트를 변경하지 않았다.

| 불변식 | 기준선 |
|---|---:|
| NON_GOODS 수량 | 7 → 1 |
| GOODS 수량 | 3 유지 |
| 재고 변이 게이트 | 15/15 |
| V33 후보 | 34/34 |
| V25 가드 | 통과 |
| 신규 이름 기반 판정 | 0곳 |
| inventory 관련 지정 테스트 | 100/100 |
| ProductSummaryResponse R5 테스트 | 5/5 |

이번 라운드 변경 파일은 real-QA 스펙 1개와 product-service/desktop 테스트 2개뿐이다. inventory-service 파일, production 게이트, V33/V25 migration은 변경되지 않았다.

R4에 기록된 실질 기능의 GOODS 실사 분개 표본은 0건이어서, 이번에도 GOODS 실사 분개 실데이터 정상 발행은 **판정 불가**다. 이 라운드에서 실 DB 표본을 만들지 않았다.

## 신규·변경 파일 경로

- `clients/desktop/playwright/1152-r3-non-goods-real-qa/1152-r3-non-goods-live-real-qa.spec.ts`
- `clients/desktop/src/renderer/api/productApi.search-modal.test.ts`
- `services/product-service/src/test/java/com/samhanair/logis/product/web/dto/ProductSummaryResponseTest.java`
- `docs/dev-reports/2026-08-09-1152-r5-verification-integrity.md`

검증 보조:

```text
.\gradlew.bat :services:product-service:test --tests '*ProductSummary*' --tests '*Product*' --rerun-tasks

BUILD SUCCESSFUL in 2m 30s
15 actionable tasks: 15 executed

npx playwright test --config=playwright.real-qa.config.ts --list --reporter=line playwright/1152-r3-non-goods-real-qa
Total: 1 test in 1 file

git diff --check
exit 0
```
