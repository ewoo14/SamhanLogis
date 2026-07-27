# #896 단계 0 정답 고정 — 슬라이스 1 결과 보고서

## 상태 요약

수량·선택 target 모델 경계를 두 실행 포팅본에 추가하고, H-01~08·S-01~03·C-01~09 20 가족과 옵션 변형을 golden으로 고정했다. 운영 경로의 정본과 감사 원본은 수정하지 않았다.

단가·소계·공급가액·VAT·총액은 실제 레거시 target 행의 가격 snapshot이 현재 실행 환경에서 확보되지 않아 이번 슬라이스에서 고정하지 않았다. 가격 필드는 경계 출력에 포함하되 `null`로 남겼다. 가격을 만들거나 추정하지 않았다.

중요한 정정 사항은 다음과 같다.

- `GET /products/internal/estimate-catalog`는 서버 오류 URL이 아니라 매핑되지 않은 경로다. `NoResourceFoundException`은 카탈로그 부재의 근거가 아니다.
- 실제 카탈로그 경로는 `/products/internal/estimate-catalog/products` 및 그 하위 경로이며, 로컬에서 HTTP 200을 확인했다.
- `product_db.products`에는 가격 컬럼이 있고 총 105행, `status='ACTIVE'` 101행이다. 다만 이번에 확인한 레거시 target 코드 4종의 현재 행은 0건이었다.

## 1. 경계 정의

정찰 문서 §9 단계 0의 경계를 유지했다.

입력은 다음과 같다.

- 원수량 Map
- 홈·싱글·상업 옵션 DOM snapshot 및 `SHOW_I_HOSE` 등 옵션 snapshot
- 수동 잠금 Map
- 카탈로그 모델 snapshot
- 단가·DC·반올림 설정 snapshot 자리

출력은 다음과 같다.

- 최종 품목별 수량 Map
- 수량이 0이 아닌 품목의 실제 target 모델 목록
- 품목별 단가, 소계
- 공급가액, VAT, 총액

이번 가격 미확보 경계의 출력은 다음과 같다.

```js
{
  quantities: { /* 정수 수량 */ },
  targetModels: [ /* quantities의 실제 모델 코드 */ ],
  unitPrices: null,
  subtotals: null,
  supplyAmount: null,
  vat: null,
  total: null
}
```

`clients/web/legacy-quantity-golden/legacyQuantityBoundary.js`는 호출마다 새 Node VM에 정본 함수 본문을 주입한다. DOM·window 입력은 snapshot으로만 제공하고, 계산 결과 외의 전역 상태를 보존하지 않는다. 뮤테이션도 파일에 쓰지 않고 읽은 소스 문자열에만 적용한다.

## 2. 실제 카탈로그·가격 원천 확정

### 견적 앱

- `clients/web/estimate-app/routes/index.js:21-25`에서 `/` 부팅 시 `code.bootstrap()` 결과를 EJS에 주입한다.
- `clients/web/estimate-app/lib/code.js:1842-1847`에서 기본 `CATALOG_SOURCE`가 `db`이고, `CATALOG_SOURCE=sheet`일 때만 시트를 선택한다.
- `clients/web/estimate-app/lib/code.js:1882-1890`에서 `HOME_MULTI`, `SINGLE_SET`, `COMMERCIAL_MULTI`, `LEGACY`, material prices 및 가격 데이터를 `dbCatalog`로 가져온다.
- `clients/web/estimate-app/lib/db-catalog.js:24-38`에서 product-service 기본 주소를 `http://localhost:8084`로 두고 `BASE`를 `/products/internal/estimate-catalog`로 만든다.
- 같은 파일 `:67,94,122,157,185,211-226`의 실제 호출은 각각 `/products`, `/products?category=SINGLE_SET`, `/products?category=LEGACY`, `/material-prices`, `/price-baseline`, 가격 일정·기본 variant 경로다.

