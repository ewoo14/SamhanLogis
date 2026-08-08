# PR #1119 / Issue #1113 — S20 재고 product 매핑 근거 전수 조사

## 결론

개발책임자 결정(2026-08-08)의 선택지 2를 검토했지만, **현재 활성 product master로 이을 수 있는** 매핑 근거가 확인된 행은 **A 0건**이다.

🚨 S19의 “product DB에 없는 참조 100개” 전제는 **활성 행 기준으로만 참**이다. 이번 SELECT에서 100개 재고 UUID 모두가 `product_db.products`에 `is_deleted=true`인 과거 product 행으로는 남아 있고, `id`·`model_name`이 정확히 일치함을 확인했다. 현재 활성 product master에는 100개가 모두 없다. 이 전제 차이는 고치지 않고 그대로 보고한다.

| 분류 | 건수 | 판정 |
|---|---:|---|
| A 근거가 확실해 1:1로 이을 수 있다 | 0 | 마이그레이션 대상 없음 |
| B 후보가 여럿이라 사람이 골라야 한다 | 0 | 후보 목록 없음 |
| C 현재 활성 master로 이을 근거가 없다 | 100 | 과거 soft-deleted 행은 있으나 활성 target 없음 |

따라서 이번 라운드에는 Flyway 마이그레이션을 만들지 않았다. B·C는 손대지 않았고, DB에는 SELECT만 실행했다. 실행·재시드·INSERT/UPDATE/DELETE·커밋·push를 하지 않았다. soft-deleted 행을 활성화하거나 재사용하는 것은 개발책임자 결정 범위(“현재 product master에 매핑”)와 다른 조치이므로 수행하지 않았다.

## 1. 조사 대상과 원본 UUID 역산

재고 시더의 원본은 다음 파일의 `PRODUCT_MODEL_NAMES` 100개 배열이다.

```text
services/inventory-service/src/main/java/com/samhanair/logis/inventory/seed/StockBalanceSeeder.java
```

시더 코드의 규칙은 다음과 같다.

```java
UUID.nameUUIDFromBytes(
    ("samhan-seed:product:" + modelName).getBytes(StandardCharsets.UTF_8))
```

UUID 자체에서 모델명을 수학적으로 복호화한 것은 아니다. 저장소에 남아 있는 유한한 100개 원본 모델명 각각에 같은 Type-3 UUID 함수를 적용해 `stock_balances.product_id`와 일치시켰다. 100개 모두 재고 UUID와 일치했으므로, 아래 표의 `seed_model_name`은 해당 재고 참조를 만든 시더 원본으로 확정할 수 있다.

## 2. SELECT 원문과 전수 결과

### 2.1 재고 현황

실행한 SQL의 핵심은 다음과 같다. 100개 모델명과 결정적 UUID를 `VALUES`로 만들고, `inventory_db.stock_balances`의 활성 행을 창고별로 조회했다.

```sql
WITH seed(seq, model_name, product_id) AS (VALUES
  -- StockBalanceSeeder.PRODUCT_MODEL_NAMES 100개와
  -- UUID.nameUUIDFromBytes('samhan-seed:product:' || model_name)의 결과
  -- 를 각각 (seq, model_name, product_id)로 넣음
)
SELECT s.seq,s.model_name,s.product_id,
 string_agg(format('%s avail=%s reserved=%s total=%s version=%s',
   w.code,b.available_qty,b.reserved_qty,b.total_qty,b.version),
   ' ; ' ORDER BY w.code) AS stock_by_warehouse
FROM seed s
JOIN stock_balances b ON b.product_id=s.product_id
JOIN warehouses w ON w.id=b.warehouse_id
WHERE b.is_deleted=false
GROUP BY s.seq,s.model_name,s.product_id
ORDER BY s.seq;
```

실행 결과는 100행이며, 각 행은 HQ-001·VH-001 두 창고의 활성 재고를 가진다. 수치는 SQL 결과 원문이다.

