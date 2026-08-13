# 제품구분(카테고리) 값 유입 경로 정찰

> 조사일: 2026-08-11 11:46:50 KST  
> 대상: PR #1166 워크트리 / 공유 `product_db`  
> 제한 준수: 코드·스키마·git·공유 DB write 없음. 모든 DB 조회는 `PGOPTIONS=-c default_transaction_read_only=on`으로 실행하고 `SHOW default_transaction_read_only`의 `on`을 확인했다.

## 결론 5줄

1. **경로별 채움 여부** — 기초품목 등록·수정은 사용자가 고른 `categoryId`를 그대로 저장하지만, 구글 시트 신규 행은 전부 `INDOOR_WALL(벽걸이형)`, 이카운트 신규·복원 행은 전부 `ECOUNT_MIG2`로 채운다.
2. **MIG-2 버킷 원인** — 1,963건은 카테고리 판정 실패의 우연한 fallback이 아니라 `EcountProductImporter` SQL에 `ECOUNT_MIG2`가 명시된 의도적 고정 버킷이다.
3. **원본 분류 유무·재적재 가능성** — 실제 적재 item 원본에는 `품목구분=[상품]/[무형상품]/[부재료]`만 있었고 품목계층그룹 원본은 0행이었다. 별도 그룹 export를 다시 받을 수는 있지만, 현재 importer는 그것도 `category_group`에만 저장하므로 **현 코드 그대로 재적재해도 `category_id`는 채워지지 않는다**.
4. **시트 덮어쓰기 위험** — 활성 품목의 `category_id`는 시트·이카운트 update SQL이 쓰지 않아 다음 정상 sync/reimport에는 보존된다. 다만 전용 `category_manual` 가드는 없고, soft-delete 뒤 재등장·복원 경로는 각각 `INDOOR_WALL`/`ECOUNT_MIG2`로 초기화되는 경계 위험이 있다.
5. **품목명 자동분류 커버리지** — 현재 실제 분모는 2,982가 아니라 **3,084건**이며, 보수적 명시 키워드 규칙으로 **916건(29.70%)**이 확정 후보, **2,168건(70.30%)**이 애매/미분류다.

## 1. 측정 기준과 분모 정정

PM이 제시한 카테고리별 수 `1,121 + 1,963`의 합은 3,084다. 현재 공유 DB에서도 활성 제품은 3,084건이다. `실외기` 171건과 `실내기` 417건은 재현됐고, `has_variable_discount=true`는 현재 시점에는 741이 아니라 803건이다. 후자는 8월 9~10일 수정 행이 있어 이전 측정과 시점 차이가 있는 것으로 보인다.

실행 SQL 원문:

```sql
SHOW default_transaction_read_only;

SELECT c.code, c.name, count(p.*) AS active_product_count
FROM categories c
LEFT JOIN products p ON p.category_id=c.id AND p.is_deleted=false
WHERE c.is_deleted=false
GROUP BY c.code,c.name
ORDER BY c.name;

SELECT count(*) AS active_products,
       count(*) FILTER (WHERE has_variable_discount=true) AS has_variable_discount_true,
       count(*) FILTER (WHERE cat_l_id IS NULL AND cat_m_id IS NULL AND cat_s_id IS NULL) AS all_lms_null
FROM products
WHERE is_deleted=false;

SELECT count(*) FILTER (WHERE position('실외기' in name)>0) AS outdoor_count,
       count(*) FILTER (WHERE position('실내기' in name)>0) AS indoor_count
FROM products
WHERE is_deleted=false;
```

결과 원문:

```text
default_transaction_read_only
-----------------------------
on

code            name                   active_product_count
--------------- ---------------------- --------------------
CONTROL         계장/제어                                  0
HVAC            공조 (HVAC)                                0
PIPING          배관/부속                                  0
INDOOR_WALL     벽걸이형                                1121
SERVICE         서비스/요금                                0
INDOOR_CEILING  시스템 천장형                              0
INDOOR          실내기                                     0
OUTDOOR         실외기                                     0
ECOUNT_MIG2     이카운트 MIG-2 품목                     1963

active_products  has_variable_discount_true  all_lms_null
---------------  --------------------------  ------------
3084             803                         1963

outdoor_count  indoor_count
-------------  ------------
171            417
```

