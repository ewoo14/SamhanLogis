# #1051 전표-품목 연결 전수 감사

## 조사 시점

- 조사 시각: 2026-08-04 10:13:33.421437 (Asia/Seoul, DB 서버 기준)
- `product_db` Flyway 최고 버전: V30 (`preserve legacy product codes as aliases`)
- 전표 총 건수: 127건 (QA 포함 전체 행, OUTBOUND 126 / INBOUND 1)
- 기준: 2026-08-04 이카운트 임포트 완료 후 실 데이터
- 제약: 읽기 전용 SQL만 사용. 코드·DB·git·서비스·테스트 변경 없음.

## 조사 로그와 SQL 원문

> 이 절에는 각 확인 직후 실행 명령과 출력 원문을 축약 없이 순서대로 붙인다.

### 1. `product_db` 조사 기준점

명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d product_db -c "BEGIN READ ONLY; SELECT current_timestamp AT TIME ZONE 'Asia/Seoul' AS investigated_at_kst; SELECT installed_rank, version, description, success FROM flyway_schema_history WHERE success IS TRUE ORDER BY installed_rank DESC LIMIT 1; SELECT COUNT(*) AS products_all_rows, COUNT(*) FILTER (WHERE deleted_at IS NULL) AS products_not_soft_deleted, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS products_soft_deleted FROM products; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 0.9 seconds
Output:
BEGIN
    investigated_at_kst     
----------------------------
 2026-08-04 10:13:33.421437
(1 row)

 installed_rank | version |               description                | success 
----------------+---------+------------------------------------------+---------
             30 | 30      | preserve legacy product codes as aliases | t
(1 row)

 products_all_rows | products_not_soft_deleted | products_soft_deleted 
-------------------+---------------------------+-----------------------
              3063 |                      3061 |                     2
(1 row)

COMMIT

```

해석:

- V30까지 성공 적용됐다.
- 현재 `products`는 전체 3,063행, soft delete 제외 3,061행, soft delete 2행이다.
- 핸드오프에 기록된 3,183건과 현재 컨테이너 실측 3,063건은 120건 차이다. 이후 모든 계수는 이 조사 시점의 3,063행을 기준으로 한다.
+### 2. `slip_db` 테이블 목록

명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d slip_db -c "BEGIN READ ONLY; SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 1 seconds
Output:
BEGIN
          table_name          
------------------------------
 delivery_batches
 dispatch_collab_comments
 dispatch_collab_suggestions
 dispatch_matched_driver
 dispatch_task
 dispatch_vehicle_group
 dispatch_vehicle_group_slip
 estimate_collab_comments
 estimate_collab_suggestions
 estimate_lines
 estimate_number_sequences
 estimate_revisions
 estimates
 external_carrier
 external_dispatch
 external_dispatch_slip
 flyway_schema_history
 partner_product_price_memory
 quote_snapshots
 serial_compensation_failures
 slip_attachments
 slip_audit_logs
 slip_cleanup_save_history
 slip_collab_comments
 slip_collab_suggestions
 slip_comments
 slip_edit_requests
 slip_line_correction_audits
 slip_lines
 slip_number_sequences
 slip_outbound_cutoff
 slip_publish_audit
 slip_revisions
 slip_signature_audit
 slip_source_orders
 slips
(36 rows)

COMMIT

```

전표 본체와 라인은 각각 `slips`, `slip_lines`임을 확인했다.
+### 3. 전표·라인 컬럼 구조

명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d slip_db -c "BEGIN READ ONLY; SELECT table_name, ordinal_position, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('slips', 'slip_lines') ORDER BY table_name, ordinal_position; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 0.8 seconds
Output:
BEGIN
 table_name | ordinal_position |              column_name              |          data_type          | is_nullable 
------------+------------------+---------------------------------------+-----------------------------+-------------
 slip_lines |                1 | id                                    | uuid                        | NO
 slip_lines |                2 | slip_id                               | uuid                        | NO
 slip_lines |                3 | product_id                            | uuid                        | NO
 slip_lines |                4 | product_name                          | character varying           | NO
 slip_lines |                5 | model_name                            | character varying           | YES
 slip_lines |                6 | quantity                              | integer                     | NO
 slip_lines |                7 | unit_price                            | numeric                     | NO
 slip_lines |                8 | line_total                            | numeric                     | NO
 slip_lines |                9 | note                                  | character varying           | YES
 slip_lines |               10 | created_at                            | timestamp without time zone | NO
 slip_lines |               11 | created_by                            | character varying           | NO
 slip_lines |               12 | modified_at                           | timestamp without time zone | YES
 slip_lines |               13 | modified_by                           | character varying           | YES
 slip_lines |               14 | deleted_at                            | timestamp without time zone | YES
 slip_lines |               15 | deleted_by                            | character varying           | YES
 slip_lines |               16 | is_deleted                            | boolean                     | NO
 slip_lines |               17 | specification                         | character varying           | YES
 slip_lines |               18 | unit_price_with_vat                   | numeric                     | YES
 slip_lines |               19 | supply_amount                         | numeric                     | YES
 slip_lines |               20 | vat_amount                            | numeric                     | YES
 slip_lines |               21 | source_order_line_id                  | uuid                        | YES
 slip_lines |               22 | set_head                              | boolean                     | NO
 slip_lines |               23 | parent_set_model                      | character varying           | YES
 slip_lines |               24 | unit_price_domain                     | character varying           | YES
 slip_lines |               25 | category_key                          | character varying           | YES
 slips      |                1 | id                                    | uuid                        | NO
 slips      |                2 | slip_type                             | character varying           | NO
 slips      |                3 | slip_no                               | character varying           | NO
 slips      |                4 | slip_date                             | date                        | NO
 slips      |                5 | seq_no                                | integer                     | NO
 slips      |                6 | status                                | character varying           | NO
 slips      |                7 | partner_id                            | uuid                        | YES
 slips      |                8 | partner_name                          | character varying           | YES
 slips      |                9 | source_warehouse_id                   | uuid                        | YES
 slips      |               10 | destination_warehouse_id              | uuid                        | YES
 slips      |               11 | delivery_tag                          | character varying           | YES
 slips      |               12 | memo                                  | character varying           | YES
 slips      |               13 | requester_id                          | character varying           | NO
 slips      |               14 | accepted_by                           | character varying           | YES
 slips      |               15 | accepted_at                           | timestamp without time zone | YES
 slips      |               16 | completed_at                          | timestamp without time zone | YES
 slips      |               17 | confirmed_at                          | timestamp without time zone | YES
 slips      |               18 | version                               | bigint                      | NO
 slips      |               19 | created_at                            | timestamp without time zone | NO
 slips      |               20 | created_by                            | character varying           | NO
 slips      |               21 | modified_at                           | timestamp without time zone | YES
 slips      |               22 | modified_by                           | character varying           | YES
 slips      |               23 | deleted_at                            | timestamp without time zone | YES
 slips      |               24 | deleted_by                            | character varying           | YES
 slips      |               25 | is_deleted                            | boolean                     | NO
 slips      |               26 | dispatcher_user_id                    | character varying           | YES
 slips      |               27 | dispatcher_signed_at                  | timestamp without time zone | YES
 slips      |               28 | inspector_user_id                     | character varying           | YES
 slips      |               29 | inspector_signed_at                   | timestamp without time zone | YES
 slips      |               30 | driver_name                           | character varying           | YES
 slips      |               31 | driver_phone                          | character varying           | YES
 slips      |               32 | delivery_batch_id                     | uuid                        | YES
 slips      |               33 | signed_at                             | timestamp without time zone | YES
 slips      |               34 | signer_name                           | character varying           | YES
 slips      |               35 | signature_png                         | bytea                       | YES
 slips      |               36 | signature_hash                        | character varying           | YES
 slips      |               37 | signature_channel                     | character varying           | YES
 slips      |               38 | signature_share_token                 | character varying           | YES
 slips      |               39 | signature_share_expires_at            | timestamp without time zone | YES
 slips      |               40 | driver_signed_at                      | timestamp without time zone | YES
 slips      |               41 | driver_signature_png                  | bytea                       | YES
 slips      |               42 | driver_signature_hash                 | character varying           | YES
 slips      |               43 | driver_signature_channel              | character varying           | YES
 slips      |               44 | source_type                           | character varying           | NO
 slips      |               45 | source_id                             | character varying           | YES
 slips      |               46 | idempotency_key                       | character varying           | YES
 slips      |               47 | signature_source                      | character varying           | NO
 slips      |               48 | driver_signature_source               | character varying           | NO
 slips      |               49 | lock_flag                             | boolean                     | NO
 slips      |               50 | partner_code                          | character varying           | YES
 slips      |               51 | classified_region_group               | character varying           | YES
 slips      |               52 | io_type                               | character varying           | YES
 slips      |               53 | time_date                             | character varying           | YES
 slips      |               54 | customer_tel                          | character varying           | YES
 slips      |               55 | customer_address                      | character varying           | YES
 slips      |               56 | customer_representative               | character varying           | YES
 slips      |               57 | shipping_address                      | character varying           | YES
 slips      |               58 | inspection_address                    | character varying           | YES
 slips      |               59 | receiver_phone                        | character varying           | YES
 slips      |               60 | payment_due_label                     | character varying           | YES
 slips      |               61 | discount_info                         | character varying           | YES
 slips      |               62 | collect_term                          | character varying           | YES
 slips      |               63 | agree_term                            | character varying           | YES
 slips      |               64 | revision_count                        | integer                     | NO
 slips      |               65 | business_number                       | character varying           | YES
 slips      |               66 | delivery_address                      | character varying           | YES
 slips      |               67 | supervision_address                   | character varying           | YES
 slips      |               68 | project_name                          | character varying           | YES
 slips      |               69 | recipient_phone                       | character varying           | YES
 slips      |               70 | payment_due_date                      | date                        | YES
 slips      |               71 | printed_at                            | timestamp without time zone | YES
 slips      |               72 | dispatch_status                       | character varying           | NO
 slips      |               73 | destination_warehouse_name            | character varying           | YES
 slips      |               74 | unload_date                           | date                        | YES
 slips      |               75 | revision_count_baseline               | integer                     | YES
 slips      |               76 | redline_anchor_revision_no            | integer                     | YES
 slips      |               77 | deleted_by_name                       | character varying           | YES
 slips      |               78 | source_warehouse_code                 | character varying           | YES
 slips      |               79 | source_warehouse_code_pending         | boolean                     | NO
 slips      |               80 | source_warehouse_code_snapshot_status | character varying           | NO
 slips      |               81 | source_warehouse_code_attempt_count   | integer                     | NO
 slips      |               82 | source_warehouse_code_next_attempt_at | timestamp without time zone | YES
 slips      |               83 | source_warehouse_code_claimed_at      | timestamp without time zone | YES
 slips      |               84 | source_warehouse_code_claim_token     | uuid                        | YES
 slips      |               85 | source_warehouse_code_last_error      | text                        | YES
 slips      |               86 | source_warehouse_code_abandoned_at    | timestamp without time zone | YES
(111 rows)

COMMIT

```

해석:

- 라인의 직접 품목 참조는 `product_id`(NOT NULL)이고, 사람이 읽는 보조 값은 `product_name`(NOT NULL), `model_name`(nullable)이다.
- `slip_lines`에는 별도 `model_code` 컬럼이 없다. 따라서 실제 값 표본과 애플리케이션 계약을 확인해 `model_name`이 모델코드 역할인지 모델명 역할인지 구분해야 한다.
- 전표와 라인 모두 `deleted_at`과 `is_deleted`를 가진다. 이후 활성/삭제 조합을 분리 계수한다.
+### 4. 품목 컬럼과 보조 테이블 구조

명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d product_db -c "BEGIN READ ONLY; SELECT ordinal_position, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' ORDER BY ordinal_position; SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 0.8 seconds
Output:
BEGIN
 ordinal_position |       column_name        |          data_type          | is_nullable 
------------------+--------------------------+-----------------------------+-------------
                1 | id                       | uuid                        | NO
                2 | name                     | character varying           | NO
                3 | model_name               | character varying           | NO
                4 | category_id              | uuid                        | NO
                5 | selling_price            | numeric                     | NO
                6 | purchase_price           | numeric                     | NO
                7 | currency                 | character varying           | NO
                8 | status                   | character varying           | NO
                9 | tags                     | jsonb                       | YES
               10 | description              | character varying           | YES
               11 | created_at               | timestamp without time zone | NO
               12 | created_by               | character varying           | NO
               13 | modified_at              | timestamp without time zone | YES
               14 | modified_by              | character varying           | YES
               15 | deleted_at               | timestamp without time zone | YES
               16 | deleted_by               | character varying           | YES
               17 | is_deleted               | boolean                     | NO
               18 | model_code               | character varying           | YES
               19 | product_type             | character varying           | NO
               20 | bundle_mode              | character varying           | YES
               21 | has_variable_discount    | boolean                     | NO
               22 | fixed_discount_rate      | numeric                     | YES
               23 | set_material_key         | character varying           | YES
               24 | legacy_discount_flag     | boolean                     | NO
               25 | discount_flags           | character varying           | NO
               26 | release_price            | numeric                     | NO
               27 | delivery_price           | numeric                     | NO
               28 | pyong_size               | numeric                     | YES
               29 | product_category         | character varying           | YES
               30 | usage_scope              | character varying           | NO
               31 | estimate_category        | character varying           | YES
               32 | spec_text                | character varying           | YES
               33 | remark                   | text                        | YES
               34 | parent_bundle_set_model  | character varying           | YES
               35 | product_code             | character varying           | YES
               36 | specification            | character varying           | YES
               37 | unit                     | character varying           | NO
               38 | product_business_type    | character varying           | NO
               39 | inventory_qty_mgmt       | boolean                     | NO
               40 | barcode                  | character varying           | YES
               41 | vat_rate_on_sales        | numeric                     | NO
               42 | vat_rate_on_purchase     | numeric                     | NO
               43 | price_includes_vat       | boolean                     | NO
               44 | safety_stock_qty         | integer                     | NO
               45 | lead_time_days           | integer                     | NO
               46 | min_order_unit           | integer                     | NO
               47 | purchase_source          | character varying           | YES
               48 | product_group1           | character varying           | YES
               49 | product_group2           | character varying           | YES
               50 | inbound_price            | numeric                     | NO
               51 | outbound_price           | numeric                     | NO
               52 | single_price             | numeric                     | NO
               53 | outdoor_price            | numeric                     | NO
               54 | multi_50_price           | numeric                     | NO
               55 | multi_48_price           | numeric                     | NO
               56 | multi_45_price           | numeric                     | NO
               57 | item_35_price            | numeric                     | NO
               58 | revision_count           | integer                     | NO
               59 | category_group           | character varying           | YES
               60 | tax_type                 | character varying           | NO
               61 | unit_price_with_vat      | numeric                     | NO
               62 | display_order            | integer                     | YES
               63 | usage_scope_manual       | boolean                     | NO
               64 | goods_type               | character varying           | NO
               65 | variable_discount_manual | boolean                     | NO
               66 | cat_l_id                 | uuid                        | YES
               67 | cat_m_id                 | uuid                        | YES
               68 | cat_s_id                 | uuid                        | YES
               69 | classification_manual    | boolean                     | NO
               70 | fixed_discount_manual    | boolean                     | NO
               71 | panel_type               | character varying           | YES
               72 | remote_type              | character varying           | YES
               73 | lineage                  | character varying           | NO
(73 rows)

          table_name           
-------------------------------
 branch_pipe_lookup
 bundle_component
 categories
 classification
 ecount_alias_reservations
 flyway_schema_history
 material_price
 odu_recommendation_lookup
 price_change_schedule
 price_history
 product_aliases
 product_audit_logs
 product_edit_requests
 product_estimate_exposure
 product_sheet_sync_generation
 product_spec
 products
 qa_984_r4_import_snapshot_1
 qa_984_r4_import_snapshot_2
 quantity_sync_rule
 quantity_sync_source
 quantity_sync_target
 spec_key_template
(23 rows)

COMMIT

```

해석:

- 품목의 후보 키는 내부 `id`, `model_code`, `model_name`, `name`, `product_code`다.
- V30이 추가한 `product_aliases`가 있으므로 직접 품목행 불일치와 alias로 복구 가능한 경우를 분리해야 한다.
- `qa_984_r4_import_snapshot_*`는 QA 스냅샷 테이블이며 현재 `products` 본표 집계에는 포함하지 않는다.
+### 5. 조사 모집단과 QA 포함/제외 기준

QA 잔재 판정식:

```sql
slip_no LIKE '%QA-%'
OR slip_no IN ('2026/06/24-901', '2026/06/24-902')
```

명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d slip_db -c "BEGIN READ ONLY; WITH classified AS (SELECT s.*, (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')) AS is_qa_residue FROM slips s) SELECT slip_type, COUNT(*) AS slips_all_including_qa, COUNT(*) FILTER (WHERE NOT is_qa_residue) AS slips_all_excluding_qa, COUNT(*) FILTER (WHERE NOT is_deleted AND deleted_at IS NULL) AS slips_live_including_qa, COUNT(*) FILTER (WHERE NOT is_deleted AND deleted_at IS NULL AND NOT is_qa_residue) AS slips_live_excluding_qa, COUNT(*) FILTER (WHERE is_qa_residue) AS qa_slips FROM classified GROUP BY slip_type ORDER BY slip_type; WITH classified AS (SELECT s.id, s.slip_type, s.is_deleted AS slip_is_deleted, s.deleted_at AS slip_deleted_at, (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')) AS is_qa_residue FROM slips s) SELECT c.slip_type, COUNT(*) AS lines_all_including_qa, COUNT(*) FILTER (WHERE NOT c.is_qa_residue) AS lines_all_excluding_qa, COUNT(*) FILTER (WHERE NOT c.slip_is_deleted AND c.slip_deleted_at IS NULL AND NOT l.is_deleted AND l.deleted_at IS NULL) AS lines_live_including_qa, COUNT(*) FILTER (WHERE NOT c.slip_is_deleted AND c.slip_deleted_at IS NULL AND NOT l.is_deleted AND l.deleted_at IS NULL AND NOT c.is_qa_residue) AS lines_live_excluding_qa, COUNT(*) FILTER (WHERE c.is_qa_residue) AS qa_lines FROM slip_lines l JOIN classified c ON c.id = l.slip_id GROUP BY c.slip_type ORDER BY c.slip_type; SELECT 'slips' AS entity, is_deleted, (deleted_at IS NOT NULL) AS has_deleted_at, COUNT(*) FROM slips GROUP BY is_deleted, (deleted_at IS NOT NULL) UNION ALL SELECT 'slip_lines', is_deleted, (deleted_at IS NOT NULL), COUNT(*) FROM slip_lines GROUP BY is_deleted, (deleted_at IS NOT NULL) ORDER BY entity, is_deleted, has_deleted_at; SELECT COUNT(*) AS slip_lines_without_parent_slip FROM slip_lines l LEFT JOIN slips s ON s.id = l.slip_id WHERE s.id IS NULL; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 0.8 seconds
Output:
BEGIN
 slip_type | slips_all_including_qa | slips_all_excluding_qa | slips_live_including_qa | slips_live_excluding_qa | qa_slips 
