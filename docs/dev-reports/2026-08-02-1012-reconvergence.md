# #1012 재수렴 라운드 도달성 검증 보고서 (PR #1047)

## 확인 누적

### 확인 1 — `categoryKey` 코드 출처는 폐기된 `estimate_category`가 아니라 `products.product_category`

```text
ProductSummaryResponse.from(Product):
categoryKey(p.getProductCategory())

Product 엔티티 매핑:
@Column(name = "product_category", length = 20)
private ProductCategory productCategory;

별도 deprecated 매핑:
@Column(name = "estimate_category", length = 20)
private EstimateCategory estimateCategory;
```

- ① 실 사용자 경로 재현 여부: 아직 API 호출 전 코드 경로 추적 단계다.
- ② 재현 명령·출력 원문: `rg -n "categoryKey|lookupByModelCodes|inout-analysis" services clients` 후 `ProductSummaryResponse.from(Product)`와 `Product` 엔티티 매핑을 원문 확인했다.
- ③ 실 데이터 영향 건수: 이 확인만으로는 미산정. 다음 확인에서 `product_db.products.product_category` 채움 건수와 실 판매 40품목 매칭 건수를 읽기 전용으로 센다.
- 판정: 수정 코드가 직접 읽는 정본은 V18 폐기 컬럼 `estimate_category`가 아니다. 다만 `product_category`의 실 채움률과 실 40품목 연결 여부가 칩 도달성을 결정한다.

### 확인 2 — `products.product_category` 실 채움률

```text
명령: docker exec samhan-postgres psql -U samhan -d product_db ...
BEGIN
 live_products | category_filled | category_null | deprecated_estimate_filled
---------------+-----------------+---------------+----------------------------
          1220 |            1119 |           101 |                          2
(1 row)
ROLLBACK
```

- ① 실 사용자 경로 재현 여부: product-service가 읽는 실 `product_db.products` 정본에서 재현했다.
- ② 재현 명령·출력 원문: 위 `BEGIN READ ONLY` 집계 원문.
- ③ 실 데이터 영향 건수: 현재 활성 상품 1,220건 중 `product_category` 채움 1,119건, NULL 101건(8.28%). 폐기된 `estimate_category`는 2건만 채워져 있다.
- 판정: 전체 DB 차원에서 수정이 폐기 컬럼의 96% NULL 문제를 그대로 읽는 것은 아니다. 단, 실 판매 40품목의 모델코드 매칭·칩 건수는 별도 확인이 필요하다.

### 결함 R1 — 현재 실 판매 집합은 정찰값 40/35/5가 아니라 46/41/5

구현의 `isConfirmed()`와 같은 `CONFIRMED/DELIVERED/COMPLETED` 상태를 적용했다.

```text
BEGIN
 sold_products | sold_without_inbound | overlap_products | full_cost_products
---------------+----------------------+------------------+--------------------
            46 |                   41 |                5 |                  2
(1 row)
ROLLBACK
```

- ① 실 사용자 경로 재현 여부: 수정 서비스가 조회하는 현재 공유 `slip_db`의 기간·상태·soft-delete 규칙에서 재현했다. 실행 API 응답은 다음 확인에서 별도로 검증한다.
- ② 재현 명령·출력 원문: `docker exec samhan-postgres psql ... "BEGIN READ ONLY; WITH i AS (...), o AS (...) SELECT ...; ROLLBACK;"`; 출력은 위 블록이다.
- ③ 실 데이터 영향 건수: 판매 46품목, 입고 없는 판매 41품목, 입고·판매 공통 5품목, 전량 원가 충족 2품목.
- 판정: 요구 숫자 `40 / 35 / 5 · 전량 원가 충족 4` 중 현재 실 DB에서 `5`만 재현된다. 40이 아니므로 실제값 46을 보고한다.

### 결함 R2 — 모델코드 벌크 lookup도 실 판매 모델코드를 0건 반환; 칩 전량 미분류 지속

```text
requested=46 HTTP=200 returned=0 categoryKeyFilled=0 categoryKeyNull=0

실 판매 전표 라인 fallback:
slip_category_filled=0
```

- ① 실 사용자 경로 재현 여부: 실행 중 실 product-service의 `POST /products/internal/lookup-by-model-codes`에 현재 실 판매 모델코드만 전달해 재현했다. 품목 식별자는 모델코드로만 다뤘고 UUID는 출력·저장하지 않았다.
- ② 재현 명령·출력 원문: `slip_db`에서 모델코드를 `BEGIN READ ONLY`로 읽고, 실행 컨테이너와 같은 `X-Internal-Token` 인증으로 product-service를 호출했다. 출력 원문은 위 블록이다.
- ③ 실 데이터 영향 건수: 정본 매칭 0/46, 정본 `categoryKey` 채움 0/46, 전표 `category_key` fallback 채움 0/46. 따라서 실제 칩 부착 0/46, 미분류 46/46이다.
- 판정: **BLOCK**. 폐기 컬럼 재사용 문제는 아니지만, 실 모델코드가 product 정본에 존재하지 않아 `categoryKey` 복구가 사용자 경로에 도달하지 않는다. 직전 라운드의 “전량 미분류” 결함은 현재 실 집합 46품목 전부에서 그대로 재발한다.