QA·시더 잔재를 활성 실데이터로 세지 않았는지 확인한 SQL 원문:

```sql
SELECT count(*) FILTER (WHERE is_deleted=false AND created_by IN ('system','qa-seed')) AS active_system_or_qa_seed,
       count(*) FILTER (WHERE is_deleted=false AND created_by LIKE 'qa-%') AS active_qa_prefix,
       count(*) FILTER (WHERE is_deleted=true AND deleted_by='issue-1096-test-seed-cleanup') AS cleaned_test_seed_rows
FROM products;
```

```text
active_system_or_qa_seed  active_qa_prefix  cleaned_test_seed_rows
------------------------  ----------------  ----------------------
0                         0                 101
```

활성행의 생성 일자·생성자와 월별 분포를 별도로 세었다. 1,121건은 `2026-07-28 1,119건 + 2026-08-09 2건`, MIG-2 1,963건은 전부 2026-08-03 생성이다.

실행 SQL 원문:

```sql
SELECT p.created_at::date AS created_date, p.created_by, count(*) AS row_count
FROM products p
WHERE p.is_deleted=false
GROUP BY p.created_at::date,p.created_by
ORDER BY p.created_at::date,p.created_by;

SELECT date_trunc('month',p.created_at) AS created_month, p.created_by, count(*) AS row_count
FROM products p
WHERE p.is_deleted=false
GROUP BY date_trunc('month',p.created_at),p.created_by
ORDER BY created_month,p.created_by;
```

결과 원문:

```text
created_date  created_by                              row_count
------------  --------------------------------------  ---------
2026-07-28    00000000-0000-0000-0000-000000000001       1119
2026-08-03    00000000-0000-0000-0000-000000000001       1963
2026-08-09    a0000000-0000-0000-0000-000000000003          2

created_month       created_by                              row_count
------------------  --------------------------------------  ---------
2026-07-01 00:00:00 00000000-0000-0000-0000-000000000001       1119
2026-08-01 00:00:00 00000000-0000-0000-0000-000000000001       1963
2026-08-01 00:00:00 a0000000-0000-0000-0000-000000000003          2
```

## 2. 카테고리를 채우는 경로 전수

### 2.1 기초품목 등록·수정 화면

화면은 카테고리 트리를 조회해 펼친 뒤 필수 Select로 노출한다.

- `ProductFormPage.tsx:159-163` — `listProductCategories`로 트리를 조회한다.
- `ProductFormPage.tsx:233-236` — 트리를 Select option으로 평탄화한다.
- `ProductFormPage.tsx:554-566` — `카테고리` 필수 Select의 선택값을 `values.categoryId`에 둔다.
- `productFormModel.ts:265-270` — 빈 `categoryId`를 validation error로 막는다.
- `productFormModel.ts:282-300`, `303-315` — 등록·수정 request에 선택한 `categoryId`를 그대로 싣는다.
- `CategoryController.java:41-45`, `CategoryService.java:28-35` — 백엔드는 활성 루트부터 카테고리 트리를 반환한다.
- `ProductService.java:540-564` — 등록 시 `req.categoryId()`로 Category를 조회해 `Product.create`에 넘긴다.
- `ProductService.java:606-611` — 수정 시 요청값이 기존값과 다르면 `product.changeCategory(category)`를 실행한다.

판정: **수동 화면은 정상 채움 경로다. 등록은 필수, 수정은 선택한 실제 카테고리로 변경한다.**

### 2.2 구글 시트 동기화

