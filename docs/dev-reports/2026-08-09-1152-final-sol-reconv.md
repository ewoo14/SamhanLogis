# PR #1152 머지 전 최종 SOL 5.6 적대검증 재수렴

## 환경 확인

```text
워크트리 = C:\dev\Samhan-Public\.claude\worktrees\tnongoods
브랜치 = feat/896-non-goods-estimate
요청 HEAD = e80a0dfd5
실측 HEAD = e80a0dfd519a41755939bd7afc06e4ae4e5c3c37

renderer = http://127.0.0.1:5175/ -> HTTP 200
gateway  = http://127.0.0.1:8080/actuator/health -> HTTP 200
product  = http://127.0.0.1:8084/actuator/health -> HTTP 200
inventory= http://127.0.0.1:8085/actuator/health -> HTTP 200
```

HEAD에서 다음 명령으로 세 허용 서비스의 JAR를 fresh 재빌드했다.

```text
.\gradlew.bat :services:api-gateway:bootJar :services:product-service:bootJar :services:inventory-service:bootJar --rerun-tasks --no-daemon
BUILD SUCCESSFUL in 30s
25 actionable tasks: 25 executed
```

배포 JAR SHA와 HEAD 빌드 SHA의 최종 대조 원문:

```text
api-gateway HEAD build = b9fee18fcea9d9a1d5dfed7b4d3e4b7e1399c2dc2d45c0ba9925263da2786205
api-gateway /app/app.jar = b9fee18fcea9d9a1d5dfed7b4d3e4b7e1399c2dc2d45c0ba9925263da2786205

product-service HEAD build = a8805cc2f62c6f70bb8b4d1c7efc64ce6d70ac554f21c8d7fbdcf51ea8bce36c
product-service /app/app.jar = a8805cc2f62c6f70bb8b4d1c7efc64ce6d70ac554f21c8d7fbdcf51ea8bce36c

inventory-service HEAD build = c3357c0295e713e84acb24c2b6ef4593e03b344f929137a17b52291133a7c309
inventory-service /app/app.jar = c3357c0295e713e84acb24c2b6ef4593e03b344f929137a17b52291133a7c309
```

실제 호출 API는 `http://127.0.0.1:8080`의 `/auth/login`, `/api/products/**`,
`/api/v1/products/**`, `/api/v1/classifications`, `/api/v1/material-prices`,
`/api/v1/quantity-sync-rules`이다. GUI는 위 renderer의 HashRouter 경로
`#/products/estimate-items`와 `#/sales/estimates/new`를 사용했다.

재배포 직후 제거된 옛 product 컨테이너의 Eureka 주소가 잠시 남아 `/api/products`가
200/500으로 교대했다. gateway 원문은 `UnknownHostException: Failed to resolve
'7e09f918a892'`였다. 옛 등록을 제거한 뒤 동일 카탈로그 호출 5/5가 HTTP 200으로
수렴한 것을 확인하고 검증을 시작했다. 이는 HEAD 애플리케이션 경로의 재현 결함으로
집계하지 않았다.

## 발화 조건 카운트

라이브 GUI보다 먼저 인증된 실 카탈로그를 5회 호출했다.

```text
[TRIGGER COUNT] TRY=1 LOGIN_HTTP=200 CATALOG_HTTP=200 PRODUCT_TOTAL=3084 FIRST_PAGE_GOODS=32 FIRST_PAGE_NON_GOODS=18
[TRIGGER COUNT] TRY=2 LOGIN_HTTP=200 CATALOG_HTTP=200 PRODUCT_TOTAL=3084 FIRST_PAGE_GOODS=32 FIRST_PAGE_NON_GOODS=18
[TRIGGER COUNT] TRY=3 LOGIN_HTTP=200 CATALOG_HTTP=200 PRODUCT_TOTAL=3084 FIRST_PAGE_GOODS=32 FIRST_PAGE_NON_GOODS=18
[TRIGGER COUNT] TRY=4 LOGIN_HTTP=200 CATALOG_HTTP=200 PRODUCT_TOTAL=3084 FIRST_PAGE_GOODS=32 FIRST_PAGE_NON_GOODS=18
[TRIGGER COUNT] TRY=5 LOGIN_HTTP=200 CATALOG_HTTP=200 PRODUCT_TOTAL=3084 FIRST_PAGE_GOODS=32 FIRST_PAGE_NON_GOODS=18
```

