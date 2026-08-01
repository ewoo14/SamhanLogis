# #1042 재수렴 라운드 적대적 검증 보고서

## 확인 1 — 검증 기준점과 쓰기 격리

- 브랜치: `fix/1042-stock-balance-query`
- 검증 HEAD: `a725130b76aa39004e70bcdacc6375882831b3bd`
- `git status --short` 원문: `?? docs/dev-reports/2026-08-02-1042-reconvergence.md`
- 본 보고서 외 작업트리 변경은 관찰되지 않았다. 이후 검증은 Git 읽기, 소스 읽기, DB 읽기 전용 질의, 빌드/테스트만 사용하며 코드·Git·Docker·실 DB 쓰기를 수행하지 않는다.
- 실 사용자 경로 재현 여부: 해당 없음(검증 환경 기준점 확인).
- 실 데이터 영향 건수: 0건.

## 확인 2 — 행 키 유일성·빈 코드·동명 품목 실 DB 실측

① 실 사용자 경로 재현 여부: 현재 실 DB의 활성 재고 201행을 화면과 동일한 `productCode-warehouseCode` 조합으로 평가했으며 중복 키는 **0그룹·0행**이다. 따라서 현재 데이터에서는 DataGrid 행 겹침/소실이 재현되지 않는다. 다만 서버의 `productCode` 값은 실제 `ProductSummary.productCode()`가 아니라 `ProductSummary.modelName()`에서 채워진다. 즉 현재 화면 키의 실질은 **모델코드(`model_name`) + 창고코드**다.

② 재현 명령: Docker 컨테이너의 PostgreSQL에 `PGOPTIONS=-c default_transaction_read_only=on`을 강제하고, `inventory_db.stock_balances`의 활성 행/창고코드와 `product_db.products`를 읽은 뒤 PowerShell 메모리에서 내부 식별자로 결합했다. 원 질의는 `SELECT ... FROM stock_balances ... WHERE sb.is_deleted=false` 및 `SELECT ... FROM products`; 원시 내부 식별자는 출력·저장하지 않았다.

출력 원문:

```text
PRODUCTS_ACTIVE=1220
ACTIVE_MODEL_NAME_BLANK=0
ACTIVE_PRODUCT_CODE_BLANK=1120
DUP_NAME_GROUPS=187,ROWS=700
DUP_NAME_DIFF_MODEL_GROUPS=187,ROWS=700
DUP_NAME_SINGLE_MODEL_GROUPS=0,ROWS=0
DUP_NAME_AND_MODEL_GROUPS=0,ROWS=0
BALANCE_ROWS=201,DISTINCT_PRODUCTS=101,MISSING_PRODUCT_ROWS=0,DELETED_PRODUCT_ROWS=0
BALANCE_MODEL_NAME_BLANK_ROWS=0,PRODUCTS=0
BALANCE_PRODUCT_CODE_BLANK_ROWS=1
UI_ROWKEY_DUP_GROUPS=0,ROWS=0
ACTUAL_PRODUCT_CODE_KEY_DUP_GROUPS=0,ROWS=0
```

③ 실 데이터 영향 건수:

- 활성 품목 1,220종 중 화면 키에 실제 쓰이는 모델코드 공백은 **0종**이다.
- 실제 `product_code` 공백은 활성 품목 **1,120종**, 재고 보유 101종 중 **1종(재고 1행)**이다. 그러나 현 구현은 이 열을 화면 `productCode`로 보내지 않으므로 해당 1행의 키는 현재 무너지지 않는다.
- #1049의 동명 품목은 정확히 **187그룹·700행**으로 재현됐다. 187그룹 전부 이름은 같지만 모델코드는 서로 다르며, 이름과 모델코드까지 같은 그룹은 **0그룹·0행**이다.
- 현재 활성 재고 201행·101품목에는 누락/삭제 품목 매핑이 0행이고, 모델코드+창고코드 중복도 0그룹이다.