따라서 단독 경로인 `GET /products/internal/estimate-catalog`가 아니라, 예를 들어 다음이 실제 카탈로그 호출이다.

```text
GET http://localhost:8084/products/internal/estimate-catalog/products?category=HOME_MULTI&scope=ESTIMATE
HTTP/1.1 200
```

### 주문 앱

- `clients/web/order-app/index.html:44-62`의 blocking XHR이 `/partner-orders/bootstrap`을 호출해 `window.__SAMHAN_BOOTSTRAP__`을 채운다.
- `clients/web/order-app/src/samhanApi.ts:248-252`도 `GET /partner-orders/bootstrap`을 fallback 호출한다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderBootstrapController.java:17,25`가 `/api/v1/partner-orders/bootstrap`을 실제로 제공한다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java:299-367`에서 product-service client로 `HOME_MULTI`, `COMMERCIAL_MULTI`, `SINGLE_SET`, `LEGACY`, components, material prices, price baseline/schedule을 읽어 bootstrap payload로 변환한다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/EstimateCatalogClient.java:42-63`의 product-service 호출은 `/products/internal/estimate-catalog/products`, `/components`, `/material-prices`, `/price-baseline`이다.

실행 확인:

```text
GET http://localhost:8080/api/v1/partner-orders/bootstrap
HTTP/1.1 200 OK
```

### 가격 snapshot의 현재 한계

확인한 DB 결과는 다음과 같다.

```text
 total | active_not_deleted | active_status
-------+---------------------+--------------
   105 |                 105 |          101

 legacy_target_rows
 ------------------
                  0