## 판정

```text
실 사용자 경로로 재현 가능한 PR #1152 결함 = 0건
원 결함(PATCH 500) = 해소
PR 본래 시나리오 = 완주
라우트 우선순위 반대급부 = 재현 안 됨
권한 우회 = 재현 안 됨
Flyway 요구 순서 = 적용 확인
최종 판정 = 통과
```

알려진 출고 `complete` 409, 비상품 정책, #1151 source journal, 4인자 `shipBatch`는
지시대로 재조사하거나 결함으로 집계하지 않았다.

## 각도 1 — 원 결함 해소와 PR 요구사항 완주

기존 real-QA 스펙의 첫 테스트만 실행했다. 캡처 목적지는
`resolveQaShotsDir()`에 `QA_SHOTS_DIR=docs/qa/2026-08-09-1152-final`을 전달했고,
명시적 증거 경로 기록을 위해 `QA_ALLOW_OVERWRITE=1`을 사용했다.
`resolveQaCredential()` 호출은 테스트 본문 안의 `try/catch`에서 실패 시
`test.skip`하는 기존 규약을 그대로 사용했다.

```text
Running 1 test using 1 worker
[TRIGGER COUNT] PRODUCT_TOTAL=3084 FIRST_PAGE_GOODS=32
[GOODS TYPE RESPONSE] HTTP=200 ... "goodsType":"NON_GOODS" ...
[GUI] ESTIMATE_ITEM=AJ060MXHNBC1 GOODS_TYPE=NON_GOODS ESTIMATE_INCLUDED=true HTTP=200
[GUI] ESTIMATE_MODEL=AJ060MXHNBC1 DELIVERY_PRICE=12345 QUANTITY=1 SEARCH_HTTP=200
[RESTORE] ESTIMATE_ITEM=AJ060MXHNBC1 GOODS_TYPE=GOODS ESTIMATE_INCLUDED=true
1 passed (4.4s)
```

실 GUI 동작 순서는 견적품목에서 상품 `AJ060MXHNBC1`을 비상품으로 변경하고,
견적 작성 화면에서 해당 품목을 선택한 뒤 수량을 7로 두고 납품가 12,345를 입력하는
것이었다. blur 뒤 수량은 자동으로 1이 됐다. 테스트 종료 시 상품/견적노출 상태를
원래 값으로 복구했다. DB 직접 INSERT는 없었다.

스크린샷:

- `docs/qa/2026-08-09-1152-final/01-estimate-item-designated-non-goods.png`
- `docs/qa/2026-08-09-1152-final/02-non-goods-delivery-price-quantity-one.png`

두 PNG를 직접 열어 첫 화면의 `상품/비상품=비상품`, 둘째 화면의
`수량=1`, `단가(VAT포함)=12345`가 실제 DOM 렌더에 보이는 것을 확인했다.

## 각도 2 — product 라우트 전수와 우선순위 반대급부

### gateway 설정 원문

`services/api-gateway/src/main/resources/application.yml`의 `lb://product-service`
라우트 전부다.

```yaml
- id: product-service
  uri: lb://product-service
  predicates:
    - Path=/api/products/**
  filters:
    - StripPrefix=1
    - JwtAuthentication

- id: product-admin-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/admin/**
  filters:
    - JwtAuthentication

- id: product-catalog-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products
  filters:
    - JwtAuthentication

- id: product-usage-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/*/usage
  filters:
    - JwtAuthentication

- id: product-variable-discount-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/*/variable-discount
  filters:
    - JwtAuthentication

- id: product-fixed-discount-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/*/fixed-discount
  filters:
    - JwtAuthentication

- id: product-classification-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/*/classification
  filters:
    - JwtAuthentication

- id: product-goods-type-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/*/goods-type
  filters:
    - JwtAuthentication

- id: product-classifications-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/classifications,/api/v1/classifications/**
  filters:
    - JwtAuthentication

- id: product-specs-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/*/specs,/api/v1/products/*/specs/**,/api/v1/spec-key-templates,/api/v1/spec-key-templates/**
  filters:
    - JwtAuthentication

- id: product-components-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/*/components
  filters:
    - JwtAuthentication

- id: product-display-orders-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/display-orders
  filters:
    - JwtAuthentication

- id: product-catalog-realtime-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/catalog-realtime
  filters:
    - JwtAuthentication

- id: product-lookups-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/material-prices,/api/v1/material-prices/**,/api/v1/odu-recommendations,/api/v1/odu-recommendations/**,/api/v1/branch-pipes,/api/v1/branch-pipes/**
  filters:
    - JwtAuthentication

- id: product-quantity-sync-rules-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/quantity-sync-rules,/api/v1/quantity-sync-rules/**
  filters:
    - JwtAuthentication

- id: product-service-v1
  uri: lb://product-service
  predicates:
    - Path=/api/v1/products/**
  filters:
    - StripPrefix=2
    - JwtAuthentication
```