판정: 현재 실 데이터 도달성 결함은 0건이다. 단, 계약명 `productCode`와 실제 원천 `modelName`의 불일치는 확인했으며, 이번 라운드는 품질 지적이 아니라 현재/향후 키 충돌 도달성만 판정한다. DB에 같은 모델코드와 같은 창고를 공유하는 서로 다른 품목이 생기면 충돌 가능한 구조이나, 현재 실 데이터 영향은 0행이다.

## 확인 3 — 행 선택·상세 이동 회귀 도달성

① 실 사용자 경로 재현 여부: 재고 현황 화면은 변경 전부터 `DataGrid`의 셀 다중 선택·복사만 제공했고 상세 이동 콜백은 없었다. 현재도 `enableMultiSelect=true`, `enableCopy=true`이며 `onRowClick`/`navigate`가 없다. 따라서 UUID 제거 때문에 막힌 상세 이동 경로는 **기존부터 0경로**다. 셀 선택은 행 식별자가 아니라 필터 결과의 행/열 인덱스로 관리되며, `rowKey`는 React `<tr>` key에만 쓰인다. 현재 실 DB 키 중복 0건이므로 선택/렌더 회귀도 재현되지 않는다.

② 재현 명령·출력 원문:

```text
git show HEAD^:clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx
before: rowKey={(row) => `${row.productId}-${row.warehouseCode}`}

current source search:
rowKey={(row) => `${row.productCode}-${row.warehouseCode}`}
enableMultiSelect={true}
enableCopy={true}
onRowClick occurrences in InventoryStockBalancePage.tsx = 0
navigate occurrences in InventoryStockBalancePage.tsx = 0

DataGrid.tsx:
<tr key={rowKey(row)} ...>
const sel = enableMultiSelect && isSelected(rIdx, cIdx)
handleCellClick(rIdx, cIdx, e)
```

③ 실 데이터 영향 건수: 상세 이동 기존/현재 0경로, 현재 활성 재고 201행 중 중복 React key 0행, 선택 불능 재현 0행.

## 확인 4 — 전체 창고 조회에서 재고 0 창고·VIRTUAL 도달성

① 실 사용자 경로 재현 여부: 화면의 창고 선택 목록은 별도 `GET /inventory/warehouses`를 사용하므로 미삭제 4곳을 모두 선택지로 받을 수 있다. 그러나 “전체 창고” 재고 결과는 `stock_balances` 행을 기준으로 조회하므로 재고 행이 없는 위탁 창고와 VIRTUAL 창고는 **0으로 생성되지 않고 결과에서 사라진다**. 따라서 실 데이터에서 VIRTUAL `—` 렌더 경로는 도달하지 않는다. 재고 보유 본사/차량 창고 2곳의 201행만 나온다.

② 재현 명령: 읽기 전용 `warehouses LEFT JOIN stock_balances` 유형별 집계, 활성 재고 집계, `StockBalanceRepository.findBalancePage` 및 화면의 `listWarehouses()`/`listStockBalances()` 경로 대조.

출력 원문:

```text
WAREHOUSES_ACTIVE=4
WAREHOUSE_TYPE=CONSIGNMENT,WAREHOUSES=1,BALANCE_ROWS=0
WAREHOUSE_TYPE=HEADQUARTERS,WAREHOUSES=1,BALANCE_ROWS=101
WAREHOUSE_TYPE=VEHICLE,WAREHOUSES=1,BALANCE_ROWS=100
WAREHOUSE_TYPE=VIRTUAL,WAREHOUSES=1,BALANCE_ROWS=0
BALANCES_ACTIVE=201,PRODUCTS=101,WAREHOUSES=2,TOTAL=46700

repository predicate:
FROM StockBalance b
WHERE b.isDeleted = false
  AND (:productId IS NULL OR b.productId = :productId)
  AND (:warehouseId IS NULL OR b.warehouse.id = :warehouseId)
```