```

가격 컬럼도 실제로 존재한다.

```text
delivery_price
estimate_category
inbound_price
model_code
outbound_price
purchase_price
release_price
selling_price
single_price
```

이번 fixture는 `priceSnapshot: null`이다. 모델 코드는 정본의 `PANEL_MODELS`, `PUMP_MAP`, `RENEW_FILTER_MAP`, 분기관 코드표와 `services/product-service/src/test/resources/label-mapping-fixtures/legacy-invoice-labels.txt`, 레거시 매핑 원본의 실제 코드만 참조했다. 정본 정규식을 실행하기 위한 품명은 모델 참조용이며 현재 API의 가격·재고 행이라고 주장하지 않는다.

따라서 이번 결과는 **수량·target 모델 선행 고정**이다. 현재 DB가 가격 컬럼을 갖고 있다는 사실과, 레거시 target 행의 가격 snapshot을 확보했다는 사실을 혼동하지 않았다. 실제 레거시 target 행과 단가·DC·VAT·반올림 snapshot이 확보되면 같은 경계의 금액 필드를 후속 golden으로 채워야 한다. 레거시 target 행이 없는 현재 상태를 PM이 모델 golden의 merge 조건으로 보더라도 되는지는 **PM 확인 필요**다.

## 3. 20 가족 ↔ fixture 대응표

각 기본 fixture는 견적·주문 테스트에서 같은 입력으로 실행하고, 기대 결과는 앱별 goldens로 분리했다. 괄호 안은 옵션 target·제외·경계 변형 fixture다.

| 가족 | 정본 계산 지점(정찰 §2) | 기본 fixture / 옵션 변형 |
|---|---|---|
| H-01 | estimate `index.ejs:8289-8329`, order `index.html:5265-5300` | `H-01`, `H-01-I`, `H-01-NO-HOSE` |
| H-02 | estimate `:8078-8127`, order `:5042-5101` | `H-02`, `H-02-NO-PANEL` |
| H-03 | estimate `:8103-8144`, order `:5071-5121` | `H-03`, `H-03-AIR-PANEL`, `H-03-NO-PANEL` |
| H-04 | estimate `:8146-8173`, order `:5123-5152` | `H-04`, `H-04-25`, `H-04-AI` |
| H-05 | estimate `:8189-8219`, order `:5165-5201` | `H-05`, `H-05-WIRED`, `H-05-COLOR`, `H-05-NO-REMOTE` |
| H-06 | estimate `:8198-8224`, order `:5176-5207` | `H-06`, `H-06-COLOR`, `H-06-NO-REMOTE` |
| H-07 | estimate `:8228-8285`, order `:5212-5261` | `H-07`, `H-07-NO-BRANCH` — legacy 소유 유지 |
| H-08 | estimate `:7914-7923`, order `:4911-4917` | `H-08`, `H-08-NO-FOOT` |
| S-01 | estimate `:7927-7963`, order `:4919-4932` | `S-01`, `S-01-NO-BASE`, `S-01-FLAT-BASE` |
| S-02 | estimate `:7968-7979`, order `:4935-4946` | `S-02`, `S-02-COLOR`, `S-02-NO-REMOTE` |
| S-03 | estimate `:7980-7988`, order `:4947-4955` | `S-03` |
| C-01 | estimate `:8360-8366,8555-8637`, order `:5331-5337,5496-5579` | `C-01`, panel 제외·블랙·승강·공청, 360 원형·사각 |
| C-02 | estimate `:8368-8394`, order `:5339-5353` | `C-02`, `C-02-I-HOSE`, `C-02-NO-HOSE` |
| C-03 | estimate `:8396-8410,4051-4080`, order `:5355-5362,2336+` | `C-03`, 무선·유선·컬러유선·제외 |
| C-04 | estimate `:8412-8425`, order `:5364-5377` | `C-04` — `PUMP_MAP` 대상 |
| C-05 | estimate `:8427-8451,4111-4153`, order `:5379-5422,2396+` | `C-05`, `C-05-NO-BASE` |
| C-06 | estimate `:8443,8452,4181-4186`, order `:5407-5427,2466+` | `C-06` — SET HP·`+` 분기관 |
| C-07 | estimate `:8454-8463,4190-4193`, order `:5429-5441,2475+` | `C-07` — 리뉴얼 필터 |
| C-08 | estimate `:5317-5337`, order `:3343-3363` | `C-08`, `C-08-NO-BASE` — legacy 소유 유지 |
| C-09 | estimate `:12592-12680,13234-13257`, order `:6791-6862,7369-7384` | `C-09`, 누적합 1509/2512/2812/2815/3419/4119 경계 6건 |

`C-09`는 각 코드의 직전/경계 이후가 별도 fixture이고, pairwise 축약을 하지 않았다. H-07과 C-09는 후속 설정 모델로 옮기지 않고 legacy 소유로 남긴 채 정답만 고정했다.

## 4. 두 앱 드리프트 fixture

두 앱의 결과를 합치거나 어느 쪽이 옳다고 판정하지 않았다.

| 드리프트 | 견적 golden | 주문 golden | 고정 fixture |
|---|---|---|---|
| 홈 360 기본 리모컨 | `AR-EC05` 탐색 | `AR-EC05`와 `AR-KH05` 분리 | `H-01`, `H-02`, `H-05` |
| 홈 분기관 게이트 | 실내합 `>=2` 및 단배관 필요 | 단배관만 있으면 분기 | `H-07` |
| 홈 I형 호스 | `#home_hose_i` | `window.SHOW_I_HOSE` | `H-01-I` |
| 상업 4WAY 공청 | `NUF→NUC` 후 `K1→K4` | 다른 변환식 | `C-01-AIR-PANEL` |
| 상업 호스 나머지 | 나머지도 4WAY측에 합산 | 4WAY·360만 명시 합산 | `C-02`, `C-02-I-HOSE` |
| 리뉴얼 필터 | `AF-R09A:2`, `AF-R12A:1` | 필터 행 없음 | `C-07` |
| GHP 보조 경로 | `GHP방진가대:2`, `ACL-KORGHP07:2` | 결과 없음 | `C-08` |
| 홈 360 기본 수량 | `AR-EC05:4` | `AR-EC05:3`, `AR-KH05:1` | `H-01` |

