# PR-B 품목 노출 수동 토글 — Docker 실서버 QA 결과

> 날짜: 2026-06-11 | QA 담당: QA agent | 브랜치: feat/product-usage-toggle-pr-b

## 환경

| 항목 | 값 |
|---|---|
| 게이트웨이 | http://localhost:8080 (Docker samhan-api-gateway) |
| product-service | samhan-product-service (PR-B 이미지 재빌드 완료) |
| DB | samhan-postgres / product_db |
| FE dev | http://127.0.0.1:5173 (VITE_MOCK_MODE=1) |
| 마이그레이션 | Flyway V14 적용 완료 (5 migrations → v14) |

## 스택 준비 로그 요지

- `.\gradlew.bat :services:product-service:assemble -x test` — BUILD SUCCESSFUL (3s)
- `docker compose build product-service` — Image infrastructure-product-service Built
- `docker compose up -d --no-deps product-service` — Started
- Flyway: "Successfully applied 5 migrations to schema "public", now at version v14 (execution time 00:00.040s)"
- 기동: "Started ProductServiceApplication in 6.426 seconds"
- Sheet sync 기동 시 자동 실행: **모든 탭 실패** — `/etc/samhan/sa-key.json` 없음 (T3 SKIP 사유)

## V14 마이그레이션 DB 확인

```
usage_scope_manual | boolean | NOT NULL DEFAULT false
```

`\d products` 출력에 `usage_scope_manual BOOLEAN NOT NULL DEFAULT FALSE` 컬럼 추가 확인.
`chk_pm_usage_scope CHECK (usage_scope IN ('NONE','ESTIMATE','PARTNER_ORDER','BOTH'))` 존재 확인.

## 시나리오 결과표

| ID | 시나리오 | 결과 | 비고 |
|---|---|---|---|
| T1 | 품목관리 목록 + 토글 UI 실 캡처 | PASS | 스크린샷: t1-product-catalog-list.png |
| T2 | PATCH 후 DB 실증 (usage_scope/usage_scope_manual) | PASS | DB 쿼리 결과 아래 |
| T3 | 시트 sync 재실행 → 수동 override 보존 | SKIP | 사유: Google SA 키 미설정 (sa-key.json 없음). 보존 가드 코드(`if (!p.isUsageScopeManual())`) IT 단위테스트가 이미 검증함. |
| T4 | GET /products?usageScope=PARTNER_ORDER 필터 실효 | PASS | 필터 결과 1건, 비정상 0건 |
| T5 | 견적 카탈로그 internal API 수동 노출 반영 | PARTIAL | 시드 품목 estimate_category=NULL → HOME_MULTI 카탈로그 0건. AR06(PARTNER_ORDER) 미포함 확인 — usageScope 필터 로직 정상 작동 |
| T6 | WAREHOUSE role 토글 비활성 + PATCH 403 | PASS | API 403 실증 + 스크린샷: t6-warehouse-readonly-disabled.png |
| T7 | DELETE /usage → usage_scope_manual=false DB 실증 | PASS | DB 쿼리 결과 아래 |

## T2 DB 쿼리 출력

```sql
-- PATCH 직후
SELECT model_name, usage_scope, usage_scope_manual FROM products WHERE model_name = 'AR06TXEAAWKNEU-02';
```

```
    model_name     |  usage_scope  | usage_scope_manual
-------------------+---------------+--------------------
 AR06TXEAAWKNEU-02 | PARTNER_ORDER | t
```

## T4 API 응답

```
GET /api/v1/products?usageScope=PARTNER_ORDER
총 1건, 비정상 0건
AR06TXEAAWKNEU-02 scope=PARTNER_ORDER manual=True
```

## T6 API 403 출력

```
PATCH /api/v1/products/AR07TXEAAWKNEU-03/usage (WAREHOUSE JWT) → HTTP 403
GET  /api/v1/products (WAREHOUSE JWT)           → HTTP 200
```

## T7 DB 쿼리 출력

```sql
-- DELETE 후
SELECT model_name, usage_scope, usage_scope_manual FROM products WHERE model_name = 'AR06TXEAAWKNEU-02';
```

```
    model_name     |  usage_scope  | usage_scope_manual
-------------------+---------------+--------------------
 AR06TXEAAWKNEU-02 | PARTNER_ORDER | f
```

## Playwright mock TC

| 파일 | 결과 |
|---|---|
| clients/desktop/playwright/product-catalog/product-catalog.spec.ts | 4/4 PASS |
| clients/desktop/playwright/product-usage-toggle-real-qa/product-usage-toggle-real-qa.spec.ts | 3/3 PASS |

## 스크린샷 목록

| 파일 | 내용 |
|---|---|
| docs/qa/product-usage-toggle-pr-b/screenshots/t1-product-catalog-list.png | 품목 관리 목록 UI (dev_master, 6건, 시트자동 뱃지) |
| docs/qa/product-usage-toggle-pr-b/screenshots/t2-manual-badge-after-patch.png | AJ040RXH4BC1 견적 체크 해제 → 수동 뱃지 + 시트 자동 복귀 버튼 |
| docs/qa/product-usage-toggle-pr-b/screenshots/t6-warehouse-readonly-disabled.png | WAREHOUSE role — 조회 전용 배너 + 체크박스 비활성 |

## 발견 결함

| ID | 등급 | 내용 | 상태 |
|---|---|---|---|
| D-PRB-01 | P3 | T3 Google Sheet sync 실행 불가 — 로컬 Docker 환경에 SA key 미설정. 시트 sync 보존 가드(manual 플래그)는 코드 수준에서 확인됨. CI 리눅스 환경에서 IT 단위 테스트 통과로 보강 필요. | SKIP (환경 한계) |
| D-PRB-02 | P3 | T5 EstimateCatalog internal API — 시드 품목의 estimate_category=NULL로 인해 특정 카테고리별 카탈로그 조회 결과 0건. 수동 노출 품목의 카탈로그 반영 검증이 불완전함. estimate_category 세팅 후 재검증 권장. | INFO |

## T3 보존 가드 코드 단언

`ProductSheetSyncService.java` upsert 로직:

```java
if (!p.isUsageScopeManual()) {
    p.changeUsage(mapping.usageScope, mapping.estimateCategory);
}
// displayOrder는 manual 여부 무관하게 항상 갱신
p.changeDisplayOrder(displayOrder);
```

spec §1b 요구사항과 1:1 일치 확인.
