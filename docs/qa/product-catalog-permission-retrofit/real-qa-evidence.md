# PR #420 QA 실측 증빙 — ProductCatalog 권한 소급 + 라우팅 교정

## 1. 환경 정보

| 항목 | 값 |
|---|---|
| 테스트 일시 (1차) | 2026-06-07 16:38 ~ 16:55 (KST) |
| 테스트 일시 (재실측) | 2026-06-07 18:00 ~ 18:06 (KST) |
| 브랜치 | feat/product-catalog-permission-retrofit |
| 최신 커밋 (재실측 시) | 559a4831 ([FIX] D-PCR-01 — 카탈로그 식별자 단절 해소) |
| 게이트웨이 | localhost:8080 (samhan-api-gateway) |
| product-service | localhost:8084 (samhan-product-service, 559a4831 재빌드 후 재기동) |
| 재빌드 방법 | `./gradlew :services:product-service:bootJar --no-daemon` (BUILD SUCCESSFUL 13s) |
| 이미지 재빌드 | `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build product-service` |
| 재기동 | `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d product-service` |
| health 확인 | `curl localhost:8084/actuator/health` → `{"status":"UP"}` |
| DB | samhan-postgres (PostgreSQL 16-alpine, product_db / auth_db) |
| 테스트 방법 | 게이트웨이 경유 실 HTTP (curl) — 직접 서비스 포트 호출 없음 |

## 2. 계정 정보 (실 로그인 확인)

| login_id | 그룹(권한) | userId |
|---|---|---|
| dev_master | 마스터 (is_system_master=true) | a0000000-0000-0000-0000-000000000001 |
| dev_manager | 매니저 | a0000000-0000-0000-0000-000000000003 |
| dev_sales | 영업원 | a0000000-0000-0000-0000-000000000004 |

### products 관련 seed 권한 매트릭스 (auth_db 실 조회)

| 그룹 | products.list VIEW | products.admin VIEW |
|---|---|---|
| 마스터 (system_master) | 전권 bypass | 전권 bypass |
| 매니저 | true | true |
| 영업원 | true | true |
| 개발자 | true | true |
| 재고원 | true | true |
| 창고원 | **true** | **false** |
| 회계원 | true | **false** |
| 기사 | **false** | false |
| 사원 | **false** | false |
| 배차담당자 | **false** | false |

## 3. 테스트 결과표 — 최종 (T1~T8 + 재실측)

| T | 테스트 항목 | 기대 | 실측 HTTP | 결과 | 비고 |
|---|---|---|---|---|---|
| T1 | MASTER GET /api/v1/products?size=3 | 200 + Spring Page shape | **200** totalElements=100 | **PASS** | 1차 측정. 라우팅 교정(product-catalog-v1) 실증 |
| T2 | products.list 무권한 → GET 403 | 403 | **403** FORBIDDEN | **PASS** | 재실측: psql 임시 revoke 우회 실증 (D-PCR-02 해소) |
| T3 | MANAGER PATCH /api/v1/products/{code}/usage | 200 | **200** (재실측 — fix 전 500) | **PASS** | D-PCR-01 fix 559a4831 실증 |
| T3b | 미존재 식별자 PATCH → 404 | 404 | **404** NOT_FOUND | **PASS** | 신규. GlobalExceptionHandler 404 교정 실증 |
| T4 | products.admin 무권한(창고원) PATCH → 403 | 403 | **403** FORBIDDEN | **PASS** | 1차 측정. @RequirePermission UPDATE deny 실증 |
| T5a | SALES GET /api/v1/products/{code}/specs | 200 | **200** `[]` (재실측 — fix 전 500) | **PASS** | D-PCR-01 fix 559a4831 실증 |
| T5b | SALES GET /api/v1/spec-key-templates | 200 | **200** 42건 | **PASS** | 1차 측정 |
| T6 | MANAGER POST spec(201) → DELETE(204) → deleted_by=UUID | 201→204→psql | **201→204, deleted_by=MANAGER UUID** | **PASS** | 재실측. X-User-Id actor 교정 psql 실증 |
| T7a | SALES GET /api/products/categories | 200 | **200** 2 categories | **PASS** | 1차 측정 |
| T7b | 무권한 역할 GET /api/products/categories → 403 | 403 | **403** FORBIDDEN | **PASS** | 재실측: psql revoke 우회 실증 (D-PCR-02 해소) |
| T8a | SALES GET /api/products?q=삼성 | 200 | **200** | **PASS** | 1차 측정 |
| T8b | SALES GET /api/v1/material-prices | 200 | **200** `[]` | **PASS** | 1차 측정 |