| seq | seed_model_name | seed_product_id | stock_by_warehouse |
|---:|---|---|---|
| 1 | AR05TXEAAWKNEU-01 | 01949ab7-e922-35c6-b289-5337d867a0ee | HQ-001 avail=47 reserved=3 total=50 version=3 ; VH-001 avail=63 reserved=0 total=63 version=0 |
| 2 | AR06TXEAAWKNEU-02 | 210c51ce-f07e-3f15-a6ba-84a1f4dd2bf0 | HQ-001 avail=56 reserved=1 total=57 version=1 ; VH-001 avail=70 reserved=0 total=70 version=0 |
| 3 | AR07TXEAAWKNEU-03 | 2e40fa30-10b2-3a9b-a99c-570ac92287ad | HQ-001 avail=62 reserved=2 total=64 version=1 ; VH-001 avail=77 reserved=0 total=77 version=0 |
| 4 | AR09TXEAAWKNEU-04 | d7f488a5-6259-379c-8035-ed551e75a102 | HQ-001 avail=70 reserved=1 total=71 version=1 ; VH-001 avail=84 reserved=0 total=84 version=0 |
| 5 | AR11TXEAAWKNEU-05 | ae339262-7ca9-3f7c-8418-4339e88b3466 | HQ-001 avail=70 reserved=8 total=78 version=3 ; VH-001 avail=91 reserved=0 total=91 version=0 |
| 6 | AR13TXEAAWKNEU-06 | 7550826e-d6d1-3a12-98b1-3e867188c6a9 | HQ-001 avail=83 reserved=2 total=85 version=2 ; VH-001 avail=98 reserved=0 total=98 version=0 |
| 7 | AR15TXEAAWKNEU-07 | d15a3094-1c04-3db3-93da-2e5b50a9bc7a | HQ-001 avail=91 reserved=1 total=92 version=1 ; VH-001 avail=105 reserved=0 total=105 version=0 |
| 8 | AR16TXEAAWKNEU-08 | 4599cfc1-35c1-3a8a-869b-f92f5f125b76 | HQ-001 avail=99 reserved=0 total=99 version=0 ; VH-001 avail=112 reserved=0 total=112 version=0 |
| 9 | AR18TXEAAWKNEU-09 | 13cce07c-8822-3d89-bd3c-dfe04660cf05 | HQ-001 avail=106 reserved=0 total=106 version=0 ; VH-001 avail=119 reserved=0 total=119 version=0 |
| 10 | AR20TXEAAWKNEU-10 | ecc3d7e8-950b-3441-a60f-4b44ce7fbab5 | HQ-001 avail=113 reserved=0 total=113 version=0 ; VH-001 avail=126 reserved=0 total=126 version=0 |
| 11 | AR05TXEAAWKNEU-11 | 80bd3fac-6f65-3c05-8ec5-b1ac8d684b44 | HQ-001 avail=120 reserved=0 total=120 version=0 ; VH-001 avail=133 reserved=0 total=133 version=0 |
| 12 | AR06TXEAAWKNEU-12 | b185b774-d801-34aa-99b5-e2abf5ff0748 | HQ-001 avail=127 reserved=0 total=127 version=0 ; VH-001 avail=140 reserved=0 total=140 version=0 |
| 13 | AR07TXEAAWKNEU-13 | b9ed7fe2-734a-36fe-9e81-45907b92d00a | HQ-001 avail=134 reserved=0 total=134 version=0 ; VH-001 avail=147 reserved=0 total=147 version=0 |
| 14 | AR09TXEAAWKNEU-14 | c6f164a9-fe01-35d7-ae5c-8fb807ee05e7 | HQ-001 avail=141 reserved=0 total=141 version=0 ; VH-001 avail=154 reserved=0 total=154 version=0 |
| 15 | AR11TXEAAWKNEU-15 | ed045c04-8fe4-3cd7-b31d-4ea0a728001a | HQ-001 avail=148 reserved=0 total=148 version=0 ; VH-001 avail=161 reserved=0 total=161 version=0 |
| 16 | AR13TXEAAWKNEU-16 | d03f3161-559e-30cf-968d-5d0b3f6a780b | HQ-001 avail=155 reserved=0 total=155 version=0 ; VH-001 avail=168 reserved=0 total=168 version=0 |
| 17 | AR15TXEAAWKNEU-17 | 17e5da1c-b638-3cc8-a86d-254466a9ee54 | HQ-001 avail=162 reserved=0 total=162 version=0 ; VH-001 avail=175 reserved=0 total=175 version=0 |
| 18 | AR16TXEAAWKNEU-18 | 87c4b0ef-1c9f-3e93-8af0-0ebc88978d40 | HQ-001 avail=169 reserved=0 total=169 version=0 ; VH-001 avail=182 reserved=0 total=182 version=0 |
| 19 | AR18TXEAAWKNEU-19 | 71f0a01b-1d3f-32cc-ae07-b9ccea274466 | HQ-001 avail=176 reserved=0 total=176 version=0 ; VH-001 avail=189 reserved=0 total=189 version=0 |
| 20 | AR20TXEAAWKNEU-20 | 553a8e29-99ab-3ce1-841f-cbf01cfe7aee | HQ-001 avail=183 reserved=0 total=183 version=0 ; VH-001 avail=196 reserved=0 total=196 version=0 |
| 21 | AR05TXEAAWKNEU-21 | b94d18af-ef77-39ca-abf4-7a1afa43ed06 | HQ-001 avail=190 reserved=0 total=190 version=0 ; VH-001 avail=203 reserved=0 total=203 version=0 |
| 22 | AR06TXEAAWKNEU-22 | f5edeecb-7382-36c9-b643-20f51092bbe7 | HQ-001 avail=197 reserved=0 total=197 version=0 ; VH-001 avail=210 reserved=0 total=210 version=0 |
| 23 | AR07TXEAAWKNEU-23 | db0ae185-e1f4-3773-b8d8-39ef8eba5b70 | HQ-001 avail=204 reserved=0 total=204 version=0 ; VH-001 avail=217 reserved=0 total=217 version=0 |
| 24 | AR09TXEAAWKNEU-24 | 8f62c8cf-d312-3d68-af23-a21391f0eff0 | HQ-001 avail=211 reserved=0 total=211 version=0 ; VH-001 avail=224 reserved=0 total=224 version=0 |
| 25 | AR11TXEAAWKNEU-25 | 6bc25996-b322-37ec-8ee6-60a73b6b1120 | HQ-001 avail=218 reserved=0 total=218 version=0 ; VH-001 avail=231 reserved=0 total=231 version=0 |
| 26 | AR13TXEAAWKNEU-26 | 9a9dd245-c03e-3264-873d-e72596e8cb60 | HQ-001 avail=225 reserved=0 total=225 version=0 ; VH-001 avail=238 reserved=0 total=238 version=0 |
| 27 | AR15TXEAAWKNEU-27 | 565cc5d3-85af-3b9f-870d-0f3bd6c4dc76 | HQ-001 avail=232 reserved=0 total=232 version=0 ; VH-001 avail=245 reserved=0 total=245 version=0 |
| 28 | AR16TXEAAWKNEU-28 | 97307209-a471-3c5e-8717-3459bc23e40b | HQ-001 avail=239 reserved=0 total=239 version=0 ; VH-001 avail=252 reserved=0 total=252 version=0 |
| 29 | AR18TXEAAWKNEU-29 | c9e2752d-ca12-32bc-9397-12eaff083511 | HQ-001 avail=246 reserved=0 total=246 version=0 ; VH-001 avail=259 reserved=0 total=259 version=0 |
| 30 | AR20TXEAAWKNEU-30 | 64677bfa-f4ae-3c84-9afc-ce9131184f63 | HQ-001 avail=253 reserved=0 total=253 version=0 ; VH-001 avail=266 reserved=0 total=266 version=0 |
| 31 | AF15BX1NWAEAH-31 | 7da82639-4494-3ba3-a18a-c5ec19db7534 | HQ-001 avail=260 reserved=0 total=260 version=0 ; VH-001 avail=273 reserved=0 total=273 version=0 |
| 32 | AF17BX1NWAEAH-32 | 50813e5b-f6e4-36d0-8ebb-f2507f248dcb | HQ-001 avail=267 reserved=0 total=267 version=0 ; VH-001 avail=280 reserved=0 total=280 version=0 |
| 33 | AF18BX1NWAEAH-33 | df53ced3-439d-3237-80f2-45f57a00cbfb | HQ-001 avail=274 reserved=0 total=274 version=0 ; VH-001 avail=287 reserved=0 total=287 version=0 |
| 34 | AF20BX1NWAEAH-34 | d0e9c52b-942f-3ffb-8c69-9b790ccf4d3c | HQ-001 avail=281 reserved=0 total=281 version=0 ; VH-001 avail=294 reserved=0 total=294 version=0 |
| 35 | AF23BX1NWAEAH-35 | 03786abc-0185-3f34-a4d5-af787bc5bfd2 | HQ-001 avail=288 reserved=0 total=288 version=0 ; VH-001 avail=301 reserved=0 total=301 version=0 |
| 36 | AF25BX1NWAEAH-36 | d7fd042d-6d04-303c-88fc-fe50a326e221 | HQ-001 avail=295 reserved=0 total=295 version=0 ; VH-001 avail=308 reserved=0 total=308 version=0 |
| 37 | AF26BX1NWAEAH-37 | fb2619be-80d3-3da0-a4cf-4601fbf7e88a | HQ-001 avail=302 reserved=0 total=302 version=0 ; VH-001 avail=315 reserved=0 total=315 version=0 |
| 38 | AF30BX1NWAEAH-38 | a698ab4f-45ba-30a3-b906-89023551d00f | HQ-001 avail=309 reserved=0 total=309 version=0 ; VH-001 avail=322 reserved=0 total=322 version=0 |
| 39 | AF15BX1NWAEAH-39 | 76db0149-839d-35de-a96f-5d17bf0dac80 | HQ-001 avail=316 reserved=0 total=316 version=0 ; VH-001 avail=329 reserved=0 total=329 version=0 |
| 40 | AF17BX1NWAEAH-40 | 91974980-4d19-350d-8320-c479be95f6e0 | HQ-001 avail=323 reserved=0 total=323 version=0 ; VH-001 avail=336 reserved=0 total=336 version=0 |
| 41 | AF18BX1NWAEAH-41 | c5774020-04ce-3874-92cf-c95413897e43 | HQ-001 avail=330 reserved=0 total=330 version=0 ; VH-001 avail=343 reserved=0 total=343 version=0 |
| 42 | AF20BX1NWAEAH-42 | 01a174a8-bc74-30f0-b729-67bf87d6610b | HQ-001 avail=337 reserved=0 total=337 version=0 ; VH-001 avail=350 reserved=0 total=350 version=0 |
| 43 | AF23BX1NWAEAH-43 | e5867f26-8e85-39bc-a440-cac0621398b4 | HQ-001 avail=344 reserved=0 total=344 version=0 ; VH-001 avail=357 reserved=0 total=357 version=0 |
| 44 | AF25BX1NWAEAH-44 | 2ec35099-ebd1-3234-9bc2-c84e8fecde1a | HQ-001 avail=351 reserved=0 total=351 version=0 ; VH-001 avail=364 reserved=0 total=364 version=0 |
| 45 | AF26BX1NWAEAH-45 | 39ad50ea-2aea-3a3a-8032-62bdcb4de4eb | HQ-001 avail=358 reserved=0 total=358 version=0 ; VH-001 avail=371 reserved=0 total=371 version=0 |
| 46 | AF30BX1NWAEAH-46 | ecd40587-b0ba-396d-9d1d-b3154d8d52d4 | HQ-001 avail=365 reserved=0 total=365 version=0 ; VH-001 avail=378 reserved=0 total=378 version=0 |
| 47 | AF15BX1NWAEAH-47 | 02c6c679-1743-35c3-9b08-d4c87979dddb | HQ-001 avail=372 reserved=0 total=372 version=0 ; VH-001 avail=385 reserved=0 total=385 version=0 |
| 48 | AF17BX1NWAEAH-48 | 4b54cdd6-14cf-3139-ab17-614e71c3e73f | HQ-001 avail=379 reserved=0 total=379 version=0 ; VH-001 avail=392 reserved=0 total=392 version=0 |
| 49 | AF18BX1NWAEAH-49 | 2c7873b8-c085-372b-992b-287e08855d40 | HQ-001 avail=386 reserved=0 total=386 version=0 ; VH-001 avail=399 reserved=0 total=399 version=0 |
| 50 | AF20BX1NWAEAH-50 | e35ae4a5-0505-36a1-bbf2-b2abea094b8a | HQ-001 avail=391 reserved=2 total=393 version=2 ; VH-001 avail=406 reserved=0 total=406 version=0 |
| 51 | AM030BNNDEH-51 | 51e16f88-98ce-359c-b4e5-c6641325c5bd | HQ-001 avail=397 reserved=3 total=400 version=2 ; VH-001 avail=413 reserved=0 total=413 version=0 |
| 52 | AM040BNNDEH-52 | 89fbb6de-2c36-3ebe-96f7-4dd832bf5300 | HQ-001 avail=407 reserved=0 total=407 version=0 ; VH-001 avail=420 reserved=0 total=420 version=0 |
| 53 | AM050BNNDEH-53 | a2d7fde5-88b7-3cca-8771-264f16b1199b | HQ-001 avail=414 reserved=0 total=414 version=0 ; VH-001 avail=427 reserved=0 total=427 version=0 |
| 54 | AM060BNNDEH-54 | 31897a51-efeb-300b-afb7-1ae61280ae87 | HQ-001 avail=421 reserved=0 total=421 version=0 ; VH-001 avail=434 reserved=0 total=434 version=0 |
| 55 | AM070BNNDEH-55 | f7e7bee0-cad2-3003-ab2c-908fd6c8ff4f | HQ-001 avail=428 reserved=0 total=428 version=0 ; VH-001 avail=441 reserved=0 total=441 version=0 |
| 56 | AM080BNNDEH-56 | 78ba4426-b711-340d-ab87-3374c9085b57 | HQ-001 avail=435 reserved=0 total=435 version=0 ; VH-001 avail=448 reserved=0 total=448 version=0 |
| 57 | AM100BNNDEH-57 | a9d88f27-98af-3009-8e1f-3d9a390c41f4 | HQ-001 avail=442 reserved=0 total=442 version=2 ; VH-001 avail=455 reserved=0 total=455 version=0 |
| 58 | AM120BNNDEH-58 | 7e55e54f-b757-3d5b-8d4f-661084b2a88e | HQ-001 avail=449 reserved=0 total=449 version=0 ; VH-001 avail=462 reserved=0 total=462 version=0 |
| 59 | AM140BNNDEH-59 | 50221b31-ef85-3faf-9cfa-5d09e858a9ca | HQ-001 avail=456 reserved=0 total=456 version=0 ; VH-001 avail=469 reserved=0 total=469 version=0 |
| 60 | AM160BNNDEH-60 | 09367b6e-b597-39fc-8c56-d23a1f9e96bc | HQ-001 avail=463 reserved=0 total=463 version=0 ; VH-001 avail=476 reserved=0 total=476 version=0 |
| 61 | AM180BNNDEH-61 | f4caddce-cb1c-3b77-9541-633efe248c6a | HQ-001 avail=470 reserved=0 total=470 version=0 ; VH-001 avail=483 reserved=0 total=483 version=0 |
| 62 | AM200BNNDEH-62 | 9dc444ac-aaff-3143-b266-85977b505d86 | HQ-001 avail=477 reserved=0 total=477 version=0 ; VH-001 avail=490 reserved=0 total=490 version=0 |
| 63 | AM220BNNDEH-63 | 3bb183d2-edf6-3967-9fc8-d604bf721f22 | HQ-001 avail=484 reserved=0 total=484 version=0 ; VH-001 avail=497 reserved=0 total=497 version=0 |
| 64 | AM030BNNDEH-64 | 198b917b-e26b-39dc-8db4-53b4c3fb4098 | HQ-001 avail=491 reserved=0 total=491 version=2 ; VH-001 avail=33 reserved=0 total=33 version=0 |
| 65 | AM040BNNDEH-65 | ead3297d-8dcc-3b2a-8589-17216d679491 | HQ-001 avail=498 reserved=0 total=498 version=8 ; VH-001 avail=40 reserved=0 total=40 version=0 |
| 66 | AM050BNNDEH-66 | 87245769-c0aa-36e9-a10d-8e826dd7e1f9 | HQ-001 avail=34 reserved=0 total=34 version=0 ; VH-001 avail=47 reserved=0 total=47 version=0 |
| 67 | AM060BNNDEH-67 | 98f09b10-5f3c-3e10-9fb3-0744c7a28a96 | HQ-001 avail=41 reserved=0 total=41 version=0 ; VH-001 avail=54 reserved=0 total=54 version=0 |
| 68 | AM070BNNDEH-68 | 0e383a3c-06eb-3d4b-9455-5f4c10de7ea7 | HQ-001 avail=48 reserved=0 total=48 version=0 ; VH-001 avail=61 reserved=0 total=61 version=0 |
| 69 | AM080BNNDEH-69 | ae0f223f-87e1-3004-b6b8-869794a8c68c | HQ-001 avail=55 reserved=0 total=55 version=0 ; VH-001 avail=68 reserved=0 total=68 version=0 |
| 70 | AM100BNNDEH-70 | 2cd7f9a5-f139-37dc-9d59-c624f9b4fc64 | HQ-001 avail=62 reserved=0 total=62 version=0 ; VH-001 avail=75 reserved=0 total=75 version=0 |
| 71 | AM120BNNDEH-71 | 678d5932-a886-34e8-baad-06fe0a753288 | HQ-001 avail=69 reserved=0 total=69 version=0 ; VH-001 avail=82 reserved=0 total=82 version=0 |
| 72 | AM140BNNDEH-72 | 2c3886d8-f77e-3e07-81c9-d7205dcbb44b | HQ-001 avail=76 reserved=0 total=76 version=0 ; VH-001 avail=89 reserved=0 total=89 version=0 |
| 73 | AM160BNNDEH-73 | c5858a82-f634-3f51-9431-f86271c58ac8 | HQ-001 avail=83 reserved=0 total=83 version=0 ; VH-001 avail=96 reserved=0 total=96 version=0 |
| 74 | AM180BNNDEH-74 | 37db1dd8-862a-39b3-ae29-cacc2f67da45 | HQ-001 avail=90 reserved=0 total=90 version=0 ; VH-001 avail=103 reserved=0 total=103 version=0 |
| 75 | AM200BNNDEH-75 | 6c70e584-4e7c-38fd-85be-28c047f38fcb | HQ-001 avail=97 reserved=0 total=97 version=0 ; VH-001 avail=110 reserved=0 total=110 version=0 |
| 76 | AC100CNCDEH-76 | 508ffc15-4ebe-363e-a395-389ba0d6b6a7 | HQ-001 avail=96 reserved=8 total=104 version=3 ; VH-001 avail=117 reserved=0 total=117 version=0 |
| 77 | AC200CNCDEH-77 | a6992eb0-81fc-3b3d-957b-7accfe06288c | HQ-001 avail=111 reserved=0 total=111 version=0 ; VH-001 avail=124 reserved=0 total=124 version=0 |
| 78 | AC300CNCDEH-78 | 841e6a99-06fe-3252-8a4f-5227de864a62 | HQ-001 avail=118 reserved=0 total=118 version=0 ; VH-001 avail=131 reserved=0 total=131 version=0 |
| 79 | AC400CNCDEH-79 | e47852ff-2ea7-39e4-90d3-1cc0ea6ebfa1 | HQ-001 avail=125 reserved=0 total=125 version=0 ; VH-001 avail=138 reserved=0 total=138 version=0 |
| 80 | AC500CNCDEH-80 | 384c8baa-2755-3902-9131-799b1bf79832 | HQ-001 avail=132 reserved=0 total=132 version=0 ; VH-001 avail=145 reserved=0 total=145 version=0 |
| 81 | AC600CNCDEH-81 | 6f3e996f-96dd-3f38-8a9c-704ff462495a | HQ-001 avail=139 reserved=0 total=139 version=0 ; VH-001 avail=152 reserved=0 total=152 version=0 |
| 82 | AC700CNCDEH-82 | 5ebf6916-1127-3091-821b-34a4faf15af4 | HQ-001 avail=146 reserved=0 total=146 version=0 ; VH-001 avail=159 reserved=0 total=159 version=0 |
| 83 | AC800CNCDEH-83 | 71a65c6a-3a15-37a7-8c67-4b0de18e92a4 | HQ-001 avail=153 reserved=0 total=153 version=0 ; VH-001 avail=166 reserved=0 total=166 version=0 |
| 84 | AC900CNCDEH-84 | 5a504cc7-5343-3650-ac34-49003d649d1a | HQ-001 avail=160 reserved=0 total=160 version=0 ; VH-001 avail=173 reserved=0 total=173 version=0 |
| 85 | AC1000CNCDEH-85 | d35ab633-c3db-3187-acb0-b19262eb5fae | HQ-001 avail=167 reserved=0 total=167 version=0 ; VH-001 avail=180 reserved=0 total=180 version=0 |
| 86 | AX17B17NNDB-86 | 367a48d3-0af8-3996-aafb-e80b4dcf3bf3 | HQ-001 avail=174 reserved=0 total=174 version=0 ; VH-001 avail=187 reserved=0 total=187 version=0 |
| 87 | AX23B23NNDB-87 | 5b586178-5bbc-329c-9309-f2773910f8ec | HQ-001 avail=181 reserved=0 total=181 version=0 ; VH-001 avail=194 reserved=0 total=194 version=0 |
| 88 | AX30B30NNDB-88 | 3dc9ea39-8bc3-3a60-8dd5-c4bb4d499049 | HQ-001 avail=188 reserved=0 total=188 version=0 ; VH-001 avail=201 reserved=0 total=201 version=0 |
| 89 | AX35B35NNDB-89 | e8efe136-b12f-3b6b-9d08-771196214089 | HQ-001 avail=195 reserved=0 total=195 version=0 ; VH-001 avail=208 reserved=0 total=208 version=0 |
| 90 | AX40B40NNDB-90 | 6b86e35b-4912-386f-8636-92453aa064d1 | HQ-001 avail=202 reserved=0 total=202 version=0 ; VH-001 avail=215 reserved=0 total=215 version=0 |
| 91 | AX50B50NNDB-91 | 273a5596-53d8-348a-8ac4-478e75124063 | HQ-001 avail=209 reserved=0 total=209 version=0 ; VH-001 avail=222 reserved=0 total=222 version=0 |
| 92 | AX60B60NNDB-92 | 47953963-4b68-3085-86d3-38c822f3702c | HQ-001 avail=216 reserved=0 total=216 version=0 ; VH-001 avail=229 reserved=0 total=229 version=0 |
| 93 | AX75B75NNDB-93 | 2b3977b8-1ad3-320f-a247-f57e44fb55ac | HQ-001 avail=223 reserved=0 total=223 version=0 ; VH-001 avail=236 reserved=0 total=236 version=0 |
| 94 | AX90B90NNDB-94 | b2799515-dea3-3759-88a9-ed85205e9585 | HQ-001 avail=230 reserved=0 total=230 version=0 ; VH-001 avail=243 reserved=0 total=243 version=0 |
| 95 | AX100B100NNDB-95 | e46cece2-ca40-3e81-8121-9b76a396d678 | HQ-001 avail=237 reserved=0 total=237 version=0 ; VH-001 avail=250 reserved=0 total=250 version=0 |
| 96 | PIPE-CU-15A | 9baffe53-4593-3a56-bbc9-129da0550391 | HQ-001 avail=244 reserved=0 total=244 version=0 ; VH-001 avail=257 reserved=0 total=257 version=0 |
| 97 | PIPE-CU-22A | 7bf268ec-9565-38a5-9bd3-7163933b1970 | HQ-001 avail=251 reserved=0 total=251 version=0 ; VH-001 avail=264 reserved=0 total=264 version=0 |
| 98 | INSUL-T20 | f5b526e0-7d62-3829-8811-cac9e68e5a3b | HQ-001 avail=258 reserved=0 total=258 version=6 ; VH-001 avail=271 reserved=0 total=271 version=0 |
| 99 | REMOTE-MR-DH00 | 25e9c490-21df-3b32-9b27-d45c57c4c4c6 | HQ-001 avail=264 reserved=1 total=265 version=1 ; VH-001 avail=278 reserved=0 total=278 version=0 |
| 100 | COMM-MIM-N10 | 0fdcd680-d002-3ee4-a397-0d0eae1af8fb | HQ-001 avail=272 reserved=0 total=272 version=0 ; VH-001 avail=285 reserved=0 total=285 version=0 |

