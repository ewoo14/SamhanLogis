# 주문서 세트 전개 계승 정찰 — 2026-08-10

## 조사 범위와 판정 기준

- 기준 소스는 `origin/main` `22427d9c6`이다. 이번 라운드에는 소스·마이그레이션을 수정하지 않았고, `samhan-postgres`의 읽기 전용 조회만 수행했다.
- 전환 진입점은 단일 주문 `POST /api/v1/partner-orders/{id}/convert-to-slip`와 병합 `POST /api/v1/partner-orders/convert-to-slip-merge`이다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderConvertController.java:24-39`).
- 결론은 화면에 무엇이 보이는지가 아니라, 주문 저장 데이터가 출고전표 생성 payload와 전표 라인으로 어떻게 이동하는지를 기준으로 냈다.

## 요약 판정

1. 현재 주문→출고전표는 주문 라인을 세트 전개해서 재생성하지 않는다. 주문 라인마다 `modelName`, 표시명, 요청 수량, VAT 포함 단가, 비고, `sourceOrderLineId`, `categoryKey`만 평면 payload로 만든다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:122-154`). 병합 전환도 같은 필드만 만든다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java:139-174`).
2. 현재 product DB의 활성 BUNDLE은 343개이고 모두 `EXPAND`이며(`실측 product_db, 2026-08-10 14:10:58 KST`), slip resolver는 `EXPAND` 또는 mode null BUNDLE 부모를 저장 전에 거절한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:760-773`, `services/slip-service/src/main/java/com/samhanair/logis/slip/service/BundleModePolicy.java:11-16`). 따라서 현 데이터의 BUNDLE 주문을 전환하면 부모 행도 구성품 행도 출고전표에 남지 않는다.
3. `KEEP` BUNDLE만 예외적으로 부모 1행이 만들어질 수 있다. 이때도 구성품 전개는 없다(`services/slip-service/src/main/java/com/samhanair/logis/slip/service/BundleModePolicy.java:11-16`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:774-788`). 현재 실 DB에는 활성 `KEEP` BUNDLE이 0개다(실측 `bundle_mode_group|EXPAND|343`).
4. 주문서 쪽에는 `bundleMode`나 구성품 snapshot/parent-child lineage 저장 필드가 없다. 상세 응답도 `bundleMode=null`, `expandedComponents=[]`를 하드코딩한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java:128-133`, `:166-185`).
5. 실 데이터에는 BUNDLE 주문→전표 전환 표본이 없다. 활성 `partner_order_lines` 586건 전부 `converted_quantity=0`, 활성 BUNDLE 참조 주문 라인은 331건 모두 `converted_quantity=0`, 활성 `slip_lines` 302건 모두 `source_order_line_id IS NULL`이었다(실측 범위 `2026-08-10 14:10:58~14:10:59 KST`). 따라서 실제 BUNDLE 원본 라인과 전환 전표 라인의 값 대조는 **판정 불가**이며, 실제 표본으로 “무엇이 사라졌는가”를 확정할 수는 없다.
6. 다만 전환 경로가 도달 불가능한 것은 아니다. 주문 상태가 `DRAFT` 또는 `ON_HOLD`이면 전환 진입은 허용된다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java:606-629`). 현 DB의 BUNDLE 주문 라인 331건은 모두 주문 상태 `DRAFT`다(실측 `bundle_line_status|DRAFT|331`). 이후 부모 재고 예약을 시도하고(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:167-184`), slip resolver에서 BUNDLE 부모를 거절한다. 예약이 실제로 잡혔다면 실패 catch에서 보상 release한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:199-207`).

## 1. 현재 주문→출고전표 전환 경로

### 1.1 단일 주문

현재 순서는 다음과 같다.

```text
주문 상태 가드
  → 요청 orderLineId를 PartnerOrderLine에 매핑·수량 검증
  → 주문 라인에서 평면 slip payload 작성
  → 주문 라인의 productId로 inventory 부모 예약
  → slip-service POST /from-partner-order
  → 성공한 경우에만 PartnerOrderLine.convert()와 saveAndFlush
