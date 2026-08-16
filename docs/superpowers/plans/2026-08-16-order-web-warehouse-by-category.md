# 주문서웹 품목분류 기반 창고 결정 Implementation Plan

> **For agentic workers:** 이 계획은 현재 세션에서 순차 실행한다. 커밋 단계는 사용자 지시로 제외한다.

**Goal:** 주문서웹 `confirm` 시 실제 품목분류로 주문 전체 창고를 결정하고, 누락·미지 분류와 레거시 차집합을 드러낸다.

**Architecture:** `product-service` internal lookup이 L/M 분류명을 포함한 상품 snapshot을 반환한다. `partner-order-service`의 순수 판정기가 `HOME_MULTI`/`SINGLE_SET`/`SINGLE_PART`와 실제 분류명 exact set을 사용해 `2` 또는 `00003`을 반환하며, 분류 누락은 명시적 예외로 중단한다. 판정은 `PartnerOrderConfirmService.confirm`에만 연결하고 가입고·수기 전표·convert에는 연결하지 않는다.

**Tech Stack:** Java 21, Spring Boot, JUnit 5, AssertJ, Mockito, REST internal client.

**Spec:** `docs/decisions/2026-08-15-order-web-warehouse-by-category.md`

## Global Constraints

- 창고 판정은 주문서웹 확정 시점에만 실행한다.
- 기본은 `00003`, 하나라도 적중하면 주문 전체 `2`다.
- 분류가 없거나 판정 가능한 축이 아니면 조용히 기본값으로 내리지 않는다.
- 품명 정규식은 판정에 사용하지 않는다.
- 사용자 화면·로그에는 UUID를 남기지 않는다.
- 대조 보고서의 32개 모델은 변경하지 않고 결과 산출물·로그로만 식별한다.
- 적용 마이그레이션은 수정하지 않으며 실제 주문 발송·공유 DB write를 하지 않는다.

### Task 1: RED — 순수 분류 판정 계약

**Files:**
- Create: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/OrderWarehouseByClassificationTest.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/OrderWarehouseByClassification.java` (RED 단계에서는 미생성 상태)

- [ ] 실제 보고서 값으로 9조건, mixed order, missing classification, unknown classification 테스트를 작성한다.
- [ ] `./gradlew :services:partner-order-service:test --tests '*OrderWarehouseByClassificationTest'`로 expected missing symbol/compile RED를 확보한다.

### Task 2: GREEN — 판정기 및 누락 오류

**Files:**
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/OrderWarehouseByClassification.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductSummary.java`

- [ ] `ProductClassification` snapshot과 판정 결과를 UUID 없이 설계한다.
- [ ] exact classification set을 코드 상수로 두고 regex/string name scan을 하지 않는다.
- [ ] 누락/미지 분류는 `BusinessException`으로 실패시키고 모델코드·분류명만 메시지/로그에 포함한다.
- [ ] 단위 테스트를 GREEN으로 만든다.

### Task 3: product lookup 계약 연결

**Files:**
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java`
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductSummary.java`
- Test: product internal lookup contract tests and client mapping tests

- [ ] 기존 internal lookup wire contract에 productCategory와 L/M 분류명을 추가한다.
- [ ] UUID는 wire/user/log에 추가하지 않는다.
- [ ] 분류 없는 실제 상품은 `classificationAssigned=false`와 빈 분류로 보존한다.

### Task 4: confirm 경계 연결 및 회귀 테스트

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java`
- Modify: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmServiceTest.java`

- [ ] 가격 계산 완료 뒤 confirm에서만 판정기를 호출하고 결과를 주문/전표 계약에 반영한다.
- [ ] missing/unknown은 저장 전에 실패한다.
- [ ] 가입고·convert 코드에는 호출이 없는지 정적 검증 테스트/rg로 확인한다.
- [ ] mixed order와 idempotency 회귀를 확인한다.

### Task 5: 32개 차집합 결과물과 전체 검증

**Files:**
- Create/Modify: `docs/dev-reports/2026-08-15-order-web-warehouse-category-mapping.md` (실측 목록 유지 및 구현 결과 부록)
- Create: `docs/dev-reports/2026-08-16-order-web-warehouse-category-implementation.md`

- [ ] 32개 목록을 재계산 가능한 fixture/report로 남기되 창고 값을 임의 변경하지 않는다.
- [ ] partner-order 단위 테스트와 product-service lookup 테스트를 실행한다.
- [ ] 변경 파일·RED 원문·GREEN 원문·분류값 출처·개발책임자 확인 대상을 보고한다.