- `ProductSheetSyncService.java:87-88` — FK 충족용 기본 카테고리를 `INDOOR_WALL`로 고정한다.
- `ProductSheetSyncService.java:110-128` — 탭별로 `ProductCategory`와 `UsageScope`는 다르게 매핑하지만 `category_id` 매핑은 없다.
- `ProductSheetSyncService.java:234-248` — sync 시작 시 `INDOOR_WALL` Category 하나를 읽어 모든 탭에 같은 `defaultCategory`를 전달한다.
- `ProductSheetSyncService.java:1317-1332` — 신규 행은 `Product.seedFromSheet(..., defaultCategory, ...)`로 생성한다.
- `ProductSheetSyncService.java:1363-1386` — ECOUNT 품목이 시트에 나타나면 lineage/name/`productCategory`는 바꾸지만 `category`는 바꾸지 않는다.
- `ProductSheetSyncService.java:1416-1430` — 별도 L/M/S 분류는 `classificationManual`이 아닐 때 자동 갱신한다. 이것은 `products.category_id`와 다른 축이다.
- `ProductSheetSyncService.java:1851-1916` — 품목명·모델코드로 실외기/실내기/벽걸이/전열교환기/판넬/부자재 등 L/M/S를 계산하지만, 계산 결과를 top-level `category_id`에는 연결하지 않는다.

판정: **시트 신규 1,121건이 전부 벽걸이형인 직접 원인이다.** 탭별 `HOME_MULTI`, `SINGLE_SET`, `COMMERCIAL_MULTI`와 L/M/S는 잘 채우면서 top-level category FK만 하나의 기본값을 쓴다.

### 2.3 이카운트 MIG-2 적재

- `EcountProductImporter.java:39-51` — item 원본 헤더에는 `품목구분`, 별도 group 원본에는 `그룹단계/[그룹코드]그룹명`이 있다.
- `EcountProductImporter.java:59-69` — `groupCsv`를 별도 입력으로 받고 품목코드→그룹명 map을 만든다.
- `EcountProductImporter.java:294-311` — group 파일이 없으면 빈 map, 있으면 그룹명을 staging에 넣고 코드별로 읽는다.
- `EcountProductImporter.java:368-388` — 그룹명은 `categoryGroup`과 `productGroup1` parameter로만 전달된다.
- `EcountProductImporter.java:391-405` — 신규 Product의 `category_id`는 무조건 `categories.code='ECOUNT_MIG2'`다.
- `EcountProductImporter.java:407-431` — 활성 product_code 충돌 update 목록에는 `category_id`가 없어 기존 수동 카테고리를 보존한다.
- `EcountProductImporter.java:441-486` — 시트 계보 품목과 병합할 때도 `category_id`를 쓰지 않는다.
- `EcountProductImporter.java:489-534` — 단, soft-delete 품목 복원은 `category_id=ECOUNT_MIG2`로 다시 초기화한다.
- `EcountProductImportController.java:32-47` — HTTP import의 `groupFile`은 선택 입력이다.
- `EcountReimportService.java:48-51`, `459-468`, `488-501` — 자동 재적재도 item/relation/group 동반 파일을 찾아 product-service로 전달한다.
- `EcountProductImporterIT.java:131-145` — 시트 품목과 병합하는 이카운트 import가 기존 category_id를 보존하는 통합테스트가 있다.

판정: **MIG-2 1,963건은 원본을 분류하지 못해 예외적으로 fallback 된 것이 아니라 importer 설계상 항상 버킷으로 들어간 것이다.**

### 2.4 시더와 마이그레이션

- `V2__seed_product_categories.sql:5-12` — HVAC/실내기/실외기/벽걸이형/시스템 천장형/배관·부속의 축만 만든다. Product 행은 만들지 않는다.
- `V7__add_product_aliases_and_ecount_staging.sql:23-25` — `ECOUNT_MIG2` 버킷 축을 추가한다.
- `ProductSeedRunner.java:30-34`, `102-105` — `seed` profile에서도 dry-run 보고만 하며 실제 Product INSERT는 지원하지 않는다.
- `HvacProductSeeder.java:28-41`, `72-75` — 100건 로컬 테스트 시더는 `dev + app.seed-test-data=true` 이중 가드다.
- `HvacProductSeeder.java:183-188` — 테스트 시더는 SeedRow별 category UUID를 쓰며 해당 축이 없을 때만 HVAC 루트로 fallback한다.
- `V31__soft_delete_test_seed_products.sql:126-128` — `created_by IN ('system','qa-seed')` 테스트 제품을 soft-delete한다. 실제 DB에서 정리 대상 101행, 활성 잔재 0행을 확인했다.
- `V28__add_product_lineage.sql:5-26` — 기존 category를 바꾸는 migration이 아니라 현재 bucket을 근거로 ECOUNT/SHEET lineage만 backfill한다.