```

각 단계의 근거는 다음과 같다.

- 전환 전에 주문을 조회하고 `requireConvertible()`을 호출한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:105-108`).
- 요청 수량이 잔여 수량을 넘지 않는지 검증하고, payload에는 `productCode`, `productName`, `qty`, `unitPriceVat`, `remarks`, `sourceOrderLineId`, `categoryKey`만 넣는다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:122-154`). `bundleMode`, `productType`, 구성품 배열, `setHead`, `parentSetModel`, `bundleSetOptions`는 넣지 않는다.
- 재고 예약은 `line.getProductId()`를 그대로 사용한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:167-177`). 즉 BUNDLE이면 구성품 product ID가 아니라 부모 product ID로 예약을 시도한다.
- slip-service 호출은 `/api/v1/slips/from-partner-order`다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/SlipServiceClient.java:95-113`).
- slip 발행 성공 후에만 `line.convert()`와 주문 저장이 실행된다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:199-223`). 따라서 BUNDLE 부모가 resolver에서 거절되면 `converted_quantity`는 증가하지 않는다.

### 1.2 병합 주문

병합 경로도 각 원본 주문 라인을 순회하면서 같은 평면 필드를 만들고(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java:139-174`), 부모 `productId`로 재고를 예약한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java:184-201`). slip-service의 merge endpoint는 같은 `resolveLines()`를 사용한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:322-346`). 성공 후에만 각 원본 라인의 `convert()`를 누적한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java:236-257`).

### 1.3 라인은 복사되는가, 다시 계산되는가

- 라인 수량은 주문 원본의 전체 수량을 무조건 복사하지 않고, 전환 요청 item의 수량을 사용한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:146-154`).
- slip-service는 전달받은 `productCode`로 product-service를 다시 조회하고, product summary의 product ID·model name과 요청 표시명·단가·수량으로 `ResolvedLines.Entry`를 만든다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:765-788`). 따라서 주문 라인의 저장 snapshot을 그대로 복사하는 것이 아니라 product ID/name과 금액 계산 입력을 재구성한다.
- VAT 포함 단가가 있으면 `SlipLine.createFromVatInclusive()`가 수량을 곱하고 반올림한 뒤 공급가액·부가세를 다시 분리한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:1082-1093`, `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:267-294`). 주문에 저장된 `supplyAmount`와 `vatAmount`는 현재 partner-order payload에 포함되지 않는다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:146-154`).

### 1.4 BUNDLE 부모와 구성품 중 무엇이 전표에 남는가

| 주문 product 상태 | 현재 전환 결과 | 근거 |
|---|---|---|
| `BUNDLE + EXPAND` | **실패**. resolver가 slip 저장 전에 거절하므로 부모 행·구성품 행 모두 없음 | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/BundleModePolicy.java:11-16`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:765-773` |
| `BUNDLE + mode null` | **실패**. 정책상 `KEEP`가 아니면 expand 대상이고, partner-order payload에는 mode가 없으므로 product-service 조회 결과에 따른다 | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/BundleModePolicy.java:11-16`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:765-773` |
| `BUNDLE + KEEP` | **부모 1행**. 구성품 전개 없음 | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/BundleModePolicy.java:11-16`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:774-788` |
| 구성품 product를 이미 payload로 보낸 경우 | 일반 product 1행으로 저장 가능. 다만 현재 partner-order 변환 코드는 그런 payload를 만들지 않음 | `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:774-788` |

### 1.5 지금 전환하면 사라지는 것

1. BUNDLE 판정 자체가 주문 라인에 저장되지 않는다. `PartnerOrderLine`은 product ID, 모델명, 상품명, category, 수량, 가격, 금액, 비고, converted 수량, 금액 권위만 가진다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:49-116`).
2. 구성품 snapshot이 저장되지 않는다. 상세 응답은 저장 컬럼이 없다고 명시하고 mode를 null, 구성품을 빈 배열로 반환한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java:128-133`, `:181-185`).
3. 전환 payload에는 세트 lineage가 없다. `sourceOrderLineId`는 부모 주문 라인을 가리키는 추적 ID일 뿐, 구성품별 `setHead`·`parentSetModel`·옵션을 전달하지 않는다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishLineRequest.java:29-42`).
4. 현재 활성 BUNDLE은 모두 EXPAND이므로 실제 시도 결과는 “부모 1행이 남음”이 아니라 “slip 생성 거절”이다(실측 product DB `bundle_mode_group|EXPAND|343`, partner-order DB `bundle_line_status|DRAFT|331`).
5. 주문 금액의 S/V snapshot은 현재 전환 request에 실리지 않고 slip에서 VAT 포함 단가 기준으로 다시 계산된다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:146-154`, `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:275-294`).

## 2. 세트 전개 정보가 이미 있는 곳

### 2.1 product-service의 정본