## 5. 뮤테이션 게이트 — 실제 RED 원문

각 항목은 `LEGACY_MUTATION`을 하나만 설정해 별도 프로세스로 실행했다. 견적과 주문 모두 정상 fixture 60건에 뮤테이션 gate 1건이 추가되어 `61 tests`가 되었고, 모든 항목은 exit code 1이었다. 뮤테이션은 정본 파일에 남지 않았다.

### 1) multiplier 1→2

등가 지점은 견적의 홈 호스 `setH` 대입과 주문의 `HOSE_4W` 대입이다. 설정 evaluator가 없어도 현행 legacy 1:1 대입에서 검출했다.

```text
견적
-   "FH-LFHLF": 2,
+   "FH-LFHLF": 4,
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 60 passed, 61 total

주문
- Expected "FH-LFHLF": 2
+ Received "FH-LFHLF": 4
Test Files 1 failed, 1 passed (2)
Tests 1 failed, 60 passed (61)
```

### 2) target 모델 하나 교체

`PANEL_MODELS.p1sWi`의 `PC1MWSK3NW`를 `PC1NWSK3NW`로 바꿨다.

```text
견적
-   "PC1MWSK3NW": 1,
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 60 passed, 61 total

주문
- Expected "PC1MWSK3NW": 1
Test Files 1 failed, 1 passed (2)
Tests 1 failed, 60 passed (61)
```

### 3) source 하나 누락

`H-01`의 `AM020BN1PBH1` source 수량을 입력 Map에서 삭제했다.

```text
견적
-   "AM020BN1PBH1": 2,
-   "AR-EC05": 4,
-   "PC1NWSK3NW": 2,
+   "AR-EC05": 2,
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 60 passed, 61 total

주문
- Expected AM020BN1PBH1: 2, AR-EC05: 3, PC1NWSK3NW: 2
+ Received source가 없어 해당 수량이 사라짐
Test Files 1 failed, 1 passed (2)
Tests 1 failed, 60 passed (61)
```

### 4) ADD → REPLACE

두 source가 같은 `PC1NWSK3NW` target으로 합산되는 C-01 입력에서 `want.set(pm, (want.get(pm)||0)+q)`를 `want.set(pm,q)`로 바꿨다.

```text
견적
-   "PC1NWSK3NW": 3,
+   "PC1NWSK3NW": 1,
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 60 passed, 61 total

주문
- Expected "PC1NWSK3NW": 3
+ Received "PC1NWSK3NW": 1
Test Files 1 failed, 1 passed (2)
Tests 1 failed, 60 passed (61)
```

### 5) 비활성 시 ZERO → KEEP

견적 패널 초기화와 주문 `clearAllPanels`의 `set(..., 0)` 조건을 무력화하고, 기존 panel 수량 7을 입력했다.

```text
견적
- Expected Object {}
+ Received Object { "PC2NWSK1N": 7 }
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 60 passed, 61 total

주문
AssertionError: expected { PC2NWSK1N: 7 } to deeply equal {}
Test Files 1 failed, 1 passed (2)
Tests 1 failed, 60 passed (61)
```

### 6) 옵션 조건 반전

홈 공청판넬 조건을 `===`에서 `!==`로 바꿨다.

```text
견적
-   "PC4NUCK4NW": 1,
+   "PC4NUFK1NW": 1,
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 60 passed, 61 total

주문
- Expected "PC4NUCK4NW": 1
+ Received "PC4NUFK1NW": 1
Test Files 1 failed, 1 passed (2)
Tests 1 failed, 60 passed (61)
```

### 7) 수동 잠금 무시

견적 `HOME_MANUAL_PANEL` 보호 조건을 제거하고, 주문 상업 받침대의 `COMM_MANUAL_BASE` 보호 조건을 제거했다.