판정: 운영 Product의 top-level category를 올바르게 대량 채우는 시더·migration 경로는 현재 없다.

## 3. 1,963건 MIG-2 버킷과 원본 분류 정보

### 3.1 실제 적재 원본에 무엇이 있었나

staging은 실제 import 때 받은 원본 행을 보존한다. item 파일 1개 hash에 2,854행이 있고, 품목계층그룹 staging은 0행이다.

실행 SQL 원문:

```sql
SELECT source_file_hash, count(*) AS staged_rows,
       min(imported_at) AS first_imported_at,
       max(imported_at) AS last_imported_at,
       count(*) FILTER (WHERE NULLIF(btrim(raw_item_type),'') IS NOT NULL) AS with_item_type
FROM staging.ecount_item_raw
GROUP BY source_file_hash
ORDER BY last_imported_at, source_file_hash;

SELECT COALESCE(NULLIF(btrim(raw_item_type),''),'[NULL/BLANK]') AS raw_item_type,
       count(*) AS row_count
FROM staging.ecount_item_raw
GROUP BY COALESCE(NULLIF(btrim(raw_item_type),''),'[NULL/BLANK]')
ORDER BY row_count DESC,raw_item_type;

SELECT transform_status,count(*) AS row_count
FROM staging.ecount_item_raw
GROUP BY transform_status
ORDER BY transform_status;

SELECT count(*) AS raw_group_rows
FROM staging.ecount_item_group_raw;

SELECT count(*) AS active_ecount_products_with_category_group
FROM products p JOIN categories c ON c.id=p.category_id
WHERE p.is_deleted=false AND c.code='ECOUNT_MIG2'
  AND NULLIF(btrim(p.category_group),'') IS NOT NULL;
```

결과 원문:

```text
source_file_hash                                                   staged_rows  first_imported_at          last_imported_at           with_item_type
-----------------------------------------------------------------  -----------  -------------------------  -------------------------  --------------
7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678  2854         2026-08-03 20:20:21.66747  2026-08-03 20:20:21.66747  2853

raw_item_type  row_count
-------------  ---------
[상품]         2756
[무형상품]       93
[부재료]          4
[NULL/BLANK]      1

transform_status  row_count
----------------  ---------
REJECT_NAME_NULL  1
UPDATED           2853

raw_group_rows
--------------
0

active_ecount_products_with_category_group
------------------------------------------
0
```

`품목구분`은 HVAC 제품구분이 아니다. importer는 대괄호만 벗겨 `product_business_type`으로 저장한다(`EcountProductImporter.java:719-724`). 활성 MIG-2 1,963건의 값도 `상품 1,878 / 무형상품 85`다. 실외기·실내기 같은 분류 원천이 아니다.

별도 `품목계층그룹-Excel다운로드.csv`는 이카운트에 그런 export 경로가 있음을 코드와 재적재 서비스가 보여준다. 그러나 **이번 실제 import에서는 파일이 전달되지 않았거나 비어 있었고, staging 0행이므로 그룹 값의 내용은 확인할 수 없다.** 따라서 “이카운트 원 시스템에도 분류가 전혀 없었다”고 단정할 수는 없지만, “현재 보존된 실제 적재 원본에는 재사용 가능한 그룹 분류가 없다”는 것은 확정이다.

### 3.2 재적재가 가장 싼 길인가

**현 상태의 단순 재적재는 답이 아니다.** 이유는 두 겹이다.