- Product master는 `product_type`과 `bundle_mode`를 보유한다(`services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:102-110`). product migration도 두 컬럼과 `BUNDLE/EXPAND/KEEP` 제약을 만든다(`services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:17-20`, `:37-44`).
- 구성품은 `bundle_component` 1:N 테이블이다(`services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:75-99`). 엔티티에는 부모 product ID, 구성품 model code, 기본 수량, 수량 모드, 구성품 종류/variant, `is_default`, 사양, 표시 순서가 있다(`services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java:63-107`).
- `BundleExpander`는 BUNDLE이 아니거나 KEEP이면 부모 1행을 반환하고, EXPAND이면 `bundle_component`를 읽어 구성품 product·수량·가격을 만든다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:82-120`).
- 현재 구현은 `SINGLE_SET`에만 옵션 필터를 적용하고, 그 밖의 BUNDLE은 `parts` 전체를 사용한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:123-137`). 따라서 “기본 구성품”의 의미를 `is_default=true`로 고정할 것인지, 비-SINGLE_SET에서 옵션 제외 후 등록된 전체 기본 행을 뜻하는지 확인이 필요하다. `is_default` 자체는 구성품 정본에 존재한다(`services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java:89-95`).

### 2.2 slip-service의 이미 존재하는 전개 결과 저장

- `slip_lines`에는 `source_order_line_id`, `set_head`, `parent_set_model`, `bundle_set_options`가 있다(`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:127-149`).
- V29는 주문 라인 추적용 `source_order_line_id`를 추가했고(`services/slip-service/src/main/resources/db/migration/V29__add_slip_line_source_order_line.sql:1-4`), V34는 견적/전표 라인에 `set_head`와 `parent_set_model`을 추가했다(`services/slip-service/src/main/resources/db/migration/V34__add_bundle_component_columns.sql:1-13`). V114는 slip의 옵션 JSON을 추가했다(`services/slip-service/src/main/resources/db/migration/V114__preserve_bundle_set_options.sql:1-3`).
- 견적 생성은 BUNDLE을 `productClient.expand()`로 전개하고 각 구성품에 부모 model, head 여부, 옵션을 기록한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:130-172`). 견적→전표는 이미 전개된 `estimate_lines`를 1:1로 복사하고 그 metadata를 다시 `SlipLine`에 붙인다(`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java:99-130`).
- 실 DB에서도 이 구조가 manual slip에 사용되고 있다. 2026-08-10 14:10:58 KST 기준 활성 `slip_lines` 302건 중 `parent_set_model` 보유 202건, `set_head=true` 77건, `source_order_line_id` 보유 0건이었다. 최근 manual 표본 `2026/08/06-5`에는 부모 model `AC072CS6PBH1SY` 아래 `AR-EH05`, `PC6NUNK1NW`, `AC072CXAPBH1`, `AC072CN6PBH1` 구성품 행과 head 1건이 실제로 저장되어 있었다(실측 `slip_db`, 2026-08-10 14:11:09 KST). 이 표본은 **주문 전환 쌍이 아니라 manual slip 내부의 전개 구조 표본**이다.

### 2.3 주문 생성 시점

- 직접 주문 confirm은 요청마다 `PartnerOrderLine.create()`를 한 번 호출해 부모/요청 품목 1행을 저장할 뿐이다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:215-230`). confirm 자체는 slip을 발행하지 않고 이후 명시적 convert를 사용한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:238-240`).
- 견적→주문도 snapshot line마다 `toOrderLine()`을 호출한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderFromEstimateService.java:54-88`). 이 변환이 읽는 `EstimateLineSnapshot`에는 product ID, model code/name, category, quantity, price, remark, S/V/T, authority만 있고 `setHead`, `parentSetModel`, `bundleSetOptions`, 구성품 부모 ID가 없다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/EstimateClient.java:18-41`). `toOrderLine()`도 그 평면 필드만 `PartnerOrderLine`으로 옮긴다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderFromEstimateService.java:91-110`). 따라서 estimate에서 이미 전개된 구성품 행을 주문으로 넘길 수는 있어도, 세트 lineage와 옵션 snapshot은 주문 경계에서 사라진다.
- 또한 현재 partner-order의 기본 `FixtureEstimateClient`는 항상 empty를 반환한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/FixtureEstimateClient.java:7-19`). 따라서 실 DB에서 estimate→order 전개 계승을 실행 대조할 수 있는 HTTP 경로는 현재 확보되지 않았고, 위 판정은 계약/코드 기준이다.

### 2.4 PartnerOrderLine 전체 필드 — 세트 컬럼 부재 확인

`PartnerOrderLine` 고유 필드는 다음과 같다.

| 구분 | 필드/컬럼 | 근거 |
|---|---|---|
| 식별/관계 | `id`, `partnerOrder` / `partner_order_id` | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:49-57` |
| 품목 snapshot | `productId`, `modelName`, `productName`, `categoryKey` | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:59-73` |
| 수량/가격 | `quantity`, `priceVat`, `subtotal` | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:75-84` |
| 금액 | `supplyAmount`, `vatAmount`, `amountAuthority` | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:86-92`, `:105-116` |
| 기타/전환 | `remark`, `convertedQuantity` | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:94-103` |
| 공통 audit/soft delete | `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy`, `deletedAt`, `deletedBy`, `isDeleted` | `shared/common/src/main/java/com/samhanair/logis/common/entity/BaseEntity.java:18-43` |