### 확인 3 — 수정 코드의 읽기 전용 실 API 응답: 판매 46행, 전체 61행

공유 Docker는 변경하지 않았다. 현재 워크트리의 slip-service를 별도 포트 `28086`에서 실행했고, JDBC에 `default_transaction_read_only=on`, Flyway/DDL/스케줄러/시드를 비활성화했다.

```text
GET /slips/query/inout-analysis?dateFrom=2026-01-01&dateTo=2026-12-31
HTTP=200 api_rows=61
purchase_null=41 profit_rate_null=56
categoryKey_filled=0 categoryKey_null=61

실 판매 행(outboundQuantity > 0): 46
실 입고 전용 행(outboundQuantity = 0): 15
```

- ① 실 사용자 경로 재현 여부: 수정된 컨트롤러→서비스→실 `slip_db`→실 product-service 경로를 실제 HTTP 호출로 재현했다.
- ② 재현 명령·출력 원문: 위 블록. 공유 배포본 `18086`은 여전히 endpoint 미배포로 HTTP 500이며, 수정 코드 실증은 격리 포트 `28086`에서 수행했다.
- ③ 실 데이터 영향 건수: API 전체 61행, 그중 판매가 있는 행 46, 원가 없는 판매 41, 산정 가능 판매 5. 요구한 40이 아니며 현재 실값은 46이다.
- 판정: 모델코드 lookup 0건이어도 행을 보존하는 수정은 도달했다. 그러나 정찰 수치 40/35는 현재 실 DB와 불일치한다.

### 확인 4 — 원가 없는 실 판매 41품목은 목록에 남고 이익률 null→`—` 분기

```text
API 판매 행: 46
API purchaseAmount=null 판매 행: 41
API profitRate=null 판매 행: 41
FE 변환: purchaseAmount === null ? '—' : <계산값>
```

- ① 실 사용자 경로 재현 여부: 실 API 목록 보존과 null 응답까지 재현했다. FE는 이 실 응답의 `purchaseAmount=null`을 `—`로 변환하는 동일 분기를 사용한다.
- ② 재현 명령·출력 원문: 확인 3의 실제 HTTP 응답 집계와 `inoutAnalysisModel`의 표시 분기를 대조했다.
- ③ 실 데이터 영향 건수: 원가 없는 판매 41/46품목이 목록에 존재하며 이익률 `—` 표시 대상이다. 요구한 35가 아니므로 현재값 41을 보고한다.
- 판정: 행 보존·대시 표시는 수정 경로에 도달한다.

### 확인 5 — 산정 가능 5품목의 API 이익률과 실 DB 손계산 일치

```text
모델코드         입고수량 출고수량  매입총액       판매총액        매입단가   판매단가   손계산    API
TEST-MODEL-0073       7       10   5,796,000    8,280,000       828,000    828,000    0.00%   0.00%
TEST-MODEL-0076       8       18   6,856,000   15,426,000       857,000    857,000    0.00%   0.00%
TEST-MODEL-0080       8       12   7,176,000   10,764,000       897,000    897,000    0.00%   0.00%
TEST-MODEL-0083       9        4   8,343,000    3,708,000       927,000    927,000    0.00%   0.00%
TEST-MODEL-0086      10        6   9,570,000    5,742,000       957,000    957,000    0.00%   0.00%
(5 rows)
```

- ① 실 사용자 경로 재현 여부: 수정 코드 실제 HTTP 응답의 5행과 동일 시점 실 DB 독립 계산을 모델코드로 대조했다.
- ② 재현 명령·출력 원문: `BEGIN READ ONLY` SQL에서 `매입총액/입고수량`, `판매총액/출고수량`, `(판매단가-매입단가)/매입단가×100`을 계산했다. 위 표가 원문 값이다.
- ③ 실 데이터 영향 건수: 산정 가능 5/5품목 모두 손계산 `0.00%`와 API `0.00%`가 일치한다. 직전 라운드의 5/5 불일치는 해소됐다.
- 판정: 단가 기준 이익률 수정은 실 사용자 API 경로에 도달한다.

### 확인 6 — 창고원은 실제 403, 회계원은 실제 200

```text
warehouse_HTTP=403
accounting_HTTP=200 rows=61
```

- ① 실 사용자 경로 재현 여부: 실 `auth_db`의 활성 창고원 계정과 활성 회계원 계정으로 수정 코드 API를 각각 호출해 재현했다.
- ② 재현 명령·출력 원문: 계정 식별자는 메모리에서만 헤더에 사용하고 출력·저장하지 않았다. HTTP 원문 결과는 위 두 줄이다.
- ③ 실 데이터 영향 건수: 창고원 1명은 61행 전부 차단, 회계원 표본 1명은 61행 조회 성공.
- 판정: `accounting.sales-slip.list` 변경은 창고원 차단과 정상 권한자 허용 양쪽 모두 실제 API 경로에 도달한다.