### 전수표

| 순서 | route id | 외부 패턴 | product-service 전달 경로 | 새 route와 관계 | 판정 |
|---:|---|---|---|---|---|
| 1 | `product-service` | `/api/products/**` | `/products/**` | 별도 `/api` 계열 | 유지 |
| 2 | `product-admin-v1` | `/api/v1/products/admin/**` | 원문 | `admin/goods-type`만 선행 포착 가능하나 같은 서비스·no-strip·JWT | 유지 |
| 3 | `product-catalog-v1` | `/api/v1/products` | 원문 | 세그먼트 수가 다름 | 유지 |
| 4 | `product-usage-v1` | `/api/v1/products/*/usage` | 원문 | 마지막 세그먼트가 다름 | 유지 |
| 5 | `product-variable-discount-v1` | `/api/v1/products/*/variable-discount` | 원문 | 마지막 세그먼트가 다름 | 유지 |
| 6 | `product-fixed-discount-v1` | `/api/v1/products/*/fixed-discount` | 원문 | 마지막 세그먼트가 다름 | 유지 |
| 7 | `product-classification-v1` | `/api/v1/products/*/classification` | 원문 | 마지막 세그먼트가 다름 | 유지 |
| 8 | `product-goods-type-v1` | `/api/v1/products/*/goods-type` | 원문 | 정확히 한 modelCode 세그먼트만 허용 | 정상 |
| 9 | `product-classifications-v1` | `/api/v1/classifications{,/**}` | 원문 | prefix가 다름 | 유지 |
| 10 | `product-specs-v1` | specs·spec-key-templates 표적 | 원문 | 마지막 세그먼트가 다름 | 유지 |
| 11 | `product-components-v1` | `/api/v1/products/*/components` | 원문 | 마지막 세그먼트가 다름 | 유지 |
| 12 | `product-display-orders-v1` | `/api/v1/products/display-orders` | 원문 | 3세그먼트 exact라 미중첩 | 유지 |
| 13 | `product-catalog-realtime-v1` | `/api/v1/products/catalog-realtime` | 원문 | 3세그먼트 exact라 미중첩 | 유지 |
| 14 | `product-lookups-v1` | material/ODU/branch-pipe | 원문 | prefix가 다름 | 유지 |
| 15 | `product-quantity-sync-rules-v1` | `/api/v1/quantity-sync-rules{,/**}` | 원문 | prefix가 다름 | 유지 |
| 16 | `product-service-v1` | `/api/v1/products/**` | `StripPrefix=2` 후 `/products/**` | 새 route의 유일한 일반 중첩; 새 route가 선행 | 유지 |

`*`는 한 세그먼트이고 패턴은 `goods-type`에서 끝난다. 따라서
`/api/v1/products/{code}/goods-type/…` 같은 더 깊은 경로나 usage/specs/components
경로를 삼키지 않는다. `product-admin-v1`은 더 먼저 선언돼 modelCode가 문자 그대로
`admin`인 경우 그 route가 잡지만, 전달 서비스·경로·JWT가 모두 동일한 no-strip이므로
동작 차이는 없다.

### 실 호출 원문

사용자 식별 UUID는 보고서에서 비공개로 치환했다.

