# PR #438 풀스택 Docker 실QA — 세트(BUNDLE) → 전표 구성품 전개

- **브랜치**: `feat/bundle-set-expansion-pr3-integration`
- **일시**: 2026-06-09
- **목표**: 견적에 세트(BUNDLE EXPAND) 라인을 넣으면 product-service expand 로 **구성품 N라인으로 전개**되어 견적/전표에 올라가는지 **2서비스 실 연동**으로 실증
- **결과**: ✅ **PASS** — 견적 생성·견적→전표 변환 양쪽 모두 세트가 구성품 4라인으로 전개, 합계 정합 + cross-service expand HTTP 실증

---

## 1. 기동 구성 (clean bootJar → standalone)

신규 Flyway(slip V34) 때문에 `clean :bootJar` 후 standalone 부팅 ([[standalone-boot-real-qa]]).

| 서비스 | 포트 | DB | Flyway 확인 | 부팅 |
|---|---|---|---|---|
| product-service (PR jar) | 8084 | product_db (PG 16.14) | V12 (현행, 343 BUNDLE + 1584 bundle_component 기적재) | `Started in 12.997s`, Eureka 등록 UP |
| slip-service (PR jar) | 8086 | slip_db | **V34 신규 적용** `Successfully applied 1 migration ... now at version v34` (add bundle component columns) | `Started in 15.552s` |

- 기존 Docker `samhan-product-service`/`samhan-slip-service`(구 브랜치)는 stop, 동일 인프라(`samhan-postgres`/`samhan-eureka`/minio) 재사용.
- slip-service 의 `ProductClient` 는 `@LoadBalanced` `http://product-service` → 기동 중 Eureka 가 PR-branch product-service(8084) 로 해소. 별도 host override 불필요.
- 내부 인증: 양 서비스 동일 `SAMHAN_INTERNAL_TOKEN`(`X-Internal-Token`).
- 권한 가드(`@RequirePermission` + `EstimatePermissionGuard`)는 `X-Is-System-Master: true` 헤더로 MASTER bypass.
- SA key 는 repo 밖 `C:\dev\` 하위 사용(내용 미기록). product_db 가 이미 시트 sync 완료 상태라 expand 가 읽는 bundle_component/products 전부 적재됨.

### V34 마이그레이션 후 컬럼 (slip_db)
```
estimate_lines | set_head        (BOOLEAN NOT NULL DEFAULT FALSE)
estimate_lines | parent_set_model (VARCHAR(64))
slip_lines     | set_head
slip_lines     | parent_set_model
```

---

## 2. 선정 세트

```
SELECT model_code, product_category, bundle_mode, delivery_price, name
  FROM products WHERE model_code='AC052CS1PBH1SY';
 AC052CS1PBH1SY | SINGLE_SET | EXPAND | 1330000.00 | 무풍 1way 냉난방
```
- productId: `5410e5eb-9925-479c-a3f5-8807f6e5ae55`
- product_type=BUNDLE, bundle_mode=EXPAND, category=SINGLE_SET (싱글세트 → 6:4 재배분 대상)

### product-service `/products/internal/expand` 직접 호출 (cross-service 계약 실증)
`POST /products/internal/expand`  body `{"parentModelCode":"AC052CS1PBH1SY","setQty":1}` → 200, 4 라인:

| modelCode | kind | qty | unitPrice | setHead |
|---|---|---|---|---|
| AC052CN1PBH1 | INDOOR | 1 | 478,495 | **true** |
| AC052CX1PBH1 | OUTDOOR | 1 | 719,010 | false |
| PC1BWSK3NW | PANEL | 1 | 118,580 | false |
| AR-EH05 | REMOTE | 1 | 13,915 | false |

합계 478,495 + 719,010 + 118,580 + 13,915 = **1,330,000 = 세트 단가** (6:4 재배분이 세트 총액 보존).
`setQty=2` 호출 시 구성품 qty=2.0 으로 FOLLOW_SET 스케일, 단가 per-unit 유지(합계 동일).

---

## 3. 실 HTTP QA — 견적 생성 (세트 라인 1건)

`POST /slips/estimates` (`X-User-Id`, `X-Is-System-Master: true`), 라인 1건: 세트 productId, qty=1, unitPrice=1,330,000 → **HTTP 201**.

응답 estimateNo `2026/06/09-1`, status `QUOTE_DRAFT`, totalSupply **1,330,000** / totalVat 133,000 / totalAmount 1,463,000.
**라인 1건 → 4 구성품 라인으로 전개됨.**

### estimate_lines (slip_db, estimate_id=6d5e63d3-...)
```
 line_no |  model_name  | qty | unit_price | set_head | parent_set_model
       1 | AC052CN1PBH1 |  1  |  478495.00 |   t      | AC052CS1PBH1SY
       2 | AC052CX1PBH1 |  1  |  719010.00 |   f      | AC052CS1PBH1SY
       3 | PC1BWSK3NW   |  1  |  118580.00 |   f      | AC052CS1PBH1SY
       4 | AR-EH05      |  1  |   13915.00 |   f      | AC052CS1PBH1SY