③ 실 데이터 영향 건수: 미삭제 창고 4곳 중 전체 재고 결과에 나타나는 창고 2곳, 사라지는 재고 0 창고 2곳(위탁 1, VIRTUAL 1), VIRTUAL `—` 실 화면 도달 0행. 이는 fix 전후 동일한 row 기반 표현이며, 목록 선택지는 4곳·재고 결과는 2곳으로 표면이 분리된다.

## 확인 5 — desktop typecheck

① 실 사용자 경로 재현 여부: 정적 소비 계약 전체를 컴파일했으며 통과했다. 행 선택/상세 이동의 실 클릭 QA는 이 확인 축이 아니다.

② 재현 명령·출력 원문:

```text
cd clients/desktop
npm run typecheck

> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

tests 50
pass 50
fail 0
Process exited with code 0
```

③ 실 데이터 영향 건수: 해당 없음. TypeScript/real-QA scope 실패 0건. 실행 중 출력된 CRLF 경고와 미추적 로컬 스펙 격리 안내는 종료 코드를 실패로 바꾸지 않았으며 공식 수치에는 섞이지 않았다.

## 확인 6 — inventory-service 전체 명령 1차 실행 상태

① 실 사용자 경로 재현 여부: 해당 없음(빌드/테스트 축).

② 재현 명령·출력 원문:

```text
.\gradlew.bat :services:inventory-service:test --no-daemon
> Task :services:inventory-service:test UP-TO-DATE
BUILD SUCCESSFUL in 14s
18 actionable tasks: 18 up-to-date
```

③ 실 데이터 영향 건수: 0건. 이 실행은 Gradle 캐시 판정으로 실제 테스트를 재실행하지 않았으므로, 전체 테스트 수치의 신선한 재현으로 간주하지 않고 `--rerun-tasks` 후속 확인을 수행한다.

## 확인 7 — inventory-service 전체 신선한 재실행

① 실 사용자 경로 재현 여부: 테스트 격리 환경의 controller/service/JPA 경로를 포함한 전체 테스트 재실행이며 공유 실 서비스 HTTP는 아니다.

② 재현 명령·출력 원문:

```text
.\gradlew.bat :services:inventory-service:test --no-daemon --rerun-tasks
> Task :services:inventory-service:test
BUILD SUCCESSFUL in 2m 14s
18 actionable tasks: 18 executed

XML_FILES=61,PARSE_MISSES=0,TESTS=544,FAILURES=0,ERRORS=0,SKIPPED=1
```

`StockBalanceQueryLazyIT`의 4개 케이스(전체 조회, 성공 응답 UUID 정규식, 기존 `productId` 필터, `warehouseId` 필터)가 모두 XML에 통과 testcase로 기록됐다.

③ 실 데이터 영향 건수: 실 DB 영향 0건(Testcontainers 격리). 테스트 544건 중 실패 0, 오류 0, skip 1.

## 확인 8 — 전체조회 DB statement content+count 2회

① 실 사용자 경로 재현 여부: Testcontainers에서 전체조회 controller/service/JPA 경로를 1회 재현했다. 요청 직전 fixture 생성 세션과 스케줄러 세션은 분리되며, 해당 GET의 읽기 전용 세션은 statement 2회를 실행했다.

② 재현 명령·출력 원문:

```text
SPRING_APPLICATION_JSON={spring.jpa.properties.hibernate.generate_statistics=true}
.\gradlew.bat :services:inventory-service:test \
  --tests '*StockBalanceQueryLazyIT.balances_withoutProductId_returns200ForWholeInventoryPage' \
  --no-daemon --rerun-tasks --info

StockBalanceQueryLazyIT > balances_withoutProductId_returns200ForWholeInventoryPage()
252300 nanoseconds spent preparing 2 JDBC statements;
4460800 nanoseconds spent executing 2 JDBC statements;
0 nanoseconds spent executing 0 JDBC batches;
BUILD SUCCESSFUL in 1m 3s
18 actionable tasks: 18 executed
```