1. 현재 raw 세트에는 group 원본이 없다.
2. 새 group export를 추가해도 importer는 그룹명을 `category_group/product_group1`에만 저장하고 `category_id`는 계속 `ECOUNT_MIG2`로 쓴다.

가장 싼 후보 경로는 “이카운트에서 최신 품목계층그룹 export를 조회해 실제 값의 유용성을 먼저 판정 → 그룹명↔카테고리 명시 매핑을 정한 뒤 재적재/일괄 반영”이다. 다만 매핑 로직이나 migration 작성은 이번 정찰 범위 밖이며 실행하지 않았다.

## 4. 1,121건 `벽걸이형`은 실제 벽걸이인가

아니다. 전부 `lineage=SHEET`이며 같은 고정 default로 들어갔다. 현재 자체 L/M/S classifier와 품목명만 봐도 혼합 버킷이다.

실행 SQL 원문:

```sql
SELECT count(*) AS indoor_wall_bucket_rows,
       count(*) FILTER (WHERE position('벽걸이' in p.name)>0) AS name_contains_wall,
       count(*) FILTER (WHERE cl.name LIKE '%벽걸이%' OR cm.name='벽걸이') AS classifier_wall,
       count(*) FILTER (WHERE cl.name='실외기') AS classifier_outdoor,
       count(*) FILTER (WHERE cl.name='실내기') AS classifier_indoor,
       count(*) FILTER (
           WHERE cl.name='부자재'
              OR cl.name IN ('판넬','실외기 받침','실외기 받침대')
       ) AS classifier_accessory,
       count(*) FILTER (
           WHERE cl.name IN ('4way 냉난방','4way 냉방전용','1way 냉방전용',
                             '1way 냉난방','360','실링','덕트')
       ) AS classifier_ceiling_family
FROM products p
JOIN categories c ON c.id=p.category_id
LEFT JOIN classification cl ON cl.id=p.cat_l_id
LEFT JOIN classification cm ON cm.id=p.cat_m_id
WHERE p.is_deleted=false AND c.code='INDOOR_WALL';
```

```text
indoor_wall_bucket_rows  name_contains_wall  classifier_wall  classifier_outdoor  classifier_indoor  classifier_accessory  classifier_ceiling_family
-----------------------  ------------------  ---------------  ------------------  -----------------  --------------------  -------------------------
1121                     116                 101              179                 197                127                   159
```

`classifier_*` 열끼리는 업무상 계층/부분집합이 섞일 수 있어 합산 분모로 쓰지 않았다. 이 SQL의 용도는 “1,121건 전부 벽걸이” 가설을 반증하는 것이다. 품목명에 `벽걸이`가 있는 행도 116건(10.35%)뿐이고, 현재 classifier가 벽걸이로 보는 행은 101건(9.01%)이다.

L 분류의 실제 상위 분포도 `가정용 에어컨 223 / 실내기 197 / 실외기 179 / 부자재 86 / 냉난방 스탠드 78 / 4way 냉난방 71 / 냉전 벽걸이 52 / 냉난방 벽걸이 42 ...`로 혼재한다. 즉 `벽걸이형`은 사실값이 아니라 시트 import의 FK 기본값이다.

## 5. 수동 카테고리와 시트 덮어쓰기 보호

### 5.1 다음 정상 sync/reimport

- 화면 수정은 `ProductService.update`에서 `changeCategory`를 실행한다.
- 시트의 기존행 update 블록에는 `changeCategory`가 없다.
- ECOUNT의 active upsert와 SHEET merge update SQL에도 `category_id`가 없다.

따라서 **현재 활성행을 사람이 수정한 뒤 다음 정상 시트 sync 또는 MIG-2 reimport가 실행되는 경우 category_id는 보존된다.** 개발책임자 결정의 핵심 시나리오는 현재 동작상 충족한다.

### 5.2 보호가 명시적 불변식인가