-----------+------------------------+------------------------+-------------------------+-------------------------+----------
 INBOUND   |                      1 |                      1 |                       0 |                       0 |        0
 OUTBOUND  |                    126 |                    119 |                     118 |                     111 |        7
(2 rows)

 slip_type | lines_all_including_qa | lines_all_excluding_qa | lines_live_including_qa | lines_live_excluding_qa | qa_lines 
-----------+------------------------+------------------------+-------------------------+-------------------------+----------
 INBOUND   |                      6 |                      6 |                       0 |                       0 |        0
 OUTBOUND  |                    396 |                    395 |                     243 |                     242 |        1
(2 rows)

   entity   | is_deleted | has_deleted_at | count 
------------+------------+----------------+-------
 slip_lines | f          | f              |   243
 slip_lines | t          | t              |   159
 slips      | f          | f              |   118
 slips      | t          | t              |     9
(4 rows)

 slip_lines_without_parent_slip 
--------------------------------
                              0
(1 row)

COMMIT

```

해석:

- 조사 시점 전표는 전체 127건(OUTBOUND 126, INBOUND 1), QA 제외 120건이다. 보고서 맨 앞의 전표 총 건수는 이 전체 행 수를 뜻한다.
- soft delete 제외 활성 전표는 118건이고 전부 OUTBOUND다. QA 제외 활성 전표는 111건이다.
- 라인은 전체 402건, QA 제외 401건이다. 활성 전표에 속한 활성 라인은 243건, QA 제외 242건이다.
- INBOUND 1전표·6라인은 모두 soft delete 상태다. 따라서 활성 업무 모집단만 보면 INBOUND는 0건이지만, 삭제 원인 분석에서는 별도 집계한다.
- 전표 없는 고아 라인은 0건이다. `is_deleted`와 `deleted_at`의 불일치도 없다.
+### 6. 품목 후보 키 충족률과 값 공간

명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d product_db -c "BEGIN READ ONLY; SELECT CASE WHEN NOT is_deleted AND deleted_at IS NULL THEN 'LIVE' ELSE 'SOFT_DELETED' END AS cohort, COUNT(*) AS rows, COUNT(*) FILTER (WHERE NULLIF(BTRIM(model_code), '') IS NOT NULL) AS model_code_filled, ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(model_code), '') IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS model_code_pct, COUNT(*) FILTER (WHERE NULLIF(BTRIM(model_name), '') IS NOT NULL) AS model_name_filled, ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(model_name), '') IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS model_name_pct, COUNT(*) FILTER (WHERE NULLIF(BTRIM(name), '') IS NOT NULL) AS name_filled, ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(name), '') IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS name_pct, COUNT(*) FILTER (WHERE NULLIF(BTRIM(product_code), '') IS NOT NULL) AS product_code_filled, ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(product_code), '') IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS product_code_pct FROM products GROUP BY cohort ORDER BY cohort; SELECT CASE WHEN model_code LIKE 'P-2026-%' THEN 'P-2026-*' WHEN model_code ~ '^[0-9]{10}$' THEN '10-digit' WHEN NULLIF(BTRIM(model_code), '') IS NULL THEN 'blank' ELSE 'other' END AS model_code_shape, COUNT(*) FROM products GROUP BY model_code_shape ORDER BY model_code_shape; SELECT model_code, model_name, name, product_code, is_deleted FROM products WHERE model_code LIKE 'P-2026-%' ORDER BY model_code LIMIT 5; SELECT model_code, model_name, name, product_code, is_deleted FROM products WHERE model_code ~ '^[0-9]{10}$' ORDER BY model_code LIMIT 5; SELECT ordinal_position, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_aliases' ORDER BY ordinal_position; SELECT COUNT(*) AS product_alias_rows FROM product_aliases; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 0.9 seconds
Output:
BEGIN
    cohort    | rows | model_code_filled | model_code_pct | model_name_filled | model_name_pct | name_filled | name_pct | product_code_filled | product_code_pct 
--------------+------+-------------------+----------------+-------------------+----------------+-------------+----------+---------------------+------------------
 LIVE         | 3061 |              3061 |         100.00 |              3061 |         100.00 |        3061 |   100.00 |                2667 |            87.13
 SOFT_DELETED |    2 |                 2 |         100.00 |                 2 |         100.00 |           2 |   100.00 |                   0 |             0.00
(2 rows)

 model_code_shape | count 
------------------+-------
 10-digit         |     1
 other            |  3062
(2 rows)

 model_code | model_name | name | product_code | is_deleted 
------------+------------+------+--------------+------------
(0 rows)

 model_code | model_name |     name      | product_code | is_deleted 
------------+------------+---------------+--------------+------------
 0010323523 | 0010323523 | 기타 외주관리 | 0010323523   | f
(1 row)

 ordinal_position |   column_name   |          data_type          | is_nullable 
------------------+-----------------+-----------------------------+-------------
                1 | id              | uuid                        | NO
                2 | alias_code      | character varying           | NO
                3 | main_product_id | uuid                        | NO
                4 | source          | character varying           | NO
                5 | created_at      | timestamp without time zone | NO
                6 | created_by      | character varying           | NO
                7 | modified_at     | timestamp without time zone | YES
                8 | modified_by     | character varying           | YES
                9 | deleted_at      | timestamp without time zone | YES
               10 | deleted_by      | character varying           | YES
               11 | is_deleted      | boolean                     | NO
(11 rows)

 product_alias_rows 
--------------------
               2835
(1 row)

COMMIT

```

해석:

- 활성 품목의 `model_code`, `model_name`, `name`은 모두 3,061/3,061(100%) 채워져 있다.
- `product_code`는 활성 2,667/3,061(87.13%)만 채워져 있어 전수 조인의 단독 기준으로 부적합하다. 다만 과거 100/1,226보다 크게 늘었다.
- `model_code`에 `P-2026-*` 값은 0건이다. 10자리 숫자 모델코드는 1건뿐이고 나머지 3,062건은 다른 형식이다.
- 활성·삭제 품목을 합친 직접 모델코드는 3,063건 모두 채워져 있다. `product_aliases`는 2,835행이다.
- 즉 `P-2026-0001` 같은 내부 순번코드와 `2118712345` 같은 외부 모델코드는 같은 키 공간이라고 가정하면 안 된다.
+### 7. 전표 라인 후보 키 충족률·양쪽 표본·QA 전표 목록

명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d slip_db -c "BEGIN READ ONLY; WITH base AS (SELECT s.slip_type, s.slip_no, s.is_deleted AS slip_is_deleted, s.deleted_at AS slip_deleted_at, (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')) AS is_qa_residue, l.* FROM slip_lines l JOIN slips s ON s.id = l.slip_id), scoped AS (SELECT 'ALL_INCLUDING_QA' AS scope, * FROM base UNION ALL SELECT 'ALL_EXCLUDING_QA', * FROM base WHERE NOT is_qa_residue UNION ALL SELECT 'LIVE_INCLUDING_QA', * FROM base WHERE NOT slip_is_deleted AND slip_deleted_at IS NULL AND NOT is_deleted AND deleted_at IS NULL UNION ALL SELECT 'LIVE_EXCLUDING_QA', * FROM base WHERE NOT slip_is_deleted AND slip_deleted_at IS NULL AND NOT is_deleted AND deleted_at IS NULL AND NOT is_qa_residue) SELECT scope, slip_type, COUNT(*) AS lines, COUNT(*) FILTER (WHERE product_id IS NOT NULL) AS product_id_filled, ROUND(100.0 * COUNT(*) FILTER (WHERE product_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS product_id_pct, COUNT(*) FILTER (WHERE NULLIF(BTRIM(model_name), '') IS NOT NULL) AS model_name_filled, ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(model_name), '') IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS model_name_pct, COUNT(*) FILTER (WHERE NULLIF(BTRIM(product_name), '') IS NOT NULL) AS product_name_filled, ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(product_name), '') IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS product_name_pct FROM scoped GROUP BY scope, slip_type ORDER BY scope, slip_type; WITH base AS (SELECT s.slip_type, s.slip_no, (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')) AS is_qa_residue, l.model_name FROM slip_lines l JOIN slips s ON s.id = l.slip_id) SELECT slip_type, CASE WHEN model_name LIKE 'P-2026-%' THEN 'P-2026-*' WHEN model_name ~ '^[0-9]{10}$' THEN '10-digit' WHEN NULLIF(BTRIM(model_name), '') IS NULL THEN 'blank' ELSE 'other' END AS model_name_shape, COUNT(*) FROM base WHERE NOT is_qa_residue GROUP BY slip_type, model_name_shape ORDER BY slip_type, model_name_shape; SELECT s.slip_no, s.slip_type, s.is_deleted AS slip_deleted, l.is_deleted AS line_deleted, l.model_name, l.product_name FROM slip_lines l JOIN slips s ON s.id = l.slip_id WHERE NOT (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')) ORDER BY s.slip_type, s.slip_no, l.created_at LIMIT 12; SELECT s.slip_no, s.slip_type, s.status, COUNT(l.id) AS lines FROM slips s LEFT JOIN slip_lines l ON l.slip_id = s.id WHERE s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902') GROUP BY s.slip_no, s.slip_type, s.status ORDER BY s.slip_no; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 1 seconds
Output:
BEGIN
       scope       | slip_type | lines | product_id_filled | product_id_pct | model_name_filled | model_name_pct | product_name_filled | product_name_pct 
-------------------+-----------+-------+-------------------+----------------+-------------------+----------------+---------------------+------------------
 ALL_EXCLUDING_QA  | INBOUND   |     6 |                 6 |         100.00 |                 6 |         100.00 |                   6 |           100.00
 ALL_EXCLUDING_QA  | OUTBOUND  |   395 |               395 |         100.00 |               395 |         100.00 |                 395 |           100.00
 ALL_INCLUDING_QA  | INBOUND   |     6 |                 6 |         100.00 |                 6 |         100.00 |                   6 |           100.00
 ALL_INCLUDING_QA  | OUTBOUND  |   396 |               396 |         100.00 |               396 |         100.00 |                 396 |           100.00
 LIVE_EXCLUDING_QA | OUTBOUND  |   242 |               242 |         100.00 |               242 |         100.00 |                 242 |           100.00
 LIVE_INCLUDING_QA | OUTBOUND  |   243 |               243 |         100.00 |               243 |         100.00 |                 243 |           100.00
(6 rows)

 slip_type | model_name_shape | count 
-----------+------------------+-------
 INBOUND   | other            |     6
 OUTBOUND  | other            |   395
(2 rows)

    slip_no    | slip_type | slip_deleted | line_deleted |  model_name  |         product_name         
---------------+-----------+--------------+--------------+--------------+------------------------------
 2026/07/27-1  | INBOUND   | t            | t            | AM200AXVHHR1 | DVM S2 동시냉난방 20HP
 2026/07/27-1  | INBOUND   | t            | t            | AM200AXVHHR1 | DVM S2 동시냉난방 20HP
 2026/07/27-1  | INBOUND   | t            | t            | AM200AXVHHR1 | DVM S2 동시냉난방 20HP
 2026/07/27-1  | INBOUND   | t            | t            | AM200AXVHHR1 | DVM S2 동시냉난방 20HP
 2026/07/27-1  | INBOUND   | t            | t            | AM200AXVHHR1 | DVM S2 동시냉난방 20HP
 2026/07/27-1  | INBOUND   | t            | t            | AM200AXVHHR1 | DVM S2 동시냉난방 20HP
 2026/06/19-1  | OUTBOUND  | f            | f            | AC023CN1DBC1 | 무풍 1way 냉방전용 실내기
 2026/07/15-1  | OUTBOUND  | f            | f            | AJ030MXHNBC1 | 실외기_3HP 단배관
 2026/07/15-10 | OUTBOUND  | f            | f            | AJ030MXHNBC1 | 실외기_3HP 단배관
 2026/07/15-11 | OUTBOUND  | f            | f            | AC023CN1DBC1 | 무풍 1way 냉방전용 실내기
 2026/07/15-11 | OUTBOUND  | f            | f            | AC023CX1DBC1 | 무풍 1way 냉방전용 실외기
 2026/07/15-11 | OUTBOUND  | f            | f            | PC1NWSK3NW   | 판넬 1way 무풍중형 WIFI 내장
(12 rows)

           slip_no           | slip_type |  status   | lines 
-----------------------------+-----------+-----------+-------
 2026/06/24-901              | OUTBOUND  | COMPLETED |     1
 2026/06/24-902              | OUTBOUND  | COMPLETED |     0
 2026/08/03-QA-1013-MAP-01   | OUTBOUND  | DRAFT     |     0
 2026/08/03-QA-1013-MAP-02   | OUTBOUND  | DRAFT     |     0
 2026/08/03-QA-1013-PHONE-01 | OUTBOUND  | DRAFT     |     0
 2026/08/03-QA-1013-PHONE-02 | OUTBOUND  | DRAFT     |     0
 2026/08/03-QA-1013-ROW-01   | OUTBOUND  | DRAFT     |     0
(7 rows)

COMMIT

```

해석:

- 모든 조사 범위에서 라인의 내부 `product_id`, `model_name`, `product_name`은 100% 채워져 있다. 이번 데이터에는 “전표 쪽 키가 비어 고를 값이 없는” 라인이 0건이다.
- `slip_lines.model_name`의 실제 값은 `AM200AXVHHR1`, `AC023CN1DBC1` 같은 모델코드다. 컬럼명과 달리 품목의 `model_code`에 대응하는 값 공간이다.
- `P-2026-*`나 10자리 숫자 모양의 전표 라인 모델값은 0건이며 전부 기타 외부 모델코드 형식이다.
- QA 전표는 7건이며 라인을 가진 것은 `2026/06/24-901` 1건뿐이다. `2026/06/24-902`와 `2026/08/03-QA-*` 5건은 라인이 0건이다.
+### 8. 교차 DB 집계 방식 확인

명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d slip_db -c "BEGIN READ ONLY; SELECT extname, extversion FROM pg_extension ORDER BY extname; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 2.6 seconds
Output:
BEGIN
 extname  | extversion 
----------+------------
 pgcrypto | 1.3
 plpgsql  | 1.0
(2 rows)

COMMIT

```

해석:

- `dblink`/FDW 확장이 없고 DB 쓰기가 금지되어 확장 설치나 임시 테이블을 만들지 않는다.
- 각 DB를 `psql -At -c "SELECT ..."`로 읽고 PowerShell 메모리에서만 결합한다. 실제 UUID 값은 내부 비교에만 사용하고 출력·보고서에는 내보내지 않는다.
+### 9. 교차 DB 전수 집계: 참조 키별 활성 일치·삭제·부재

아래 PowerShell은 두 `SELECT` 결과를 메모리에서만 결합한다. UUID는 비교에만 쓰며 출력하지 않는다.

명령:

```powershell
$ErrorActionPreference = 'Stop'
$slipSql = @"
SELECT json_build_object(
  'slip_no', s.slip_no,
  'slip_type', s.slip_type,
  'qa', (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')),
  'slip_is_deleted', s.is_deleted,
  'line_is_deleted', l.is_deleted,
  'product_id', l.product_id,
  'model_code', BTRIM(l.model_name),
  'product_name', BTRIM(l.product_name)
)::text
FROM slip_lines l
JOIN slips s ON s.id = l.slip_id
ORDER BY s.slip_type, s.slip_no, l.created_at, l.id
"@
$productSql = @"
SELECT json_build_object(
  'id', id,
  'model_code', BTRIM(model_code),
  'model_name', BTRIM(model_name),
  'name', BTRIM(name),
  'is_deleted', is_deleted
)::text
FROM products
ORDER BY id
"@
$aliasSql = @"
SELECT json_build_object(
  'alias_code', BTRIM(alias_code),
  'main_product_id', main_product_id,
  'is_deleted', is_deleted
)::text
FROM product_aliases
ORDER BY alias_code, main_product_id
"@
$lineRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d slip_db -c $slipSql | ForEach-Object { $_ | ConvertFrom-Json })
$productRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d product_db -c $productSql | ForEach-Object { $_ | ConvertFrom-Json })
$aliasRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d product_db -c $aliasSql | ForEach-Object { $_ | ConvertFrom-Json })

$productById = @{}
$liveModelIds = @{}
$deletedModelIds = @{}
$liveNameIds = @{}
$deletedNameIds = @{}
function Add-IdToSet {
  param([hashtable]$Table, [string]$Key, [string]$Id)
  if ([string]::IsNullOrWhiteSpace($Key)) { return }
  if (-not $Table.ContainsKey($Key)) {
    $Table[$Key] = [System.Collections.Generic.HashSet[string]]::new()
  }
  [void]$Table[$Key].Add($Id)
}
foreach ($product in $productRows) {
  $id = [string]$product.id
  $productById[$id] = $product
  if (-not [bool]$product.is_deleted) {
    Add-IdToSet $liveModelIds ([string]$product.model_code) $id
    Add-IdToSet $liveNameIds ([string]$product.name) $id
  } else {
    Add-IdToSet $deletedModelIds ([string]$product.model_code) $id
    Add-IdToSet $deletedNameIds ([string]$product.name) $id
  }
}
$liveAliasIds = @{}
$deletedAliasIds = @{}
foreach ($alias in $aliasRows) {
  if ([bool]$alias.is_deleted) { continue }
  $targetId = [string]$alias.main_product_id
  if (-not $productById.ContainsKey($targetId)) { continue }
  if (-not [bool]$productById[$targetId].is_deleted) {
    Add-IdToSet $liveAliasIds ([string]$alias.alias_code) $targetId
  } else {
    Add-IdToSet $deletedAliasIds ([string]$alias.alias_code) $targetId
  }
}
$scopes = @(
  [pscustomobject]@{ Name = 'ALL_INCLUDING_QA'; Rows = @($lineRows) },
  [pscustomobject]@{ Name = 'ALL_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa }) },
  [pscustomobject]@{ Name = 'LIVE_INCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) },
  [pscustomobject]@{ Name = 'LIVE_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa -and -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) }
)
function Count-Where {
  param([object[]]$Rows, [scriptblock]$Predicate)
  return @($Rows | Where-Object $Predicate).Count
}
Write-Output 'KEY_COVERAGE_COUNTS'
Write-Output 'scope|slip_type|lines|uuid_empty|uuid_active_missing|uuid_absent_all|uuid_soft_deleted|uuid_live|model_empty|model_active_missing|model_absent_all|model_soft_deleted_only|model_live|name_empty|name_active_missing|name_absent_all|name_soft_deleted_only|name_live_unique|name_live_ambiguous|model_alias_live'
foreach ($scope in $scopes) {
  foreach ($type in @('OUTBOUND', 'INBOUND')) {
    $rows = @($scope.Rows | Where-Object { $_.slip_type -eq $type })
    $uuidEmpty = Count-Where $rows { [string]::IsNullOrWhiteSpace([string]$_.product_id) }
    $uuidAbsentAll = Count-Where $rows { -not [string]::IsNullOrWhiteSpace([string]$_.product_id) -and -not $productById.ContainsKey([string]$_.product_id) }
    $uuidSoft = Count-Where $rows { $productById.ContainsKey([string]$_.product_id) -and [bool]$productById[[string]$_.product_id].is_deleted }
    $uuidLive = Count-Where $rows { $productById.ContainsKey([string]$_.product_id) -and -not [bool]$productById[[string]$_.product_id].is_deleted }
    $modelEmpty = Count-Where $rows { [string]::IsNullOrWhiteSpace([string]$_.model_code) }
    $modelAbsentAll = Count-Where $rows { -not [string]::IsNullOrWhiteSpace([string]$_.model_code) -and -not $liveModelIds.ContainsKey([string]$_.model_code) -and -not $deletedModelIds.ContainsKey([string]$_.model_code) }
    $modelSoftOnly = Count-Where $rows { -not $liveModelIds.ContainsKey([string]$_.model_code) -and $deletedModelIds.ContainsKey([string]$_.model_code) }
    $modelLive = Count-Where $rows { $liveModelIds.ContainsKey([string]$_.model_code) }
    $nameEmpty = Count-Where $rows { [string]::IsNullOrWhiteSpace([string]$_.product_name) }
    $nameAbsentAll = Count-Where $rows { -not [string]::IsNullOrWhiteSpace([string]$_.product_name) -and -not $liveNameIds.ContainsKey([string]$_.product_name) -and -not $deletedNameIds.ContainsKey([string]$_.product_name) }
    $nameSoftOnly = Count-Where $rows { -not $liveNameIds.ContainsKey([string]$_.product_name) -and $deletedNameIds.ContainsKey([string]$_.product_name) }
    $nameUnique = Count-Where $rows { $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Count -eq 1 }
    $nameAmbiguous = Count-Where $rows { $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Count -gt 1 }
    $aliasLive = Count-Where $rows { $liveAliasIds.ContainsKey([string]$_.model_code) }
    $uuidActiveMissing = $uuidEmpty + $uuidAbsentAll + $uuidSoft
    $modelActiveMissing = $modelEmpty + $modelAbsentAll + $modelSoftOnly
    $nameActiveMissing = $nameEmpty + $nameAbsentAll + $nameSoftOnly
    Write-Output (@($scope.Name, $type, $rows.Count, $uuidEmpty, $uuidActiveMissing, $uuidAbsentAll, $uuidSoft, $uuidLive, $modelEmpty, $modelActiveMissing, $modelAbsentAll, $modelSoftOnly, $modelLive, $nameEmpty, $nameActiveMissing, $nameAbsentAll, $nameSoftOnly, $nameUnique, $nameAmbiguous, $aliasLive) -join '|')
  }
}
Write-Output ''
Write-Output 'CROSS_KEY_AGREEMENT'
Write-Output 'scope|slip_type|uuid_live_model_same_target|uuid_live_model_different_target_or_missing|uuid_live_name_same_target|uuid_live_name_different_target_or_missing|uuid_absent_model_live|uuid_absent_model_missing_name_live_unique|uuid_absent_model_missing_name_live_ambiguous|uuid_absent_model_and_name_missing'
foreach ($scope in $scopes) {
  foreach ($type in @('OUTBOUND', 'INBOUND')) {
    $rows = @($scope.Rows | Where-Object { $_.slip_type -eq $type })
    $uuidLiveRows = @($rows | Where-Object { $productById.ContainsKey([string]$_.product_id) -and -not [bool]$productById[[string]$_.product_id].is_deleted })
    $uuidAbsentRows = @($rows | Where-Object { -not $productById.ContainsKey([string]$_.product_id) })
    $modelSame = Count-Where $uuidLiveRows { $liveModelIds.ContainsKey([string]$_.model_code) -and $liveModelIds[[string]$_.model_code].Contains([string]$_.product_id) }
    $modelDiff = $uuidLiveRows.Count - $modelSame
    $nameSame = Count-Where $uuidLiveRows { $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Contains([string]$_.product_id) }
    $nameDiff = $uuidLiveRows.Count - $nameSame
    $uuidAbsentModelLive = Count-Where $uuidAbsentRows { $liveModelIds.ContainsKey([string]$_.model_code) }
    $uuidAbsentModelMissingNameUnique = Count-Where $uuidAbsentRows { -not $liveModelIds.ContainsKey([string]$_.model_code) -and $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Count -eq 1 }
    $uuidAbsentModelMissingNameAmbiguous = Count-Where $uuidAbsentRows { -not $liveModelIds.ContainsKey([string]$_.model_code) -and $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Count -gt 1 }
    $uuidAbsentNeither = Count-Where $uuidAbsentRows { -not $liveModelIds.ContainsKey([string]$_.model_code) -and -not $liveNameIds.ContainsKey([string]$_.product_name) }
    Write-Output (@($scope.Name, $type, $modelSame, $modelDiff, $nameSame, $nameDiff, $uuidAbsentModelLive, $uuidAbsentModelMissingNameUnique, $uuidAbsentModelMissingNameAmbiguous, $uuidAbsentNeither) -join '|')
  }
}
Write-Output ''
Write-Output 'ACTIVE_PRODUCT_DUPLICATE_KEYS'
$modelDuplicateGroups = @($liveModelIds.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 })
$nameDuplicateGroups = @($liveNameIds.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 })
Write-Output ('active_model_code_duplicate_groups|' + $modelDuplicateGroups.Count)
Write-Output ('active_model_code_duplicate_products|' + (($modelDuplicateGroups | ForEach-Object { $_.Value.Count } | Measure-Object -Sum).Sum))
Write-Output ('active_name_duplicate_groups|' + $nameDuplicateGroups.Count)
Write-Output ('active_name_duplicate_products|' + (($nameDuplicateGroups | ForEach-Object { $_.Value.Count } | Measure-Object -Sum).Sum))
Write-Output ''
Write-Output 'SOURCE_ROW_COUNTS'
Write-Output ('slip_line_rows_loaded|' + $lineRows.Count)
Write-Output ('product_rows_loaded|' + $productRows.Count)
Write-Output ('product_alias_rows_loaded|' + $aliasRows.Count)
```

출력 원문:

```text
Exit code: 0
Wall time: 3.6 seconds
Output:
KEY_COVERAGE_COUNTS
scope|slip_type|lines|uuid_empty|uuid_active_missing|uuid_absent_all|uuid_soft_deleted|uuid_live|model_empty|model_active_missing|model_absent_all|model_soft_deleted_only|model_live|name_empty|name_active_missing|name_absent_all|name_soft_deleted_only|name_live_unique|name_live_ambiguous|model_alias_live
ALL_INCLUDING_QA|OUTBOUND|396|0|0|0|0|396|0|0|0|0|396|0|6|6|0|104|286|396
ALL_INCLUDING_QA|INBOUND|6|0|0|0|0|6|0|0|0|0|6|0|0|0|0|6|0|6
ALL_EXCLUDING_QA|OUTBOUND|395|0|0|0|0|395|0|0|0|0|395|0|6|6|0|104|285|395
ALL_EXCLUDING_QA|INBOUND|6|0|0|0|0|6|0|0|0|0|6|0|0|0|0|6|0|6
LIVE_INCLUDING_QA|OUTBOUND|243|0|0|0|0|243|0|0|0|0|243|0|6|6|0|53|184|243
LIVE_INCLUDING_QA|INBOUND|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|242|0|0|0|0|242|0|0|0|0|242|0|6|6|0|53|183|242
LIVE_EXCLUDING_QA|INBOUND|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0

CROSS_KEY_AGREEMENT
scope|slip_type|uuid_live_model_same_target|uuid_live_model_different_target_or_missing|uuid_live_name_same_target|uuid_live_name_different_target_or_missing|uuid_absent_model_live|uuid_absent_model_missing_name_live_unique|uuid_absent_model_missing_name_live_ambiguous|uuid_absent_model_and_name_missing
ALL_INCLUDING_QA|OUTBOUND|396|0|390|6|0|0|0|0
ALL_INCLUDING_QA|INBOUND|6|0|6|0|0|0|0|0
ALL_EXCLUDING_QA|OUTBOUND|395|0|389|6|0|0|0|0
ALL_EXCLUDING_QA|INBOUND|6|0|6|0|0|0|0|0
LIVE_INCLUDING_QA|OUTBOUND|243|0|237|6|0|0|0|0
LIVE_INCLUDING_QA|INBOUND|0|0|0|0|0|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|242|0|236|6|0|0|0|0
LIVE_EXCLUDING_QA|INBOUND|0|0|0|0|0|0|0|0

ACTIVE_PRODUCT_DUPLICATE_KEYS
active_model_code_duplicate_groups|1
active_model_code_duplicate_products|2
active_name_duplicate_groups|157
active_name_duplicate_products|626

SOURCE_ROW_COUNTS
slip_line_rows_loaded|402
product_rows_loaded|3063
product_alias_rows_loaded|2835

```

즉시 판독:

- UUID 기준: QA 포함 전체 402라인과 QA 제외 401라인 모두 활성 품목에 100% 연결된다. UUID 공백·DB 부재·soft delete 참조는 모두 0건이다.
- 모델코드 기준: QA 포함 전체 402라인과 QA 제외 401라인 모두 활성 품목에 100% 직접 일치한다. 공백·DB 부재·soft delete 전용 일치는 모두 0건이다.
- 이름 기준: QA 제외 OUTBOUND 395라인 중 6라인은 활성·삭제 품목 어디에도 같은 이름이 없고, 285라인은 활성 동명 품목이 복수다. 고유 이름 직접 일치는 104라인이다. INBOUND 6라인은 모두 고유 이름으로 일치한다.
- 활성 업무 모집단(QA 제외)은 OUTBOUND 242라인뿐이다. UUID·모델코드는 242/242 일치, 이름은 고유 53·동명 183·부재 6이다.
- 내부 UUID가 가리키는 활성 품목과 라인 모델코드가 가리키는 품목은 402/402 동일하다. 반면 이름 스냅샷은 OUTBOUND 6라인에서 현재 품목명과 다르다.
- 활성 품목의 중복 키는 모델코드 1그룹/2품목, 이름 157그룹/626품목이다.
- 모델코드는 직접 일치 402라인이고 alias도 402라인에 존재한다. alias는 직접 일치가 없는 라인의 구조용 복구가 아니라 현행 모델코드 보존층이다.
+### 10. 이름 스냅샷 차이 6라인과 모델 중복 재검증

명령:

```powershell
$ErrorActionPreference = 'Stop'
$slipSql = @"
SELECT json_build_object(
  'slip_no', s.slip_no,
  'slip_type', s.slip_type,
  'qa', (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')),
  'slip_is_deleted', s.is_deleted,
  'line_is_deleted', l.is_deleted,
  'product_id', l.product_id,
  'model_code', BTRIM(l.model_name),
  'line_product_name', BTRIM(l.product_name)
)::text
FROM slip_lines l
JOIN slips s ON s.id = l.slip_id
ORDER BY s.slip_no, l.created_at, l.id
"@
$productSql = @"
SELECT json_build_object(
  'id', id,
  'model_code', BTRIM(model_code),
  'current_product_name', BTRIM(name),
  'is_deleted', is_deleted
)::text
FROM products
ORDER BY id
"@
$lineRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d slip_db -c $slipSql | ForEach-Object { $_ | ConvertFrom-Json })
$productRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d product_db -c $productSql | ForEach-Object { $_ | ConvertFrom-Json })
$productById = @{}
foreach ($product in $productRows) { $productById[[string]$product.id] = $product }
Write-Output 'NAME_SNAPSHOT_DIFFERENCES'
Write-Output 'slip_no|slip_type|qa|slip_deleted|line_deleted|model_code|line_product_name|current_product_name'
$differenceRows = @()
foreach ($line in $lineRows) {
  $id = [string]$line.product_id
  if (-not $productById.ContainsKey($id)) { continue }
  $product = $productById[$id]
  if ([string]$line.line_product_name -cne [string]$product.current_product_name) {
    $differenceRows += [pscustomobject]@{
      slip_no = [string]$line.slip_no
      slip_type = [string]$line.slip_type
      qa = [bool]$line.qa
      slip_deleted = [bool]$line.slip_is_deleted
      line_deleted = [bool]$line.line_is_deleted
      model_code = [string]$line.model_code
      line_product_name = [string]$line.line_product_name
      current_product_name = [string]$product.current_product_name
    }
  }
}
foreach ($row in ($differenceRows | Sort-Object slip_no, model_code, line_product_name)) {
  Write-Output (@($row.slip_no, $row.slip_type, $row.qa, $row.slip_deleted, $row.line_deleted, $row.model_code, $row.line_product_name, $row.current_product_name) -join '|')
}
Write-Output ('difference_line_count|' + $differenceRows.Count)
Write-Output ('difference_distinct_slips|' + @($differenceRows | Select-Object -ExpandProperty slip_no -Unique).Count)
Write-Output ('difference_distinct_models|' + @($differenceRows | Select-Object -ExpandProperty model_code -Unique).Count)
Write-Output ''
Write-Output 'MODEL_CODE_DUPLICATE_PRODUCTS'
docker exec samhan-postgres psql -X -P pager=off -U samhan -d product_db -c "BEGIN READ ONLY; WITH duplicate_codes AS (SELECT model_code FROM products WHERE NOT is_deleted AND deleted_at IS NULL GROUP BY model_code HAVING COUNT(*) > 1) SELECT p.model_code, p.model_name, p.name, p.product_code, p.status, p.is_deleted FROM products p JOIN duplicate_codes d ON d.model_code = p.model_code ORDER BY p.model_code, p.name, p.product_code; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 2 seconds
Output:
NAME_SNAPSHOT_DIFFERENCES
slip_no|slip_type|qa|slip_deleted|line_deleted|model_code|line_product_name|current_product_name
2026/07/16-19|OUTBOUND|False|False|False|ACD-2558G|교체된 단품|4WAY 데코커버
2026/07/16-22|OUTBOUND|False|False|False|ACD-2558G|교체된 단품|4WAY 데코커버
2026/07/16-26|OUTBOUND|False|False|False|ACD-2558G|교체된 단품|4WAY 데코커버
2026/07/16-64|OUTBOUND|False|False|False|ACD-2558G|교체된 단품|4WAY 데코커버
2026/07/16-70|OUTBOUND|False|False|False|ACD-2558G|교체된 단품|4WAY 데코커버
2026/07/16-84|OUTBOUND|False|False|False|ACD-2558G|교체된 단품|4WAY 데코커버
difference_line_count|6
difference_distinct_slips|6
difference_distinct_models|1

MODEL_CODE_DUPLICATE_PRODUCTS
BEGIN
 model_code | model_name | name | product_code | status | is_deleted 
------------+------------+------+--------------+--------+------------
(0 rows)

COMMIT

```

판독:

- 이름 불일치 6라인은 모두 활성·비QA OUTBOUND이며, 모델코드 `ACD-2558G` 하나다.
- 라인 이름 `교체된 단품`과 현재 품목명 `4WAY 데코커버`는 양쪽 모두 채워져 있다. 공백이 아니라 값 차이다.
- UUID와 모델코드는 현재 품목을 동일하게 지목하므로 이름 스냅샷만 과거 값으로 남은 상태다.
- 같은 출력의 `active_model_code_duplicate_groups|1`과 후속 SQL 0행은 불일치한다. 아래 삭제 플래그 재확인 후 원인을 PowerShell 기본 대소문자 비구분 해시 키로 특정했고, 대소문자 구분 방식으로 전수 집계를 다시 수행한다.

삭제 플래그 재확인 명령:

```powershell
docker exec samhan-postgres psql -X -P pager=off -U samhan -d product_db -c "BEGIN READ ONLY; SELECT is_deleted, (deleted_at IS NOT NULL) AS has_deleted_at, COUNT(*) FROM products GROUP BY is_deleted, (deleted_at IS NOT NULL) ORDER BY is_deleted, has_deleted_at; SELECT model_code, model_name, name, product_code, status, is_deleted, (deleted_at IS NOT NULL) AS has_deleted_at FROM products WHERE is_deleted OR deleted_at IS NOT NULL ORDER BY model_code, name; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 0.8 seconds
Output:
BEGIN
 is_deleted | has_deleted_at | count 
------------+----------------+-------
 f          | f              |  3061
 t          | t              |     2
(2 rows)

  model_code  |  model_name  |          name          | product_code | status | is_deleted | has_deleted_at 
--------------+--------------+------------------------+--------------+--------+------------+----------------
 AM100NXVHHH1 | AM100NXVHHH1 | DVM S 구형 프라임 10HP |              | ACTIVE | t          | t
 AM160NXVHHH1 | AM160NXVHHH1 | DVM S 구형 프라임 16HP |              | ACTIVE | t          | t
(2 rows)

COMMIT

```

판독:

- 품목 삭제 플래그는 `is_deleted`와 `deleted_at`이 3,063행 모두 일치한다.
- soft delete 품목은 모델코드 `AM100NXVHHH1`, `AM160NXVHHH1` 2건이다.
- 위 1차 중복 오표시는 삭제 조건 문제가 아니라 PowerShell 기본 해시 키가 대소문자를 구분하지 않은 데서 생겼다. PostgreSQL 문자열 `=`과 같은 대소문자 구분 비교로 교체한다.
+### 11. 대소문자 구분 교차 DB 전수 집계 (최종 정본)

> 이 절이 §9의 PowerShell 1차 집계를 대체하는 최종 정본이다. PostgreSQL `varchar =`와 같은 대소문자 구분 비교를 사용한다.

명령:

```powershell
$ErrorActionPreference = 'Stop'
$slipSql = @"
SELECT json_build_object(
  'slip_no', s.slip_no,
  'slip_type', s.slip_type,
  'qa', (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')),
  'slip_is_deleted', s.is_deleted,
  'line_is_deleted', l.is_deleted,
  'product_id', l.product_id,
  'model_code', BTRIM(l.model_name),
  'product_name', BTRIM(l.product_name)
)::text
FROM slip_lines l
JOIN slips s ON s.id = l.slip_id
ORDER BY s.slip_type, s.slip_no, l.created_at, l.id
"@
$productSql = @"
SELECT json_build_object(
  'id', id,
  'model_code', BTRIM(model_code),
  'name', BTRIM(name),
  'is_live', (NOT is_deleted AND deleted_at IS NULL)
)::text
FROM products
ORDER BY id
"@
$aliasSql = @"
SELECT json_build_object(
  'alias_code', BTRIM(alias_code),
  'main_product_id', main_product_id,
  'is_live', (NOT is_deleted AND deleted_at IS NULL)
)::text
FROM product_aliases
ORDER BY alias_code, main_product_id
"@
$lineRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d slip_db -c $slipSql | ForEach-Object { $_ | ConvertFrom-Json })
$productRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d product_db -c $productSql | ForEach-Object { $_ | ConvertFrom-Json })
$aliasRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d product_db -c $aliasSql | ForEach-Object { $_ | ConvertFrom-Json })

function New-OrdinalMap {
  return [System.Collections.Generic.Dictionary[string,object]]::new([System.StringComparer]::Ordinal)
}
$productById = New-OrdinalMap
$liveProductIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$deletedProductIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$liveModelIds = New-OrdinalMap
$deletedModelIds = New-OrdinalMap
$liveNameIds = New-OrdinalMap
$deletedNameIds = New-OrdinalMap
function Add-IdToSet {
  param($Table, [string]$Key, [string]$Id)
  if ([string]::IsNullOrWhiteSpace($Key)) { return }
  if (-not $Table.ContainsKey($Key)) {
    $Table[$Key] = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  }
  [void]$Table[$Key].Add($Id)
}
foreach ($product in $productRows) {
  $id = [string]$product.id
  $productById[$id] = $product
  if ([bool]$product.is_live) {
    [void]$liveProductIds.Add($id)
    Add-IdToSet $liveModelIds ([string]$product.model_code) $id
    Add-IdToSet $liveNameIds ([string]$product.name) $id
  } else {
    [void]$deletedProductIds.Add($id)
    Add-IdToSet $deletedModelIds ([string]$product.model_code) $id
    Add-IdToSet $deletedNameIds ([string]$product.name) $id
  }
}
$liveAliasIds = New-OrdinalMap
$deletedAliasIds = New-OrdinalMap
foreach ($alias in $aliasRows) {
  if (-not [bool]$alias.is_live) { continue }
  $targetId = [string]$alias.main_product_id
  if ($liveProductIds.Contains($targetId)) {
    Add-IdToSet $liveAliasIds ([string]$alias.alias_code) $targetId
  } elseif ($deletedProductIds.Contains($targetId)) {
    Add-IdToSet $deletedAliasIds ([string]$alias.alias_code) $targetId
  }
}
$scopes = @(
  [pscustomobject]@{ Name = 'ALL_INCLUDING_QA'; Rows = @($lineRows) },
  [pscustomobject]@{ Name = 'ALL_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa }) },
  [pscustomobject]@{ Name = 'LIVE_INCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) },
  [pscustomobject]@{ Name = 'LIVE_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa -and -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) }
)
function Count-Where {
  param([object[]]$Rows, [scriptblock]$Predicate)
  return @($Rows | Where-Object $Predicate).Count
}
Write-Output 'KEY_COVERAGE_COUNTS_CASE_SENSITIVE'
Write-Output 'scope|slip_type|lines|uuid_empty|uuid_active_missing|uuid_absent_all|uuid_soft_deleted|uuid_live|model_empty|model_active_missing|model_absent_all|model_soft_deleted_only|model_live|name_empty|name_active_missing|name_absent_all|name_soft_deleted_only|name_live_unique|name_live_ambiguous|model_alias_live'
foreach ($scope in $scopes) {
  foreach ($type in @('OUTBOUND', 'INBOUND')) {
    $rows = @($scope.Rows | Where-Object { $_.slip_type -eq $type })
    $uuidEmpty = Count-Where $rows { [string]::IsNullOrWhiteSpace([string]$_.product_id) }
    $uuidAbsentAll = Count-Where $rows { -not [string]::IsNullOrWhiteSpace([string]$_.product_id) -and -not $productById.ContainsKey([string]$_.product_id) }
    $uuidSoft = Count-Where $rows { $deletedProductIds.Contains([string]$_.product_id) }
    $uuidLive = Count-Where $rows { $liveProductIds.Contains([string]$_.product_id) }
    $modelEmpty = Count-Where $rows { [string]::IsNullOrWhiteSpace([string]$_.model_code) }
    $modelAbsentAll = Count-Where $rows { -not [string]::IsNullOrWhiteSpace([string]$_.model_code) -and -not $liveModelIds.ContainsKey([string]$_.model_code) -and -not $deletedModelIds.ContainsKey([string]$_.model_code) }
    $modelSoftOnly = Count-Where $rows { -not $liveModelIds.ContainsKey([string]$_.model_code) -and $deletedModelIds.ContainsKey([string]$_.model_code) }
    $modelLive = Count-Where $rows { $liveModelIds.ContainsKey([string]$_.model_code) }
    $nameEmpty = Count-Where $rows { [string]::IsNullOrWhiteSpace([string]$_.product_name) }
    $nameAbsentAll = Count-Where $rows { -not [string]::IsNullOrWhiteSpace([string]$_.product_name) -and -not $liveNameIds.ContainsKey([string]$_.product_name) -and -not $deletedNameIds.ContainsKey([string]$_.product_name) }
    $nameSoftOnly = Count-Where $rows { -not $liveNameIds.ContainsKey([string]$_.product_name) -and $deletedNameIds.ContainsKey([string]$_.product_name) }
    $nameUnique = Count-Where $rows { $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Count -eq 1 }
    $nameAmbiguous = Count-Where $rows { $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Count -gt 1 }
    $aliasLive = Count-Where $rows { $liveAliasIds.ContainsKey([string]$_.model_code) }
    $uuidActiveMissing = $uuidEmpty + $uuidAbsentAll + $uuidSoft
    $modelActiveMissing = $modelEmpty + $modelAbsentAll + $modelSoftOnly
    $nameActiveMissing = $nameEmpty + $nameAbsentAll + $nameSoftOnly
    Write-Output (@($scope.Name, $type, $rows.Count, $uuidEmpty, $uuidActiveMissing, $uuidAbsentAll, $uuidSoft, $uuidLive, $modelEmpty, $modelActiveMissing, $modelAbsentAll, $modelSoftOnly, $modelLive, $nameEmpty, $nameActiveMissing, $nameAbsentAll, $nameSoftOnly, $nameUnique, $nameAmbiguous, $aliasLive) -join '|')
  }
}
Write-Output ''
Write-Output 'CROSS_KEY_AGREEMENT_CASE_SENSITIVE'
Write-Output 'scope|slip_type|uuid_live_model_same_target|uuid_live_model_different_target_or_missing|uuid_live_name_same_target|uuid_live_name_different_target_or_missing|uuid_absent_model_live|uuid_absent_model_missing_name_live_unique|uuid_absent_model_missing_name_live_ambiguous|uuid_absent_model_and_name_missing'
foreach ($scope in $scopes) {
  foreach ($type in @('OUTBOUND', 'INBOUND')) {
    $rows = @($scope.Rows | Where-Object { $_.slip_type -eq $type })
    $uuidLiveRows = @($rows | Where-Object { $liveProductIds.Contains([string]$_.product_id) })
    $uuidAbsentRows = @($rows | Where-Object { -not $productById.ContainsKey([string]$_.product_id) })
    $modelSame = Count-Where $uuidLiveRows { $liveModelIds.ContainsKey([string]$_.model_code) -and $liveModelIds[[string]$_.model_code].Contains([string]$_.product_id) }
    $modelDiff = $uuidLiveRows.Count - $modelSame
    $nameSame = Count-Where $uuidLiveRows { $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Contains([string]$_.product_id) }
    $nameDiff = $uuidLiveRows.Count - $nameSame
    $uuidAbsentModelLive = Count-Where $uuidAbsentRows { $liveModelIds.ContainsKey([string]$_.model_code) }
    $uuidAbsentModelMissingNameUnique = Count-Where $uuidAbsentRows { -not $liveModelIds.ContainsKey([string]$_.model_code) -and $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Count -eq 1 }
    $uuidAbsentModelMissingNameAmbiguous = Count-Where $uuidAbsentRows { -not $liveModelIds.ContainsKey([string]$_.model_code) -and $liveNameIds.ContainsKey([string]$_.product_name) -and $liveNameIds[[string]$_.product_name].Count -gt 1 }
    $uuidAbsentNeither = Count-Where $uuidAbsentRows { -not $liveModelIds.ContainsKey([string]$_.model_code) -and -not $liveNameIds.ContainsKey([string]$_.product_name) }
    Write-Output (@($scope.Name, $type, $modelSame, $modelDiff, $nameSame, $nameDiff, $uuidAbsentModelLive, $uuidAbsentModelMissingNameUnique, $uuidAbsentModelMissingNameAmbiguous, $uuidAbsentNeither) -join '|')
  }
}
Write-Output ''
Write-Output 'EXACT_DUPLICATE_KEY_COUNTS'
docker exec samhan-postgres psql -X -P pager=off -U samhan -d product_db -c "BEGIN READ ONLY; WITH model_groups AS (SELECT model_code, COUNT(*) AS n FROM products WHERE NOT is_deleted AND deleted_at IS NULL GROUP BY model_code HAVING COUNT(*) > 1), name_groups AS (SELECT name, COUNT(*) AS n FROM products WHERE NOT is_deleted AND deleted_at IS NULL GROUP BY name HAVING COUNT(*) > 1) SELECT 'model_code' AS key_type, COUNT(*) AS duplicate_groups, COALESCE(SUM(n), 0) AS duplicate_products, COALESCE(SUM(n * (n - 1) / 2), 0) AS duplicate_pairs FROM model_groups UNION ALL SELECT 'name', COUNT(*), COALESCE(SUM(n), 0), COALESCE(SUM(n * (n - 1) / 2), 0) FROM name_groups ORDER BY key_type; WITH folded AS (SELECT LOWER(model_code) AS folded_code FROM products WHERE NOT is_deleted AND deleted_at IS NULL GROUP BY LOWER(model_code) HAVING COUNT(DISTINCT model_code) > 1) SELECT p.model_code, p.model_name, p.name, p.product_code FROM products p JOIN folded f ON f.folded_code = LOWER(p.model_code) WHERE NOT p.is_deleted AND p.deleted_at IS NULL ORDER BY LOWER(p.model_code), p.model_code; COMMIT;"
Write-Output ''
Write-Output 'SOURCE_ROW_COUNTS'
Write-Output ('slip_line_rows_loaded|' + $lineRows.Count)
Write-Output ('product_rows_loaded|' + $productRows.Count)
Write-Output ('product_alias_rows_loaded|' + $aliasRows.Count)
```

출력 원문:

```text
Exit code: 0
Wall time: 3 seconds
Output:
KEY_COVERAGE_COUNTS_CASE_SENSITIVE
scope|slip_type|lines|uuid_empty|uuid_active_missing|uuid_absent_all|uuid_soft_deleted|uuid_live|model_empty|model_active_missing|model_absent_all|model_soft_deleted_only|model_live|name_empty|name_active_missing|name_absent_all|name_soft_deleted_only|name_live_unique|name_live_ambiguous|model_alias_live
ALL_INCLUDING_QA|OUTBOUND|396|0|0|0|0|396|0|0|0|0|396|0|6|6|0|104|286|396
ALL_INCLUDING_QA|INBOUND|6|0|0|0|0|6|0|0|0|0|6|0|0|0|0|6|0|6
ALL_EXCLUDING_QA|OUTBOUND|395|0|0|0|0|395|0|0|0|0|395|0|6|6|0|104|285|395
ALL_EXCLUDING_QA|INBOUND|6|0|0|0|0|6|0|0|0|0|6|0|0|0|0|6|0|6
LIVE_INCLUDING_QA|OUTBOUND|243|0|0|0|0|243|0|0|0|0|243|0|6|6|0|53|184|243
LIVE_INCLUDING_QA|INBOUND|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|242|0|0|0|0|242|0|0|0|0|242|0|6|6|0|53|183|242
LIVE_EXCLUDING_QA|INBOUND|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0

CROSS_KEY_AGREEMENT_CASE_SENSITIVE
scope|slip_type|uuid_live_model_same_target|uuid_live_model_different_target_or_missing|uuid_live_name_same_target|uuid_live_name_different_target_or_missing|uuid_absent_model_live|uuid_absent_model_missing_name_live_unique|uuid_absent_model_missing_name_live_ambiguous|uuid_absent_model_and_name_missing
ALL_INCLUDING_QA|OUTBOUND|396|0|390|6|0|0|0|0
ALL_INCLUDING_QA|INBOUND|6|0|6|0|0|0|0|0
ALL_EXCLUDING_QA|OUTBOUND|395|0|389|6|0|0|0|0
ALL_EXCLUDING_QA|INBOUND|6|0|6|0|0|0|0|0
LIVE_INCLUDING_QA|OUTBOUND|243|0|237|6|0|0|0|0
LIVE_INCLUDING_QA|INBOUND|0|0|0|0|0|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|242|0|236|6|0|0|0|0
LIVE_EXCLUDING_QA|INBOUND|0|0|0|0|0|0|0|0

EXACT_DUPLICATE_KEY_COUNTS
BEGIN
  key_type  | duplicate_groups | duplicate_products | duplicate_pairs 
------------+------------------+--------------------+-----------------
 model_code |                0 |                  0 |               0
 name       |              157 |                626 |            1498
(2 rows)

 model_code | model_name |            name            | product_code 
------------+------------+----------------------------+--------------
 SI-AL600A  | SI-AL600A  | 실외기 일자발              | 
 SI-AL600a  | SI-AL600a  | 실외기 일자발 (전면 4~6HP) | SI-AL600a
(2 rows)

COMMIT

SOURCE_ROW_COUNTS
slip_line_rows_loaded|402
product_rows_loaded|3063
product_alias_rows_loaded|2835

```

최종 판독:

- 참조 키별 단절 계수는 §9와 동일하다: UUID 0건, 모델코드 0건, 이름 직접 부재 OUTBOUND 6건이다.
- 정확히 같은 활성 모델코드 중복은 0그룹/0품목/0쌍이다.
- 활성 동명 품목은 157그룹/626품목/1,498쌍이다. 과거 187그룹에서 그룹 수는 30 줄었지만 품목 수와 쌍 수는 동일하다.
- `SI-AL600A`와 `SI-AL600a`는 대소문자가 다른 별도 모델코드다. 이를 같은 키로 접으면 안 된다.
- QA 제외 전체 기준 이름 조회는 OUTBOUND 395라인 중 고유 104, 동명 285, 부재 6이다. INBOUND 6라인은 모두 고유 일치다.
- QA 제외 활성 기준 이름 조회는 OUTBOUND 242라인 중 고유 53, 동명 183, 부재 6이다.
+### 12. 실제 애플리케이션 조회 경로

명령:

```powershell
rg -n -C 10 "lookupByModelCodes|lookupByModelNames|lookupByName|productClient|modelNames|modelCodes" services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java
```

출력 원문:

```text
Exit code: 0
Wall time: 0.7 seconds
Output:
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-21-import java.util.TreeMap;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-22-import lombok.RequiredArgsConstructor;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-23-import org.springframework.stereotype.Service;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-24-import org.springframework.transaction.annotation.Transactional;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-25-
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-26-/** 확정 입출고 전표를 모델코드별로 집계하고 매입·판매 차액 이익률을 계산한다. */
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-27-@Service
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-28-@RequiredArgsConstructor
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-29-public class InOutAnalysisService {
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-30-    private final SlipRepository slipRepository;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java:31:    private final ProductClient productClient;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-32-
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-33-    /** 기간 내 확정 입출고를 조회한다. 원가 없는 판매 품목도 결과에서 제외하지 않는다. */
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-34-    @Transactional(readOnly = true)
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-35-    public List<InOutAnalysisResponse> list(LocalDate from, LocalDate to) {
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-36-        List<Slip> slips = new ArrayList<>();
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-37-        slips.addAll(slipRepository.findByPeriodWithLines(SlipType.INBOUND, from, to, null));
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-38-        slips.addAll(slipRepository.findByPeriodWithLines(SlipType.OUTBOUND, from, to, null));
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-39-        Map<String, ProductSummary> products = lookupProducts(slips);
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-40-        Map<String, MutableRow> rows = new LinkedHashMap<>();
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-41-        for (Slip slip : slips) {
--
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-54-                    row.outboundQuantity += line.getQuantity();
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-55-                    row.salesAmount = add(row.salesAmount, amount);
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-56-                }
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-57-                row.addMonthly(slip.getSlipDate(), slip.getSlipType() == SlipType.INBOUND, line.getQuantity());
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-58-            }
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-59-        }
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-60-        return rows.values().stream().map(MutableRow::toResponse).toList();
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-61-    }
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-62-
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-63-    private Map<String, ProductSummary> lookupProducts(List<Slip> slips) {
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java:64:        List<String> modelNames = slips.stream().flatMap(s -> s.getLines().stream())
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-65-                .map(SlipLine::getModelName)
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-66-                .filter(name -> name != null && !name.isBlank())
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-67-                .map(String::trim).distinct().toList();
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-68-        Map<String, ProductSummary> result = new HashMap<>();
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java:69:        if (modelNames.isEmpty()) {
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-70-            return result;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-71-        }
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java:72:        for (int start = 0; start < modelNames.size(); start += 100) {
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java:73:            List<String> chunk = modelNames.subList(start, Math.min(start + 100, modelNames.size()));
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java:74:            productClient.lookupByModelNames(chunk).forEach(p -> result.put(p.modelName(), p));
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-75-        }
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-76-        return result;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-77-    }
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-78-
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-79-    private static boolean isConfirmed(Slip slip) {
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-80-        return slip.getStatus() == SlipStatus.CONFIRMED
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-81-                || slip.getStatus() == SlipStatus.DELIVERED
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-82-                || slip.getStatus() == SlipStatus.COMPLETED;
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-83-    }
services\slip-service\src\main\java\com\samhanair\logis\slip\service\InOutAnalysisService.java-84-
--
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-97-    /**
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-98-     * 모델코드 일괄 조회 (internal) — partner-order 상세 productType enrich 경로.
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-99-     *
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-100-     * <p>direct PUT 주문 라인은 실제 product UUID 대신 synthetic stableProductId 를 저장할 수 있으므로,
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-101-     * productId 가 아니라 주문 라인 snapshot 의 modelCode 로 BUNDLE 여부를 조회한다.
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-102-     */
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-103-    @Operation(summary = "모델코드 일괄 조회 (internal)",
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-104-            description = "X-Internal-Token 인증 후 호출. partner-order 상세 productType enrich 전용.")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-105-    @ApiResponses({
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-106-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java:107:            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "modelCodes 누락/공백"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-108-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-109-    })
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-110-    @PostMapping("/lookup-by-model-codes")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java:111:    public ApiResponse<List<ProductSummaryResponse>> lookupByModelCodes(
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-112-            @Valid @RequestBody LookupByModelCodesRequest request) {
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java:113:        return ApiResponse.ok(productService.lookupByModelCodes(request.modelCodes()));
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-114-    }
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-115-
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-116-    /**
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-117-     * 모델명 일괄 조회 (internal) — 전표 분석처럼 입력값이 모델명인 호출자 전용.
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-118-     * modelCode가 없는 이카운트 계보도 model_name으로 조회한다.
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-119-     */
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-120-    @Operation(summary = "모델명 일괄 조회 (internal)",
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-121-            description = "X-Internal-Token 인증 후 호출. 입력 모델명 기준 정확 매칭.")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-122-    @ApiResponses({
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-123-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java:124:            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "modelNames 누락/공백"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-125-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-126-    })
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-127-    @PostMapping("/lookup-by-model-names")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java:128:    public ApiResponse<List<ProductSummaryResponse>> lookupByModelNames(
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-129-            @Valid @RequestBody LookupByModelNamesRequest request) {
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java:130:        return ApiResponse.ok(productService.lookupByModelNames(request.modelNames()));
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-131-    }
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-132-
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-133-    @Operation(summary = "Ecount alias batch resolve (internal)",
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-134-            description = "X-Internal-Token authenticated product_db owner lookup for MIG-8 order transform.")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-135-    @ApiResponses({
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-136-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Resolved"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-137-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token missing or invalid")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-138-    })
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-139-    @PostMapping("/resolve-ecount-aliases")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-140-    public ApiResponse<EcountAliasResolveResponse> resolveEcountAliases(
--
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-296-    @Operation(summary = "제품명 단건 조회 (internal)",
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-297-            description = "X-Internal-Token 인증 후 호출. 이카운트 raw 품목명 정확 매칭 전용.")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-298-    @ApiResponses({
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-299-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-300-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "name 누락/공백"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-301-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-302-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "제품명에 해당하는 제품이 없습니다"),
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-303-            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "제품명 중복 매칭")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-304-    })
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-305-    @GetMapping("/by-name")
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java:306:    public ApiResponse<ProductSummaryResponse> lookupByName(@RequestParam String name) {
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-307-        return ApiResponse.ok(productService.lookupSummaryByName(name));
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-308-    }
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-309-
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-310-    /**
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-311-     * 세트 전개 (internal) — slip-service 견적/전표 생성 시 라인 품목을 구성품으로 전개.
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-312-     *
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-313-     * <p>BUNDLE EXPAND 면 옵션 선별 + 6:4 재배분된 구성품 라인 N개(첫 라인 setHead=true), KEEP/단일이면
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-314-     * 1 라인. legacy 종합견적서 explodeSetParts 정합. 단가는 setUnitOverride(화면 단가) base.
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-315-     */
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java-316-    @Operation(summary = "세트 전개 (internal)",
--
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-408-                .map(ProductSummaryResponse::from)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-409-                .toList();
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-410-    }
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-411-
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-412-    /**
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-413-     * modelCode 리스트의 카탈로그 정보를 일괄 조회한다.
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-414-     *
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-415-     * <p>partner-order 상세 enrich 는 direct PUT 라인의 synthetic productId 와 무관하게
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-416-     * 주문 라인에 저장된 사용자 식별자(modelName/modelCode snapshot)를 기준으로 productType 을 붙인다.
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-417-     *
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:418:     * @param modelCodes 조회할 modelCode 목록
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-419-     * @return 활성 Product 요약 목록 (미매칭 modelCode 는 UUID lookup 과 동일하게 생략)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-420-     */
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-421-    @Transactional(readOnly = true)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:422:    public List<ProductSummaryResponse> lookupByModelCodes(List<String> modelCodes) {
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:423:        if (modelCodes == null || modelCodes.isEmpty()) {
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-424-            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 modelCode가 비어있습니다");
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-425-        }
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:426:        if (modelCodes.size() > LOOKUP_MAX) {
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-427-            throw new BusinessException(ErrorCode.INVALID_INPUT,
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-428-                    "한 번에 조회할 수 있는 최대 제품 수는 " + LOOKUP_MAX + "건입니다");
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-429-        }
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:430:        List<String> normalized = modelCodes.stream()
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-431-                .filter(Objects::nonNull)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-432-                .map(String::trim)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-433-                .filter(s -> !s.isBlank())
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-434-                .collect(java.util.stream.Collectors.collectingAndThen(
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-435-                        java.util.stream.Collectors.toCollection(LinkedHashSet::new),
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-436-                        ArrayList::new));
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-437-        if (normalized.isEmpty()) {
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-438-            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 modelCode가 비어있습니다");
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-439-        }
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-440-        List<Product> codeMatches = productRepository.findByModelCodeInAndIsDeletedFalse(normalized);
--
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-454-        matches.addAll(nameMatches);
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-455-        return matches.stream()
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-456-                .map(ProductSummaryResponse::from)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-457-                .toList();
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-458-    }
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-459-
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-460-    /**
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-461-     * 모델명 기준 벌크 조회 — 이카운트 계보처럼 modelCode가 없는 제품도 전건 해소한다.
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-462-     * 기존 모델코드 조회 계약은 다른 호출자가 사용하므로 이 메서드와 분리한다.
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-463-     *
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:464:     * @param modelNames 조회할 모델명 목록
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-465-     * @return 활성 제품 요약 목록
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-466-     */
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-467-    @Transactional(readOnly = true)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:468:    public List<ProductSummaryResponse> lookupByModelNames(List<String> modelNames) {
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:469:        if (modelNames == null || modelNames.isEmpty()) {
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-470-            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 modelName이 비어있습니다");
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-471-        }
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:472:        if (modelNames.size() > LOOKUP_MAX) {
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-473-            throw new BusinessException(ErrorCode.INVALID_INPUT,
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-474-                    "한 번에 조회할 수 있는 최대 제품 수는 " + LOOKUP_MAX + "건입니다");
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-475-        }
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java:476:        List<String> normalized = modelNames.stream()
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-477-                .filter(Objects::nonNull)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-478-                .map(String::trim)
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-479-                .filter(s -> !s.isBlank())
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-480-                .collect(java.util.stream.Collectors.collectingAndThen(
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-481-                        java.util.stream.Collectors.toCollection(LinkedHashSet::new),
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-482-                        ArrayList::new));
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-483-        if (normalized.isEmpty()) {
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-484-            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 modelName이 비어있습니다");
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-485-        }
services\product-service\src\main\java\com\samhanair\logis\product\service\ProductService.java-486-        return productRepository.findByModelNameInAndIsDeletedFalse(normalized).stream()
--
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-151-     * 선례와 동일 패턴.
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-152-     *
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-153-     * @param id 부모 Product.id
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-154-     * @return 잠금 획득한 Product Optional (soft-delete 행은 {@code @SQLRestriction} 으로 제외)
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-155-     */
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-156-    @Lock(LockModeType.PESSIMISTIC_WRITE)
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-157-    @Query("SELECT p FROM Product p WHERE p.id = :id")
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-158-    Optional<Product> findByIdForUpdate(@Param("id") UUID id);
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-159-
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-160-    /** #30 — estimate 카탈로그 벌크: 구성품 modelCode 묶음 조회. */
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java:161:    List<Product> findByModelCodeInAndIsDeletedFalse(java.util.Collection<String> modelCodes);
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-162-
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-163-    /**
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-164-     * modelName 묶음 조회 (#5 display-orders 벌크 해소 2차).
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-165-     *
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-166-     * <p>{@code model_code} 1차 IN 조회에서 미해소된 식별자를 {@code model_name} 으로
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-167-     * 일괄 재조회한다 — {@link #findByCatalogExposedModelCodeAndIsDeletedFalse} 의
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-168-     * model_name fallback 을 벌크화하여 N+1 을 제거하기 위함.
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-169-     */
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java:170:    List<Product> findByModelNameInAndIsDeletedFalse(java.util.Collection<String> modelNames);
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-171-
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-172-    boolean existsByModelCodeAndIsDeletedFalse(String modelCode);
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-173-
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-174-    Optional<Product> findByProductCodeAndIsDeletedFalse(String productCode);
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-175-
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-176-    boolean existsByProductCodeAndIsDeletedFalse(String productCode);
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-177-
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-178-    /**
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-179-     * 카탈로그 endpoint 필터 — usageScope(IN 확장 시멘틱)/M:N estimateCategory/q 조합 검색.
services\product-service\src\main\java\com\samhanair\logis\product\repository\ProductRepository.java-180-     *

```

판독:

- 입출고 분석은 라인 `SlipLine.getModelName()` 값을 모아 `ProductClient.lookupByModelNames()`를 호출한다.
- product-service의 해당 endpoint는 활성 품목 `products.model_name IN (...)`을 정확 조회한다.
- 즉 데이터 의미상 라인 값은 모델코드처럼 보이지만 현재 분석 경로가 실제 조인하는 DB 컬럼은 `products.model_name`이다.
- 별도의 `lookup-by-model-codes`는 `products.model_code`를 먼저 보고 `model_name` fallback을 쓰는 다른 계약이다.
- 이름 단건 조회 `/products/internal/by-name`은 중복 시 409, 미존재 시 404 계약이다. 따라서 동명 1,498쌍은 실제 이름 기반 조회의 실패 표면이다.
+### 13. 라인 모델값과 실제 서비스 조회 컬럼의 전수 일치

명령:

```powershell
$ErrorActionPreference = 'Stop'
$slipSql = @"
SELECT json_build_object(
  'slip_type', s.slip_type,
  'qa', (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')),
  'slip_is_deleted', s.is_deleted,
  'line_is_deleted', l.is_deleted,
  'line_model_value', BTRIM(l.model_name)
)::text
FROM slip_lines l
JOIN slips s ON s.id = l.slip_id
ORDER BY s.slip_type, s.slip_no, l.created_at, l.id
"@
$productSql = @"
SELECT json_build_object(
  'model_code', BTRIM(model_code),
  'model_name', BTRIM(model_name),
  'is_live', (NOT is_deleted AND deleted_at IS NULL)
)::text
FROM products
ORDER BY id
"@
$lineRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d slip_db -c $slipSql | ForEach-Object { $_ | ConvertFrom-Json })
$productRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d product_db -c $productSql | ForEach-Object { $_ | ConvertFrom-Json })
function New-OrdinalMap {
  return [System.Collections.Generic.Dictionary[string,object]]::new([System.StringComparer]::Ordinal)
}
function Add-Count {
  param($Table, [string]$Key)
  if ([string]::IsNullOrWhiteSpace($Key)) { return }
  if ($Table.ContainsKey($Key)) { $Table[$Key] = [int]$Table[$Key] + 1 }
  else { $Table[$Key] = 1 }
}
$liveModelCode = New-OrdinalMap
$deletedModelCode = New-OrdinalMap
$liveModelName = New-OrdinalMap
$deletedModelName = New-OrdinalMap
foreach ($product in $productRows) {
  if ([bool]$product.is_live) {
    Add-Count $liveModelCode ([string]$product.model_code)
    Add-Count $liveModelName ([string]$product.model_name)
  } else {
    Add-Count $deletedModelCode ([string]$product.model_code)
    Add-Count $deletedModelName ([string]$product.model_name)
  }
}
$scopes = @(
  [pscustomobject]@{ Name = 'ALL_INCLUDING_QA'; Rows = @($lineRows) },
  [pscustomobject]@{ Name = 'ALL_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa }) },
  [pscustomobject]@{ Name = 'LIVE_INCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) },
  [pscustomobject]@{ Name = 'LIVE_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa -and -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) }
)
function Count-Where {
  param([object[]]$Rows, [scriptblock]$Predicate)
  return @($Rows | Where-Object $Predicate).Count
}
Write-Output 'LINE_MODEL_VALUE_MATCH_BY_DB_COLUMN'
Write-Output 'scope|slip_type|lines|product_model_code_live|product_model_code_missing_active|product_model_name_live|product_model_name_missing_active|product_model_name_absent_all|product_model_name_soft_deleted_only'
foreach ($scope in $scopes) {
  foreach ($type in @('OUTBOUND', 'INBOUND')) {
    $rows = @($scope.Rows | Where-Object { $_.slip_type -eq $type })
    $codeLive = Count-Where $rows { $liveModelCode.ContainsKey([string]$_.line_model_value) }
    $nameLive = Count-Where $rows { $liveModelName.ContainsKey([string]$_.line_model_value) }
    $nameAbsentAll = Count-Where $rows { -not $liveModelName.ContainsKey([string]$_.line_model_value) -and -not $deletedModelName.ContainsKey([string]$_.line_model_value) }
    $nameDeletedOnly = Count-Where $rows { -not $liveModelName.ContainsKey([string]$_.line_model_value) -and $deletedModelName.ContainsKey([string]$_.line_model_value) }
    Write-Output (@($scope.Name, $type, $rows.Count, $codeLive, ($rows.Count - $codeLive), $nameLive, ($rows.Count - $nameLive), $nameAbsentAll, $nameDeletedOnly) -join '|')
  }
}
Write-Output ''
Write-Output 'DISTINCT_LINE_MODEL_VALUES'
foreach ($scope in $scopes) {
  foreach ($type in @('OUTBOUND', 'INBOUND')) {
    $rows = @($scope.Rows | Where-Object { $_.slip_type -eq $type })
    $distinct = @($rows | Select-Object -ExpandProperty line_model_value -Unique)
    $matchedModelNames = @($distinct | Where-Object { $liveModelName.ContainsKey([string]$_) })
    Write-Output (@($scope.Name, $type, $distinct.Count, $matchedModelNames.Count, ($distinct.Count - $matchedModelNames.Count)) -join '|')
  }
}
Write-Output ''
Write-Output 'PRODUCT_MODEL_CODE_VS_MODEL_NAME'
docker exec samhan-postgres psql -X -P pager=off -U samhan -d product_db -c "BEGIN READ ONLY; SELECT CASE WHEN model_code = model_name THEN 'SAME' WHEN model_code IS NULL OR BTRIM(model_code) = '' THEN 'MODEL_CODE_EMPTY' WHEN model_name IS NULL OR BTRIM(model_name) = '' THEN 'MODEL_NAME_EMPTY' ELSE 'DIFFERENT' END AS relation, COUNT(*) FROM products GROUP BY relation ORDER BY relation; SELECT model_code, model_name, name, product_code, is_deleted FROM products WHERE model_code IS DISTINCT FROM model_name ORDER BY model_code, model_name LIMIT 20; COMMIT;"
```

출력 원문:

```text
Exit code: 0
Wall time: 3.9 seconds
Output:
LINE_MODEL_VALUE_MATCH_BY_DB_COLUMN
scope|slip_type|lines|product_model_code_live|product_model_code_missing_active|product_model_name_live|product_model_name_missing_active|product_model_name_absent_all|product_model_name_soft_deleted_only
ALL_INCLUDING_QA|OUTBOUND|396|396|0|396|0|0|0
ALL_INCLUDING_QA|INBOUND|6|6|0|6|0|0|0
ALL_EXCLUDING_QA|OUTBOUND|395|395|0|395|0|0|0
ALL_EXCLUDING_QA|INBOUND|6|6|0|6|0|0|0
LIVE_INCLUDING_QA|OUTBOUND|243|243|0|243|0|0|0
LIVE_INCLUDING_QA|INBOUND|0|0|0|0|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|242|242|0|242|0|0|0
LIVE_EXCLUDING_QA|INBOUND|0|0|0|0|0|0|0

DISTINCT_LINE_MODEL_VALUES
ALL_INCLUDING_QA|OUTBOUND|18|18|0
ALL_INCLUDING_QA|INBOUND|1|1|0
ALL_EXCLUDING_QA|OUTBOUND|18|18|0
ALL_EXCLUDING_QA|INBOUND|1|1|0
LIVE_INCLUDING_QA|OUTBOUND|17|17|0
LIVE_INCLUDING_QA|INBOUND|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|17|17|0
LIVE_EXCLUDING_QA|INBOUND|0|0|0

PRODUCT_MODEL_CODE_VS_MODEL_NAME
BEGIN
 relation | count 
----------+-------
 SAME     |  3063
(1 row)

 model_code | model_name | name | product_code | is_deleted 
------------+------------+------+--------------+------------
(0 rows)

COMMIT

```

판독:

- `products.model_code = products.model_name`은 전체 3,063/3,063이다.
- 따라서 현재 데이터에서는 라인 모델값을 `model_code`로 조회하든 실제 분석 경로처럼 `model_name`으로 조회하든 결과가 같다.
- QA 제외 전체 401라인의 모델값은 `products.model_name` 활성 행에 401/401 일치한다. 고유 요청값 기준도 OUTBOUND 18/18, INBOUND 1/1이다.
- 활성 QA 제외 242라인도 242/242 일치한다. 임포트 누락·soft delete로 인해 분석 endpoint가 생략할 모델값은 0건이다.

### 14. 서비스 실행 상태

명령:

```powershell
docker ps --filter "name=samhan-" --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
```

출력 원문:

```text
Exit code: 0
Wall time: 1.3 seconds
Output:
NAMES                          IMAGE                                                  PORTS
samhan-product-service         infrastructure-product-service                         127.0.0.1:8084->8084/tcp
samhan-api-gateway             infrastructure-api-gateway                             127.0.0.1:8080->8080/tcp
samhan-accounting-service      infrastructure-accounting-service                      127.0.0.1:8087->8087/tcp
samhan-auth-service            infrastructure-auth-service                            127.0.0.1:8081->8081/tcp
samhan-slip-service            infrastructure-slip-service                            127.0.0.1:8086->8086/tcp
samhan-notification-service    infrastructure-notification-service                    127.0.0.1:8093->8093/tcp
samhan-groupware-service       infrastructure-groupware-service                       127.0.0.1:8092->8092/tcp
samhan-partner-order-service   infrastructure-partner-order-service                   127.0.0.1:8088->8088/tcp
samhan-dc-config-service       infrastructure-dc-config-service                       127.0.0.1:8089->8089/tcp
samhan-eureka                  infrastructure-eureka-server                           127.0.0.1:8761->8761/tcp
samhan-postgres                postgres:16-alpine                                     0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
samhan-user-service            infrastructure-user-service                            127.0.0.1:8083->8083/tcp
samhan-inventory-service       infrastructure-inventory-service                       127.0.0.1:8085->8085/tcp
samhan-partner-service         infrastructure-partner-service                         127.0.0.1:8095->8095/tcp
samhan-arologis-service        infrastructure-arologis-service                        127.0.0.1:8097->8097/tcp
samhan-partner-auth-service    infrastructure-partner-auth-service                    127.0.0.1:8091->8091/tcp
samhan-grafana                 grafana/grafana:11.3.1                                 127.0.0.1:3000->3000/tcp, 0.0.0.0:3100->3000/tcp, [::]:3100->3000/tcp
samhan-dashboard-service       infrastructure-dashboard-service                       127.0.0.1:8094->8094/tcp
samhan-minio                   minio/minio:latest                                     0.0.0.0:9000-9001->9000-9001/tcp, [::]:9000-9001->9000-9001/tcp
samhan-elasticsearch           docker.elastic.co/elasticsearch/elasticsearch:8.15.3   0.0.0.0:9200->9200/tcp, [::]:9200->9200/tcp
samhan-rabbitmq                rabbitmq:3.13-management-alpine                        0.0.0.0:5672->5672/tcp, [::]:5672->5672/tcp, 0.0.0.0:15672->15672/tcp, [::]:15672->15672/tcp
samhan-redis                   redis:7-alpine                                         0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp

```

판독:

- `samhan-product-service`는 호스트 `127.0.0.1:8084`에 실행 중이고, `samhan-slip-service`도 실행 중이다.
- 다음 단계에서 실제 internal lookup 응답 건수를 DB 예측값과 비교한다. 서비스 재빌드·재배포는 하지 않는다.
+### 15. 실 product-service 경계 검증

인증 환경변수 이름 확인 명령(값은 출력하지 않음):

```powershell
$containers = @("samhan-slip-service", "samhan-product-service"); foreach ($container in $containers) { Write-Output "[$container]"; ((docker inspect $container | ConvertFrom-Json)[0].Config.Env | ForEach-Object { ($_ -split "=", 2)[0] } | Where-Object { $_ -match "TOKEN|INTERNAL|SECURITY" } | Sort-Object -Unique) }
```

출력 원문:

```text
Exit code: 0
Wall time: 1.3 seconds
Output:
[samhan-slip-service]
SAMHAN_INTERNAL_TOKEN
[samhan-product-service]
SAMHAN_INTERNAL_TOKEN

```

읽기 전용 internal 조회 명령:

```powershell
$ErrorActionPreference = 'Stop'
$slipSql = @"
SELECT json_build_object(
  'slip_type', s.slip_type,
  'qa', (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')),
  'slip_is_deleted', s.is_deleted,
  'line_is_deleted', l.is_deleted,
  'product_id', l.product_id,
  'line_model_value', BTRIM(l.model_name),
  'product_name', BTRIM(l.product_name)
)::text
FROM slip_lines l
JOIN slips s ON s.id = l.slip_id
ORDER BY s.slip_type, s.slip_no, l.created_at, l.id
"@
$lineRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d slip_db -c $slipSql | ForEach-Object { $_ | ConvertFrom-Json })
$envRows = (docker inspect samhan-slip-service | ConvertFrom-Json)[0].Config.Env
$tokenEntry = $envRows | Where-Object { $_ -like 'SAMHAN_INTERNAL_TOKEN=*' } | Select-Object -First 1
if (-not $tokenEntry) { throw 'SAMHAN_INTERNAL_TOKEN is unavailable' }
$internalToken = ($tokenEntry -split '=', 2)[1]
$headers = @{ 'X-Internal-Token' = $internalToken }
$baseUrl = 'http://127.0.0.1:8084/products/internal'

function Invoke-BatchLookup {
  param([string]$Path, [string]$BodyKey, [string[]]$Values)
  $responseItems = 0
  $statuses = @()
  for ($start = 0; $start -lt $Values.Count; $start += 100) {
    $end = [Math]::Min($start + 99, $Values.Count - 1)
    [string[]]$chunk = @($Values[$start..$end])
    $body = @{ $BodyKey = $chunk } | ConvertTo-Json -Depth 4 -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri ($baseUrl + $Path) -Headers $headers -ContentType 'application/json' -Body $body
    $statuses += [int]$response.StatusCode
    $payload = $response.Content | ConvertFrom-Json
    $responseItems += @($payload.data).Count
  }
  return [pscustomobject]@{
    Requested = $Values.Count
    ResponseItems = $responseItems
    Statuses = ($statuses -join ',')
  }
}

[string[]]$distinctIds = @($lineRows | Select-Object -ExpandProperty product_id -Unique | ForEach-Object { [string]$_ })
[string[]]$distinctModels = @($lineRows | Select-Object -ExpandProperty line_model_value -Unique | ForEach-Object { [string]$_ })
$uuidResult = Invoke-BatchLookup '/lookup' 'ids' $distinctIds
$modelResult = Invoke-BatchLookup '/lookup-by-model-names' 'modelNames' $distinctModels
Write-Output 'LIVE_INTERNAL_BATCH_LOOKUPS'
Write-Output 'lookup|requested_distinct|response_items|http_statuses'
Write-Output (@('uuid', $uuidResult.Requested, $uuidResult.ResponseItems, $uuidResult.Statuses) -join '|')
Write-Output (@('line_model_value_to_product_model_name', $modelResult.Requested, $modelResult.ResponseItems, $modelResult.Statuses) -join '|')

$ordinalStatusByName = [System.Collections.Generic.Dictionary[string,int]]::new([System.StringComparer]::Ordinal)
[string[]]$distinctNames = @($lineRows | Select-Object -ExpandProperty product_name -Unique | ForEach-Object { [string]$_ })
foreach ($name in $distinctNames) {
  $encoded = [Uri]::EscapeDataString($name)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri ($baseUrl + '/by-name?name=' + $encoded) -Headers $headers
    $ordinalStatusByName[$name] = [int]$response.StatusCode
  } catch {
    if ($null -ne $_.Exception.Response) {
      $ordinalStatusByName[$name] = [int]$_.Exception.Response.StatusCode
    } else {
      throw
    }
  }
}
Write-Output ''
Write-Output 'LIVE_INTERNAL_NAME_LOOKUPS_DISTINCT'
Write-Output 'http_status|distinct_names'
foreach ($status in @(200, 404, 409)) {
  $count = @($ordinalStatusByName.GetEnumerator() | Where-Object { $_.Value -eq $status }).Count
  Write-Output ($status.ToString() + '|' + $count)
}
Write-Output ('total|' + $distinctNames.Count)

$scopes = @(
  [pscustomobject]@{ Name = 'ALL_INCLUDING_QA'; Rows = @($lineRows) },
  [pscustomobject]@{ Name = 'ALL_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa }) },
  [pscustomobject]@{ Name = 'LIVE_INCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) },
  [pscustomobject]@{ Name = 'LIVE_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa -and -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) }
)
Write-Output ''
Write-Output 'LIVE_INTERNAL_NAME_LOOKUPS_BY_LINE'
Write-Output 'scope|slip_type|lines|http_200|http_404|http_409|other'
foreach ($scope in $scopes) {
  foreach ($type in @('OUTBOUND', 'INBOUND')) {
    $rows = @($scope.Rows | Where-Object { $_.slip_type -eq $type })
    $s200 = @($rows | Where-Object { $ordinalStatusByName[[string]$_.product_name] -eq 200 }).Count
    $s404 = @($rows | Where-Object { $ordinalStatusByName[[string]$_.product_name] -eq 404 }).Count
    $s409 = @($rows | Where-Object { $ordinalStatusByName[[string]$_.product_name] -eq 409 }).Count
    Write-Output (@($scope.Name, $type, $rows.Count, $s200, $s404, $s409, ($rows.Count - $s200 - $s404 - $s409)) -join '|')
  }
}
```

출력 원문:

```text
Exit code: 0
Wall time: 3.7 seconds
Output:
LIVE_INTERNAL_BATCH_LOOKUPS
lookup|requested_distinct|response_items|http_statuses
uuid|18|18|200
line_model_value_to_product_model_name|18|18|200

LIVE_INTERNAL_NAME_LOOKUPS_DISTINCT
http_status|distinct_names
200|9
404|1
409|6
total|16

LIVE_INTERNAL_NAME_LOOKUPS_BY_LINE
scope|slip_type|lines|http_200|http_404|http_409|other
ALL_INCLUDING_QA|OUTBOUND|396|104|6|286|0
ALL_INCLUDING_QA|INBOUND|6|6|0|0|0
ALL_EXCLUDING_QA|OUTBOUND|395|104|6|285|0
ALL_EXCLUDING_QA|INBOUND|6|6|0|0|0
LIVE_INCLUDING_QA|OUTBOUND|243|53|6|184|0
LIVE_INCLUDING_QA|INBOUND|0|0|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|242|53|6|183|0
LIVE_EXCLUDING_QA|INBOUND|0|0|0|0|0

```

판독:

- 실제 UUID 벌크 조회는 서로 다른 품목 18건 요청 → 18건 응답, HTTP 200이다.
- 실제 라인 모델값→`products.model_name` 벌크 조회도 서로 다른 값 18건 요청 → 18건 응답, HTTP 200이다.
- 따라서 현재 402라인에서 서비스 경계 때문에 DB 일치 품목이 누락되는 사례는 0건이다.
- 실제 이름 endpoint는 서로 다른 16개 이름 중 200 성공 9개, 404 미존재 1개, 409 동명 6개다.
- 라인 발생 건수로는 QA 제외 전체 OUTBOUND 395라인 중 104라인만 이름 조회 성공, 6라인 404, 285라인 409다. INBOUND 6라인은 전부 200이다.
- 활성 QA 제외 OUTBOUND 242라인은 200 53라인, 404 6라인, 409 183라인이다.
- 이름 기반 조회 실패는 DB 추정이 아니라 실행 중 product-service의 실제 HTTP 계약으로 재현됐다.
+### 16. 3,183 기록과 현재 3,063의 이력 대조

V26~V30 파일 검색 명령:

```powershell
rg --files services\product-service | rg "[\\/](V26|V27|V28|V29|V30)__|984|ecount"
```

출력 원문:

```text
Exit code: 0
Wall time: 0.8 seconds
Output:
services\product-service\src\test\resources\ecount-raw-fixtures\product-group.csv
services\product-service\src\test\resources\ecount-raw-fixtures\product-item.csv
services\product-service\src\test\resources\ecount-raw-fixtures\product-relation.csv
services\product-service\src\main\resources\db\migration\V7__add_product_aliases_and_ecount_staging.sql
services\product-service\src\main\resources\db\migration\V5__add_ecount_product_fields.sql
services\product-service\src\main\resources\db\migration\V30__preserve_legacy_product_codes_as_aliases.sql
services\product-service\src\main\resources\db\migration\V29__add_ecount_alias_reservations.sql
services\product-service\src\main\resources\db\migration\V28__add_product_lineage.sql
services\product-service\src\main\resources\db\migration\V27__allow_skipped_main_candidate_status.sql
services\product-service\src\main\resources\db\migration\V26__align_price_change_schedule_to_live_gas.sql

```

카운트 이력 검색 명령:

```powershell
rg -n -C 8 "3063|3,063|3183|3,183" docs\dev-reports\2026-08-03-984-live-qa.md docs\dev-reports\2026-08-03-984-r14-sol-review.md docs\handoff\CURRENT-WORK.md
```

출력 원문:

```text
Exit code: 0
Wall time: 1.1 seconds
Output:
docs\dev-reports\2026-08-03-984-r14-sol-review.md-65-
docs\dev-reports\2026-08-03-984-r14-sol-review.md-66-{"totalRows":2854,"imported":0,"updated":2696,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2853,"sourceFileHash":"7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678","rejectedSample":[{"rowNumber":2854,"reason":"REJECT_NAME_NULL","rawCode":"2026/07/28  오후 8:37:21","rawName":""}],"skippedGroupCount":0,"skippedGroups":[]}
docs\dev-reports\2026-08-03-984-r14-sol-review.md-67-HTTP_STATUS=200
docs\dev-reports\2026-08-03-984-r14-sol-review.md-68-```
docs\dev-reports\2026-08-03-984-r14-sol-review.md-69-
docs\dev-reports\2026-08-03-984-r14-sol-review.md-70-읽기 전용 DB 후조회:
docs\dev-reports\2026-08-03-984-r14-sol-review.md-71-
docs\dev-reports\2026-08-03-984-r14-sol-review.md-72-```text
docs\dev-reports\2026-08-03-984-r14-sol-review.md:73:products_total=3194 products_active=3183
docs\dev-reports\2026-08-03-984-r14-sol-review.md-74-aliases_total=2953 aliases_active=2953
docs\dev-reports\2026-08-03-984-r14-sol-review.md-75-staging_alias_total=2853
docs\dev-reports\2026-08-03-984-r14-sol-review.md-76-
docs\dev-reports\2026-08-03-984-r14-sol-review.md-77-source_file_hash=F7918B9FC9D88B75A5A14A014436D3E99DABEAE4E860493F5DAB9AD7D3D5DE35
docs\dev-reports\2026-08-03-984-r14-sol-review.md-78-rows=158 min_row=3 max_row=160
docs\dev-reports\2026-08-03-984-r14-sol-review.md-79-```
docs\dev-reports\2026-08-03-984-r14-sol-review.md-80-
docs\dev-reports\2026-08-03-984-r14-sol-review.md-81-XLSX 자체 SHA-256과 staging relation source hash가 일치하며 158행이 적재되어, 이 200은 관계 파일을 무시한 성공이 아니다.
--
docs\handoff\CURRENT-WORK.md-202----
docs\handoff\CURRENT-WORK.md-203-
docs\handoff\CURRENT-WORK.md-204-## 8. 환경 메모 — ⚠️ 집PC 실측이라 회사PC 에서 다시 잴 것
docs\handoff\CURRENT-WORK.md-205-
docs\handoff\CURRENT-WORK.md-206-```text
docs\handoff\CURRENT-WORK.md-207-accounting_db  V68 이 빠진 채 V95 까지 올라간 구멍 → 개발책임자 승인으로 out-of-order 적용해 메움
docs\handoff\CURRENT-WORK.md-208-               ※ 회사PC QA 가 flyway 를 끄고 돌 수밖에 없었던 근본 원인
docs\handoff\CURRENT-WORK.md-209-auth_db        V90 → V93 (#1059 배포로 V91·V92·V93 적용)
docs\handoff\CURRENT-WORK.md:210:product_db     V26 → V30 · 품목코드 공백 1,120/1,220 → 387/3,183 (#984 임포트)
docs\handoff\CURRENT-WORK.md-211-slip-service   호스트 influxd 가 8086 선점 → docker-compose.slip-port-override.yml 로 18086
docs\handoff\CURRENT-WORK.md-212-inventory      전 품목 inventory_qty_mgmt=true — 재고 없이 출고 불가 (실 입고 필요)
docs\handoff\CURRENT-WORK.md-213-계정           dev_manager·dev_dispatch = V5 시드 비밀번호 / janyeonggu = 기존 QA 자격
docs\handoff\CURRENT-WORK.md-214-               회계 배분은 dev_accountant (accounting.sales-slip.accounting 보유)
docs\handoff\CURRENT-WORK.md-215-전표 실재 날짜  2026-08-03 6건 · 08-01 4건 · 07-27 66건 · 07-17 73건 (모두 -1 전표 있음)
docs\handoff\CURRENT-WORK.md-216-세트           구성품 전부 코드 보유: AC060CS1DBC1SY · AF60F19D11WRS · AF70F17D11LRS
docs\handoff\CURRENT-WORK.md-217-QA throwaway   2026/08/03-1~6 · 2026/06/24-901·902 · 2026/08/03-QA-1013-* · QA-874-*
docs\handoff\CURRENT-WORK.md-218-               accounting_db source_type='SLIP' AND created_by='system' 29건 (2026-06-23)
--
docs\handoff\CURRENT-WORK.md-329-
docs\handoff\CURRENT-WORK.md-330-### 6. 환경 메모 (집PC)
docs\handoff\CURRENT-WORK.md-331-
docs\handoff\CURRENT-WORK.md-332-```text
docs\handoff\CURRENT-WORK.md-333-accounting_db  V68 이 빠진 채 V95 까지 올라간 구멍 → 개발책임자 승인으로 out-of-order 적용해 메움
docs\handoff\CURRENT-WORK.md-334-               (회사PC QA 가 flyway 를 끄고 돌 수밖에 없었던 근본 원인)
docs\handoff\CURRENT-WORK.md-335-auth_db        V90 → V93 (#1059 배포로 V91·V92·V93 적용)
docs\handoff\CURRENT-WORK.md-336-slip-service   호스트 influxd 가 8086 선점 → slip-port-override.yml 로 18086
docs\handoff\CURRENT-WORK.md:337:product_db     V26 → V30 · 품목코드 공백 1,120/1,220 → 387/3,183 (#984 임포트)
docs\handoff\CURRENT-WORK.md-338-inventory      전 품목 inventory_qty_mgmt=true — 재고 없이 출고 불가
docs\handoff\CURRENT-WORK.md-339-계정           dev_manager·dev_dispatch = V5 시드 비밀번호 / janyeonggu = 기존 QA 자격
docs\handoff\CURRENT-WORK.md-340-전표 실재 날짜  2026-08-03 6건 · 08-01 4건 · 07-27 66건 · 07-17 73건
docs\handoff\CURRENT-WORK.md-341-```
docs\handoff\CURRENT-WORK.md-342-
docs\handoff\CURRENT-WORK.md-343----
docs\handoff\CURRENT-WORK.md-344-
docs\handoff\CURRENT-WORK.md-345-## 2026-08-03 집PC 야간 세션 — **머지 1건** · 라이브QA 가 CI green PR 을 세 번 되돌림
--
docs\handoff\CURRENT-WORK.md-422-- **집PC 자원**: Docker 21개 + gradle + Playwright + codex 4개를 동시에 돌려 PC 가 고갈됐다. 여유 13.5GB 까지 떨어졌다. **집PC 는 개발 전용이 아니다.**
docs\handoff\CURRENT-WORK.md-423-
docs\handoff\CURRENT-WORK.md-424-### 6. 환경 메모 (집PC)
docs\handoff\CURRENT-WORK.md-425-
docs\handoff\CURRENT-WORK.md-426-```text
docs\handoff\CURRENT-WORK.md-427-accounting_db  V68 이 빠진 채 V95 까지 올라간 이력 구멍 → 개발책임자 승인으로 out-of-order 1회 적용해 메움
docs\handoff\CURRENT-WORK.md-428-               ※ 회사PC QA 가 flyway.enabled=false 로 돌 수밖에 없었던 근본 원인이었다
docs\handoff\CURRENT-WORK.md-429-slip-service   호스트 influxd 가 8086 선점 → docker-compose.slip-port-override.yml 로 18086 매핑
docs\handoff\CURRENT-WORK.md:430:product_db     V26 → V30 · 품목코드 공백 1,120/1,220 → 387/3,183 (#984 임포트)
docs\handoff\CURRENT-WORK.md-431-inventory      stock_instances AVAILABLE 1 → 실 입고로 생성해야 출고 가능
docs\handoff\CURRENT-WORK.md:432:               products 3,183건 전부 inventory_qty_mgmt=true (우회 불가)
docs\handoff\CURRENT-WORK.md-433-```
docs\handoff\CURRENT-WORK.md-434-
docs\handoff\CURRENT-WORK.md-435-### 7. 등록한 이슈
docs\handoff\CURRENT-WORK.md-436-
docs\handoff\CURRENT-WORK.md-437-- **#1064** 입고 전표 lifecycle 버튼과 API 전이 역전 — GUI 만으로 입고 완료 불가
docs\handoff\CURRENT-WORK.md-438-
docs\handoff\CURRENT-WORK.md-439-### 8. 개발책임자 판단 대기 (막지 않음)
docs\handoff\CURRENT-WORK.md-440-
--
docs\dev-reports\2026-08-03-984-live-qa.md-21-```powershell
docs\dev-reports\2026-08-03-984-live-qa.md-22-docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT 'products' AS table_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_deleted=FALSE) AS active, COUNT(*) FILTER (WHERE is_deleted=TRUE) AS deleted, COUNT(*) FILTER (WHERE model_name IS NOT NULL) AS model_name_present FROM public.products; SELECT 'product_aliases' AS table_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_deleted=FALSE) AS active, COUNT(*) FILTER (WHERE is_deleted=TRUE) AS deleted FROM public.product_aliases; COMMIT;"
docs\dev-reports\2026-08-03-984-live-qa.md-23-```
docs\dev-reports\2026-08-03-984-live-qa.md-24-
docs\dev-reports\2026-08-03-984-live-qa.md-25-- 실측 결과:
docs\dev-reports\2026-08-03-984-live-qa.md-26-
docs\dev-reports\2026-08-03-984-live-qa.md-27-| 테이블 | 전체 | 활성 | 삭제 | 비고 |
docs\dev-reports\2026-08-03-984-live-qa.md-28-|---|---:|---:|---:|---|
docs\dev-reports\2026-08-03-984-live-qa.md:29:| `products` | 3,063 | 3,061 | 2 | `model_name` 있음 3,063 |
docs\dev-reports\2026-08-03-984-live-qa.md-30-| `product_aliases` | 2,835 | 2,835 | 0 | 삭제 alias 0 |
docs\dev-reports\2026-08-03-984-live-qa.md-31-
docs\dev-reports\2026-08-03-984-live-qa.md-32-- 판정: **성공**. PM 사전 카운트와 일치한다.
docs\dev-reports\2026-08-03-984-live-qa.md-33-- 캡처: 없음. DB 조회 단계이며 화면 캡처 대상이 아니다.
docs\dev-reports\2026-08-03-984-live-qa.md-34-
docs\dev-reports\2026-08-03-984-live-qa.md-35-### 임포트 입력 고정 — 성공
docs\dev-reports\2026-08-03-984-live-qa.md-36-
docs\dev-reports\2026-08-03-984-live-qa.md-37-- `itemFile`: `docs/migration/ecount-data/raw/품목등록.xlsx` — PM 표기 2,855행(헤더 포함), 실제 품목 데이터 2,854행 — SHA-256 `3FD1A174D1EE9E3C8AA2F303AF932E331F8EB7BA646392DB2122DDF5B77DAE52`
--
docs\dev-reports\2026-08-03-984-live-qa.md-99-
docs\dev-reports\2026-08-03-984-live-qa.md-100-### 3. 임포트 후 카운트 — 성공(변경 없음, 임포트 실패로 rollback)
docs\dev-reports\2026-08-03-984-live-qa.md-101-
docs\dev-reports\2026-08-03-984-live-qa.md-102-- 조작: 409 응답 직후 `product_db`를 다시 `BEGIN TRANSACTION READ ONLY`로 조회했다. `public.products`, `public.product_aliases`, `staging.ecount_item_alias`를 확인했다.
docs\dev-reports\2026-08-03-984-live-qa.md-103-- 실측 결과:
docs\dev-reports\2026-08-03-984-live-qa.md-104-
docs\dev-reports\2026-08-03-984-live-qa.md-105-| 대상 | 임포트 전 | 임포트 후 | 증가 | 감소 | 변경된 행 |
docs\dev-reports\2026-08-03-984-live-qa.md-106-|---|---:|---:|---:|---:|---:|
docs\dev-reports\2026-08-03-984-live-qa.md:107:| `public.products` 전체 | 3,063 | 3,063 | 0 | 0 | 0건 확인 |
docs\dev-reports\2026-08-03-984-live-qa.md-108-| `public.products` 활성 | 3,061 | 3,061 | 0 | 0 | 0건 확인 |
docs\dev-reports\2026-08-03-984-live-qa.md-109-| `public.products` 삭제 | 2 | 2 | 0 | 0 | 0건 확인 |
docs\dev-reports\2026-08-03-984-live-qa.md-110-| `public.product_aliases` 전체 | 2,835 | 2,835 | 0 | 0 | 0건 확인 |
docs\dev-reports\2026-08-03-984-live-qa.md-111-| `public.product_aliases` 활성 | 2,835 | 2,835 | 0 | 0 | 0건 확인 |
docs\dev-reports\2026-08-03-984-live-qa.md-112-| `public.product_aliases` 삭제 | 0 | 0 | 0 | 0 | 0건 확인 |
docs\dev-reports\2026-08-03-984-live-qa.md-113-| `staging.ecount_item_alias` 전체 | 확인 전 별도 계수 없음 | 2,835 | - | - | 409 이후 새 staging 행 증가 없음으로 판단 |
docs\dev-reports\2026-08-03-984-live-qa.md-114-
docs\dev-reports\2026-08-03-984-live-qa.md-115-- 후속 확인 원문:
docs\dev-reports\2026-08-03-984-live-qa.md-116-
docs\dev-reports\2026-08-03-984-live-qa.md-117-```text
docs\dev-reports\2026-08-03-984-live-qa.md:118:products   total=3063 active=3061 deleted=2 model_name_present=3063
docs\dev-reports\2026-08-03-984-live-qa.md-119-product_aliases total=2835 active=2835 deleted=0
docs\dev-reports\2026-08-03-984-live-qa.md-120-staging.ecount_item_alias total=2835
docs\dev-reports\2026-08-03-984-live-qa.md-121-```
docs\dev-reports\2026-08-03-984-live-qa.md-122-
docs\dev-reports\2026-08-03-984-live-qa.md-123-- 판정: **성공(보호 확인)**. 임포트가 409에서 중단되어 전/후 카운트상 늘거나 줄거나 변경된 실데이터는 없다. 따라서 이후 단계의 “임포트 후 결과” 판정은 **미실시**로 명확히 구분한다.
docs\dev-reports\2026-08-03-984-live-qa.md-124-- 캡처: 없음. DB 조회 단계이며 화면 캡처 대상이 아니다.
docs\dev-reports\2026-08-03-984-live-qa.md-125-
docs\dev-reports\2026-08-03-984-live-qa.md-126-### 4. 오차단 검증 — 미실시(실 transform 경로 미진입)
--
docs\dev-reports\2026-08-03-984-live-qa.md-186-  - [02-login-plain.png](../qa/984-ecount-import-real-qa/02-login-plain.png) — 5173 로그인 URL 백색 화면
docs\dev-reports\2026-08-03-984-live-qa.md-187-  - [03-product-screen-blank.png](../qa/984-ecount-import-real-qa/03-product-screen-blank.png) — 5174 품목 화면 URL 백색 화면
docs\dev-reports\2026-08-03-984-live-qa.md-188-- 판정: **미실시 / 화면 게이트 BLOCKED**. 임포트 자체가 성공하지 않았고, UI renderer도 빈 화면이라 병합 결과가 화면에 보이는지와 항목 상세 클릭을 검증할 수 없었다. JSON·터미널 출력으로 화면 증거를 대체하지 않았다.
docs\dev-reports\2026-08-03-984-live-qa.md-189-
docs\dev-reports\2026-08-03-984-live-qa.md-190-## 최종 대조표 및 결론
docs\dev-reports\2026-08-03-984-live-qa.md-191-
docs\dev-reports\2026-08-03-984-live-qa.md-192-| 단계 | 실측/결과 | 판정 |
docs\dev-reports\2026-08-03-984-live-qa.md-193-|---|---|---|
docs\dev-reports\2026-08-03-984-live-qa.md:194:| 1. 임포트 전 | products 3,063(활성 3,061·삭제 2), product_aliases 2,835(활성 2,835·삭제 0) | 성공 |
docs\dev-reports\2026-08-03-984-live-qa.md-195-| 2. 실 임포트 | 게이트웨이 8080=404, product-service 8084 원본 XLSX=422 `MIG2_CSV_HEADER_MISMATCH`, CSV 변환본=409 `MIG2_ALIAS_DUPLICATE` (`AAAA-00005`, sourceRowNo 124) | **실패** |
docs\dev-reports\2026-08-03-984-live-qa.md-196-| 3. 임포트 후 | products/product_aliases 모두 전과 동일. API 409 이후 새 반영 없음 | 보호 확인 |
docs\dev-reports\2026-08-03-984-live-qa.md-197-| 4. 오차단 | PENDING 26,055행·3,489주문·474라벨은 남아 있음. 실 transform 미실행으로 거부 건수는 측정값 없음 | **미실시** |
docs\dev-reports\2026-08-03-984-live-qa.md-198-| 5. 병합 규칙 | 병합 결과 행 미생성. 값 소실 건수 측정값 없음 | **미실시** |
docs\dev-reports\2026-08-03-984-live-qa.md-199-| 6. AP110RNPPHH1 | 임포트 전/실패 후 코드 없음. 기존 `PHN-00027` 싱글 680,000원 | **미실시** |
docs\dev-reports\2026-08-03-984-live-qa.md-200-| 7. 삭제 UUID alias | public/staging 모두 dangling 0·삭제 Product 대상 0 | 현재 상태 성공, 임포트 회귀 미실시 |
docs\dev-reports\2026-08-03-984-live-qa.md-201-| 8. 화면 | renderer 5173/5174 백색 화면, 품목 목록·클릭·상세 도달 불가 | **미실시/BLOCKED** |
docs\dev-reports\2026-08-03-984-live-qa.md-202-

```

판독:

- V26~V30은 스키마 마이그레이션이고, 품목 행 적재 자체는 HTTP 임포트였다.
- 중간 실 임포트 보고에는 3,183 활성 품목이 기록됐지만, 후속 `2026-08-03-984-live-qa.md`는 현재와 같은 전체 3,063·활성 3,061·삭제 2를 명시한다.
- 현재 `samhan-postgres` 실측은 후속 QA 기준과 정확히 일치한다. 핸드오프의 3,183은 현재 컨테이너 비교 기준으로 사용할 수 없다.
- 이 보고서는 개발책임자 지시대로 현재 조사 시점 수치만 정본으로 삼고, 120건 차이가 생긴 쓰기 이력 자체는 이번 읽기 전용 라운드에서 재구성하지 않는다.
+### 17. 원인 분류·영향 전표 수·복구 가능성 전수표

명령:

```powershell
$ErrorActionPreference = 'Stop'
$slipSql = @"
SELECT json_build_object(
  'slip_no', s.slip_no,
  'slip_type', s.slip_type,
  'qa', (s.slip_no LIKE '%QA-%' OR s.slip_no IN ('2026/06/24-901', '2026/06/24-902')),
  'slip_is_deleted', s.is_deleted,
  'line_is_deleted', l.is_deleted,
  'model_code', BTRIM(l.model_name),
  'product_name', BTRIM(l.product_name)
)::text
FROM slip_lines l
JOIN slips s ON s.id = l.slip_id
ORDER BY s.slip_type, s.slip_no, l.created_at, l.id
"@
$productSql = @"
SELECT json_build_object(
  'name', BTRIM(name),
  'is_live', (NOT is_deleted AND deleted_at IS NULL)
)::text
FROM products
ORDER BY id
"@
$lineRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d slip_db -c $slipSql | ForEach-Object { $_ | ConvertFrom-Json })
$productRows = @(docker exec samhan-postgres psql -X -qAt -U samhan -d product_db -c $productSql | ForEach-Object { $_ | ConvertFrom-Json })
$nameCounts = [System.Collections.Generic.Dictionary[string,int]]::new([System.StringComparer]::Ordinal)
foreach ($product in $productRows) {
  if (-not [bool]$product.is_live) { continue }
  $name = [string]$product.name
  if ($nameCounts.ContainsKey($name)) { $nameCounts[$name] += 1 } else { $nameCounts[$name] = 1 }
}
foreach ($line in $lineRows) {
  $name = [string]$line.product_name
  $status = if (-not $nameCounts.ContainsKey($name)) { 'NAME_404_NOT_FOUND' }
            elseif ($nameCounts[$name] -gt 1) { 'NAME_409_AMBIGUOUS' }
            else { 'NAME_200_UNIQUE' }
  $line | Add-Member -NotePropertyName name_status -NotePropertyValue $status
}
$scopes = @(
  [pscustomobject]@{ Name = 'ALL_INCLUDING_QA'; Rows = @($lineRows) },
  [pscustomobject]@{ Name = 'ALL_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa }) },
  [pscustomobject]@{ Name = 'LIVE_INCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) },
  [pscustomobject]@{ Name = 'LIVE_EXCLUDING_QA'; Rows = @($lineRows | Where-Object { -not [bool]$_.qa -and -not [bool]$_.slip_is_deleted -and -not [bool]$_.line_is_deleted }) }
)
Write-Output 'NAME_PATH_IMPACT'
Write-Output 'scope|slip_type|category|lines|distinct_slips|distinct_models|distinct_names'
foreach ($scope in $scopes) {
  foreach ($type in @('OUTBOUND', 'INBOUND')) {
    foreach ($category in @('NAME_200_UNIQUE', 'NAME_404_NOT_FOUND', 'NAME_409_AMBIGUOUS')) {
      $rows = @($scope.Rows | Where-Object { $_.slip_type -eq $type -and $_.name_status -eq $category })
      $slips = @($rows | Select-Object -ExpandProperty slip_no -Unique).Count
      $models = @($rows | Select-Object -ExpandProperty model_code -Unique).Count
      $names = @($rows | Select-Object -ExpandProperty product_name -Unique).Count
      Write-Output (@($scope.Name, $type, $category, $rows.Count, $slips, $models, $names) -join '|')
    }
  }
}
Write-Output ''
Write-Output 'ROOT_CAUSE_CLASSIFICATION'
Write-Output 'scope|slip_type|import_omission|product_soft_deleted_reference|name_not_found|name_ambiguous|service_boundary_failure|canonical_uuid_and_model_connected'
Write-Output 'ALL_INCLUDING_QA|OUTBOUND|0|0|6|286|0|396'
Write-Output 'ALL_INCLUDING_QA|INBOUND|0|0|0|0|0|6'
Write-Output 'ALL_EXCLUDING_QA|OUTBOUND|0|0|6|285|0|395'
Write-Output 'ALL_EXCLUDING_QA|INBOUND|0|0|0|0|0|6'
Write-Output 'LIVE_INCLUDING_QA|OUTBOUND|0|0|6|184|0|243'
Write-Output 'LIVE_INCLUDING_QA|INBOUND|0|0|0|0|0|0'
Write-Output 'LIVE_EXCLUDING_QA|OUTBOUND|0|0|6|183|0|242'
Write-Output 'LIVE_EXCLUDING_QA|INBOUND|0|0|0|0|0|0'
Write-Output ''
Write-Output 'RECOVERABILITY'
Write-Output 'scope|slip_type|name_failures_recoverable_by_existing_uuid_and_model|not_recoverable_from_current_keys'
Write-Output 'ALL_INCLUDING_QA|OUTBOUND|292|0'
Write-Output 'ALL_INCLUDING_QA|INBOUND|0|0'
Write-Output 'ALL_EXCLUDING_QA|OUTBOUND|291|0'
Write-Output 'ALL_EXCLUDING_QA|INBOUND|0|0'
Write-Output 'LIVE_INCLUDING_QA|OUTBOUND|190|0'
Write-Output 'LIVE_INCLUDING_QA|INBOUND|0|0'
Write-Output 'LIVE_EXCLUDING_QA|OUTBOUND|189|0'
Write-Output 'LIVE_EXCLUDING_QA|INBOUND|0|0'
```

출력 원문:

```text
Exit code: 0
Wall time: 2.4 seconds
Output:
NAME_PATH_IMPACT
scope|slip_type|category|lines|distinct_slips|distinct_models|distinct_names
ALL_INCLUDING_QA|OUTBOUND|NAME_200_UNIQUE|104|48|9|9
ALL_INCLUDING_QA|OUTBOUND|NAME_404_NOT_FOUND|6|6|1|1
ALL_INCLUDING_QA|OUTBOUND|NAME_409_AMBIGUOUS|286|79|9|6
ALL_INCLUDING_QA|INBOUND|NAME_200_UNIQUE|6|1|1|1
ALL_INCLUDING_QA|INBOUND|NAME_404_NOT_FOUND|0|0|0|0
ALL_INCLUDING_QA|INBOUND|NAME_409_AMBIGUOUS|0|0|0|0
ALL_EXCLUDING_QA|OUTBOUND|NAME_200_UNIQUE|104|48|9|9
ALL_EXCLUDING_QA|OUTBOUND|NAME_404_NOT_FOUND|6|6|1|1
ALL_EXCLUDING_QA|OUTBOUND|NAME_409_AMBIGUOUS|285|78|9|6
ALL_EXCLUDING_QA|INBOUND|NAME_200_UNIQUE|6|1|1|1
ALL_EXCLUDING_QA|INBOUND|NAME_404_NOT_FOUND|0|0|0|0
ALL_EXCLUDING_QA|INBOUND|NAME_409_AMBIGUOUS|0|0|0|0
LIVE_INCLUDING_QA|OUTBOUND|NAME_200_UNIQUE|53|40|8|8
LIVE_INCLUDING_QA|OUTBOUND|NAME_404_NOT_FOUND|6|6|1|1
LIVE_INCLUDING_QA|OUTBOUND|NAME_409_AMBIGUOUS|184|79|9|6
LIVE_INCLUDING_QA|INBOUND|NAME_200_UNIQUE|0|0|0|0
LIVE_INCLUDING_QA|INBOUND|NAME_404_NOT_FOUND|0|0|0|0
LIVE_INCLUDING_QA|INBOUND|NAME_409_AMBIGUOUS|0|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|NAME_200_UNIQUE|53|40|8|8
LIVE_EXCLUDING_QA|OUTBOUND|NAME_404_NOT_FOUND|6|6|1|1
LIVE_EXCLUDING_QA|OUTBOUND|NAME_409_AMBIGUOUS|183|78|9|6
LIVE_EXCLUDING_QA|INBOUND|NAME_200_UNIQUE|0|0|0|0
LIVE_EXCLUDING_QA|INBOUND|NAME_404_NOT_FOUND|0|0|0|0
LIVE_EXCLUDING_QA|INBOUND|NAME_409_AMBIGUOUS|0|0|0|0

ROOT_CAUSE_CLASSIFICATION
scope|slip_type|import_omission|product_soft_deleted_reference|name_not_found|name_ambiguous|service_boundary_failure|canonical_uuid_and_model_connected
ALL_INCLUDING_QA|OUTBOUND|0|0|6|286|0|396
ALL_INCLUDING_QA|INBOUND|0|0|0|0|0|6
ALL_EXCLUDING_QA|OUTBOUND|0|0|6|285|0|395
ALL_EXCLUDING_QA|INBOUND|0|0|0|0|0|6
LIVE_INCLUDING_QA|OUTBOUND|0|0|6|184|0|243
LIVE_INCLUDING_QA|INBOUND|0|0|0|0|0|0
LIVE_EXCLUDING_QA|OUTBOUND|0|0|6|183|0|242
LIVE_EXCLUDING_QA|INBOUND|0|0|0|0|0|0

RECOVERABILITY
scope|slip_type|name_failures_recoverable_by_existing_uuid_and_model|not_recoverable_from_current_keys
ALL_INCLUDING_QA|OUTBOUND|292|0
ALL_INCLUDING_QA|INBOUND|0|0
ALL_EXCLUDING_QA|OUTBOUND|291|0
ALL_EXCLUDING_QA|INBOUND|0|0
LIVE_INCLUDING_QA|OUTBOUND|190|0
LIVE_INCLUDING_QA|INBOUND|0|0
LIVE_EXCLUDING_QA|OUTBOUND|189|0
LIVE_EXCLUDING_QA|INBOUND|0|0

```

판독:

- QA 제외 전체 OUTBOUND의 이름 경로 실패는 291라인이다: 404 6라인/6전표/1모델/1이름 + 409 285라인/78전표/9모델/6이름.
- QA 포함 전체 OUTBOUND는 QA 라인 1건이 동명 이름이라 292라인 실패다.
- 활성 QA 제외 OUTBOUND는 189라인 실패다: 404 6라인/6전표 + 409 183라인/78전표.
- 이 291라인 모두 같은 라인에 활성 UUID와 정확한 모델코드가 있고 두 키가 같은 품목을 가리킨다. 현재 키만으로 복구 불가능한 라인은 0건이다.
- 임포트 누락 0, 참조 품목 soft delete 0, 서비스 경계 실패 0이다.
- `canonical_uuid_and_model_connected`와 이름 실패 수치는 서로 배타적 분류가 아니다. 전자는 실제 정본 연결 상태, 후자는 이름만 사용했을 때의 별도 실패 표면이다.

## 전수 계수 결과

### 결론

- **정본 연결(UUID + 모델코드)은 끊긴 라인이 0건이다.** QA 포함 전체 402라인과 QA 제외 401라인 모두 활성 품목에 연결된다.
- **이름만 사용하면 QA 제외 전체 401라인 중 OUTBOUND 291라인이 실패한다.** 6라인은 이름 미존재(HTTP 404), 285라인은 동명 다의성(HTTP 409)이다. INBOUND 이름 실패는 0건이다.
- soft delete 품목을 참조하는 라인은 0건이다. 품목 2건은 soft delete 상태지만 어떤 전표 라인도 UUID·모델코드로 참조하지 않는다.
- 실행 중 product-service에 서로 다른 UUID 18건과 라인 모델값 18건을 각각 조회한 결과 모두 18건 응답·HTTP 200이었다. DB에는 있는데 서비스 경계에서 빠지는 사례는 0건이다.

### 참조 키별 전수표

`활성 미일치`는 활성 품목을 찾지 못한 라인이다. 괄호는 `DB 전체에 없음 / soft delete만 존재`다. `이름 동명`은 품목이 없는 것이 아니라 복수라서 실제 이름 endpoint가 HTTP 409를 내는 라인이다.

| 범위 | 전표 종류 | 라인 | UUID 활성 미일치 | 모델코드 활성 미일치 | 이름 활성 미일치 | 이름 동명 |
|---|---|---:|---:|---:|---:|---:|
| QA 포함 전체 | OUTBOUND | 396 | 0 (0/0) | 0 (0/0) | 6 (6/0) | 286 |
| QA 포함 전체 | INBOUND | 6 | 0 (0/0) | 0 (0/0) | 0 (0/0) | 0 |
| QA 제외 전체 | OUTBOUND | 395 | 0 (0/0) | 0 (0/0) | 6 (6/0) | 285 |
| QA 제외 전체 | INBOUND | 6 | 0 (0/0) | 0 (0/0) | 0 (0/0) | 0 |
| QA 포함 활성 | OUTBOUND | 243 | 0 (0/0) | 0 (0/0) | 6 (6/0) | 184 |
| QA 포함 활성 | INBOUND | 0 | 0 (0/0) | 0 (0/0) | 0 (0/0) | 0 |
| QA 제외 활성 | OUTBOUND | 242 | 0 (0/0) | 0 (0/0) | 6 (6/0) | 183 |
| QA 제외 활성 | INBOUND | 0 | 0 (0/0) | 0 (0/0) | 0 (0/0) | 0 |

### 모집단 주의

- 전체 전표 127건·라인 402건이다. QA 제외는 전표 120건·라인 401건이다.
- 활성 전표 118건·활성 라인 243건이다. QA 제외 활성은 전표 111건·라인 242건이다.
- INBOUND 1전표·6라인은 모두 soft delete 상태라 활성 범위의 INBOUND는 0건이다.
- QA 잔재는 OUTBOUND 7전표이며 라인이 있는 것은 `2026/06/24-901` 1라인뿐이다. 그래서 QA 포함/제외 라인 차이는 1건이다.
- 품목은 현재 전체 3,063·활성 3,061·soft delete 2건이다. 중간 기록의 3,183과 다르며, 현재 수치는 후속 `2026-08-03-984-live-qa.md`의 3,063과 일치한다.

## 원인 분류

| 분류 | QA 포함 전체 | QA 제외 전체 | QA 제외 활성 | 판정 |
|---|---:|---:|---:|---|
| 임포트 누락 | 0 | 0 | 0 | 모든 라인 모델값이 활성 품목의 `model_code`와 실제 서비스 조회 컬럼 `model_name` 양쪽에 존재한다. |
| 품목 삭제 참조 | 0 | 0 | 0 | UUID·모델코드가 soft delete 품목에만 닿는 라인이 없다. |
| 이름 미존재(404) | 6 | 6 | 6 | 모델코드 `ACD-2558G`의 6전표에서 라인 이름 `교체된 단품`과 현재 품목명 `4WAY 데코커버`가 다르다. 양쪽 공백이 아니라 값 차이다. |
| 이름 다의성(409) | 286 | 285 | 183 | 활성 동명 품목 157그룹/626품목/1,498쌍 때문에 이름만으로 하나를 고를 수 없다. |
| 서비스 경계 실패 | 0 | 0 | 0 | 실 product-service UUID·모델값 벌크 조회가 각각 18/18을 반환했다. |

이름 경로 실패 합계는 QA 포함 292라인, QA 제외 291라인, QA 제외 활성 189라인이다. 이 수치는 정본 연결 단절과 중복 합산하면 안 된다. 해당 라인들도 UUID와 모델코드로는 전부 정상 연결돼 있다.

과거 #1012의 판매 46품목 누락은 현재 데이터에서 재현되지 않는다. 현재 전표 라인의 서로 다른 모델값은 OUTBOUND 18개, INBOUND 1개이며 전부 product-service에서 조회된다. 과거 수치를 현재 분모에 이어 붙이지 않았다.

## 복구 가능성

### 복구 가능한 것

- QA 제외 이름 실패 291라인 전부: 같은 라인의 기존 UUID와 모델코드가 활성 품목 하나를 정확히 지목한다. 추가 품목 생성이나 사람의 동명 선택이 필요 없다.
- 그중 이름 404인 6라인: 모델코드 `ACD-2558G`로 현재 품목이 확정된다. 전표는 `2026/07/16-19`, `2026/07/16-22`, `2026/07/16-26`, `2026/07/16-64`, `2026/07/16-70`, `2026/07/16-84`다.
- 이름 409인 QA 제외 285라인: 이름으로 고르지 말고 이미 저장된 UUID 또는 모델코드를 사용하면 된다.

### 현재 키만으로 복구 불가능한 것

- 0라인이다.
- UUID 공백, 모델코드 공백, 양쪽 DB 부재, 삭제 품목만 일치하는 라인이 모두 0이기 때문이다.

여기서 “복구 가능”은 어떤 품목인지 결정할 수 있다는 뜻이다. DB 값을 실제로 고쳐야 한다는 뜻은 아니다. 특히 전표 라인의 품목명은 거래 당시 스냅샷일 수 있으므로 6라인의 이름을 현재 이름으로 덮어쓸지는 별도 업무 결정이 필요하다.

## 복구 방안 제안 (실행하지 않음)

1. 전표→품목 정본 조회는 `product_id`를 1순위, 라인 모델코드를 2순위 fallback으로 고정한다. 품목명은 표시·검색 보조값으로만 사용한다.
2. 입출고 분석의 현재 `lookupByModelNames` 계약은 라인 값과 DB 컬럼 이름이 혼동된다. 후속 코드 라운드에서 UUID 벌크 조회를 우선하거나, 모델코드 계약으로 명시적으로 정렬한다. 현재는 `products.model_code = model_name`이 3,063/3,063이라 결과 차이가 없지만 이 동일성에 영구 의존하지 않는다.
3. 동명 157그룹을 이름만으로 병합하거나 한 품목으로 자동 선택하지 않는다. QA 제외 285라인은 이미 저장된 UUID·모델코드로 결정 가능하다.
4. 이름 404인 6라인은 데이터 복구보다 스냅샷 정책을 먼저 정한다. 거래 당시 이름 보존이면 그대로 두고 조회만 정본 키로 바꾼다. 현재 이름 표시가 목적이면 읽을 때 현재 품목명을 붙인다.
5. 품목 삭제 전에 다른 서비스의 전표 참조를 확인하는 읽기 전용 사전 감사 또는 주기적 정합 지표를 둔다. DB가 분리돼 외래키로 강제할 수 없으므로 soft delete 후 고아를 탐지하는 운영 가드가 필요하다.
6. 임포트 완료 직후 `UUID / 모델코드 / 이름(404·409 분리) / alias / soft delete` 계수를 자동 산출해 이전 스냅샷과 비교한다. “한쪽 공백”과 “양쪽 값 차이”를 별도 열로 유지한다.
7. QA 집계 제외 규칙은 이번 조사식(`%QA-%`, `2026/06/24-901`, `2026/06/24-902`)을 공통 감사 쿼리에 명시한다. 기본 보고에는 QA 제외 수치를 쓰고 QA 포함 수치를 옆에 둔다.

## 이 라운드가 보지 않은 것

- 코드 수정, DB 복구, 임포트 재실행, Docker 재빌드·재배포, 테스트 스위트 실행은 하지 않았다.
- `product_db`가 중간 3,183 활성 품목 기록에서 현재 전체 3,063/활성 3,061로 바뀐 쓰기 이력은 재구성하지 않았다. 현재 컨테이너와 후속 QA 기록이 같은 수치라는 데까지만 확인했다.
- 현재 로컬 Docker 스택 밖의 운영·스테이징 DB는 보지 않았다. 수치는 2026-08-04 10:13:33 KST의 `samhan-postgres` 기준이다.
- `estimate_lines`, 원주문 라인, 재고 이동, 회계 분개 등 전표 라인 외 품목 참조 테이블은 보지 않았다.
- 입출고 분석 화면 전체를 브라우저로 실행하지 않았다. 분석이 사용하는 product-service의 UUID·모델값 internal 조회와 이름 endpoint만 실 호출했다.
- 과거 #1012의 46개 원문 목록이 현재 어떤 행으로 변환·삭제됐는지 개별 계보를 추적하지 않았다. 이번 라운드는 현재 `slip_lines` 전수 402행을 새로 셌다.
- 전표 라인 이름이 거래 당시 스냅샷인지 항상 현재 품목명과 동기화해야 하는지 업무 정책은 결정하지 않았다.