③ 실 데이터 영향 건수: 테스트 응답 1행, 조회 statement 2회(content 1 + count 1), 행별 추가 조회 0회. 실 DB 쓰기 0건.

## 확인 9 — `GET /inventory/balances` 성공 본문·에러 본문·응답 헤더 UUID 전수

① 실 사용자 경로 재현 여부:

- 최신 HEAD 성공 본문: `StockBalanceQueryLazyIT.balances_httpResponseContainsNoUuidAndRetainsDisplayFields`가 `ApiResponse → Page → content[]` 전체 직렬화 문자열을 UUID 정규식으로 훑어 **0건**으로 통과했다. 중첩 Page 메타데이터와 행 객체가 모두 스캔 대상이다.
- 에러 본문·응답 헤더: 공유 런타임은 직전 코드이지만 최신 fix commit이 `GlobalExceptionHandler`, 보안 헤더, controller 헤더를 변경하지 않았음을 `git diff HEAD^..HEAD`로 확인했다. 실제 GET 성공/형식 오류 응답의 전체 헤더와 오류 본문을 일반 canonical UUID 정규식으로 검사해 모두 0건이었다.
- 공유 런타임 성공 본문은 구 DTO라 UUID 3건이 검출됐다. 이는 최신 HEAD 미배포 상태의 예상 결과이며, 재빌드·재기동 금지 때문에 최신 HEAD의 실제 공유 HTTP 성공 본문은 이 라운드에서 도달 불가다.

② 재현 명령: 최신 HEAD `StockBalanceQueryLazyIT` 전체 재실행; 읽기 전용으로 기존 품목 하나를 선택한 뒤 기존 공유 inventory-service에 성공 GET 및 형식 오류 GET; `curl -i` 결과의 header/body를 분리해 `(?i)\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b`로 스캔. 요청용 내부 식별자는 출력·저장하지 않았다.

출력 원문:

```text
LATEST_HEAD_SUCCESS_BODY_UUID_MATCHES=0 (StockBalanceQueryLazyIT passed)

SUCCESS_STATUS=200,HEADER_UUID_MATCHES=0,BODY_UUID_MATCHES=3
SUCCESS_HEADER_NAMES=Cache-Control,Content-Type,Date,Expires,Pragma,Transfer-Encoding,X-Content-Type-Options,X-Frame-Options,X-XSS-Protection
ERROR_STATUS=400,HEADER_UUID_MATCHES=0,BODY_UUID_MATCHES=0
ERROR_HEADER_NAMES=Cache-Control,Connection,Content-Type,Date,Expires,Pragma,Transfer-Encoding,X-Content-Type-Options,X-Frame-Options,X-XSS-Protection
ERROR_BODY_KEYS=code,data,message,success,timestamp,CODE=INVALID_INPUT
```

③ 실 데이터 영향 건수: 최신 HEAD 성공 응답 UUID 도달 0건(Testcontainers). 변경되지 않은 헤더·에러 표면 UUID 0건. 공유 구 런타임 성공 1행에서는 UUID 3건이 검출되지만 PR 배포 전 런타임 수치이므로 HEAD 결함으로 집계하지 않는다.

## 확인 10 — 다른 endpoint `/balances/batch` 범위 판단

① 실 사용자 경로 재현 여부: `/balances/batch`는 이번 fix 대상인 재고 현황 목록 GET과 별개인 기존 요청-응답 상관 계약이다. 요청 `productIds` 순서/항목과 응답 `productId`를 매칭하고, `warehouseId`로 `listWarehouses()` 결과와 결합해 품목×창고 매트릭스를 만든다. 해당 응답에는 UUID가 계속 존재한다.

② 재현 명령·출력 원문:

```text
POST /inventory/balances/batch
BatchBalanceRequest: List<UUID> productIds
ProductBalanceResponse: UUID productId
WarehouseBalance: UUID warehouseId

desktop consumer:
const batchById = new Map(balRes.data.data.map((p) => [p.productId, p]))
const p = batchById.get(line.productId)
```

③ 실 데이터 영향 건수: 기존 batch 요청/응답 소비 경로 1개(`fetchProductBalancesMatrix`), 내부 상관 식별자 2종. 이번 fix에서 그대로 두는 것이 맞다. 이유는 목록 GET의 공개 표시 계약과 달리, batch는 호출자가 보낸 내부 품목 식별자를 그대로 상관시키는 별도 기존 계약이며 제거 시 정상 매트릭스 경로가 막히기 때문이다. 따라서 “inventory-service의 모든 응답 UUID 0건”은 사실이 아니고, **이번 fix 대상인 `GET /balances` 응답 표면만 0건**이다.

## 확인 11 — 기존 `productId` 요청 계약 보존

① 실 사용자 경로 재현 여부: 최신 HEAD의 품목 필터 GET이 Testcontainers에서 HTTP 200으로 통과했고, 공유 구 런타임에서도 같은 기존 계약으로 HTTP 200을 재현했다. 응답 DTO의 `productId` 제거와 요청 query parameter는 분리되어 있다.

② 재현 명령·출력 원문:

```text
controller: @RequestParam(required = false) UUID productId
desktop wrapper: if (options.productId) params['productId'] = options.productId

StockBalanceQueryLazyIT > balances_productIdFilter_returns200WithWarehouseNameOutsideTestTransaction() passed
shared pre-fix runtime: SUCCESS_STATUS=200
```

③ 실 데이터 영향 건수: 기존 요청 계약 호출부 6곳(부하 1, real-QA helper 1, 서버 IT 4) 유지. 최신 HEAD 계약 실패 0건.

## 확인 12 — PR #1043 CI 수치

① 실 사용자 경로 재현 여부: 해당 없음(CI 상태 확인).

② 재현 명령·출력 원문:

```text
gh pr checks 1043
GH_EXIT=0,PASS_LINES=42
```

42개 check 모두 `pass`이며 pending/fail/cancel 항목은 출력되지 않았다.

③ 실 데이터 영향 건수: 0건. CI **42/42 green** 재현.

## 확인 13 — 품목 마스터 전체 모델코드 유일성 보강

① 실 사용자 경로 재현 여부: 재고 201행의 현재 화면 키는 중복 0이지만, 품목 마스터 전체에서 모델코드 자체는 전역 유일하지 않다. 동일 모델코드 **1그룹·2품목**이 있으며 품목명은 서로 다르다. 다만 두 품목 모두 현재 balance가 없어 화면에 도달하지 않으므로 현 사용자 행 겹침은 0건이다.

② 재현 명령: `product_db.products WHERE is_deleted=false`를 읽기 전용 조회해 `model_name`/`product_code` 중복을 집계하고, 내부 식별자를 출력하지 않은 채 활성 balance와 메모리 결합했다.

출력 원문:

```text
ACTIVE_MODEL_DUP_GROUPS=1,ROWS=2
ACTIVE_PRODUCT_CODE_DUP_GROUPS=0,ROWS=0
DUP_MODEL_MASTER_GROUPS=1,PRODUCT_ROWS=2,DISTINCT_NAMES=2
DUP_MODEL_WITH_BALANCE_PRODUCTS=0,BALANCE_ROWS=0,SHARED_WAREHOUSE_GROUPS=0
```

③ 실 데이터 영향 건수: 현재 화면 영향 0행. 잠재 대상은 품목 마스터 2종이며, 향후 둘이 같은 창고에 balance를 갖게 되면 현재 `modelName-warehouseCode` 키가 충돌한다. 즉 **현재 balance 결과에서 유일하지만 품목 마스터 불변식으로 보장된 키는 아니다.**

