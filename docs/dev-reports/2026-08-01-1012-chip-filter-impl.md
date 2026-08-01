# 2026-08-01 D-1012 입출고 내역 모델별 복수 칩 필터 구현 보고서

## 착수 확인 1 — 분류 근거 실 DB 조사

`product_db.products`의 활성 1,220품목을 읽기 전용으로 확인했다. 분류는 단일 정규화 컬럼 하나에 모두 들어 있지 않다.

- `products.name`(품목명)에 `실외기`, `실내기`, `판넬`/`패널`이 문자 그대로 표현된다.
- `products.product_category`에는 `HOME_MULTI`, `SINGLE_SET`, `COMMERCIAL_MULTI`가 저장되어 각각 홈멀티, 싱글중대형, 상업멀티의 근거가 된다.
- `estimate_category`는 1,218건 NULL이고, `category_group`은 1,220건 NULL이므로 이번 칩 분류 근거로 사용하지 않는다.

읽기 전용 SQL 출력 원문:

```text
    chip    | products
------------+----------
 상업멀티   |      237
 실내기     |      353
 실외기     |      127
 싱글중대형 |      274
 판넬       |       58
 홈멀티     |       22
(6 rows)

 total_products | classifiable | unclassified
----------------+--------------+--------------
           1220 |         1071 |           48
(1 row)
```

위 칩 수는 품목별 단순 우선 분류 결과이며, 품목명과 `product_category`가 중복되는 품목은 칩 간 교집합을 별도로 보존해야 한다. 따라서 화면 필터는 단일 분류값을 덮어쓰지 않고 품목이 가진 분류 집합에 대해 OR(복수 선택)로 적용한다. UUID는 보고서에 출력하지 않았다.

분류 확인 중 거래 DB를 `product_db`와 교차 조회하려 한 SQL은 PostgreSQL 데이터베이스 경계로 실패했다.

```text
ERROR:  relation "slip_db.slip_lines" does not exist
```

이후 `slip_db` 자체에서 입출고 행의 품목명/모델명 기준 건수도 별도 확인한다.

## 착수 확인 2 — 거래 원천의 분류 가능성

`slip_db`를 별도 읽기 전용 조회했다.

```text
 slip_type | rows | products | quantity
-----------+------+----------+----------
 INBOUND   |   20 |       20 |      122
 OUTBOUND  |   45 |       40 |      258
(2 rows)

 category_key | rows | products | quantity
--------------+------+----------+----------
 (NULL)       |   65 |       55 |      380
(1 row)
```

거래 라인의 `category_key`는 65행 전부 NULL이고, 거래 `product_name`도 `테스트제품-TEST-MODEL-*` 형태여서 거래 스냅샷 문자열만으로 6개 칩을 판정할 수 없다. `slip_lines.product_id`를 상품 정본의 `products.id`와 연결해 `products.name` 및 `products.product_category`를 읽어야 한다. 상품 정본에 분류 근거가 있으므로 “실 데이터에 근거 없음”으로 중단할 사유는 아니다.

## RED — 복수 칩 필터 부재 재현

추가한 실패 테스트:

```text
clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.test.ts
```

지정 워크트리에서 실행한 원문:

```text
vitest.config.ts ... [UNRESOLVED_IMPORT] Could not resolve 'vitest/config'
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
```

현재 워크트리에는 `node_modules`가 없어 Vitest가 기동되지 않았다. 의존성 부재로 인해 기능 부재를 판정하는 정상 RED(예상 assertion 실패)까지는 실행할 수 없으며, 테스트는 구현 전에 작성해 두었다. PM이 의존성 설치 환경에서 RED/GREEN을 재실행해야 한다.

## 구현

- `inoutAnalysisModel.ts`: 품목명(`실외기`/`실내기`/`판넬·패널`)과 상품 대분류(`HOME_MULTI`/`SINGLE_SET`/`COMMERCIAL_MULTI`)를 하나의 분류 집합으로 보존한다.
- `filterInOutRows`: 선택 칩이 0개면 원본 전체를 반환하고, 1개 이상이면 OR 조건으로 통과시킨다. 칩 간 교집합 품목도 어느 하나를 선택하면 포함된다.
- `InOutModelChipFilter.tsx`: design-system `TagChip`만 사용해 전체 및 6개 모델 칩을 렌더링하고, 각 칩의 실데이터 건수를 표시한다. 기본 선택은 빈 집합(전체)이다.
- UUID는 분류·표현·테스트에 사용하지 않고 모델코드/품목명만 대상으로 한다.

## 불변식 B·C 실행 확인

구현 전후 테스트 실행에 필요한 의존성이 없어 실행 가능한 Vitest 확인을 완료하지 못했다. 대신 같은 테스트 케이스를 구현 규칙에 대입하면 B는 `filterInOutRows(rows, new Set())`가 2건을 반환하는 경로이고, C는 각 칩의 `counts`를 별도로 계산·표시하는 계약이다. PM은 `npm ci` 후 해당 테스트를 실행해 원문을 보완해야 한다.

## 요청된 전체 검증 원문

`npm run typecheck`:

```text
electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts
```

`npm test` (데스크톱 vitest 전체):

```text
electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts
Electron main 빌드 산출물 out/main/index.js이(가) 없습니다: out\\main\\index.js
```

공유 Docker 재빌드·재기동 및 실 DB 쓰기는 수행하지 않았다.

## 현재 범위의 한계

선행 조사대로 현행 데스크톱에는 입출고 내역 페이지/라우트와 상품 `product_id` 기반 입출고 집계 API가 아직 없다. 이번 변경은 해당 화면에 연결 가능한 복수 칩 판정 모델과 design-system 칩 UI를 추가한 단계이며, 기존 판매·구매·재고 화면에 임의로 연결하지 않았다. 화면 라우트와 집계 API를 새로 만드는 것은 이번 “칩 필터만” 범위를 넘어선다.