이 표의 수량은 `StockBalanceSeeder.computeQuantity(productSeq, warehouseSeq)`의 결정적 분포와 일치한다. 이는 재고 참조가 해당 시더에서 생성됐다는 근거이지, 현재 product master의 어느 행인지 알려주는 매핑 근거는 아니다. `products`에는 창고별 수량 축이 없으므로 warehouse + quantity로 product 행을 식별할 수도 없다.

### 2.2 후보 키 전수 대조

`product_db.products` 활성 3,083행을 대상으로 다음 키를 모두 시도했다.

1. 원문 정확 일치: `products.model_name`, `products.name`, `products.model_code`.
2. `lower(trim(value))` 일치: 대소문자와 양 끝 공백만 무시.
3. `regexp_replace(lower(value), '[[:space:]-]', '', 'g')` 일치: 대소문자를 무시하고 모든 공백과 하이픈을 제거.
4. 추가 점검으로 하이픈 앞 prefix가 `model_name`, `model_code`, `product_code`의 시작과 일치하는지 조회.

실행한 SQL의 후보 판정 부분은 다음과 같다.

```sql
count(p.id) FILTER (WHERE
  p.model_name=s.model_name OR p.name=s.model_name OR p.model_code=s.model_name
) AS exact_any,
count(p.id) FILTER (WHERE
  lower(trim(p.model_name))=lower(trim(s.model_name))
  OR lower(trim(p.name))=lower(trim(s.model_name))
  OR lower(trim(p.model_code))=lower(trim(s.model_name))
) AS trim_lower_any,
count(p.id) FILTER (WHERE
  regexp_replace(lower(coalesce(p.model_name,'')),'[[:space:]-]','','g')=
    regexp_replace(lower(s.model_name),'[[:space:]-]','','g')
  OR regexp_replace(lower(coalesce(p.name,'')),'[[:space:]-]','','g')=
    regexp_replace(lower(s.model_name),'[[:space:]-]','','g')
  OR regexp_replace(lower(coalesce(p.model_code,'')),'[[:space:]-]','','g')=
    regexp_replace(lower(s.model_name),'[[:space:]-]','','g')
) AS remove_space_hyphen_any
```

