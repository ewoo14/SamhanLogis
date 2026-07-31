# Issue #1001 / PR #1003 슬라이스 2 — 배송주소 전달 보강

- 작업일: 2026-07-31
- 대상: 거래처 주문·전표 발행 경로의 구조화된 배송주소 전달
- 원칙: `shipping_address`, 거래처 주소, 적요를 `slips.delivery_address`의 대체값으로 사용하지 않음
- 작업 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1001`

## 1. 결론

거래처 주문의 구조화된 배송주소를 주문 원천에 보존하고, 단건·병합 발행 payload를 거쳐 `slips.delivery_address`까지 전달하도록 보강했다. 기존 `shippingAddress`는 그대로 전달되며, 새 배송주소는 선택값이므로 기존 소비자를 막지 않는다.

견적 발행은 원천 계약에 구조화된 배송주소가 없으므로 새 값을 만들지 않고 빈 값(null)을 유지한다. 과거 데이터 backfill은 수행하지 않았다.

## 2. 생성 경로별 도달 상태

| 경로 | 원천에 구조화된 주소 있음 | 현재 도달 | 조치 후 도달 |
|---|---:|---:|---:|
| 판매전표 직접 생성 폼 → `slips` | 있음 (`deliveryAddress`) | 도달함 | 도달함 (기존 정상 경로 유지) |
| 거래처 주문 확인 → 단건 전표 발행 | 주문 입력에서 받을 수 있으나 주문 DB 컬럼·계약이 없음 | 도달하지 않음 | 도달함: `PartnerOrder.deliveryAddress` → 단건 발행 payload → `slips.delivery_address` |
| 거래처 주문 병합 → 전표 발행 | 단일 원천 주문 또는 명시적 병합 입력에 있을 수 있음 | 도달하지 않음 | 도달함: 단일 주소 자동 전달 또는 `ShippingInfo.deliveryAddress` 명시 선택 |
| 거래처 주문 상세 조회 | 주문 snapshot에 저장된 값이 원천 | 항상 `null` | 저장된 snapshot 값을 반환; 과거 null은 그대로 유지 |
| 견적 발행 → 거래처 주문/전표 | 없음 (현재 계약에 `deliveryAddress` 없음) | 없음 | 없음; 사용자 입력·계약 보강 전까지 빈 값 유지 |

병합 대상 주문들의 구조화된 주소가 서로 다르고 요청에도 명시 주소가 없으면 reserve 전에 발행을 거부한다. 이는 서로 다른 주소 중 임의의 값을 정본으로 선택하지 않기 위한 안전장치이며, 오류 문구에 구조화된 `deliveryAddress` 선택이 필요함을 명시했다.

## 3. RED 원문

### 3.1 거래처 주문 원천·DTO RED

구현 전에 다음 테스트를 먼저 추가하고 실행했다.

```text
.\gradlew.bat :services:partner-order-service:test --tests com.samhanair.logis.partnerorder.service.PartnerOrderConfirmServiceTest --tests com.samhanair.logis.partnerorder.web.dto.PartnerOrderResponseTest --console=plain

> Task :services:partner-order-service:compileTestJava FAILED
...PartnerOrderConfirmServiceTest.java:175: error: constructor ConfirmRequest in record ConfirmRequest cannot be applied to given types;
 required: List<ConfirmLineRequest>
 found: List<ConfirmLineRequest>,String
...PartnerOrderConfirmServiceTest.java:188: error: cannot find symbol
 saved.getValue().getDeliveryAddress()
...PartnerOrderResponseTest.java:48: error: incompatible types: String cannot be converted to UUID
...PartnerOrderResponseTest.java:53: error: cannot find symbol
 order.getDeliveryAddress()
BUILD FAILED
```

### 3.2 전표 저장 RED

```text
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishControllerIT.publishFromPartnerOrder_persistsEcountColumns_andOrderApprovedAtMergedIntoMemo --console=plain