### 확인 7 — `accounting.sales-slip.list` 실 권한 보유자는 활성 계정 20명

```text
그룹       sales_view  stock_view  활성계정
마스터     system      system             2
매니저     true        true               2
영업원     true        false             10
회계원     true        false              6
창고원     false       true               1
재고원     false       true               1
그 외      false       false              6

active_permission_holders=20
```

- ① 실 사용자 경로 재현 여부: 실 권한 DB의 활성 계정·그룹·page permission 결합으로 재현했다.
- ② 재현 명령·출력 원문: `BEGIN READ ONLY`로 `accounts`, `account_groups`, `permission_groups`, `group_page_permissions`를 결합했다. UUID와 로그인 ID는 출력하지 않았다.
- ③ 실 데이터 영향 건수: 정상 조회 대상은 마스터 2, 매니저 2, 영업원 10, 회계원 6으로 총 20명이다. 창고원·재고원 각 1명은 판매전표 권한이 없어 차단된다.
- 판정: 현재 화면의 데이터가 판매금액·이익률을 포함하고 기존 판매전표 조회 경계를 따르므로, 정상 대상 역할(마스터/매니저/영업원/회계원)은 전부 보유 집합에 들어 있다. 권한 축에서 정상 사용자를 새로 막는 도달성은 관측되지 않았다.

### 확인 8 — 숫자 재현 및 desktop 검증

```text
실 DB/API: 판매 46 / 원가 없음 41 / 산정 가능 5 / 전량 원가 충족 2

npm run test -- --run src/renderer/routes/warehouse/inoutAnalysisModel.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)
Exit code: 0

npm run typecheck
typecheck:real-qa tests 2 pass 2 fail 0
real-QA scope tests 50 pass 50 fail 0
Exit code: 0
```

- ① 실 사용자 경로 재현 여부: 실 숫자는 읽기 전용 DB와 수정 API에서, desktop 검증은 지정 명령으로 재현했다.
- ② 재현 명령·출력 원문: 위 블록. typecheck 중 기존 LF→CRLF 경고가 있었으나 exit 0이다.
- ③ 실 데이터 영향 건수: 현재 실 집합은 46/41/5·전량 원가 충족 2다. 요청 정찰값 40/35/5·4 중 산정 가능 5만 일치한다.
- 판정: desktop 모델 테스트 5 passed와 typecheck exit 0은 재현됐다. 실 숫자 40/35·전량 4는 재현되지 않았다.

### 확인 9 — 일시 실증 프로세스 종료

```text
PORT_28086_CLOSED
```

- 공유 Docker 컨테이너는 재빌드·재기동하지 않았다.
- 별도 slip-service는 실증 후 종료했다.
- 실 DB 연결은 `default_transaction_read_only=on`이었고 Flyway/DDL/스케줄러/시드는 비활성화했다.

## 최종 판정

**BLOCK**

1. **R2 — 칩 도달성 0:** 실 판매 모델코드 46개를 모델코드 벌크 lookup해도 product-service 응답은 0건이다. 전표 `category_key` fallback도 0건이어서 칩 부착 0/46, 미분류 46/46이다.
2. **R1 — 요구 숫자 불재현:** 현재 실 DB/API는 판매 46, 원가 없음 41, 산정 가능 5, 전량 원가 충족 2다. 요구 기준 40/35/5·4와 다르다.

해소 확인:

- 수정 API는 실제 HTTP 200으로 행을 보존한다. 판매 46행 중 원가 없는 41행이 목록에 남고 이익률 null→FE `—` 분기에 들어간다.
- 산정 가능 5품목은 실 매입·판매 단가 손계산과 API가 전부 `0.00%`로 일치한다.
- 창고원 실계정은 403, 회계원 실계정은 200이다. 정상 권한 보유 활성 계정은 20명이다.
- desktop 모델 테스트 5 passed, typecheck exit 0이다.

## 이 라운드가 보지 않은 축

- 공유 Docker에 PR #1047 산출물을 배포한 뒤의 동일 endpoint: 재빌드·재기동 금지로 미확인. 대신 현재 워크트리 코드를 별도 읽기 전용 프로세스로 실 DB·실 product-service에 연결해 확인했다.
- Electron 렌더러의 실제 픽셀/DOM 화면: API 실응답, FE 변환·표시 코드, 모델 테스트까지만 확인했다.
- 현재 실 DB에 도달 사례가 없는 0/음수 매입단가, 서로 다른 복수 매입가, 실제 단가 손실 경계.
- 모바일·웹 등 데스크톱 외 클라이언트.
- 구매예측과 검증 품질 평가는 요청에 따라 보지 않았다.
