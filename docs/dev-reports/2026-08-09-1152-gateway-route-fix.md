# PR #1152 gateway route fix — 2026-08-09

## 범위와 판정

PR #1152의 핵심 진입 결함인 상품→비상품 변경 PATCH를 gateway no-strip route로 보완했다.
현재 HEAD는 `b35c8270b3d5e0929a1732686b034591b2a53cc3`이며, 커밋·push는 하지 않았다.

## RED-A — 수정 전 원문

```text
PATCH http://127.0.0.1:8080/api/v1/products/AJ060MXHNBC1/goods-type
HTTP=500
BODY={"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.",...}

product-service:
org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource products/AJ060MXHNBC1/goods-type.
```

수정 전 gateway에는 `goods-type` 문자열을 포함하는 route가 없었고, generic
`product-service-v1`의 `StripPrefix=2`가 요청을 `/products/{modelCode}/goods-type`으로
변형했다.

## 계열 sweep 대조표

축은 `product-service`의 풀패스 컨트롤러가 노출하는 `/api/v1/products/**`와 gateway
no-strip route의 대조다. `admin/**`과 `specs/**`처럼 wildcard로 덮이는 경로는 해당 route로
표시했다.

| product-service 풀패스 경로 | gateway no-strip route | 판정 |
|---|---|---|
| `/api/v1/products/admin/**` | `product-admin-v1` | 덮음 |
| `/api/v1/products` | `product-catalog-v1` | 덮음 |
| `/api/v1/products/*/usage` | `product-usage-v1` | 덮음 |
| `/api/v1/products/*/variable-discount` | `product-variable-discount-v1` | 덮음 |
| `/api/v1/products/*/goods-type` | `product-goods-type-v1` | 이번 수정 |
| `/api/v1/products/*/classification` | `product-classification-v1` | 덮음 |
| `/api/v1/products/*/fixed-discount` | `product-fixed-discount-v1` | 덮음 |
| `/api/v1/products/*/specs`, `.../specs/**` | `product-specs-v1` | 덮음 |
| `/api/v1/spec-key-templates`, `.../**` | `product-specs-v1` | 덮음 |
| `/api/v1/products/*/components` | `product-components-v1` | 덮음 |
| `/api/v1/products/display-orders` | `product-display-orders-v1` | 덮음 |
| `/api/v1/products/catalog-realtime` | `product-catalog-realtime-v1` | 덮음 |

차집합은 `goods-type` 1건이었고, 이 PR의 기능과 직접 관련된 해당 경로만 수정했다.
다른 product 풀패스 누락은 발견되지 않았다.

## 변경

`services/api-gateway/src/main/resources/application.yml`에 다음 route를
generic `product-service-v1`보다 앞에 추가했다.

```yaml
- id: product-goods-type-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/*/goods-type
  filters:
    - JwtAuthentication
```

`ApiGatewayContextLoadIT`에 Path, no-strip, generic 선행, JWT 필터 계약을 추가했다.

## TDD 및 gateway 검증

신규 route 계약 테스트를 먼저 추가하고 수정 전 실행하여 의도된 RED를 확인했다.

```text
ApiGatewayContextLoadIT > RC9 product 라우트 ... FAILED
java.lang.AssertionError at ApiGatewayContextLoadIT.java:462
1 test completed, 1 failed
```

route 추가 후 단일 테스트:

```text
1 test completed
BUILD SUCCESSFUL
```

gateway 전체 테스트:

```text
:services:api-gateway:test
BUILD SUCCESSFUL
```

gateway bootJar 및 변경 이미지 빌드도 `BUILD SUCCESSFUL`/Docker build 성공을 확인했다.
다른 서비스 컨테이너는 재배포하지 않고 local gateway 컨테이너만 변경 JAR로 기동했다.

## RED-A~C 실 경로 결과

### GREEN-A/B — 실 GUI

Playwright real-QA 스펙에서 다음 원문을 확인했다.

```text
[TRIGGER COUNT] PRODUCT_TOTAL=3084 FIRST_PAGE_GOODS=32
[GOODS TYPE RESPONSE] HTTP=200 BODY={..."goodsType":"NON_GOODS",...}
[GUI] ESTIMATE_ITEM=AJ060MXHNBC1 GOODS_TYPE=NON_GOODS ESTIMATE_INCLUDED=true HTTP=200
[GUI] ESTIMATE_MODEL=AJ060MXHNBC1 DELIVERY_PRICE=12345 QUANTITY=1 SEARCH_HTTP=200
[RESTORE] ESTIMATE_ITEM=AJ060MXHNBC1 GOODS_TYPE=GOODS ESTIMATE_INCLUDED=true
```

요구된 캡처:

- `docs/qa/2026-08-09-1152-postmerge2/_local/01-estimate-item-designated-non-goods.png`
- `docs/qa/2026-08-09-1152-postmerge2/_local/02-non-goods-delivery-price-quantity-one.png`

### GREEN-C — 기존 product route 회귀 대표 호출

변경 gateway에 로그인 후 business model code만 사용해 호출했다. UUID는 기록하지 않았다.

```text
GET /api/v1/products HTTP=200
GET /api/v1/products/admin/sync/last HTTP=200
GET /api/v1/products/AJ060MXHNBC1/specs HTTP=200
```

### 별도 미판정 — 출고 complete

같은 real-QA 파일의 출고 검증은 다음 기존 계약 오류로 실패했다.

```text
[OUTBOUND STATE] 2026/08/08-41 STATUS=PROCESSING REMAINING=complete
[OUTBOUND NETWORK] 2026/08/08-41 complete -> 409
sourceContext: sourceContext 는 필수입니다
```

이는 gateway route 변경과 무관한 보호 배포본의 inventory 계약 불일치다. 본 fix의 결함이나
GREEN-A/B를 부정하는 근거로 세지 않으며, 출고 전체는 이 보고서에서 미판정으로 남긴다.

## 신규 생성 파일

- `docs/dev-reports/2026-08-09-1152-gateway-route-fix.md`
- `docs/qa/2026-08-09-1152-postmerge2/_local/01-estimate-item-designated-non-goods.png`
- `docs/qa/2026-08-09-1152-postmerge2/_local/02-non-goods-delivery-price-quantity-one.png`
- `docs/qa/2026-08-09-1152-postmerge2/_local/03-before-outbound-complete.png`
- `docs/qa/2026-08-09-1152-postmerge2/_local/05-sheet-sync-remark-surface.png`

QA 캡처는 `_local` 보호 경로에 생성되었고 git 상태에는 나타나지 않는 ignored 파일이다.

## 못 한 것

- 출고 `complete 200`은 보호 배포본의 `sourceContext` 누락으로 재현하지 못했다.
- 커밋·push·PR·main 머지는 수행하지 않았다.