SlipPublishControllerIT > publishFromPartnerOrder_persistsEcountColumns_andOrderApprovedAtMergedIntoMemo FAILED
org.opentest4j.AssertionFailedError at SlipPublishControllerIT.java:421
1 test completed, 1 failed
BUILD FAILED
```

### 3.3 발행 경로 RED

단건·병합 전달 테스트와 견적의 빈 값 보존 테스트도 RED 상태에서 추가한 뒤 구현했다. 구현 전에는 주문 DB·발행 payload에 구조화된 배송주소 필드가 없었으므로 해당 단정이 성립하지 않았다.

## 4. 구현 요지

### 거래처 주문 서비스

- `V14__add_partner_order_delivery_address.sql`을 신규 추가했다. `partner_orders.delivery_address VARCHAR(500)` nullable 컬럼만 추가하며 기존 행 update/backfill은 없다.
- 확인 요청과 주문 수정 계약에 선택적 `deliveryAddress`를 추가했다. 기존 생성자와 요청 형태는 호환용으로 유지했다.
- `PartnerOrder` 생성·수정·복원·revision snapshot에 주소를 보존하고, 상세 DTO도 더 이상 상시 `null`을 반환하지 않도록 했다.
- 단건 전환 payload에 `deliveryAddress`를 추가했다.
- 병합 전환은 명시 주소를 우선하고, 명시 주소가 없을 때 단일 비공백 snapshot 주소만 자동 전달한다. 서로 다른 주소가 여러 개면 reserve 전에 실패한다.
- 기존 `shippingAddress` 전달 필드와 동작은 변경하지 않았다. 주소가 없는 원천은 null로 남는다.

### 전표 서비스

- 거래처 주문 단건·병합 발행 계약에 선택적 `deliveryAddress`를 추가했다.
- 거래처 주문 발행 시 기존 전표의 `withProjectInfo` 경로로 `slips.delivery_address`를 저장한다.
- idempotency fingerprint에도 `deliveryAddress`를 포함해 동일 요청 판별이 주소 변경을 무시하지 않도록 했다.
- 판매전표 직접 생성 경로는 이미 `deliveryAddress`를 저장하므로 변경하지 않았다.
- 견적 발행 fingerprint와 저장 경로에는 배송주소를 추가하지 않았다. 원천에 없는 값을 생성하지 않기 위함이다.

### 마이그레이션 번호 확인

- partner-order-service의 기존 최고 번호는 V13이었다.
- `git ls-tree`로 main, 열린 관련 브랜치 및 로컬·원격 refs를 확인했고, partner-order-service의 V14는 기존에 존재하지 않았다.
- 따라서 partner-order-service에만 신규 V14를 추가했다. 이미 적용된 마이그레이션은 수정하지 않았다.
- slip-service는 기존 V20에서 `slips.delivery_address`가 이미 존재하므로 신규 마이그레이션을 추가하지 않았다.

## 5. 실 데이터 실측

공유 Docker 스택은 재빌드·재기동하지 않았고, 아래 조회만 `docker exec ... psql -c`로 수행했다. 쓰기 SQL은 실행하지 않았다.

### 5.1 공유 DB 상태

```text
        db        | delivery_address_column_present
------------------+---------------------------------
 partner_order_db | f
(1 row)

  status   | active_orders
-----------+---------------
 CONFIRMED |            25
 CONVERTED |            10
 DRAFT     |          1986
(3 rows)

 active_total | convert_eligible | convert_ineligible
--------------+------------------+--------------------
         2021 |             1986 |                 35
(1 row)
```

현재 공유 DB에는 아직 신규 V14가 적용되지 않아 `delivery_address` 컬럼이 없다. 따라서 실행 중인 스택은 기존 계약으로 동작하며, 이 라운드에서 기존 행을 변경한 건수는 **0건**이다. 테스트의 Flyway V14 적용은 격리된 Testcontainers DB에서만 수행했다.

```text
   db    | active_outbound | delivery_address_present | shipping_address_present
---------+-----------------+--------------------------+--------------------------
 slip_db |            2299 |                        0 |                        2