SUM(unit_price*qty) = 1330000.00
```
- 첫 라인(실내기) `set_head=true`, 나머지 false ✅
- 전 라인 `parent_set_model = AC052CS1PBH1SY` (세트 modelCode) ✅
- 구성품 단가 합 = 세트 단가 ✅

> **cross-service 실증**: slip_db 에는 bundle_component 가 없다. estimate_lines 에 들어간 구성품 modelCode/6:4-재배분 단가는 **오직 product-service expand HTTP 응답에서만** 올 수 있는 값 → slip→product 실 HTTP expand 호출이 실제로 일어났음을 데이터로 증명.

---

## 4. 견적 → 전표 변환 (구성품 전파)

상태전이 `send`(200) → `accept`(200) → `convert`(200).
- 견적 status → `QUOTE_CONVERTED`, convertedSlipId `44a5e186-e9dc-4006-b46c-99e65d66dda3`
- 전표 헤더: slip_no `2026/06/09-1`, slip_type `OUTBOUND`, status `DRAFT`

### slip_lines (slip_db, slip_id=44a5e186-...)
```
  model_name  | qty | unit_price | set_head | parent_set_model
 AC052CN1PBH1 |  1  |  478495.00 |   t      | AC052CS1PBH1SY
 AC052CX1PBH1 |  1  |  719010.00 |   f      | AC052CS1PBH1SY
 AR-EH05      |  1  |   13915.00 |   f      | AC052CS1PBH1SY
 PC1BWSK3NW   |  1  |  118580.00 |   f      | AC052CS1PBH1SY
SUM(unit_price*qty) = 1330000.00
```
전표 라인도 동일 4 구성품, set_head/parent_set_model 보존, 합계 1,330,000 ✅
→ **세트 전개가 견적→전표 변환 전 구간에서 구성품으로 일관 전파**.

---

## 5. 최종 판정

| 검증 항목 | 결과 |
|---|---|
| 2서비스 clean bootJar standalone 기동 (V34 적용) | ✅ PASS |
| product-service `/expand` 세트→구성품 4라인 + setHead + kind | ✅ PASS |
| cross-service expand HTTP 실 호출 (데이터로 실증) | ✅ PASS |
| 견적 생성: 세트 1라인 → 구성품 4라인 전개 | ✅ PASS |
| set_head 첫라인 true / parent_set_model=세트modelCode | ✅ PASS |
| 구성품 단가 합 = 세트 단가 (6:4 재배분 총액 보존) | ✅ PASS |
| 견적→전표 변환 후 slip_lines 도 구성품 전개 | ✅ PASS |

**종합: PASS.** 세트(BUNDLE EXPAND) → 구성품 전개가 product-service + slip-service 2서비스 실 연동으로, 견적 생성과 전표 변환 양쪽에서 정상 동작 확인. code-read 아님 — 실 HTTP 201/200 + 실 DB row + 합계 정합.

---

## 부록 — 기동 로그 발췌 (시크릿 미포함)
```
[product] Database: jdbc:postgresql://localhost:5432/product_db (PostgreSQL 16.14)
[product] Registering application PRODUCT-SERVICE with eureka with status UP
[product] Tomcat started on port 8084
[product] Started ProductServiceApplication in 12.997 seconds
[slip]    Migrating schema "public" to version "34 - add bundle component columns"
[slip]    Successfully applied 1 migration to schema "public", now at version v34 (00:00.038s)
[slip]    Tomcat started on port 8086
[slip]    Started SlipServiceApplication in 15.552 seconds
```
- 첨부: `product-boot.log`, `slip-boot.log`, `estimate-create-request.json`, `estimate-create-response.json`, `convert-response.json`