이 목록에는 `bundleMode`, `expandedComponents`, `setHead`, `parentSetModel`, `bundleSetOptions`, parent line ID, component snapshot이 없다. 상세 response의 하드코딩도 같은 부재를 직접 명시한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java:128-133`, `:188-195`).

### 2.5 bundle 관련 migration history

- partner-order migration 디렉터리의 현재 최고 번호는 **V18** (`V18__soft_delete_test_seed_orders.sql`)이며, V8은 `converted_quantity`를 추가했다. bundle 관련 컬럼을 추가한 partner-order migration은 확인되지 않았다(`services/partner-order-service/src/main/resources/db/migration/V8__add_partner_order_line_converted_quantity.sql:1-3`, `services/partner-order-service/src/main/resources/db/migration/V18__soft_delete_test_seed_orders.sql:1`).
- product migration의 bundle 정본은 V3의 `product_type`, `bundle_mode`, `bundle_component`이고(`services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:17-20`, `:75-99`), 현재 최고 번호는 **V35** (`V35__repair_issue_1096_product_cleanup.sql`)이다(`services/product-service/src/main/resources/db/migration/V35__repair_issue_1096_product_cleanup.sql:1`).
- slip migration은 bundle 결과를 V34에서 추가하고(`services/slip-service/src/main/resources/db/migration/V34__add_bundle_component_columns.sql:1-13`), V114/V115에서 옵션 JSON을 보존했다(`services/slip-service/src/main/resources/db/migration/V114__preserve_bundle_set_options.sql:1-3`, `services/slip-service/src/main/resources/db/migration/V115__preserve_estimate_bundle_set_options.sql:1-3`). 현재 최고 번호는 **V118** (`V118__create_slip_closed_date_policy.sql`)이다(`services/slip-service/src/main/resources/db/migration/V118__create_slip_closed_date_policy.sql:1`).
- `git log -S`로 bundle 관련 migration/domain 변경을 추적했을 때 set lineage 최초 추가는 `01b25aa53`의 V34 계열, 옵션 보존은 `424bf88ef`, `d4668ee8d`, `ac6a4120a` 계열로 확인됐다. 해당 bundle 컬럼을 제거한 뒤 재추가한 migration 파일은 현재 이력에서 확인되지 않았다. 이 문장은 migration 파일의 현행 내용과 `git log --diff-filter=D` 결과를 함께 본 결과다.

## 3. 관련 결정과의 정합

### 3.1 #1089 — 기본 구성품만, 비-SINGLE_SET 포함

- 현재 `BundleExpander`는 `SINGLE_SET`일 때만 picked filter/옵션 선택을 적용하고(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:123-129`), `COMMERCIAL_MULTI` 등 비-SINGLE_SET은 `parts` 전체를 결과로 만든다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:123-137`).
- 따라서 #1089의 “비-SINGLE_SET도 대상”과 “옵션을 선택하지 않은 기본 구성품을 전개”라는 해석에는 보완 관계다. 반대로 “기본 구성품”을 반드시 `bundle_component.is_default=true`로 정의하는 결정이라면 현재 non-SINGLE_SET 구현은 그 predicate를 사용하지 않으므로 충돌한다. `is_default`는 저장되어 있지만(`services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java:89-95`), expander의 non-SINGLE_SET 분기에서 필터링되지 않는다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:123-137`).
- #1089를 주문→전표에 적용하려면 부모 BUNDLE을 slip resolver에 보내는 방식이 아니라, 주문 생성 시점 또는 변환 직전 한 번만 구성품으로 전개하고 구성품 payload를 보내야 한다. 현재 resolver가 BUNDLE 부모를 명시적으로 거절하는 정책은 BUNDLE 부모를 재고/판매전표 라인으로 남기지 않는 기존 방향과 일치한다(`migration/decisions/DECISIONS.md:35-39`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:767-773`).

