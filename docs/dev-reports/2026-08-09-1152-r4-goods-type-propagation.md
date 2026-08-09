# PR #1152 R4 — goodsType 전달 및 실사 분개 단일 게이트

## 판정

- 작업 기준: `e68f8ebda`, 지정 워크트리만 사용.
- 커밋·푸시하지 않았다. 업무 DB에 PATCH/POST/DELETE를 보내지 않았다.
- RED-A/B 라이브 재현 후 수정하고 동시 GREEN을 확인했다.
- 공유 product DB의 활성 노출 비상품은 라이브 QA 직전 읽기 전용 SQL로 **2건**이었다. 0건이 아니므로 판정 가능했다.

## ① goodsType 단절 지점과 수정

### 실제 단절 경로

```text
product-service Product → ProductSummaryResponse.from(Product):148
  → JSON 직렬화: goods boolean만 전송, goodsType 키 누락
  → GET /api/products 응답
  → clients/desktop/src/renderer/api/productApi.ts:98 toProductOption
       p.goodsType만 읽으므로 undefined
  → EstimateFormPage.tsx:1118 searchProducts 후보
  → EstimateFormPage.tsx:1455 rawResult.goodsType = undefined
  → EstimateFormPage.tsx:1229 quantityAfterDeliveryPriceInput(undefined, ...)
  → NON_GOODS 조건 미발화
```

처음에는 `ProductSummaryResponse`에 `goodsType()` 메서드를 추가했지만, Java 메서드만으로는 Jackson record component가 아니어서 HTTP 응답에 직렬화되지 않았다. 실제 HTTP 읽기 결과도 다음과 같았다.

```json
{
  "goods": false,
  "goodsType": null,
  "usageScope": "BOTH"
}
```

최종 수정은 `ProductSummaryResponse.java:179-181`의 `@JsonProperty("goodsType")` 명시 노출이다. `goods` boolean을 `GOODS/NON_GOODS`로 변환하므로 기존 생성자와 호출 계약을 깨지 않는다. 수정 후 실제 응답은 `goods=false, goodsType=NON_GOODS`였다.

FE의 기존 매핑은 `productApi.ts:42,98`에 이미 존재했고, mock handler도 `clients/desktop/src/renderer/api/mock.ts:3440,3469,3510`에서 `goodsType`을 반환하고 있었다. 신규 endpoint는 만들지 않았다.

### 단위 테스트가 통과했던 이유

기존 `estimateLineModel.test.ts:5-8`은 순수 함수에 `'NON_GOODS'`를 직접 주입한다.

```ts
quantityAfterDeliveryPriceInput('NON_GOODS', '3', '50000')
```

따라서 `estimateLineModel` 자체의 6/6(당시) 통과는 함수 내부 규칙만 검증했고, 품목 조회 응답→`toProductOption`→자동완성 선택→DraftLine 상태라는 경계를 전혀 통과하지 않았다. R4에서는 `productApi.search-modal.test.ts:34-51`에 실제 검색 응답 shape의 `goodsType`이 옵션으로 전달되는 계약을 추가하고, BE `ProductSummaryResponseTest`에 JSON 직렬화 테스트를 추가했다.

## ② 회계 분개 게이트

기존 결함 지점은 `InventoryAuditService.java:258-263`이었다. `audit.complete()`가 모든 라인의 차이를 합산하고, `adjustStockForLine()`은 비상품/세트에서 `void return`으로 재고 조정만 건너뛴 뒤, 전체 `audit.getTotalDiffAmount()`를 회계 client에 전달했다.

최종 구조:

- `InventoryAuditService.java:249-254`: `adjustStockForLine()`의 실제 조정 금액만 `adjustedDiffAmount`에 누적.
- `InventoryAuditService.java:258`: 분개 금액은 `adjustedDiffAmount` 하나만 사용.
- `InventoryAuditService.java:261`: 분개 호출은 그 단일 축이 0이 아닐 때만 실행.
- `InventoryAuditService.java:365`: 조정 생략 경로는 `BigDecimal.ZERO`, 실제 balance/movement 저장 경로는 `line.getDiffAmount()`를 반환.

즉 재고 조정 게이트와 분개 게이트를 따로 계산하지 않는다. 실제 조정된 라인만 분개 대상이다. GOODS 실사에서는 기존처럼 balance/movement와 분개가 함께 유지된다.

### 기존 오발행 분개 읽기 전용 집계