**최종 요약: PASS 12 / FAIL 0 / SKIP 0**

## 4. T3 재실측 상세 (D-PCR-01 fix 실증)

```
커밋: 559a4831 — findByCatalogExposedModelCodeAndIsDeletedFalse (model_code → model_name fallback 추가)
                   GlobalExceptionHandler EntityNotFoundException → 404 교정

요청: PATCH http://localhost:8080/api/v1/products/AR05TXEAAWKNEU-01/usage
  Body: {"usageScope":"ESTIMATE","estimateCategory":"OTHER"}
  Authorization: Bearer (dev_manager)
  라우트: product-usage-v1 (Path=/api/v1/products/*/usage)

응답 HTTP 200:
{"modelCode":"AR05TXEAAWKNEU-01","name":"삼성 윈드프리 5평형","usageScope":"ESTIMATE",
 "estimateCategory":"OTHER","releasePrice":600000.00,"deliveryPrice":500000.00,
 "hasVariableDiscount":false,"legacyDiscountFlag":false,"discountFlags":"000000"}

원복 PATCH (usageScope=BOTH): HTTP 200, usageScope=BOTH 확인 → DB 원복 완료

fix 전: PATCH → HTTP 500 "Product 없음: AR05TXEAAWKNEU-01"
fix 후: PATCH → HTTP 200 (model_name fallback 조회 성공)
```

## 5. T3b 상세 (미존재 식별자 404 교정)

```
요청: PATCH http://localhost:8080/api/v1/products/NONEXISTENT-QA-9999/usage
  Body: {"usageScope":"ESTIMATE","estimateCategory":"OTHER"}

응답 HTTP 404:
{"success":false,"code":"NOT_FOUND","message":"Product 없음: NONEXISTENT-QA-9999",
 "data":null,"timestamp":"2026-06-07T09:01:33.087763242Z"}

fix 전: EntityNotFoundException → 500 (GlobalExceptionHandler 미등록)
fix 후: EntityNotFoundException → 404 NOT_FOUND (GlobalExceptionHandler @ExceptionHandler 추가)
```

## 6. T6 재실측 상세 (POST spec 201 → DELETE 204 → deleted_by psql 실증)

```
MANAGER userId: a0000000-0000-0000-0000-000000000003 (dev_manager)

POST: POST http://localhost:8080/api/v1/products/AR05TXEAAWKNEU-01/specs
  Body: {"specKey":"QA-verify-key","specValue":"1","unit":null,"displayOrder":99}
  HTTP Status: 201
  Response: {"id":"6bdf7f47-1060-4134-a0da-68e61c885a4b","specKey":"QA-verify-key",
             "specValue":"1","unit":null,"displayOrder":99}

DELETE: DELETE http://localhost:8080/api/v1/products/AR05TXEAAWKNEU-01/specs/6bdf7f47-1060-4134-a0da-68e61c885a4b
  HTTP Status: 204 (빈 바디)

psql 실증 — product_db.product_spec 테이블:
  id                                   | spec_key      | is_deleted | deleted_by                           | deleted_at
  6bdf7f47-1060-4134-a0da-68e61c885a4b | QA-verify-key | t          | a0000000-0000-0000-0000-000000000003 | 2026-06-07 09:02:12.35595

deleted_by = 'a0000000-0000-0000-0000-000000000003' = dev_manager UUID
→ X-User-Id → deleted_by 전파 정상 확인 (fix 전 "system" 하드코딩 → 실 호출자 UUID)
QA row: soft-delete 상태 유지 (is_deleted=true) — 물리 삭제 없음
```

## 7. T2 / T7b 재실측 상세 (D-PCR-02 우회 — psql 임시 revoke)