### 3.2 PR #1126 — 수량 동기화

- 현재 main의 수량 동기화 API는 rule CRUD와 `SINGLE_SET` rule 조회 계약이다(`services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java:25-71`, `clients/web/order-app/src/samhanApi.ts:188-190`).
- 구성품 편집 서비스가 수량 동기화 서비스에 의존하는 부분은 있다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleComponentService.java:84-100`). 이는 구성품 변경 시 규칙 참조 무결성을 지키는 경계이지, partner-order line 생성·변환·slip publish 경계는 아니다.
- #1126과 이번 slice 사이에서 확인되는 local code overlap은 quantity-sync rule CRUD/조회와 구성품 편집 시 참조 무결성 가드까지다(`services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java:25-71`, `clients/web/order-app/src/samhanApi.ts:188-190`, `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleComponentService.java:84-100`). 현재 주문 전환 payload와 slip resolver에는 그 rule을 호출하는 경로가 없고, 세트 누락의 직접 경계는 별도로 남아 있다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:146-154`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:760-788`). GitHub PR #1126의 changed-file 목록도 read-only로 대조했으며, 해당 두 전환 파일은 목록에 없었다.
- 다만 구성품의 수량 산출 결과를 주문 snapshot에 저장하는 설계를 선택하면, #1126의 “품목 수량 sync”가 만든 파생 수량과 bundle_component의 `default_qty/qty_mode`를 섞지 않도록 경계를 고정해야 한다. 현재 BundleExpander는 `FOLLOW_SET`과 `FIXED`를 bundle_component의 qty mode로 계산한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:108-120`).

### 3.3 #1111 — 구성품 편집 소관을 기초품목으로 이동

- 현재 desktop은 기초품목 상세에서 세트 구성품을 추가·수정·삭제한다고 표시한다(`clients/desktop/src/renderer/routes/ProductFormPage.tsx:944-947`). 기초품목 목록도 세트 구성품 편집이 세트 기초품목 상세 소관이라고 명시한다(`clients/desktop/src/renderer/routes/ProductCatalogPage.tsx:2-5`, `:223-225`).
- product-service는 `/api/v1/products/{modelCode}/components` GET/PUT를 제공하고 `BundleComponentService`로 위임한다(`services/product-service/src/main/java/com/samhanair/logis/product/web/ProductCatalogController.java:415-451`).
- 이 결정은 구성품 정본의 소관을 바로잡는 것이므로 이번 요구와 **보완**된다. 다만 편집 소관을 옮겨도 주문 생성 시점에 그 결과를 snapshot하거나 전환 시 재전개하는 배선은 생기지 않는다. 현재 주문 confirm은 여전히 `PartnerOrderLine.create()` 1행만 만든다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:215-230`).

### 3.4 추가 경계: 품절 BUNDLE 예외

현재 핸드오프에는 품절 BUNDLE은 전개하지 않고 부모 행을 남긴 뒤 수량 잠금하는 별도 결정이 기록되어 있다(`docs/handoff/CURRENT-WORK.md:156-168`). 따라서 정상 #1089 정책과 품절 예외를 같은 `EXPAND/KEEP` 필드 하나로 처리할지 개발책임자 확인이 필요하다. 현재 slip resolver는 일반 BUNDLE 부모를 `KEEP`가 아니면 거절한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/service/BundleModePolicy.java:11-16`).

## 4. 실 데이터 대조

### 4.1 측정 시각과 방법

- 컨테이너: `samhan-postgres`; 조회만 수행. 측정 시각은 각 DB의 `clock_timestamp()`가 반환한 KST 기준이다.
- 기본 counts: **2026-08-10 14:10:58~14:10:59 KST**. manual 전개 구조 표본: **2026-08-10 14:11:09 KST**.
- product DB의 활성 BUNDLE product ID 목록을 읽고, 그 ID 목록을 읽기 전용 `VALUES` CTE로 partner_order_db에 전달해 `partner_order_lines.product_id`를 교집합 집계했다. INSERT/UPDATE/DELETE/DDL은 수행하지 않았다.

### 4.2 결과