```text
견적
-   "PC1MWSK3NW": 9,
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 60 passed, 61 total

주문
AssertionError: expected { AM120AXVHHH1: 1, "방진가대S2소": 1 } to deeply equal { AM120AXVHHH1: 1 }
Test Files 1 failed, 1 passed (2)
Tests 1 failed, 60 passed (61)
```

### 8) 견적/주문 중 한 앱의 드리프트 fixture 삭제

주문 테스트에서 `H-07` fixture를 제거하고 20 가족 배열을 기대했다.

```text
견적
-   "H-07",
Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 60 passed, 61 total

주문
AssertionError: expected [ 'H-01', 'H-02', 'H-03', … ] to deeply equal [ 'H-01', 'H-02', 'H-03', …, 'H-07', … ]
Test Files 1 failed, 1 passed (2)
Tests 1 failed, 60 passed (61)
```

설정 모델이 아직 없다는 이유로 1·4·5를 생략하지 않았다. 각 항목에 대응하는 legacy 대입·초기화·합산·조건·잠금 지점에서 검출했다.

## 6. CI 등재 근거

새 테스트가 조용히 빠지지 않는 근거는 다음과 같다.

- `.github/workflows/ci.yml`, 잡 `frontend-order-app` (`Frontend Order-App (typecheck + test + build)`): working directory가 `clients/web/order-app`, `npm ci` 후 `npm run typecheck`, `npm run test`, `npm run build`를 실행한다. Vitest 기본 수집으로 `src/__tests__/legacy-quantity-golden.test.ts`를 수집한다.
- `.github/workflows/deploy-estimate-app.yml`, 잡 `build` (`빌드 검증 + 단위 테스트`): working directory가 `clients/web/estimate-app`, `npm ci` 후 `npm test`, typecheck, build를 실행한다. Jest 기본 수집으로 `test/legacy-quantity-golden.test.js`를 수집한다.
- `.github/workflows/deploy-order-app.yml`, 잡 `deploy` (`Build + Deploy (Cloudflare Pages)`): working directory가 `clients/web/order-app`, `npm ci`, typecheck, `npm test --if-present`, build를 실행하는 추가 gate다.

별도 allowlist나 테스트 필터를 추가하지 않았다. 두 앱 package script의 전체 테스트 수집 범위에 새 파일이 들어간다.

## 7. 동작 불변 근거

- `clients/web/estimate-app/views/index.ejs` 미수정
- `clients/web/order-app/index.html` 미수정
- `tools/legacy-gas/**` 미수정
- 계산 evaluator 교체, API 변경, 칩 UI 변경, runtime import를 하지 않았다.
- 경계는 정본 함수의 본문을 테스트 VM에서 실행하고, 정상 입력의 기대값은 그 실행 결과로만 고정한다.
- golden 정상 실행: 두 앱 모두 60건 통과
- full suite: 견적 8 suite·162 test 통과, 주문 9 file·89 test 통과

따라서 사용자 경로의 최종 수량·target 모델·금액 계산식은 이번 파일 변경으로 실행되지 않는다. 금액 golden은 가격 snapshot 확보 후 같은 출력 경계에 추가해야 한다.

## 8. 실행 결과

### 최종 정상 검증

```text
clients/web/estimate-app
npm test -- --runInBand
Test Suites: 8 passed, 8 total
Tests:       162 passed, 162 total

npm run typecheck
typecheck OK: 14 JavaScript files

npm run build
typecheck OK: 14 JavaScript files

clients/web/order-app
npm test -- --run
Test Files  9 passed (9)
Tests       89 passed (89)

npm run typecheck
Exit code: 0

npm run build
✓ built in 457ms
```

### 뮤테이션 검증

각 `LEGACY_MUTATION=<8종>` 실행은 두 앱 모두 exit code 1, `1 failed, 60 passed, 61 total`이었다. 위 §5에 각 실패 차이의 원문을 남겼다. 실행 후 `LEGACY_MUTATION` 환경변수는 제거했고, 최종 정상 검증은 mutation 없이 실행했다.
