# PR #1133 R9 SOL 적대검증 재수렴 — 첫 과제 중단 보고

## 환경 확인 — 검증 시작 시점

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1095`
- 브랜치: `feat/1095-sheet-product-status`
- HEAD: `e3c8c4ba20649b4d46bbcd83c7dc041f541466c9`
- 데스크톱: `127.0.0.1:5295`
- 실 API 라우팅 프록시: `127.0.0.1:5296`
  - `/api/products/**`, `/api/v1/products/**` → HEAD product-service `127.0.0.1:28084`
  - 나머지 `/api/**`, `/auth/**`, `/slips/**` → 실 gateway `127.0.0.1:8080`
- HEAD product-service: 컨테이너 `t1095-product-r9-e3c8`, label `samhan.qa.source-sha=e3c8c4ba20649b4d46bbcd83c7dc041f541466c9`, bind JAR SHA-256 `C848BBC6DEB02F0F921514AA1777FD6FA1C5CC933DC1D317873199B5EDD4D2C6`, health HTTP 200
- 실제 호출 API:
  - `POST :8080/auth/login`
  - `GET :28084/products/by-model/{modelCode}`
  - `PUT :28084/products/{id}/tags`
  - `POST :28084/products/{id}/reactivate`
  - `POST :28084/api/v1/products/admin/sync`
  - `GET :28084/products?status=...`
  - GUI `POST :5296/slips/estimates`, `GET :5296/slips/estimates/{id}`

검증 시작 직후 상태 분포 SQL 원문:

```sql
SELECT status, COUNT(*)
FROM products
WHERE is_deleted=false
GROUP BY status
ORDER BY status;
```

```text
    status    | count
--------------+-------
 ACTIVE       |  2984
 DISCONTINUED |    84
 NOT_FOR_SALE |    14
 OUT_OF_STOCK |     2
(4 rows)
```

R7 기준 `ACTIVE 2,984 / DISCONTINUED 83 / NOT_FOR_SALE 14 / OUT_OF_STOCK 3`과의 차이는 지시된 R8 미복구 잔류분 그대로였다.

## 판정

**실 사용자 경로로 재현 가능한 결함이 있다.** 다만 사용자가 제시한 두 가능성인 “저장된 품절 라인이 잠긴다/잠기지 않는다”보다 앞에서 발생하는 셋째 가능성이다.

R8의 `reactivate()` 수정으로 관리자 ACTIVE 복구는 HTTP 204가 됐지만, 현재 `OUT_OF_STOCK` 후보 3건은 전부 `BUNDLE + EXPAND`다. 데스크톱 견적에서 이 중 하나를 선택해 저장하면 부모 품목은 견적 라인으로 저장되지 않고 ACTIVE 구성품 3개로 전개된다. 이후 관리자 sync로 부모를 `OUT_OF_STOCK`으로 되돌려도 재열기 hydrate는 저장된 구성품 `productId`만 조회하므로 수량 `7`이 계속 편집 가능하다. 따라서 요구한 `stored_out_of_stock_estimate_lines` 표본은 여전히 0건이며, 6단계는 4단계에서 중단됐다.

## 첫 과제 실행 원문

표본:

- R9 표본 태그: `R9-1095-SAVED-REOPEN`
- 선택 모델: `AR60F07D11WS`
- 생성 견적: `2026/08/10-1`
- 자격증명·Bearer·UUID는 산출물에서 `<redacted>` 또는 `<redacted-id>`로 치환했다.

### 1) 실 관리자 API로 ACTIVE

```text
POST /products/{id}/reactivate
HTTP 204
body=""

GET /products/by-model/AR60F07D11WS
HTTP 200
status=ACTIVE
```

캡처: [`01-active-api-and-gui.png`](../qa/2026-08-09-1095-r9/01-active-api-and-gui.png)

### 2) 데스크톱 견적 수량 7 저장

```text
POST /slips/estimates
HTTP 201
estimateNo=2026/08/10-1
requestedModel=AR60F07D11WS
requestedQuantity=7
```

캡처: [`02-estimate-saved.png`](../qa/2026-08-09-1095-r9/02-estimate-saved.png)

실 저장 라인 SQL 원문:

```sql
SELECT e.estimate_no, el.line_no, el.model_name, el.quantity,
       el.parent_set_model, el.set_head
FROM estimates e
JOIN estimate_lines el ON el.estimate_id=e.id
WHERE e.estimate_no='2026/08/10-1'
ORDER BY el.line_no;
```

```text
 estimate_no  | line_no |   model_name   | quantity | parent_set_model | set_head
--------------+---------+----------------+----------+------------------+----------
 2026/08/10-1 |       1 | AR60F07D11WNKO |        7 | AR60F07D11WS     | t
 2026/08/10-1 |       2 | AR60F07D11WXKO |        7 | AR60F07D11WS     | f
 2026/08/10-1 |       3 | ARR-WK8F       |        7 | AR60F07D11WS     | f
(3 rows)
```

### 3) 실 관리자 sync로 OUT_OF_STOCK

```text
POST /api/v1/products/admin/sync
HTTP 200
elapsedMs=101829
totalUpdatedRows=123
failedTabs=0

GET /products/by-model/AR60F07D11WS
HTTP 200
status=OUT_OF_STOCK
```

캡처: [`03-admin-api-out-of-stock.png`](../qa/2026-08-09-1095-r9/03-admin-api-out-of-stock.png)

### 4) 저장 견적 재열기 — 결함 재현, 여기서 중단

Playwright 실패 원문:

```text
Error: 저장본 재열기 후 품절 수량 input 미도달

Locator: getByLabel('라인 1 수량 품절')
Expected: visible
Timeout: 30000ms
Error: element(s) not found
```

실패 DOM과 재캡처 원문:

```text
라인 1 모델명=AR60F07D11WNKO
라인 1 수량=7
editable=true
```

캡처: [`04-failure-expanded-active-line-editable.png`](../qa/2026-08-09-1095-r9/04-failure-expanded-active-line-editable.png)

전체 API 원문: [`r9-first-task-observations.json`](../qa/2026-08-09-1095-r9/r9-first-task-observations.json)  
실패 화면 원문: [`r9-first-task-failure-screen.json`](../qa/2026-08-09-1095-r9/r9-first-task-failure-screen.json)

### 5) ACTIVE 복구 후 잠금 해제

4단계 실패 즉시 중단 지시에 따라 실행하지 않았다.

### 6) 상태 분포 원복

기능 검증으로는 진행하지 않았고, `finally`의 실 관리자 sync로 데이터만 원복했다.

```text
POST /api/v1/products/admin/sync
HTTP 200
elapsedMs=93106
totalUpdatedRows=121
failedTabs=0

PUT /products/{id}/tags
HTTP 200
tags={}
```

최종 분포 SQL 원문:

```sql
SELECT status, COUNT(*)
FROM products
WHERE is_deleted=false
GROUP BY status
ORDER BY status;
```

```text
    status    | count
--------------+-------
 ACTIVE       |  2984
 DISCONTINUED |    83
 NOT_FOR_SALE |    14
 OUT_OF_STOCK |     3
(4 rows)
```

R7 기준 분포로 복구됐고, 대상 `AR60F07D11WS`는 `OUT_OF_STOCK`, tags `{}`다. 이 sync는 R8이 복구하지 못했던 분포 잔류분도 시트 정본으로 복구했다. DB 직접 INSERT/UPDATE는 실행하지 않았다.

## 결함 근거와 실 데이터 영향

현재 품절 후보 원문:

```text
  model_code  |    status    | product_type | product_category | bundle_mode
--------------+--------------+--------------+------------------+------------
 AR60F07D11WS | OUT_OF_STOCK | BUNDLE       | SINGLE_SET       | EXPAND
 AR60F09C13WS | OUT_OF_STOCK | BUNDLE       | SINGLE_SET       | EXPAND
 AR60F16C14WS | OUT_OF_STOCK | BUNDLE       | SINGLE_SET       | EXPAND
(3 rows)
```

전개된 R9 구성품 3건은 모두 ACTIVE였다. 현재 품절 productId 3건을 slip DB의 저장 견적 라인과 대조한 원문:

```text
 stored_out_of_stock_estimate_lines
------------------------------------
                                  0
(1 row)
```

- 실 데이터 영향: 현재 `OUT_OF_STOCK` 후보 **3/3건**이 일반 견적 저장 시 부모 자신이 아니라 ACTIVE 구성품으로 전개된다.
- R9 실 재현 영향: 견적 **1건**, 저장 구성품 **3행**, 관측 수량 입력 **1개**가 편집 가능했다.
- 저장 품절 표본: 실행 전 **0건**, 실행 후 **0건**.
- 관리자 sync 영향 원문: 상태 전환 sync `totalUpdatedRows=123`, 긴급 원복 sync `totalUpdatedRows=121`. 둘 다 실 관리자 API만 사용했다.

코드 전달점:

- 세트 저장 시 부모가 아닌 전개 구성품 `productId`로 `EstimateLine` 생성: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:138-164`
- 재열기 상태 조회가 저장 라인의 `productId`만 lookup: `clients/desktop/src/renderer/utils/estimateLineStatus.ts:12-23`
- 늦게 온 상태도 현재 라인의 동일 `productId`에만 병합: `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:907-925`
- 수량 잠금 조건은 라인 자체 `status === 'OUT_OF_STOCK'`: 같은 파일 `:2300-2314`
- R8 `reactivate()` 204 경로: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:685-688`

## 증거 무결성

- 실 Playwright, 실 gateway, HEAD product-service, 공유 실 DB를 사용했다. 응답 route fulfillment/mock은 사용하지 않았다.
- 스펙의 모든 캡처·JSON write는 `resolveQaShotsDir()`가 반환한 `shotsDir`만 사용한다. `docs/qa` 직접 write 상수와 `_local` 산출물은 없다.
- `resolveQaCredential()`은 두 테스트 모두 테스트 본문 `try/catch` 안에서만 호출한다.
- 보고서·JSON·캡처에 로그인 자격, Bearer, UUID를 노출하지 않았다.
- `tools/legacy-gas/**`는 변경하지 않았다.

## 신규 파일

- `clients/desktop/playwright/1095-r9-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1095-r9-real-qa/1095-r9-first-task-real-qa.spec.ts`
- `docs/dev-reports/2026-08-09-1095-r9-sol-reconvergence.md`
- `docs/qa/2026-08-09-1095-r9/01-active-api-and-gui.png`
- `docs/qa/2026-08-09-1095-r9/02-estimate-saved.png`
- `docs/qa/2026-08-09-1095-r9/03-admin-api-out-of-stock.png`
- `docs/qa/2026-08-09-1095-r9/04-failure-expanded-active-line-editable.png`
- `docs/qa/2026-08-09-1095-r9/r9-first-task-observations.json`
- `docs/qa/2026-08-09-1095-r9/r9-first-task-failure-screen.json`

## 만든 R9 표본과 못 한 것

- 만든 표본: 견적 `2026/08/10-1`, 태그 `R9-1095-SAVED-REOPEN`(검증 종료 시 태그 원복), 선택 부모 `AR60F07D11WS`, 저장 구성품 3행.
- 못 한 것: 첫 과제 5단계 기능 확인. 첫 과제 미완주 지시에 따라 ① 늦은 hydrate/협업/조회 실패, ③ 안전재고 전량 미조회, ② 이름 규칙 경로 비교, ④ R5~R7 회귀, PR CI 확인을 전부 실행하지 않았다.
- git commit, push, main 병합은 하지 않았다.
