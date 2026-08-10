# PR #1133 R5 SOL 적대검증 재수렴 — 실 사용자 경로 도달성

## 0. 환경 확인 및 상태별 실데이터 건수

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1095`
- 브랜치: `feat/1095-sheet-product-status` (요청 라벨과 일치)
- 검증 HEAD: `2dfc55e535f30cdefb9e59cbe24d4894909fe117`
- 포트:
  - `5195`: 해당 HEAD의 `clients/web/estimate-app`
  - `5295`: 해당 HEAD의 `clients/desktop` Vite 앱
  - `5296`: R5 실서비스 라우팅 프록시
  - `28084`: 해당 HEAD로 직접 빌드한 product-service
- 배포본 증거:
  - `:services:product-service:clean :services:product-service:bootJar` 성공 후 생성한 이미지 `t1095-product-r5:2dfc55e53`
  - 컨테이너 `t1095-product-r5-2dfc` label: `samhan.qa.source-sha=2dfc55e535f30cdefb9e59cbe24d4894909fe117`
  - 로컬 JAR/컨테이너 JAR SHA-256 모두 `10d5e2781afe774948a66a033637b2a040a4d73cf40419d769cde8515ee637c6`

요청된 SQL 원문과 종료 직전 재측정 원문:

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

추가 과차단 계수:

```sql
SELECT
  COUNT(*) FILTER (WHERE status NOT IN ('DISCONTINUED','NOT_FOR_SALE')) AS denylist_survivors,
  COUNT(*) FILTER (WHERE status IN ('DISCONTINUED','NOT_FOR_SALE')) AS hidden,
  COUNT(*) FILTER (WHERE status IS NULL) AS null_status
FROM products
WHERE is_deleted=false;
```

```text
 denylist_survivors | hidden | null_status
--------------------+--------+-------------
               2987 |     97 |           0
```

실 GUI가 호출한 API는 mock이 아니다. 브라우저 네트워크 원문에는 `GET http://127.0.0.1:5296/api/products?...` 200, `GET .../api/v1/products?...` 200, `POST .../slips/expand-line` 200, `GET .../inventory/alerts/safety-stock` 200이 남았다. 프록시는 응답을 만들지 않고 product 경로를 `28084`, 그 밖의 경로를 실제 gateway `8080`으로 전달한다(`clients/desktop/playwright/1095-r5-real-qa/product-service-proxy.cjs:15-24,39-57`). 원문은 `docs/qa/2026-08-09-1095-r5/*-browser-network.json`에 저장했다.

## 1. 판정

**실 사용자 경로로 재현 가능한 결함이 있다.**

1. **PR 상태 정책 직접 결함:** 데스크톱 견적서에서 `OUT_OF_STOCK` 품목이 표시되지만 수량 입력이 잠기지 않는다.
2. **셋째 가능성(독립 선재 결함):** 안전재고 경보의 상태 필터가 경보를 감추는 것은 아니었다. 대신 하나의 삭제·불명 품목 때문에 같은 batch의 정상 품목명까지 전부 소실된다. R4 상태 필터가 만든 결함은 아니지만 실 사용자 경로에서 현재 도달한다.

`ACTIVE` 과차단, `OUT_OF_STOCK` 후보 누락, 정상 BUNDLE 전개 중단, 비상품 자동수량 회귀는 관측되지 않았다.

## 2. 결함 1 — 데스크톱 견적의 품절 수량이 편집된다

### 재현 절차

1. 실 관리자 API에서 `AR60F09C13WS`가 `status=OUT_OF_STOCK`임을 확인한다.
2. 데스크톱 실 앱의 견적서 작성 화면에서 해당 모델을 검색·선택한다.
3. 행에 `품절` 텍스트가 노출되는 것을 확인한다.
4. 수량 입력값 `1`을 `7`로 바꾼다.

### 응답·관측 원문

```json
{
  "estimateOutOfStockEditable": true,
  "estimateOutOfStockValueBefore": "1",
  "estimateOutOfStockValueAfter": "7"
}
```

- 실 API 원문: `status="OUT_OF_STOCK"`, `modelCode="AR60F09C13WS"`
- 화면 캡처: `docs/qa/2026-08-09-1095-r5/04-desktop-estimate-out-of-stock.png`
- 같은 품목을 실 관리자 API로 `goodsType=NON_GOODS`, `status=OUT_OF_STOCK` 조합으로 만든 뒤에도 수량 입력은 편집 가능했다: `docs/qa/2026-08-09-1095-r5/11-non-goods-out-of-stock.png`
- 원문 묶음: `desktop-observations.json`, `admin-api-observations.json`

### 코드 도달점

- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1250-1254`: `updateQuantity`에 품절 guard가 없다.
- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:2281-2285`: 수량 입력의 `readOnly`가 문서 읽기 전용 여부만 본다.
- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:2288-2291`: `OUT_OF_STOCK`은 aria-label과 `품절` 텍스트에만 반영된다.

### 실데이터 영향 건수

- 현재 삭제되지 않은 `OUT_OF_STOCK`: **3건**.
- 세 품목 모두 같은 견적서 행 코드 경로를 사용하므로 현재 후보 3건이 영향 대상이다.
- 저장된 기존 견적/전표 행 중 `OUT_OF_STOCK` 품목을 참조하는 표본은 각각 0건이었다. 따라서 **이미 수량이 저장된 기존 행**의 동작은 판정 불가다.

## 3. 결함 2 — 안전재고 batch의 한 stale 품목이 정상 품목 식별자까지 지운다

이 결함은 R4의 `ProductStatus` 필터 때문에 생긴 것이 아니다. 안전재고 화면의 “단종 품목이 감춰지는가”를 실 상태 전환으로 밟다가 확인한 독립 선재 결함이다.

### 재현 절차

1. 실제 `ACTIVE` 품목 `ACL-KORGHP07`에 실 관리자 API로 threshold 1, note `R5-1095-SAFETY-TRANSITION` 안전재고 설정을 만든다.
2. 실제 경보 API와 GUI를 조회한다.
3. 같은 품목을 실 관리자 API로 `DISCONTINUED` 전환한 뒤 다시 조회한다.
4. 품목을 `ACTIVE`로 복구한다.

### 응답·로그 원문

상태 전환 전부터 정상 품목 식별자가 비어 있었다.

```json
{
  "activeTarget": {
    "productCode": null,
    "productName": null,
    "threshold": 1,
    "note": "R5-1095-SAFETY-TRANSITION"
  },
  "target": {
    "productCode": null,
    "productName": null,
    "threshold": 1,
    "currentQty": 0,
    "shortage": 1,
    "warehouseName": "전체",
    "note": "R5-1095-SAFETY-TRANSITION"
  }
}
```

inventory-service 로그 원문:

```text
findAlerts: product-service lookup chunk 실패, productCode/modelName fallback null — chunkSize=5, 일부 제품을 찾을 수 없습니다 (요청 5, 응답 1)
```

- 화면 캡처: `docs/qa/2026-08-09-1095-r5/12-safety-discontinued-blank-identity.png`
- API 원문: `docs/qa/2026-08-09-1095-r5/safety-status-transition-observations.json`

### 코드 도달점

- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/ProductClient.java:127-130`: batch 응답이 요청 수보다 작으면 전체를 예외 처리한다.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SafetyStockService.java:176-187`: 그 예외를 chunk 전체 실패로 삼아 이미 받은 정상 품목 summary도 버린다.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SafetyStockService.java:152-160`: 결과적으로 정상 설정에도 `productCode/productName=null`을 만든다.
- `clients/desktop/src/renderer/routes/SafetyStockAlertsPage.tsx:540-543`: GUI는 null 식별자를 그대로 빈 칸으로 렌더링한다.

### 실데이터 영향 건수

- 검증 시작 시 안전재고 설정 **5건** 모두 현재 product DB에 없는 product ID를 포함한 동일 batch에 들어가 품목 코드·이름이 공란이었다.
- 유효한 R5 표본을 추가했을 때도 batch poison으로 **6/6**이 공란이었다.
- 단종 전 `ACTIVE` 시점부터 동일했으므로 R4 상태 필터가 원인이 아니다. 단종 뒤에도 경보 행 자체는 남았고, 식별자만 공란이었다.

## 4. 첫 각도 — 과차단·품절·공란 보존

### 후보에서 사라지는 실데이터

- 전체 product 기준 숨김 정책 대상: `DISCONTINUED 83 + NOT_FOR_SALE 14 = 97건`.
- 전체 product 기준 표시 대상: `ACTIVE 2984 + OUT_OF_STOCK 3 = 2987건`.
- 견적 노출 row 기준 실제 분포:
  - `ACTIVE`: 751 (`COMMERCIAL_MULTI 382`, `HOME_MULTI 107`, `LEGACY 39`, `SINGLE_SET 223`)
  - `DISCONTINUED`: 89
  - `NOT_FOR_SALE`: 14
  - `OUT_OF_STOCK`: 3
- 해당 HEAD의 실제 견적 내부 API 결과:
  - HOME 107 = ACTIVE 107
  - SINGLE 226 = ACTIVE 223 + OUT_OF_STOCK 3
  - COMMERCIAL 382 = ACTIVE 382
  - LEGACY 39 = ACTIVE 39