```
권한 행 위치: auth_db.account_page_permissions
  id: d6866f01-9079-49c9-a9de-80417e5ec533
  account_id: a0000000-0000-0000-0000-000000000004 (dev_sales)
  page_code: products.list
  변경 전 can_view: true

DynamicPermissionClient 캐시: TTL/재기동 불필요 — DB 직접 revoke 즉시 반영 확인됨

임시 revoke: UPDATE account_page_permissions SET can_view=false WHERE id='d6866f01...'

T2 실측:
  GET http://localhost:8080/api/v1/products?size=1 (dev_sales 토큰)
  HTTP Status: 403
  Response: {"success":false,"code":"FORBIDDEN",
             "message":"[SP-PO-1] 동적 권한 deny — page=products.list action=VIEW
              role=UNKNOWN reason=account permission missing"}

T7b 실측:
  GET http://localhost:8080/api/products/categories (dev_sales 토큰)
  HTTP Status: 403
  Response: {"success":false,"code":"FORBIDDEN",
             "message":"[SP-PO-1] 동적 권한 deny — page=products.list action=VIEW
              role=UNKNOWN reason=account permission missing"}
```

## 8. 원복 확인 (필수)

```
즉시 원복: UPDATE account_page_permissions SET can_view=true
  WHERE id='d6866f01-9079-49c9-a9de-80417e5ec533'
  → 1 row affected, can_view=true 확인

원복 후 200 재확인:
  GET http://localhost:8080/api/v1/products?size=1 (dev_sales 토큰)
  → HTTP 200, totalElements=100

DB 상태: 원복 완료. 모든 임시 변경 정상 복원.

T3 PATCH 원복: usageScope=BOTH 확인 (HTTP 200)
T6 QA spec row: product_spec.is_deleted=true (soft-delete 유지 — 물리 제거 없음)
auth_db 권한 행: can_view=true 원복 완료
```

## 9. 발견 결함 — 최종 상태

### D-PCR-01 [P1] — 해소 완료 (커밋 559a4831)

- 수정 내용: `ProductRepository.findByCatalogExposedModelCodeAndIsDeletedFalse` — model_code 정확 매칭 실패 시 model_name fallback, `GlobalExceptionHandler` EntityNotFoundException → 404
- 실증: T3 200 (fix 전 500), T3b 404 (fix 전 500), T5a 200 (fix 전 500), T6 201→204 완주

### D-PCR-02 [P2] — 우회 실증 완료

- 현상: seed에 기사/사원/배차담당자 dev 계정 없어 products.list VIEW=false 계정 실 HTTP 불가
- 우회: psql 임시 revoke (account_page_permissions can_view=false) → T2/T7b 403 실증
- 잔여 처리: V5 seed에 dev_driver(기사) 계정 추가 — 별도 슬라이스 백로그

## 10. 스크린샷 증빙 현황

| 파일 | 내용 | 실캡처 여부 |
|---|---|---|
| screenshots/T3-200-fix-evidence.png | T3 200/원복/T3b 404/T5a 200 실측 터미널 창 | 실 캡처 (터미널 창 캡처) |
| screenshots/T3-T3b-fix-evidence.txt | T3/T3b/T5a 상세 텍스트 | 실 증빙 |
| screenshots/T6-T2-T7b-evidence.txt | T6 psql/T2 403/T7b 403 상세 텍스트 | 실 증빙 |
| screenshots/T2-403-deny-evidence.png | T2 403 캡처 시도 | **캡처 불가** — Netflix Whale 브라우저 풀스크린이 화면 전체를 덮어 실 터미널 캡처 실패. 스크린샷은 검은 화면. 텍스트 증빙(T6-T2-T7b-evidence.txt)으로 대체. |
| screenshots/T1-routing-evidence.txt | T1 라우팅 200 상세 | 1차 실 증빙 |
| screenshots/T4-permission-403-evidence.txt | T4 창고원 403 상세 | 1차 실 증빙 |

**PNG 유효 파일**: T3-200-fix-evidence.png (260KB, 실 터미널 캡처 확인), T1-T8-qa-matrix.png (1차)

## 11. 라우팅 설정 실증 요약

| 라우트 ID | Path 패턴 | StripPrefix | JwtAuthentication | 실측 |
|---|---|---|---|---|
| product-catalog-v1 | /api/v1/products (exact) | 없음 | 있음 | T1 200 확인 |
| product-usage-v1 | /api/v1/products/*/usage | 없음 | 있음 | T3 200 + T4 403 확인 |
| product-specs-v1 | /api/v1/products/*/specs, /api/v1/spec-key-templates | 없음 | 있음 | T5a 200 + T5b 200 + T6 201/204 확인 |
| product-lookups-v1 | /api/v1/material-prices 등 | 없음 | 있음 | T8b 200 확인 |
| product-service-v1 | /api/v1/products/** (fallthrough) | StripPrefix=2 | 있음 | T8a 200 확인 |