## 확인 14 — 확인 13의 대소문자 정규화 보정

확인 13의 PowerShell `Group-Object`는 문자열을 대소문자 비구분으로 묶었다. 실제 React key는 대소문자를 구분하므로 그 수치를 그대로 키 충돌 잠재군으로 해석하면 안 된다.

① 실 사용자 경로 재현 여부: DB 원문 `model_name` 정확 일치 중복은 0그룹이고, `products.model_name` 정확값 UNIQUE 인덱스도 존재한다. 확인 13의 1그룹·2품목은 길이가 같은 대소문자 변형 2개이며 React key 문자열은 서로 다르다. 두 품목 모두 balance도 없다. 따라서 현재뿐 아니라 DB 제약을 지키는 정상 입력 경로에서도 같은 `modelName-warehouseCode` key 충돌은 재현되지 않는다.

② 재현 명령·출력 원문:

```text
NORMALIZED_DUP_ROWS=2,EXACT_DISTINCT=2,TRAILING_OR_LEADING_SPACE_ROWS=0,MIN_LEN=9,MAX_LEN=9,LOWER_DISTINCT=1
EXACT_MODEL_DUP_GROUPS=0
CASE_INSENSITIVE_TRIM_DUP_GROUPS=1
MODEL_NAME_UNIQUE_CONSTRAINTS=1
```

③ 실 데이터 영향 건수: 정확 key 중복 0그룹·0행. 대소문자 비구분 표시상 유사 품목 1그룹·2종은 현재 balance 0행이며 React key 충돌 영향 0행. **확인 13의 “같은 창고에 balance가 생기면 충돌” 문장은 이 보정으로 철회한다.**

## 확인 15 — 행 키 구성 열의 DB 제약

① 실 사용자 경로 재현 여부: `model_name` 정확값과 `warehouses.code`에 각각 UNIQUE 인덱스가 있고, 활성 `(product_id, warehouse_id)` 중복도 없다. 화면 키를 구성하는 실제 두 문자열의 정확값 조합이 정상 DB 경로에서 겹치는 사례는 재현되지 않는다.

② 재현 명령·출력 원문:

```text
MODEL_NAME_UNIQUE_CONSTRAINTS=1
WAREHOUSE_CODE_DUP_GROUPS=0
WAREHOUSE_CODE_UNIQUE_INDEXES=1
ACTIVE_PRODUCT_WAREHOUSE_DUP_GROUPS=0
UI_ROWKEY_DUP_GROUPS=0,ROWS=0
```

③ 실 데이터 영향 건수: 활성 재고 201행 중 행 키 충돌 0행. 정상 DB 제약하의 도달 결함 0건.

## 확인 16 — DTO 제거의 Excel export 하류 회귀

① 실 사용자 경로 재현 여부: `GET /inventory/stocks/export.xlsx`를 Testcontainers controller 경로로 실행해 실제 xlsx를 열고, 품목코드/품목명이 유지되며 품목 내부 식별자 문자열이 어느 셀에도 나타나지 않는 두 경로가 통과했다.

② 재현 명령·출력 원문:

```text
.\gradlew.bat :services:inventory-service:test \
  --tests '*InventoryControllerIT.exportStocksXlsx*' \
  --no-daemon --rerun-tasks

BUILD SUCCESSFUL in 1m 3s
18 actionable tasks: 18 executed

tests="2" skipped="0" failures="0" errors="0"
exportStocksXlsx_doesNotExposeProductIdUuid()
exportStocksXlsx_includesProductCodeAndName_forEachBalanceRow()
```

③ 실 데이터 영향 건수: 테스트 export 2경로, 실패 0. 공유 실 DB/파일 쓰기 0건(Testcontainers와 메모리 xlsx).

## 확인 17 — desktop mock wire 응답