- 즉 실 견적 노출 대상 `ACTIVE` **751건 중 누락 0건**, `OUT_OF_STOCK` **3건 중 누락 0건**, 차단 대상 노출 row는 `DISCONTINUED 89 + NOT_FOR_SALE 14 = 103건`이다.

`status IS NULL` 실표본은 0건이다. 또한 column은 `NOT NULL DEFAULT ACTIVE`이고 CHECK 대상도 네 enum으로 제한되어 정상 저장 경로에서 NULL 표본을 만들 수 없다. 따라서 SQL `NOT IN`의 NULL 함정은 현재 실 사용자 경로에서는 도달하지 않지만, **표본 0이므로 NULL 행 동작 자체는 판정 불가**다.

### 품절 표시

- 웹 종합견적: `OUT_OF_STOCK` 행 1개, 수량 input 0개, `품절` 텍스트 확인.
- 데스크톱 SlipForm: 품절 후보 표시, 수량 disabled, `/slips/expand-line` 호출 0회.
- 데스크톱 EstimateForm: 후보와 `품절` 텍스트는 표시됐으나 수량 잠금은 결함 1과 같이 실패.

### 시트 표기 공란 보존

Sheets API 읽기 원문:

```json
{"http":200,"tab":"상업멀티_단가인상","headerRow":3,"statusHeader":" 비고","statusColumn":9,"model":"ACL-KORGHP07","rowNumber":308,"statusRaw":""}
```

실 관리자 API로 해당 품목을 `DISCONTINUED`로 만든 뒤 실제 시트 동기화를 실행했다.

```json
{
  "totalTabs": 11,
  "successfulTabs": 11,
  "failedTabs": 0,
  "totalInsertedRows": 0,
  "totalUpdatedRows": 121,
  "totalSoftDeletedRows": 0,
  "durationMs": 51110,
  "blankStatusBeforeSync": "DISCONTINUED",
  "blankStatusAfterSync": "DISCONTINUED"
}
```

코드도 공란을 `null`로 파싱하고(`ProductSheetSyncService.java:1284-1287`), non-null일 때만 상태를 변경한다(`:1342-1348`). 품목은 종료 전에 `ACTIVE` 및 빈 tags로 복구했다.

## 5. R4 두 축 — goodsType과 ProductStatus

실 분포:

```text
 goods_type |    status    | count
------------+--------------+-------
 GOODS      | ACTIVE       |  2950
 GOODS      | DISCONTINUED |    83
 GOODS      | NOT_FOR_SALE |    14
 GOODS      | OUT_OF_STOCK |     3
 NON_GOODS  | ACTIVE       |    34
```

- 기존 비상품 `운임`을 데스크톱 견적에 넣고 수량을 지운 뒤 납품가 `10000` 입력: 수량이 자동으로 `1`이 됐다.
- 시작 시 비상품이면서 비활성인 실표본은 0건이었다. 실 관리자 API로 R5 식별 표본을 생성해 `NON_GOODS+DISCONTINUED`를 확인했고 후보에서 숨겨졌으며 `goodsType`은 유지됐다.
- 기존 품절 품목을 실 관리자 API로 잠시 `NON_GOODS+OUT_OF_STOCK`으로 전환했을 때 두 값이 모두 유지되고 후보에도 표시됐다. 다만 수량은 결함 1과 같이 편집 가능했다.
- 기존 품절 품목의 goodsType과 tags는 `GOODS`, `{}`로 복구했다. R5 생성 표본은 soft delete했다.

## 6. R4 세 표면 및 정상 BUNDLE

- `SafetyStockAlertsPage`: 단종 품목을 새 설정 후보로 저장할 수 없었다. 기존 경보 행 자체는 단종 뒤에도 남았다. 다만 결함 2 때문에 품목 식별자가 공란이다.
- `EstimateItemsCatalogPage`: 단종 `AJ012MB1PBC2`는 추가 후보가 아니지만, 이미 관리 중인 row는 검색 결과 1건으로 계속 접근 가능했다. 캡처 `09b-estimate-items-discontinued-management.png`.
- `ProductAutocomplete`: 데스크톱 견적에서 단종·미판매 모델명은 후보에 나타나지 않았고, ACTIVE·품절은 나타났다.
- 잠금 범위: ACTIVE 견적 행 수량은 `2`로 정상 편집됐다. SlipForm 품절 수량은 잠겼다. EstimateForm 품절만 결함 1이다.
- 정상 BUNDLE `AC060CS6PBH1SY`: 실 GUI에서 `POST /slips/expand-line` HTTP 200, 전개 결과 8행. 품절 BUNDLE은 전개 호출 0회.

## 7. 증거 무결성 및 잔재