활성 행 기준 결과는 `exact_any=0`, `trim_lower_any=0`, `remove_space_hyphen_any=0`, `prefix_any=0`이 100개 모든 모델에서 동일했다. 즉 정규화 기준을 바꿔도 활성 후보 결과 차이는 없었다. 전례처럼 하나의 정규화 기준 때문에 그룹 수가 줄어드는 현상은 이번 표본에서 발생하지 않았다.

| 기준 | 활성 후보 product 행 수 | 결과 |
|---|---:|---|
| 원문 정확 일치: model_name/name/model_code | 0 | 100개 모두 불일치 |
| lower + trim: model_name/name/model_code | 0 | 100개 모두 불일치 |
| lower + 모든 공백·하이픈 제거: model_name/name/model_code | 0 | 100개 모두 불일치 |
| 하이픈 앞 prefix: model_name/model_code/product_code | 0 | 추가 후보 없음 |

따라서 B 후보 목록은 존재하지 않는다. 현재 `product_db`의 활성 행으로는 100개 모두 C이다. 다만 별도 SELECT에서 100개 모두에 대해 `products.id = stock_balances.product_id`, `products.model_name = seed_model_name`, `products.is_deleted=true`인 과거 행을 확인했다. 이 100건은 “원래 어떤 product였는가”를 증명하는 provenance이지만, 현재 활성 target UUID를 제공하지 않으므로 A 매핑 근거가 아니다.

