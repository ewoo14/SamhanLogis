# Issue #1001 슬라이스 2 배송주소 배선 구현 계획

> **작업자 지침:** 이 계획은 `superpowers:test-driven-development` 흐름으로 수행한다. 사용자의 git 쓰기 금지 지침에 따라 add/commit/push는 수행하지 않는다.

**목표:** 구조화된 배송주소가 거래처 주문 생성·전환 경로를 거쳐 `slips.delivery_address`에 저장되도록 보강하고, 주소가 없는 견적 경로는 공란을 유지한다.

**구조:** `partner-order-service`가 nullable 배송주소 snapshot을 보유하고 단일·병합 전환 payload에 전달한다. `slip-service`는 기존 `shippingAddress`를 유지하면서 새 `deliveryAddress`를 기존 `Slip.withProjectInfo`의 `delivery_address` 필드에 저장한다. 기존 요청의 새 필드는 모두 선택값으로 둔다.

**기술:** Spring Boot, Java record/JPA, Flyway, JUnit 5, Mockito, Testcontainers PostgreSQL.

## 전역 제약

- 모든 기존 행은 변경하지 않으며 backfill을 수행하지 않는다.
- `shipping_address`, 거래처 주소, 적요 파싱을 `delivery_address`의 대체 출처로 사용하지 않는다.
- 새 주소값은 필수 검증하지 않아 기존 정상 발행을 막지 않는다.
- 공유 Docker 스택 재빌드·재기동·공유 DB 쓰기를 수행하지 않는다.
- 신규 통합 테스트를 추가하면 해당 모듈 전체 테스트를 `--rerun-tasks`로 실행한다.
- 사용자 화면 응답에는 UUID를 추가하지 않는다.

---

### 작업 1: RED 테스트 작성

**파일:**

- 수정: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmServiceTest.java`
- 수정: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderResponseTest.java`
- 수정: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConvertIT.java`
- 수정: `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishControllerIT.java`

- [ ] `ConfirmRequest.deliveryAddress`가 저장 주문에 보존되고 상세 DTO가 반환되는 단정을 추가한다.
- [ ] 단일 주문 전환 payload에 `deliveryAddress`가 포함되는 단정을 추가한다.
- [ ] slip 발행 API에 들어온 `deliveryAddress`가 `Slip.deliveryAddress`로 저장되고 `shippingAddress`는 그대로 보존되는 단정을 추가한다.
- [ ] 생산 코드 없이 모듈별 선택 테스트를 실행해 기능 부재 RED 원문을 기록한다.

### 작업 2: 거래처 주문 원천 snapshot 구현

**파일:**

- 신규: `services/partner-order-service/src/main/resources/db/migration/V14__add_partner_order_delivery_address.sql`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/ConfirmRequest.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderUpdateRequest.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderUpdateService.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/snapshot/PartnerOrderSnapshot.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/service/PartnerOrderRevisionService.java`

- [ ] nullable `delivery_address VARCHAR(500)` 컬럼을 추가하며 기존 행은 그대로 NULL로 둔다.
- [ ] 기존 factory와 DTO 생성자 계약은 overload로 보존하고 새 주소값은 trim 후 선택적으로 저장한다.
- [ ] 견적 변환 factory에는 주소 원천이 없으므로 주소를 채우지 않는다.
- [ ] revision snapshot/restore가 새 헤더값을 보존하되 구형 JSON snapshot의 누락 필드를 허용한다.
- [ ] GREEN 단위·서비스 테스트를 실행한다.

### 작업 3: 주문 전환과 slip 저장 배선

**파일:**

- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/MergeConvertToSlipRequest.java`
- 수정: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromPartnerOrderRequest.java`
- 수정: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromOrdersMergeRequest.java`
- 수정: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java`

- [ ] 단일 전환은 주문 snapshot의 주소만 payload에 복사한다.
- [ ] 병합 전환은 명시적 구조화 주소를 우선하고, 주소가 하나로 합의된 주문만 자동 전달한다. 서로 다른 주소가 있고 명시값이 없으면 재고 예약 전에 사용자 선택을 요구한다.
- [ ] 기존 `shippingAddress`는 기존 컬럼에 계속 저장하며 `deliveryAddress`로 대체하지 않는다.
- [ ] idempotency fingerprint에 새 주소를 포함해 같은 키의 주소 변경을 충돌로 감지한다.
- [ ] slip-service는 `withProjectInfo`로 `delivery_address`를 저장한다. 견적 발행에는 필드를 추가하지 않는다.

### 작업 4: 통합 검증·실측·보고서

**파일:**

- 신규/수정: `docs/dev-reports/2026-07-31-1001-s2-delivery-address-wiring.md`

- [ ] 신규 통합 테스트를 추가한 각 모듈의 전체 테스트를 `--rerun-tasks`로 실행한다.
- [ ] 공유 DB를 읽기 전용으로 조회해 발행 차단 건수와 기존 행 변경 건수를 실측한다.
- [ ] `git status --porcelain` 원문과 신규 파일 목록을 보고서에 붙인다.
- [ ] 화면·CSV·인쇄·회계 통합 원장·입금보고서는 이번 보고서에서 제외한다.