- 최초에는 기존 R3 프록시가 `/api/products`만 R5로 보내고 `/api/v1/products`를 canonical 서비스로 보냈다. 그 관리 화면 관측은 전부 폐기했다. R5 프록시가 두 prefix를 모두 `28084`로 보내도록 한 뒤 관리 화면을 재실행한 값만 이 보고서에 사용했다.
- 최초 시트 동기화는 컨테이너에 SA key mount가 없어 HTTP 502였다. 읽기 전용 key를 mount한 동일 SHA 컨테이너로 재실행해 11/11 성공한 결과만 판정에 사용했다. 실패 원문: `서비스 계정 키 파일을 읽을 수 없습니다`.
- 최초 직접 Sheets 조회는 PowerShell이 한글 탭명을 `????_????`로 변환해 실패했다. 실패 원문: `Unable to parse range: '????_????'!A:AD`. Unicode escape로 같은 읽기 전용 API를 재호출해 위 HTTP 200 원문을 얻었다.
- 자격증명/JWT/비밀번호 원문은 산출물에 저장하지 않았다. API ID는 JSON에서 `<redacted-id>`로 치환했다.
- 안전재고 설정에는 delete API가 없어 R5 표본 2건을 threshold 0, note `R5-1095-RESIDUE-THRESHOLD-0`으로 남겼다.
- soft delete된 `R5-NONGOODS-1786281810952` 1건이 `qaRound=R5-1095-COMBINED` 표식과 함께 남았다.
- 최초 공란 보존 표본으로 이름이 중복된 `AC060CS6PBH1SY`를 골랐다가 reactivate API의 이름 중복 검증에 걸렸다. API로 상태를 복구하기 위해 이름을 `R5-TEMP-RESTORE-AC060CS6PBH1SY`로 잠시 바꿨으며, 원래 이름 복구는 다음 409로 거부됐다: `이미 사용 중인 품목명입니다: 360 CST UV (충돌 품목 모델코드: AC072CS6PBH1SY)`. 공유 DB 직접 write 금지 때문에 이름은 R5 표식 상태로 남겼다. status/goodsType/tags는 `ACTIVE/GOODS/{}`다.

## 8. 신규 파일

- `clients/desktop/playwright/1095-r5-real-qa/1095-r5-reachability-real-qa.spec.ts`
- `clients/desktop/playwright/1095-r5-real-qa/product-service-proxy.cjs`
- `docs/dev-reports/2026-08-09-1095-r5-sol-reconvergence.md`
- `docs/qa/2026-08-09-1095-r5/01-estimate-discontinued.png`
- `docs/qa/2026-08-09-1095-r5/02-estimate-out-of-stock.png`
- `docs/qa/2026-08-09-1095-r5/03-estimate-active.png`
- `docs/qa/2026-08-09-1095-r5/04-desktop-estimate-out-of-stock.png`
- `docs/qa/2026-08-09-1095-r5/05-desktop-non-goods-auto-one.png`
- `docs/qa/2026-08-09-1095-r5/06-desktop-slip-out-of-stock.png`
- `docs/qa/2026-08-09-1095-r5/07-desktop-active-bundle-expanded.png`
- `docs/qa/2026-08-09-1095-r5/08-safety-discontinued-candidate.png`
- `docs/qa/2026-08-09-1095-r5/09-estimate-items-discontinued-candidate.png`
- `docs/qa/2026-08-09-1095-r5/09b-estimate-items-discontinued-management.png`
- `docs/qa/2026-08-09-1095-r5/10-discontinued-safety-alert-management.png`
- `docs/qa/2026-08-09-1095-r5/11-non-goods-out-of-stock.png`
- `docs/qa/2026-08-09-1095-r5/12-safety-discontinued-blank-identity.png`
- `docs/qa/2026-08-09-1095-r5/admin-api-observations.json`
- `docs/qa/2026-08-09-1095-r5/desktop-browser-network.json`
- `docs/qa/2026-08-09-1095-r5/desktop-observations.json`
- `docs/qa/2026-08-09-1095-r5/estimate-browser-network.json`
- `docs/qa/2026-08-09-1095-r5/estimate-observations.json`
- `docs/qa/2026-08-09-1095-r5/safety-status-transition-observations.json`

## 9. 못 한 것

- 저장된 기존 견적·전표의 품절 참조 표본이 0건이라 “이미 입력된 수량이 있는 기존 행”은 판정 불가.
- `status IS NULL` 실표본이 0건이고 schema가 NULL 저장을 막으므로 NULL 행 실 GUI 동작은 판정 불가.
- 초기 실데이터에는 비상품×비활성 조합이 0건이었다. 대신 R5 식별자를 붙인 실 관리자 API 표본으로 조합 도달성을 확인했다.

git commit/push는 하지 않았다.