```text
all_products=3221 · active_products=3083 · deleted_products=138
active_exact_candidates=0 · deleted_exact_candidates=100
active_normalized_candidates=0 · deleted_normalized_candidates=100
```

## 3. 실제 행 원문 2건씩 나란히

아래는 각각 별도 DB에서 실행한 SELECT의 실제 결과 2행이다. 첫 표는 현재 활성 product master의 실제 첫 2행이고, 둘째 표는 이번에 확인한 soft-deleted provenance 행 2건이다.

| 재고 쪽 `inventory_db.stock_balances` | 현재 활성 product 쪽 `product_db.products` |
|---|---|
| `product_id=01949ab7-e922-35c6-b289-5337d867a0ee`, `warehouse_id=11111111-1111-1111-1111-000000000001`, `available_qty=47`, `reserved_qty=3`, `total_qty=50`, `version=3`, `created_at=2026-05-31 00:26:16.248758`, `created_by=system`, `is_deleted=f` | `id=6fd28b44-f8e5-4e9d-96ba-d4b9ce9fac89`, `name=실외기_6HP 단배관`, `model_name=AJ060MXHNBC1`, `model_code=AJ060MXHNBC1`, `product_code=AJ060MXHNBC1`, `created_at=2026-07-28 20:33:33.60539`, `created_by=00000000-0000-0000-0000-000000000001`, `is_deleted=f` |
| `product_id=01949ab7-e922-35c6-b289-5337d867a0ee`, `warehouse_id=11111111-1111-1111-1111-000000000002`, `available_qty=63`, `reserved_qty=0`, `total_qty=63`, `version=0`, `created_at=2026-05-31 00:26:16.254936`, `created_by=system`, `is_deleted=f` | `id=61ff7832-7cc7-4b86-a349-bf2e1c82bbc0`, `name=실외기_5HP 단배관`, `model_name=AJ050MXHNBC1`, `model_code=AJ050MXHNBC1`, `product_code=AJ050MXHNBC1`, `created_at=2026-07-28 20:33:33.7219`, `created_by=00000000-0000-0000-0000-000000000001`, `is_deleted=f` |