(1 row)
```

기존 전표 2,299건의 배송주소는 모두 정본 컬럼만 조회했을 때 0건이며, `shipping_address`가 있는 2건도 배송주소로 복사하지 않았다. 이는 backfill을 하지 않았다는 실측과도 일치한다.

### 5.2 발행 차단 건수

- 새 `deliveryAddress`를 필수값으로 만들지 않았으므로 기존 정상 발행을 주소 부재로 차단한 건수: **0건**.
- 현재 partner-order-service 상태 기준으로 전환 가능 1,986건, 기존 상태상 불가 35건이다. 이 35건은 이번 주소 보강이 만든 차단이 아니다.
- 병합 주소 충돌 검증은 새 구조화 주소가 실제로 여러 개 존재하고 요청에 선택값이 없을 때만 적용된다. 현재 공유 DB에는 해당 컬럼 자체가 없어 실행 중인 스택에서 이 검증으로 차단된 건수는 **0건**이다.

## 6. 테스트 및 검증

RED 이후 다음을 `--rerun-tasks`로 실행했다.

```text
.\gradlew.bat :services:partner-order-service:test --rerun-tasks --console=plain
BUILD SUCCESSFUL
15 actionable tasks: 15 executed

.\gradlew.bat :services:slip-service:test --rerun-tasks --console=plain
BUILD SUCCESSFUL
18 actionable tasks: 18 executed
```

테스트 결과 XML 집계:

| 모듈 | 테스트 수 | 실패 | 오류 | skip |
|---|---:|---:|---:|---:|
| partner-order-service | 483 | 0 | 0 | 0 |
| slip-service | 1,510 | 0 | 0 | 0 |

추가로 단건 전환, 병합 전환, 거래처 주문 확인/상세 DTO, 전표 저장 테스트를 각각 `--rerun-tasks`로 재실행해 모두 통과했다. `git diff --check`도 출력 없이 통과했다. 전체 테스트 종료 과정에서 기존 Testcontainers·CloudWatch shutdown 경고 로그가 있었으나 Gradle 결과는 실패 없이 종료됐다.

## 7. 신규 파일

아래 3개가 신규 파일이다.

1. `docs/dev-reports/2026-07-31-1001-s2-delivery-address-wiring.md`
2. `docs/superpowers/plans/2026-07-31-1001-s2-delivery-address-wiring.md`
3. `services/partner-order-service/src/main/resources/db/migration/V14__add_partner_order_delivery_address.sql`

## 8. 이번에 안 본 것

- 데스크톱 화면, CSV, 인쇄 변경은 하지 않았다.
- 회계 통합 원장 API와 입금보고서는 범위에서 제외했다.
- 기존 2,342건을 포함한 과거 데이터 backfill은 하지 않았다.
- `shipping_address`, 거래처 주소, 적요 파싱을 배송주소 대체 경로로 검토·사용하지 않았다.
- 공유 DB write, Docker 이미지 재빌드, 서비스 재기동, 라이브 QA는 하지 않았다.
- 견적 원천 계약에 구조화된 배송주소를 새로 추가하는 작업은 하지 않았다. 해당 경로는 사용자 입력 또는 별도 계약 결정 전까지 빈 값을 유지한다.

## 9. 작업 트리 상태 원문

보고서 작성 전후의 변경은 모두 PM이 검토·커밋할 수 있도록 작업 트리에만 남겼다. `git status --porcelain` 최종 원문은 다음과 같다.

```text
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/service/PartnerOrderRevisionService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/snapshot/PartnerOrderSnapshot.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderUpdateService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/ConfirmRequest.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/MergeConvertToSlipRequest.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderUpdateRequest.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConvertIT.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderFromEstimateIT.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmServiceTest.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertServiceTest.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderResponseTest.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromOrdersMergeRequest.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromPartnerOrderRequest.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishControllerIT.java
?? docs/dev-reports/2026-07-31-1001-s2-delivery-address-wiring.md
?? docs/superpowers/plans/2026-07-31-1001-s2-delivery-address-wiring.md
?? services/partner-order-service/src/main/resources/db/migration/V14__add_partner_order_delivery_address.sql
```