① 실 사용자 경로 재현 여부: mock은 요청 필터용 내부 `productId`/`warehouseId`를 fixture 안에서 사용한 뒤 반환 직전에 두 속성을 제거한다. `/inventory/balances` mock handler 블록 전체의 canonical UUID 정규식 매치는 0건이다.

② 재현 명령·출력 원문:

```text
MOCK_BALANCES_BLOCK_UUID_MATCHES=0
const productIdFilter = params.get('productId')
const warehouseIdFilter = params.get('warehouseId')
const content = filtered.map(({ productId: _productId, warehouseId: _warehouseId, ...row }) => row)
```

③ 실 데이터 영향 건수: mock 응답 fixture 9행에서 반환 UUID 필드 0개. 내부 필터 계약은 2종 유지.

## 최종 판정 — 도달 결함 0건

- 행 키: 활성 재고 **201행 전부 정확 key 유일**, 중복 0그룹. 모델코드 정확값과 창고코드 각각 DB UNIQUE 제약이 확인됐다.
- 빈 코드: 화면 key 원천인 `model_name` 공백은 활성 품목/재고 품목 모두 0건. 별도 실제 `product_code`는 활성 1,220종 중 1,120종, 재고 품목 중 1종이 비어 있지만 현 GET은 이 값을 쓰지 않는다.
- 동명: **187그룹·700행**, 전부 서로 다른 모델코드이며 이름+모델코드 동일 그룹 0건.
- 정상 사용: 기존 상세 이동은 0경로, 셀 다중 선택·복사는 유지. 기존 `productId` 요청 계약 6호출부와 Excel export 2경로가 통과했다.
- 창고: 미삭제 4곳/재고 보유 2곳. 전체 창고 선택지는 4곳이지만 balance 결과는 201행이 있는 2곳만 반환하며, 재고 0인 위탁/VIRTUAL 2곳은 0행으로 생성되지 않고 사라진다. 따라서 실 DB VIRTUAL `—` 도달은 0행이다.
- UUID: 최신 HEAD `GET /balances` 성공 본문 전체 0건, 변경 없는 실제 응답 헤더·400 에러 본문 0건, mock wire 0건. `/balances/batch`는 별도 기존 내부 상관 계약이라 UUID 응답을 유지하는 것이 맞다.
- 숫자: 활성 201행·품목 101종·실재고 46,700·미삭제 창고 4곳·재고 보유 창고 2곳 재현. 조회 statement 2회 재현. inventory-service 544 tests/failure 0/error 0, desktop typecheck 및 real-QA scope 50/50 통과. PR CI 42/42 pass.

## 이 라운드가 보지 않은 축

- 금지사항 때문에 최신 HEAD를 공유 inventory-service에 재빌드·재기동하지 않았으므로, 최신 코드의 **공유 실 DB 기반 성공 HTTP 본문**과 실제 Electron 렌더는 보지 않았다. 최신 성공 본문은 Testcontainers MockMvc로 검증했다.
- 실 DB에는 VIRTUAL balance가 0행이므로 실제 VIRTUAL 행의 `—` 화면 렌더는 보지 않았다. 소스 분기와 mock fixture만 확인했다.
- 400 형식 오류 외 401/403/404/409/500 각각의 실제 응답 전체 정규식은 보지 않았다. 공통 에러 envelope/handler 정적 확인과 변경 diff 대조까지만 했다.
- `/balances/batch`는 계약/소비처와 전체 inventory 테스트를 확인했지만 이번 GET fix와 분리된 endpoint이므로 batch 실제 HTTP 응답 전체의 UUID 제거 여부를 합격 조건으로 삼지 않았다.
- 실제 Electron에서 마우스로 셀 범위 선택·복사하는 E2E는 실행하지 않았다. DataGrid의 인덱스 기반 선택 경로와 페이지의 callback 부재를 정적으로 확인했다.