| 재고 쪽 `inventory_db.stock_balances` | soft-deleted provenance 쪽 `product_db.products` |
|---|---|
| `product_id=01949ab7-e922-35c6-b289-5337d867a0ee`, `warehouse_id=11111111-1111-1111-1111-000000000001`, `available_qty=47`, `reserved_qty=3`, `total_qty=50`, `version=3`, `created_at=2026-05-31 00:26:16.248758`, `created_by=system`, `is_deleted=f` | `id=01949ab7-e922-35c6-b289-5337d867a0ee`, `name=삼성 윈드프리 5평형`, `model_name=AR05TXEAAWKNEU-01`, `model_code=NULL`, `product_code=010001`, `created_at=2026-05-31 00:45:23.419686`, `created_by=system`, `is_deleted=t` |
| `product_id=01949ab7-e922-35c6-b289-5337d867a0ee`, `warehouse_id=11111111-1111-1111-1111-000000000002`, `available_qty=63`, `reserved_qty=0`, `total_qty=63`, `version=0`, `created_at=2026-05-31 00:26:16.254936`, `created_by=system`, `is_deleted=f` | `id=210c51ce-f07e-3f15-a6ba-84a1f4dd2bf0`, `name=삼성 윈드프리 6평형`, `model_name=AR06TXEAAWKNEU-02`, `model_code=NULL`, `product_code=010002`, `created_at=2026-05-31 00:45:23.431661`, `created_by=system`, `is_deleted=t` |

재고 두 행은 같은 단절 product UUID의 창고별 행이다. 오른쪽 첫 표의 활성 master 두 행은 후보가 아니다. 둘째 표의 soft-deleted 행은 UUID와 모델명이 정확히 일치하지만, `is_deleted=t`이므로 현재 master target이 아니다.

## 4. 실행 금지 및 파일 상태

- Flyway 파일명/버전: **작성하지 않음**. A=0이므로 요청 규칙에 따라 마이그레이션을 만들지 않았다.
- 이번 라운드 신규 파일: `docs/dev-reports/2026-08-08-1113-s20-inventory-product-mapping.md` 1개.
- DB 변경: 없음. 공유 Docker 스택 재기동: 없음.
- 다음 조치: 이 보고서를 검토한 뒤, S19 전제의 정정(“product DB에 없음”이 아니라 “활성 product master에 없음”)과 현재 증거만으로는 기존 재고를 현재 활성 product master에 매핑할 수 없다는 사실을 개발책임자께 보고해야 한다. 추가 원본 product master, 교체 전 DB 백업, 또는 별도 업무 식별자가 확보되기 전에는 C 100건을 migration으로 변경하면 안 된다.