| 대상 | 결과 | 근거 |
|---|---:|---|
| 활성 BUNDLE product | 343 | `products.product_type` 구조: `services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:17-20`; 실측 `product_db`: `bundle_products|343` |
| 활성 bundle_component | 1,584 | `bundle_component` 구조: `services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:77-99`; 실측: `bundle_components|1584` |
| `is_default=true` 구성품 | 855 | 필드 정의: `services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java:89-95`; 실측: `bundle_components_default|855` |
| 활성 BUNDLE mode | `EXPAND` 343, `KEEP` 0, null 0 | mode 정의/정책: `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:102-110`, `services/slip-service/src/main/java/com/samhanair/logis/slip/service/BundleModePolicy.java:11-16`; 실측: `bundle_mode_group|EXPAND|343` |
| 활성 partner_order_lines 전체 | 586 | 테이블 필드: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:49-116`; 실측 14:01:53 `partner_order_lines_active|586` |
| 활성 BUNDLE 참조 order lines | 331 | product ID와 line의 관계: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:55-61`; 실측 14:10:43 `bundle_lines_active|331` |
| 그중 `converted_quantity>0` | 0 | 전환 누적 필드/동작: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:98-103`, `:273-285`; 실측 `bundle_lines_converted|0` |
| 활성 전체 order lines 중 `converted_quantity>0` | 0 | 성공 후에만 누적: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:210-217`; 실측 `all_lines_converted|0` |
| BUNDLE order line 주문 상태 | `DRAFT` 331 | 전환 허용 상태: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java:618-629`; 실측 14:10:59 `DRAFT|331` |
| 활성 slip_lines | 302 | set metadata 필드: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:127-149`; 실측 `active_slip_lines|302` |
| 활성 slip_lines의 source_order_line_id | 0 | V29 추적 컬럼: `services/slip-service/src/main/resources/db/migration/V29__add_slip_line_source_order_line.sql:1-4`; 실측 `active_slip_lines_with_source_order|0` |
| 활성 slip_lines의 parent_set_model | 202 | set lineage 저장: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:138-149`; 실측 `active_slip_lines_with_bundle_parent|202` |
| 활성 slip_lines의 set_head=true | 77 | set head 저장: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:138-144`; 실측 `active_slip_lines_set_head|77` |

### 4.3 원본 주문 라인↔전환 전표 라인 대조

- 대조 키는 V29가 정의한 `slip_lines.source_order_line_id`다(`services/slip-service/src/main/resources/db/migration/V29__add_slip_line_source_order_line.sql:1-4`).
- 조회 결과 활성 slip line 중 해당 키가 채워진 행이 0건이고, partner-order line 중 `converted_quantity>0`도 0건이었다. 그러므로 **BUNDLE 1쌍을 실제로 대조할 표본이 없으며, 표본 0에 따른 판정 불가**다.
- 2026-08-10 14:10:59 KST 기준 현 DB의 128개 활성 slip은 모두 `source_type=MANUAL`이었다(실측 `active_slips_manual|128`). 따라서 현재 slip 데이터의 세트 lineage 202건은 주문 전환 결과가 아니라 manual 입력 전개 결과로 해석해야 한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:136-162`, `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:138-149`).
- 표본이 0인 대신 실제 경로는 코드로 판정했다. 현 BUNDLE 주문은 모두 DRAFT라 endpoint 진입은 가능하지만, 활성 product mode가 전부 EXPAND이고 resolver가 부모를 저장 전에 거절하므로 정상적인 주문→전표 BUNDLE 결과를 만들 수 없다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java:618-629`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:765-773`). 이번 라운드에는 실제 전환을 실행하지 않았다.

### 4.4 읽기 전용 측정 SQL의 핵심

```sql
-- product_db
SELECT clock_timestamp(), count(*)
FROM products
WHERE is_deleted = false AND product_type = 'BUNDLE';

SELECT clock_timestamp(), count(*)
FROM bundle_component
WHERE is_deleted = false;

SELECT clock_timestamp(), coalesce(bundle_mode, '<null>'), count(*)
FROM products
WHERE is_deleted = false AND product_type = 'BUNDLE'
GROUP BY bundle_mode;

-- partner_order_db: product_db에서 읽은 활성 BUNDLE id 목록을 read-only VALUES CTE로 주입
WITH bundle_products(id) AS (VALUES (...active BUNDLE ids...))
SELECT clock_timestamp(),
       count(*) FILTER (WHERE l.is_deleted = false),
       count(*) FILTER (WHERE l.is_deleted = false AND l.converted_quantity > 0)