`accounting_db.journals`를 `BEGIN; ...; ROLLBACK`으로 조회했다.

```text
description LIKE '재고 실사 자동 분개 (%'
is_deleted = false
기존 건수 = 0
```

따라서 현재 실 DB에 남아 있는 해당 오발행 분개는 **0건**이다. 삭제·역분개·보정은 수행하지 않았다.

## ③ RED 원문과 동시 GREEN

- RED-A: 라이브에서 비상품에 수량 7, 납품가 12,345 입력 후 수량이 **7**로 남음.
- RED-B: GOODS 대조군 수량 3 유지.
- RED-C: 기존 단위 테스트에는 없던 `verify(accountingClient, never()...)`를 비상품 실사 테스트에 추가했을 때 `NeverWantedButInvoked`, `InventoryAuditService.java:260` 호출로 실패.
- RED-D: 기존 GOODS 실사 테스트 `complete_negativeDiff_triggersJournalAndAdjustsStock`는 분개 1회와 재고 조정을 요구하는 정상 대조군이다.

수정 후:

- RED-A/B: 실제 API·실제 renderer 라이브 스펙에서 **1 passed (4.7s)**.
- RED-C: `InventoryAuditServiceTest` 전체 GREEN.
- RED-D: GOODS 음수 차이 테스트 GREEN.

## ④ 라이브 QA 및 재빌드

- 실행 위치: `clients/desktop`.
- Playwright Chromium: `%LOCALAPPDATA%\ms-playwright\chromium-1217` 존재 확인.
- `playwright.real-qa.config.ts`, `headless: true`, `VITE_MOCK_MODE` 미설정(mock OFF), 실제 gateway `:8080` 사용.
- 스펙 경로: `clients/desktop/playwright/1152-r3-non-goods-real-qa/`.
- 캡처는 모두 `resolveQaShotsDir(...)`를 거쳤다.
- 비상품 노출 건수 원문: `exposedNonGoods.length === 2`.
- 비상품 실제 화면: 수량 7 입력 → 납품가 12,345 입력 → 수량 **1**.
- GOODS 실제 화면: 수량 3 입력 → 납품가 54,321 입력 → 수량 **3** 유지.

캡처 목록:

- `docs/qa/1152-r3-non-goods-live-qa/_local/01-non-goods-in-estimate-catalog.png`
- `docs/qa/1152-r3-non-goods-live-qa/_local/03-estimate-non-goods-price-quantity-one.png` — 납품가 12,345 / 수량 1
- `docs/qa/1152-r3-non-goods-live-qa/_local/04-estimate-goods-quantity-preserved.png` — 납품가 54,321 / 수량 3

product-service 재빌드:

```text
./gradlew.bat :services:product-service:bootJar --no-daemon --console=plain
docker compose -f docker-compose.yml -f docker-compose.local-all.yml up -d --build --no-deps product-service

LOCAL_SHA     b19d48fbc13bf44cc52bc79d7d070739e4f4b32de96970d11886158e17aa3e37
CONTAINER_SHA b19d48fbc13bf44cc52bc79d7d070739e4f4b32de96970d11886158e17aa3e37
SHA_MATCH     True
HEALTH        healthy
```

라이브 종료 후 임시 Vite `:5175` 프로세스를 중지했고 해당 listener는 없어졌다. 기존 gateway `:8080` 및 product-service `:8084`는 로컬 스택 기본 서비스로 유지했다.

## 검증

```text
clients/desktop:
npx vitest run src/renderer/api/productApi.search-modal.test.ts src/renderer/routes/estimateLineModel.test.ts
2 files, 5 tests passed

./gradlew.bat :services:inventory-service:test --tests '*InventoryAuditServiceTest' --rerun-tasks --no-daemon --console=plain
BUILD SUCCESSFUL

./gradlew.bat :services:product-service:test --tests '*ProductSummaryResponseTest' --rerun-tasks --no-daemon --console=plain
BUILD SUCCESSFUL

라이브:
1 passed (4.7s)
```

## 신규·변경 파일

- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/web/dto/ProductSummaryResponseTest.java`
- `clients/desktop/src/renderer/api/productApi.search-modal.test.ts`
- `clients/desktop/playwright/1152-r3-non-goods-real-qa/1152-r3-non-goods-live-qa.spec.ts`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/InventoryAuditService.java`
- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/InventoryAuditServiceTest.java`
- `docs/dev-reports/2026-08-09-1152-r4-goods-type-propagation.md`