아니다. `usage_scope_manual`, `variable_discount_manual`, `classification_manual`, `fixed_discount_manual`, `bundle_components_manual`은 있지만 `category_manual`은 없다(`Product.java:155-179`, `236-248`). 카테고리는 “자동 update가 아예 쓰지 않는다”는 구현 구조로 보존될 뿐이다.

경계 위험은 다음 두 가지다.

1. 시트 품목이 사라져 soft-delete된 뒤 같은 모델이 재등장하면 신규행 경로를 타며 `INDOOR_WALL`로 생성된다.
2. ECOUNT 품목이 soft-delete된 뒤 importer가 복원하면 `restoreSoftDeletedProduct`가 `ECOUNT_MIG2`로 재설정한다.

즉 **다음 정상 sync에 즉시 날아가는 위험은 없지만, 삭제→재등장/복원에서는 수동 카테고리가 날아갈 수 있다.** 또한 category 보존을 직접 단언하는 시트 sync 통합테스트는 검색되지 않았고, 이카운트 SHEET merge 보존 테스트만 있다.

## 6. 품목명 자동분류 커버리지

### 6.1 판정 규칙

품목명만 사용했다. 모델코드, 현재 잘못 채워진 category_id, L/M/S, `product_business_type`은 자동분류 입력에서 제외했다. 오분류를 줄이기 위해 서비스 → 제어 → 부속 → 실외기 → ERV → 벽걸이 → 천장형 → 기타 실내기 순으로 명시 키워드를 적용했다. 예를 들어 `실외기 받침대`는 실외기가 아니라 부속으로, `벽걸이 리모컨`은 벽걸이가 아니라 제어로 먼저 분류한다.

실행 SQL 원문:

```sql
WITH base AS (
  SELECT p.id,p.name,c.code AS current_bucket,
         lower(regexp_replace(p.name,'[[:space:]]','','g')) AS n
  FROM products p JOIN categories c ON c.id=p.category_id
  WHERE p.is_deleted=false
), classified AS (
  SELECT *,
    CASE
      WHEN n ~ '서비스|수수료|운임|설치비|절삭|철거비|출장비|작업비|시운전비' THEN '서비스/요금'
      WHEN n ~ '리모컨|리모콘|중앙제어|제어기|컨트롤러|와이파이.*키트|wifi.*키트|wi-fi.*키트|통신.*키트|중계기' THEN '계장/제어'
      WHEN n ~ '자재|부자재|받침대|받침|가대|필터|판넬|패널|데코커버|윈드가이드|몰딩|키트|kit|보드|발통|드레인|호스|분기관|배관|배수펌프|냉매관|동관|분배헤더|헤더|커버|케이블|전선|테이프|엘보|소켓|밸브|캡' THEN '배관/부속'
      WHEN n ~ '실외기' THEN '실외기'
      WHEN n ~ '전열교환기|erv' THEN '전열교환기(ERV)'
      WHEN n ~ '벽걸이' THEN '벽걸이형'
      WHEN n ~ '시스템천장형|천장형|카세트|1-?way|4-?way|360cst|실링' THEN '시스템 천장형'
      WHEN n ~ '실내기' THEN '실내기(기타)'
      ELSE '애매/미분류'
    END AS inferred_category
  FROM base
)
SELECT inferred_category,count(*) AS row_count,
       round(count(*)*100.0/sum(count(*)) OVER (),2) AS pct
FROM classified
GROUP BY inferred_category
ORDER BY CASE inferred_category
  WHEN '실외기' THEN 1 WHEN '실내기(기타)' THEN 2 WHEN '전열교환기(ERV)' THEN 3
  WHEN '시스템 천장형' THEN 4 WHEN '벽걸이형' THEN 5 WHEN '배관/부속' THEN 6
  WHEN '계장/제어' THEN 7 WHEN '서비스/요금' THEN 8 ELSE 9 END;
```

결과 원문:

```text
inferred_category  row_count  pct
-----------------  ---------  -----
실외기                    158   5.12
실내기(기타)              205   6.65
전열교환기(ERV)            11   0.36
시스템 천장형             232   7.52
벽걸이형                   78   2.53
배관/부속                 169   5.48
계장/제어                  29   0.94
서비스/요금                34   1.10
애매/미분류              2168  70.30
```