FROM partner_order_lines l
JOIN bundle_products b ON b.id = l.product_id;

-- slip_db
SELECT clock_timestamp(), count(*)
FROM slip_lines
WHERE is_deleted = false AND source_order_line_id IS NOT NULL;
```

## 5. 규모와 변경 경계 판정

### 5.1 저장 컬럼/테이블

현재 요구가 “주문 상세에 보여주기”에 그치면 product-service의 master를 조회해 response를 enrich할 수 있지만, “주문서→출고전표 전환 시 그대로 계승”까지 요구하면 response null/empty를 채우는 것만으로는 부족하다. 주문이 생성된 뒤 bundle_component가 바뀌어도 같은 출고전표가 나와야 하므로 주문 경계에 snapshot이 필요하다. 이 판단의 근거는 현재 주문 entity에 세트 snapshot이 없고(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:49-116`), 견적→전표만 metadata를 1:1 보존하기 때문이다(`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java:99-130`).

개발책임자 확인이 필요한 저장 선택지는 다음과 같다.

| 선택지 | 형태 | 대가/위험 |
|---|---|---|
| A — 권장 | `partner_order_line_components` 별도 snapshot 테이블. parent order line, component product/model/name/spec, set 수량/구성품 수량, 표시순서, head, parent model, 옵션, 금액 권위를 저장 | migration·조회 join·주문/전표 idempotency 설계가 필요하지만 주문 당시 전개 결과를 고정하고 구성품 1:N을 자연스럽게 표현한다 |
| B | 기존 `partner_order_lines`에 parent/child 행을 함께 저장하고 parent-child FK 및 bundle metadata 컬럼 추가 | 조회는 단순할 수 있으나 기존 `converted_quantity`가 부모 수량인지 구성품 수량인지 충돌하고, 전환 시 child별 중복 누적 위험이 크다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:98-103`, `:273-285`) |
| C | 저장 없이 convert 직전에 product-service `expand()` 재호출, slip payload만 구성품으로 변경 | migration이 없고 빠르지만 주문 이후 master 변경/옵션 변경에 따라 결과가 달라져 “그대로 계승”을 보장하지 못한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:82-120`) |

권장안은 A다. 최소한 parent line에는 bundle mode와 snapshot 존재 여부가 필요하고, child snapshot에는 구성품 lineage와 수량이 필요하다. 기존 `slip_lines`의 `set_head`, `parent_set_model`, `bundle_set_options`는 재사용할 수 있으나(`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:131-149`), 현재 publish request에는 그 필드가 없으므로 `PublishLineRequest`와 resolver를 확장해야 한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishLineRequest.java:29-42`).

### 5.2 BE/FE/전환 로직

- **BE 필수**: partner-order의 저장/조회/직접 confirm/estimate→order, partner-order의 단일·병합 convert, slip publish request/resolver를 함께 바꿔야 한다. 현재 변환 payload와 slip request 모두 세트 metadata를 표현하지 않는다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:146-154`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishLineRequest.java:29-42`).
- **FE 기능 코드**: 상세 화면의 타입·정규화·두 열 렌더링은 이미 존재한다(`clients/desktop/src/renderer/api/sales.ts:475-487`, `:602-622`, `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1223-1238`). 따라서 BE가 같은 response 계약을 실제 값으로 채우는 것만으로 표시 기능은 동작할 가능성이 높다. 다만 mock/fixture와 API contract test는 갱신 대상이다(`clients/desktop/src/renderer/api/sales.ts:555-567`).
- **FE 변경이 필요한 경우**: 전환 전에 구성품을 편집하거나 부모/구성품별 재고 예약을 사용자가 선택하게 만들 경우다. 현재 convert request는 `orderLineId`와 수량만 보낸다(`clients/desktop/src/renderer/api/sales.ts:494-507`); 이 범위는 별도 UX 결정 없이는 확장하지 않는 것이 안전하다.
- **전환 로직 변경은 필수**: 현재 `resolveLines()`는 BUNDLE parent를 거절하고, 성공 시에만 parent line의 converted quantity를 올린다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:765-788`, `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:210-223`). 구성품 N행 publish, 부모 수량 1회 누적, 재시도 idempotency, inventory 예약 단위를 같이 정의해야 한다.
- **마이그레이션 번호**: 이번 조사에서 생성하지 않는다. 현재 최고 번호만 보고하면 partner-order **V18**, product **V35**, slip **V118**이다(`services/partner-order-service/src/main/resources/db/migration/V18__soft_delete_test_seed_orders.sql:1`, `services/product-service/src/main/resources/db/migration/V35__repair_issue_1096_product_cleanup.sql:1`, `services/slip-service/src/main/resources/db/migration/V118__create_slip_closed_date_policy.sql:1`).