```text
[ROUTE LIVE] legacy-strip1 GET /api/products?page=0&size=1 HTTP=200
[ROUTE LIVE] v1-catalog-no-strip GET /api/v1/products?page=0&size=1 HTTP=200
[ROUTE LIVE] admin-no-strip GET /api/v1/products/admin/sync/last HTTP=200
[ROUTE LIVE] specs-no-strip GET /api/v1/products/AJ060MXHNBC1/specs HTTP=200
[ROUTE LIVE] components-no-strip GET /api/v1/products/AJ060MXHNBC1/components HTTP=200
[ROUTE LIVE] classifications-no-strip GET /api/v1/classifications HTTP=400
  BODY_PREFIX={"success":false,"code":"INVALID_INPUT","message":"필수 요청 파라미터가 누락되었습니다."...}
[ROUTE LIVE] lookup-no-strip GET /api/v1/material-prices HTTP=200
[ROUTE LIVE] quantity-sync-no-strip GET /api/v1/quantity-sync-rules HTTP=200
[ROUTE LIVE] generic-strip2 GET /api/v1/products/<opaque-id> HTTP=200
```

`classifications`의 400은 라우팅 실패가 아니라 실제
`ClassificationController.list(@RequestParam EstimateCategory estimateCategory, ...)`에
도달해 필수 파라미터 검증이 발화한 응답이다. 나머지 8개 대표 경로는 200이었다.

## 각도 3 — 권한 축

컨트롤러 계약은 다음과 같다.

```java
@PatchMapping("/products/{modelCode}/goods-type")
@RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
```

같은 modelCode와 `{"goodsType":"GOODS"}` body로 실제 gateway PATCH를 호출했다.

```text
[AUTH LOGIN] dev_master HTTP=200 ROLE=MASTER; dev_accountant HTTP=200 ROLE=ACCOUNTANT
[ROUTE LIVE] goods-type-no-token PATCH /api/v1/products/AJ060MXHNBC1/goods-type HTTP=401
BODY_PREFIX={"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}

[ROUTE LIVE] goods-type-denied PATCH /api/v1/products/AJ060MXHNBC1/goods-type HTTP=403
BODY_PREFIX={"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.admin action=UPDATE ..."}

[ROUTE LIVE] goods-type-authorized PATCH /api/v1/products/AJ060MXHNBC1/goods-type HTTP=200
```

권한 있는 `MASTER`는 통과하고 권한 없는 `ACCOUNTANT`는 product-service의 동적 권한에서
차단됐다. 무토큰도 gateway의 `JwtAuthentication`에서 401로 차단됐다.

## 각도 4 — Flyway 실제 적용 순서

inventory `flyway_schema_history` 원문:

```text
 installed_rank | version |               description                | type |        installed_on        | success
----------------+---------+------------------------------------------+------+----------------------------+---------
             23 | 23      | stock balances warehouse active index    | SQL  | 2026-08-02 01:33:29.631499 | t
             24 | 24      | create source operation journals         | SQL  | 2026-08-09 19:26:31.284197 | t
             25 | 25      | assert non goods candidate stock absence | SQL  | 2026-08-09 19:26:31.356385 | t
(3 rows)
```

product `flyway_schema_history` 원문:

```text
 installed_rank | version |            description             | type |        installed_on        | success
----------------+---------+------------------------------------+------+----------------------------+---------
             32 | 32      | bundle components manual           | SQL  | 2026-08-07 22:44:16.214956 | t
             33 | 33      | mark non goods estimate candidates | SQL  | 2026-08-09 10:12:35.966992 | t
             34 | 34      | expand product statuses            | SQL  | 2026-08-09 19:31:46.17044  | t
(3 rows)
```

요청한 inventory `V23→V24→V25`, product `V32→V33`은 installed_rank 오름차순과
`success=t`로 적용됐다. product V34는 공유 DB에 다른 실행 트랙이 이미 적용한 행이며,
현재 HEAD product JAR의 최신 migration은 V33이라 기동 로그에
`Schema public has a version (34) that is newer than the latest available migration (33)` 경고가
남았지만 서비스는 해당 이력을 검증하고 healthy로 기동했다.

## 신규 생성 파일

- `docs/dev-reports/2026-08-09-1152-final-sol-reconv.md`
- `docs/qa/2026-08-09-1152-final/01-estimate-item-designated-non-goods.png`
- `docs/qa/2026-08-09-1152-final/02-non-goods-delivery-price-quantity-one.png`

git commit·push·checkout·DB 직접 INSERT는 수행하지 않았다.