확정 후보 합계는 `158+205+11+232+78+169+29+34 = 916건`, 전체 3,084건의 29.70%다. 현재 버킷별로는 다음과 같다.

```text
current_bucket  inferred_category  row_count
--------------  -----------------  ---------
ECOUNT_MIG2     계장/제어                  5
ECOUNT_MIG2     배관/부속                 39
ECOUNT_MIG2     벽걸이형                   3
ECOUNT_MIG2     서비스/요금               32
ECOUNT_MIG2     실내기(기타)              61
ECOUNT_MIG2     실외기                    40
ECOUNT_MIG2     애매/미분류             1783
INDOOR_WALL     계장/제어                 24
INDOOR_WALL     배관/부속                130
INDOOR_WALL     벽걸이형                  75
INDOOR_WALL     서비스/요금                2
INDOOR_WALL     시스템 천장형            232
INDOOR_WALL     실내기(기타)             144
INDOOR_WALL     실외기                   118
INDOOR_WALL     애매/미분류              385
INDOOR_WALL     전열교환기(ERV)           11
```

### 6.2 애매한 품목명 표본 10건

아래는 동일 SQL의 `애매/미분류` 집합에서 `ORDER BY md5(id::text) LIMIT 10`으로 뽑은 재현 가능한 표본이다. UUID는 출력하지 않았다.

1. `AM180NXVUHH1`
2. `AR09R5173HCN`
3. `AM052KN2DBH1PP`
4. `KU65UC7000FXKR`
5. `질소세척비`
6. `SMN5540`
7. `AF18DX839BZN`
8. `AM100FXVGHC1`
9. `NZ63K1520CK`
10. `PC4NUQK4N`

모델코드형 품목명은 이름만으로 실외기/실내기/천장형을 안전하게 확정할 수 없다. `질소세척비`처럼 사람이 보면 서비스/요금으로 보이는 항목도 현재 보수적 규칙에 없는 표현이다. 규칙을 넓히면 커버리지는 올라가지만 오분류도 함께 늘어난다.

## 7. 채울 수 있는 경로의 비용 순서

이번에는 실행하지 않았으며, 조사 결과로 가능한 경로만 정리한다.

1. **즉시 가능·수동** — 기존 기초품목 수정 화면에서 category를 선택한다. 정상 sync/reimport update에는 보존된다.
2. **가장 싼 대량 후보** — 이카운트 `품목계층그룹` 최신 export를 먼저 조회한다. 그룹값이 실외기/실내기 등과 충분히 일치할 때만 명시 매핑 후 재적재를 검토한다. 현 코드 그대로의 재적재만으로는 불가하다.
3. **보수적 자동분류 + 사람 검수** — 품목명 확정 후보 916건을 먼저 제안하고, 2,168건은 검수 큐로 남긴다. 특히 모델코드형 이름은 기존 시트 탭·모델코드 classifier·이카운트 그룹 같은 추가 근거가 필요하다.
4. **시트 데이터 활용** — 시트 경로는 이미 탭별 ProductCategory와 L/M/S를 계산하므로, top-level category로 승격할 명시 매핑을 설계하면 1,121건의 오버헤드가 가장 작다. 현재는 그 연결 한 줄이 아니라 정책 자체가 빠져 있다.

## 최종 판정

개발책임자 말씀대로 축과 화면은 이미 있다. 값이 비어 있는 근본 원인은 사용자 기능 부재가 아니라 **두 대량 적재 경로가 top-level `category_id`를 업무분류로 변환하지 않고 각각 고정 버킷을 사용한 것**이다. 수동 수정은 정상 반복 sync에는 살아남지만 삭제·복원 경계까지 보장하는 명시적 보호는 아니다. plain 재적재는 해결책이 아니며, 이카운트 그룹 원본 재확보와 명시 매핑 가능성 확인이 다음으로 가장 싼 조사다.