## 6. 슬라이스 제안

### 권장 슬라이스: 주문 세트 snapshot → 출고전표 구성품 carryover

- **무엇**: 직접 confirm 및 estimate→order에서 bundle expansion 결과를 주문 경계에 고정하고, 단일/병합 주문 전환이 snapshot 구성품을 `set_head`·`parent_set_model`·옵션과 함께 slip 구성품 행으로 발행하도록 한다. BUNDLE 부모는 일반 판매전표 라인으로 저장하지 않는다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:767-773`, `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:138-149`).
- **경계 근거**: 이번 요구의 핵심은 order→slip carryover이고, 현재 주문 저장·전환 payload·slip resolver 세 경계 모두 세트 정보를 끊고 있다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:49-116`, `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:146-154`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishLineRequest.java:29-42`). #1111의 구성품 소관은 product master에 이미 정착되어 있으므로 이번 slice에서 소관을 다시 옮기지 않는다(`clients/desktop/src/renderer/routes/ProductFormPage.tsx:944-947`, `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductCatalogController.java:415-451`).
- **회귀 위험**: (1) 기존 non-BUNDLE 1:1 금액/수량, (2) 단일·병합 전환의 source line 추적과 `converted_quantity`, (3) 구성품별 재고 예약과 부모 예약 중복, (4) publish replay/idempotency, (5) master 변경 후 주문 snapshot 불변성, (6) manual/estimate 전표의 기존 set metadata, (7) 품절 BUNDLE의 부모 유지·잠금 예외(`docs/handoff/CURRENT-WORK.md:156-168`)다.
- **선행 조건**: 개발책임자가 A/B/C 저장 방식을 선택하고, “기본 구성품”을 `is_default=true`로 볼지 non-SINGLE_SET의 전체 기본 행으로 볼지 확정해야 한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:123-137`, `services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java:89-95`). 이어서 부모 주문 수량·구성품 수량·금액 authority·재고 예약 단위·sourceOrderLineId의 1:N 의미를 계약으로 고정해야 한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:78-116`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishLineRequest.java:29-42`). 현재 DB에 전환 표본이 0이므로 BUNDLE fixture/golden과 실패 전/후 검증 시나리오를 먼저 마련해야 한다(실측 2026-08-10 14:10:58~14:10:59 KST).

### 개발책임자 확인 선택지와 대가

1. **A snapshot 저장(권장)**: 주문 당시 구성품·수량·옵션을 보존해 “그대로 전환”을 보장한다. migration, API contract, 1:N converted/idempotency 테스트 비용이 든다.
2. **C 전환 시 재전개**: 구현량과 migration을 줄인다. 대신 주문 후 master/component 변경 시 출고전표가 달라져 이번 요구의 “그대로”와 충돌한다.
3. **기본 구성품 정의**: (a) `is_default=true`만 전개 — 명시적이고 4 화면 정합성이 좋지만 현재 non-SINGLE_SET expander와 달라진다; (b) non-SINGLE_SET은 현재처럼 등록된 전체 구성품, SINGLE_SET만 옵션 필터 — 기존 expander와 회귀가 적지만 `is_default`를 기본 규칙으로 쓰지 않는다(`services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:123-137`).
4. **품절 BUNDLE 예외**: (a) 정상 전개 정책에 통합 — 규칙이 단순해지나 핸드오프의 부모 잠금 결정을 바꾼다; (b) 별도 예외로 유지 — 운영 정책은 보존되나 resolver/재고 게이트 테스트가 분기된다(`docs/handoff/CURRENT-WORK.md:161-168`).

## 최종 결론

현재 결함은 두 열의 표시 문제만이 아니다. 주문 entity에 세트 결과가 없고, 전환 payload가 평면이며, slip-service는 BUNDLE 부모를 거절하므로 현 활성 BUNDLE 주문 331건은 주문→출고전표로 세트 구성을 계승할 수 없다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java:166-185`, `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:146-154`, `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:765-788`). 다음 라운드는 저장 방식과 기본 구성품/품절 예외를 확정한 뒤 BE 전환 계약부터 설계해야 한다.
