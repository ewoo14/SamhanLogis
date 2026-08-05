# 이슈 #1055 재고 0 창고 노출 현행 진단

- 조사일: 2026-08-04
- 범위: 현행 DB 수치와 소스 코드 데이터 흐름의 읽기 전용 진단
- 판정 기준: `inventory_db` 실데이터와 현재 작업공간 소스 코드
- 금지 사항 준수: 코드 수정, git 명령, DB 쓰기, 이미지 재빌드·재배포, 테스트 실행 없음
- 주의: 현재 배포된 `samhan-inventory-service` 이미지는 2026-07-24 자로 소스와 다를 수 있으므로 API가 아닌 DB와 소스를 최종 판정 근거로 삼는다.

## 조사 기록

이 절은 확인 즉시 원문과 함께 순차 추가한다.

### 1. 관련 테이블 탐색

실행 SQL:

```sql
SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND (table_name ILIKE '%warehouse%' OR table_name ILIKE '%inventor%' OR table_name ILIKE '%stock%') ORDER BY table_schema, table_name;
```

출력 원문:

```text
 table_schema |            table_name            
--------------+----------------------------------
 public       | inventory_audit_lines
 public       | inventory_audit_logs
 public       | inventory_audit_number_sequences
 public       | inventory_audits
 public       | inventory_edit_requests
 public       | safety_stock_configs
 public       | stock_balances
 public       | stock_instances
 public       | stock_lots
 public       | stock_movements
 public       | stock_transfer_lines
 public       | stock_transfers
 public       | warehouses
 staging      | ecount_stock_transfer_raw
 staging      | ecount_warehouse_map
 staging      | ecount_warehouse_raw
(16 rows)
```

확인: 현행 창고 원장은 `public.warehouses`, 재고 잔액 후보는 `public.stock_balances`다. 다음 SQL에서 두 테이블의 실제 컬럼을 확정한다.

### 2. 창고·재고 컬럼 확인

실행 SQL:

```sql
SELECT table_name, ordinal_position, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('warehouses','stock_balances','stock_instances') ORDER BY table_name, ordinal_position;
```

출력 원문:

```text
   table_name    | ordinal_position |      column_name      |          data_type          | is_nullable 
-----------------+------------------+-----------------------+-----------------------------+-------------
 stock_balances  |                1 | id                    | uuid                        | NO
 stock_balances  |                2 | product_id            | uuid                        | NO
 stock_balances  |                3 | warehouse_id          | uuid                        | NO
 stock_balances  |                4 | available_qty         | integer                     | NO
 stock_balances  |                5 | reserved_qty          | integer                     | NO
 stock_balances  |                6 | total_qty             | integer                     | NO
 stock_balances  |                7 | version               | bigint                      | NO
 stock_balances  |                8 | created_at            | timestamp without time zone | NO
 stock_balances  |                9 | created_by            | character varying           | NO
 stock_balances  |               10 | modified_at           | timestamp without time zone | YES
 stock_balances  |               11 | modified_by           | character varying           | YES
 stock_balances  |               12 | deleted_at            | timestamp without time zone | YES
 stock_balances  |               13 | deleted_by            | character varying           | YES
 stock_balances  |               14 | is_deleted            | boolean                     | NO
 stock_instances |                1 | id                    | uuid                        | NO
 stock_instances |                2 | product_id            | uuid                        | NO
 stock_instances |                3 | product_code          | character varying           | NO
 stock_instances |                4 | warehouse_id          | uuid                        | NO
 stock_instances |                5 | status                | character varying           | NO
 stock_instances |                6 | inbound_type          | character varying           | YES
 stock_instances |                7 | received_at           | timestamp without time zone | NO
 stock_instances |                8 | unit_cost             | numeric                     | YES
 stock_instances |                9 | inbound_slip_no       | character varying           | YES
 stock_instances |               10 | outbound_partner_code | character varying           | YES
 stock_instances |               11 | outbound_slip_no      | character varying           | YES
 stock_instances |               12 | outbound_at           | timestamp without time zone | YES
 stock_instances |               13 | created_at            | timestamp without time zone | NO
 stock_instances |               14 | created_by            | character varying           | NO
 stock_instances |               15 | modified_at           | timestamp without time zone | YES
 stock_instances |               16 | modified_by           | character varying           | YES
 stock_instances |               17 | deleted_at            | timestamp without time zone | YES
 stock_instances |               18 | deleted_by            | character varying           | YES
 stock_instances |               19 | is_deleted            | boolean                     | NO
 stock_instances |               20 | recall_slip_no        | character varying           | YES
 warehouses      |                1 | id                    | uuid                        | NO
 warehouses      |                2 | code                  | character varying           | NO
 warehouses      |                3 | name                  | character varying           | NO
 warehouses      |                4 | type                  | character varying           | NO
 warehouses      |                5 | address               | character varying           | YES
 warehouses      |                6 | display_order         | integer                     | NO
 warehouses      |                7 | description           | character varying           | YES
 warehouses      |                8 | created_at            | timestamp without time zone | NO
 warehouses      |                9 | created_by            | character varying           | NO
 warehouses      |               10 | modified_at           | timestamp without time zone | YES
 warehouses      |               11 | modified_by           | character varying           | YES
 warehouses      |               12 | deleted_at            | timestamp without time zone | YES
 warehouses      |               13 | deleted_by            | character varying           | YES
 warehouses      |               14 | is_deleted            | boolean                     | NO
(48 rows)
```

확인: 미삭제 기준은 두 테이블 모두 `is_deleted = false`로 계산할 수 있다. 창고는 코드·이름·유형으로 안전하게 식별하며 UUID 값은 조회·기록하지 않는다.

### 3. 미삭제 창고 실제 행과 유형별 분포

측정 시각과 창고별 활성 재고 잔액 행을 한 번에 조회했다. `balance_rows`는 미삭제 `stock_balances` 행 수, `positive_total_rows`는 그중 `total_qty > 0`인 행 수다.

실행 SQL:

```sql
SELECT current_database() AS database_name, CURRENT_TIMESTAMP AS measured_at;
WITH b AS (SELECT warehouse_id, COUNT(*) AS balance_rows, COUNT(*) FILTER (WHERE total_qty > 0) AS positive_total_rows, COUNT(*) FILTER (WHERE total_qty = 0) AS zero_total_rows, COUNT(*) FILTER (WHERE available_qty > 0) AS positive_available_rows, COALESCE(SUM(total_qty),0) AS total_qty, COALESCE(SUM(available_qty),0) AS available_qty, COALESCE(SUM(reserved_qty),0) AS reserved_qty FROM stock_balances WHERE is_deleted = false GROUP BY warehouse_id), i AS (SELECT warehouse_id, COUNT(*) AS instance_rows FROM stock_instances WHERE is_deleted = false GROUP BY warehouse_id) SELECT w.code AS warehouse_code, w.name AS warehouse_name, w.type AS warehouse_type, COALESCE(b.balance_rows,0) AS balance_rows, COALESCE(b.positive_total_rows,0) AS positive_total_rows, COALESCE(b.zero_total_rows,0) AS zero_total_rows, COALESCE(b.positive_available_rows,0) AS positive_available_rows, COALESCE(b.total_qty,0) AS total_qty, COALESCE(b.available_qty,0) AS available_qty, COALESCE(b.reserved_qty,0) AS reserved_qty, COALESCE(i.instance_rows,0) AS instance_rows FROM warehouses w LEFT JOIN b ON b.warehouse_id = w.id LEFT JOIN i ON i.warehouse_id = w.id WHERE w.is_deleted = false ORDER BY w.display_order, w.code;
WITH b AS (SELECT warehouse_id, COUNT(*) AS balance_rows FROM stock_balances WHERE is_deleted = false GROUP BY warehouse_id) SELECT w.type AS warehouse_type, COUNT(*) AS undeleted_warehouses, COUNT(*) FILTER (WHERE COALESCE(b.balance_rows,0) > 0) AS warehouses_with_balance_rows, COALESCE(SUM(b.balance_rows),0) AS balance_rows FROM warehouses w LEFT JOIN b ON b.warehouse_id = w.id WHERE w.is_deleted = false GROUP BY w.type ORDER BY w.type;
```

출력 원문:

```text
 database_name |          measured_at          
---------------+-------------------------------
 inventory_db  | 2026-08-04 10:17:02.148317+09
(1 row)

 warehouse_code |       warehouse_name       | warehouse_type | balance_rows | positive_total_rows | zero_total_rows | positive_available_rows | total_qty | available_qty | reserved_qty | instance_rows 
----------------+----------------------------+----------------+--------------+---------------------+-----------------+-------------------------+-----------+---------------+--------------+---------------
 00001          | 위니아-일산서부            | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 1              | 서초창고                   | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 HQ-001         | 본사창고                   | HEADQUARTERS   |          103 |                 103 |               0 |                     103 |     23350 |         23350 |            0 |             0
 00002          | 이창성(공항공사_49차_6372) | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 2              | 상일물류                   | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 VH-001         | 1호차 차량재고             | VEHICLE        |          103 |                 103 |               0 |                     103 |     23535 |         23535 |            0 |             0
 00003          | 삼성창고 (초월 무갑)       | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 3              | 광주창고                   | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 CS-001         | 거래처 위탁창고            | CONSIGNMENT    |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 00004          | 61차 - 김포물류 (한실물류) | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 4              | 방주창고                   | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 VR-001         | 가상창고                   | VIRTUAL        |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 5              | 다짐창고                   | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 6              | 위니아-서부                | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 7              | 위니아-북부                | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 8              | 위니아-동부                | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 9              | 엘에스공조창고             | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 10             | 이정후기사창고             | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 11             | 용인물류                   | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 12             | 김포물류                   | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 13             | 드림에어컨                 | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 14             | 온라인창고                 | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 15             | 파레트 창고                | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 16             | 2025-76차 공항 김포창고    | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 2381           | 조달창고                   | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 11151          | 오실장창고                 | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 11152          | 삼한창고 (무갑리)          | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 11153          | 2022-63차 공항 김포창고    | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 11154          | 2023-71차 공항 김포창고    | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
 11155          | 2025-공항공사 초월창고     | HEADQUARTERS   |            0 |                   0 |               0 |                       0 |         0 |             0 |            0 |             0
(30 rows)

 warehouse_type | undeleted_warehouses | warehouses_with_balance_rows | balance_rows 
----------------+----------------------+------------------------------+--------------
 CONSIGNMENT    |                    1 |                            0 |            0
 HEADQUARTERS   |                   27 |                            1 |          103
 VEHICLE        |                    1 |                            1 |          103
 VIRTUAL        |                    1 |                            0 |            0
(4 rows)
```

확정 수치: 미삭제 창고는 **30곳**, 그중 활성 재고 잔액 행을 가진 창고는 **2곳**, 활성 재고 잔액은 **206행**이다. 유형 분포는 `HEADQUARTERS 27`, `VEHICLE 1`, `CONSIGNMENT 1`, `VIRTUAL 1`이다. 재고 보유 2곳은 `HQ-001 본사창고` 103행과 `VH-001 1호차 차량재고` 103행이며, 206행 모두 `total_qty > 0`이다. 실제 `VIRTUAL` 창고는 `VR-001 가상창고` **1곳**이고 재고 잔액 행은 **0행**이므로 선택지 (나)는 실제 논점이다.

### 4. 행이 사라지는 지점: 백엔드 저장소 조회 대상

프런트는 `GET /inventory/balances`를 호출한다.

`clients/desktop/src/renderer/api/inventory.ts:285-367` 출력 원문:

```text
 285: 
 286: /**
 287:  * `GET /inventory/balances` 응답 row — BE `StockBalanceResponse` 와 1:1.
 288:  *
 289:  * UUID 비공개 가드: 응답에는 내부 UUID가 없으며 화면 노출 식별자만 수신한다.
 290:  */
 291: export interface StockBalanceListRow {
 292:   productCode: string
 293:   productName: string
 294:   warehouseCode: string
 295:   warehouseName: string
 296:   warehouseType: WarehouseType
 297:   /** 가용재고 = 실재고 - 예약재고. 전환 가능 여부 기준. */
 298:   availableQty: number
 299:   /** 예약재고 = 전환(reserve) 으로 잠긴 수량. */
 300:   reservedQty: number
 301:   /** 실재고 = 물리 보유 수량. */
 302:   totalQty: number
 303: }
 304: 
 305: /** 목록 조회 옵션. */
 306: export interface ListStockBalancesOptions {
 307:   /** 기존 품목별 재고 조회 호출부 호환용 선택 필터. */
 308:   productId?: string
 309:   warehouseId?: string
 310:   page?: number
 311:   size?: number
 312: }
 313: 
 314: /** 입출고 분석 모델코드 집계 응답 — UUID는 포함하지 않는다. */
 315: export interface InOutAnalysisRow {
 316:   modelCode: string
 317:   productName: string
 318:   categoryKey: string | null
 319:   inboundQuantity: number
 320:   outboundQuantity: number
 321:   purchaseAmount: number | null
 322:   salesAmount: number
 323:   profitAmount: number | null
 324:   profitRate: number | null
 325:   monthly: InOutMonthlyPoint[]
 326: }
 327: 
 328: export interface InOutMonthlyPoint {
 329:   year: number
 330:   month: number
 331:   inboundQuantity: number
 332:   outboundQuantity: number
 333: }
 334: 
 335: /** 확정 입출고 기간별 모델코드 집계 조회. */
 336: export async function listInOutAnalysis(dateFrom: string, dateTo: string): Promise<InOutAnalysisRow[]> {
 337:   const res = await apiClient.get<ApiEnvelope<InOutAnalysisRow[]>>('/slips/query/inout-analysis', {
 338:     params: { dateFrom, dateTo },
 339:   })
 340:   return res.data.data
 341: }
 342: 
 343: /**
 344:  * 재고 현황 목록 조회 — 가용/실재고/예약 3구분.
 345:  *
 346:  * BE `GET /inventory/balances` 호출.
 347:  * 반환 행에서 warehouseType=VIRTUAL 인 항목은 예약 대상 외이므로
 348:  * 목록에 포함하되 화면에서 회색 처리한다.
 349:  *
 350:  * @param options 창고 필터 + 페이지 옵션
 351:  */
 352: export async function listStockBalances(
 353:   options: ListStockBalancesOptions = {},
 354: ): Promise<PageResponse<StockBalanceListRow>> {
 355:   const params: Record<string, string | number> = {
 356:     page: options.page ?? 0,
 357:     size: options.size ?? 50,
 358:   }
 359:   if (options.productId) params['productId'] = options.productId
 360:   if (options.warehouseId) params['warehouseId'] = options.warehouseId
 361: 
 362:   const res = await apiClient.get<ApiEnvelope<PageResponse<StockBalanceListRow>>>(
 363:     '/inventory/balances',
 364:     { params },
 365:   )
 366:   return res.data.data
 367: }
```

컨트롤러는 별도 필터 없이 서비스의 페이지를 그대로 응답한다.

`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockController.java:69-90` 출력 원문:

```text
  69:     // -------- 조회 --------
  70: 
  71:     /**
  72:      * 재고 현황 페이지 조회 — 품목/창고 필터는 선택이며 둘 다 없으면 전체 현황이다.
  73:      *
  74:      * @param productId 제품 UUID (기존 호출부 호환용 선택 필터)
  75:      * @param warehouseId 창고 UUID (선택 필터)
  76:      * @param page 0-based 페이지 번호
  77:      * @param size 페이지 크기 (기본 20)
  78:      * @return Page&lt;StockBalanceResponse&gt;
  79:      */
  80:     @Operation(summary = "재고 잔량 조회", description = "품목/창고 선택 필터 또는 전체 활성 재고 잔량 페이지")
  81:     @GetMapping("/balances")
  82:     @RequirePermission(page = "inventory.stock-balance", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
  83:     public ApiResponse<Page<StockBalanceResponse>> balances(
  84:             @RequestParam(required = false) UUID productId,
  85:             @RequestParam(required = false) UUID warehouseId,
  86:             @RequestParam(defaultValue = "0") int page,
  87:             @RequestParam(defaultValue = "20") int size) {
  88:         Pageable pageable = PageRequest.of(page, Math.min(size, 100));
  89:         return ApiResponse.ok(stockService.findBalancePage(productId, warehouseId, pageable));
  90:     }
```

서비스도 저장소에서 받은 `StockBalance` 페이지에 품목 메타데이터를 병합할 뿐, 창고를 추가하거나 행을 제거하지 않는다.

`services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockService.java:61-88` 출력 원문:

```text
  61:     /**
  62:      * 재고 현황 페이지를 조회하고 페이지에 포함된 품목 메타데이터를 bulk 병합한다.
  63:      * 품목 UUID 자체는 응답 식별자로 사용하되 화면에는 모델코드/품목명만 표시한다.
  64:      *
  65:      * @param productId 기존 품목별 호출의 선택 필터
  66:      * @param warehouseId 전체 또는 특정 창고 선택 필터
  67:      * @param pageable 페이지 조건
  68:      * @return 창고·품목 메타데이터가 채워진 재고 현황 페이지
  69:      */
  70:     @Transactional(readOnly = true)
  71:     public Page<StockBalanceResponse> findBalancePage(UUID productId, UUID warehouseId, Pageable pageable) {
  72:         Page<StockBalance> balances =
  73:                 stockBalanceRepository.findBalancePage(productId, warehouseId, pageable);
  74:         Map<UUID, ProductSummary> productsById = new LinkedHashMap<>();
  75:         List<UUID> productIds = balances.getContent().stream()
  76:                 .map(StockBalance::getProductId)
  77:                 .filter(java.util.Objects::nonNull)
  78:                 .distinct()
  79:                 .toList();
  80:         for (int from = 0; from < productIds.size(); from += 100) {
  81:             int to = Math.min(from + 100, productIds.size());
  82:             for (ProductSummary product : productClient.lookup(productIds.subList(from, to))) {
  83:                 productsById.put(product.id(), product);
  84:             }
  85:         }
  86:         return balances.map(balance -> StockBalanceResponse.from(balance,
  87:                 productsById.get(balance.getProductId())));
  88:     }
```

행 소실의 최초 지점은 저장소 쿼리다. 이 쿼리는 `Warehouse`에서 시작하거나 창고를 `LEFT JOIN`하지 않고, 존재하는 미삭제 `StockBalance b`만 조회한다.

`services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/StockBalanceRepository.java:37-65` 출력 원문:

```text
  37:     /**
  38:      * 품목/창고 선택 필터로 재고 현황 페이지를 조회한다. 두 필터가 모두 null이면 전체 현황이다.
  39:      * 창고 연관은 DTO 변환 전에 fetch graph 로 읽어 LAZY 초기화 오류와 N+1을 막는다.
  40:      *
  41:      * @param productId 선택 품목 UUID (선택)
  42:      * @param warehouseId 선택 창고 UUID (선택)
  43:      * @param pageable 페이지 조건
  44:      * @return 활성 재고 잔량 페이지
  45:      */
  46:     @EntityGraph(attributePaths = "warehouse")
  47:     @Query(
  48:             value = """
  49:                     SELECT b
  50:                     FROM StockBalance b
  51:                     WHERE b.isDeleted = false
  52:                       AND (:productId IS NULL OR b.productId = :productId)
  53:                       AND (:warehouseId IS NULL OR b.warehouse.id = :warehouseId)
  54:                     ORDER BY b.productId ASC, b.warehouse.code ASC
  55:                     """,
  56:             countQuery = """
  57:                     SELECT COUNT(b)
  58:                     FROM StockBalance b
  59:                     WHERE b.isDeleted = false
  60:                       AND (:productId IS NULL OR b.productId = :productId)
  61:                       AND (:warehouseId IS NULL OR b.warehouse.id = :warehouseId)
  62:                     """)
  63:     Page<StockBalance> findBalancePage(@Param("productId") UUID productId,
  64:                                        @Param("warehouseId") UUID warehouseId,
  65:                                        Pageable pageable);
```

응답 변환에는 필터가 없고 입력 `StockBalance` 한 행을 응답 한 행으로 그대로 바꾼다.

`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/StockBalanceResponse.java:7-40` 출력 원문:

```text
   7: /** (품목, 창고) 단위 재고 잔량 응답. 내부 UUID는 응답에 포함하지 않는다. */
   8: public record StockBalanceResponse(
   9:         String productCode,
  10:         String productName,
  11:         String warehouseCode,
  12:         String warehouseName,
  13:         WarehouseType warehouseType,
  14:         int availableQty,
  15:         int reservedQty,
  16:         int totalQty,
  17:         Long version) {
  18: 
  19:     public static StockBalanceResponse from(StockBalance b) {
  20:         return from(b, null);
  21:     }
  22: 
  23:     /**
  24:      * 재고 행과 품목 bulk 조회 결과를 화면 응답으로 조합한다.
  25:      *
  26:      * @param b 재고 잔량 행
  27:      * @param product 품목 메타데이터
  28:      * @return 모델코드·품목명이 포함된 응답
  29:      */
  30:     public static StockBalanceResponse from(StockBalance b, ProductSummary product) {
  31:         return new StockBalanceResponse(
  32:                 product == null ? null : product.modelName(),
  33:                 product == null ? null : product.name(),
  34:                 b.getWarehouse().getCode(),
  35:                 b.getWarehouse().getName(),
  36:                 b.getWarehouse().getType(),
  37:                 b.getAvailableQty(),
  38:                 b.getReservedQty(),
  39:                 b.getTotalQty(),
  40:                 b.getVersion());
```

프런트에도 행 제거 조건은 없다. `content`를 그대로 `rows`로 잡아 DataGrid에 넘기며, `VIRTUAL` 조건은 이미 도착한 행의 세 수량 셀을 `—`로 바꾸는 데만 사용한다.

`clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:137-185` 출력 원문:

```text
 137:     render: (row) => {
 138:       const isZero = row.availableQty === 0
 139:       const isVirtual = row.warehouseType === 'VIRTUAL'
 140:       return (
 141:         <span
 142:           style={{
 143:             fontWeight: isZero && !isVirtual ? 600 : undefined,
 144:             // design-system 토큰: --color-danger-700(#991B1B) 가용 0 강조 / --color-neutral-400(#8E97A4) 가상창고
 145:             color: isZero && !isVirtual
 146:               ? 'var(--color-danger-700, #991B1B)'
 147:               : isVirtual
 148:                 ? 'var(--color-neutral-400, #8E97A4)'
 149:                 : undefined,
 150:           }}
 151:         >
 152:           {isVirtual ? '—' : fmtQty(row.availableQty)}
 153:         </span>
 154:       )
 155:     },
 156:   },
 157:   {
 158:     key: 'reservedQty',
 159:     label: '예약재고',
 160:     width: 90,
 161:     filter: false,
 162:     align: 'right',
 163:     render: (row) => {
 164:       const isVirtual = row.warehouseType === 'VIRTUAL'
 165:       return (
 166:         <span style={{ color: isVirtual ? 'var(--color-neutral-400, #8E97A4)' : undefined }}>
 167:           {isVirtual ? '—' : fmtQty(row.reservedQty)}
 168:         </span>
 169:       )
 170:     },
 171:   },
 172:   {
 173:     key: 'totalQty',
 174:     label: '실재고',
 175:     width: 90,
 176:     filter: false,
 177:     align: 'right',
 178:     render: (row) => {
 179:       const isVirtual = row.warehouseType === 'VIRTUAL'
 180:       return (
 181:         <span style={{ color: isVirtual ? 'var(--color-neutral-400, #8E97A4)' : undefined }}>
 182:           {isVirtual ? '—' : fmtQty(row.totalQty)}
 183:         </span>
 184:       )
 185:     },
```

`clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:239-244,317-323` 출력 원문:

```text
 239:   const rows = balancesQuery.data?.content ?? []
 240:   const totalElements = balancesQuery.data?.totalElements ?? 0
 241:   const totalPages = balancesQuery.data?.totalPages ?? 1
 242:   const zeroAvailableCount = rows.filter(
 243:     (r) => r.availableQty === 0 && r.warehouseType !== 'VIRTUAL',
 244:   ).length

 317:       {/* ── DataGrid 본문 ─────────────────────────────────── */}
 318:       <section style={gridSectionStyle} data-testid="inventory-balance-grid">
 319:         <DataGrid<StockBalanceListRow>
 320:           columns={COLUMNS}
 321:           rows={rows}
 322:           rowKey={(row) => `${row.productCode}-${row.warehouseCode}`}
 323:           loading={balancesQuery.isFetching}
```

**판정:** 행이 사라지는 지점은 응답 필터나 프런트 렌더 조건이 아니라 `StockBalanceRepository.findBalancePage`의 조회 집합이다. 더 정확히는 “JOIN이 재고 행을 요구”하는 구조조차 아니고, 조회 루트 자체가 `StockBalance`이므로 재고 행이 없는 창고는 후보 집합에 들어오지 않는다.

### 5. 범례 문구 위치

`clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:256-279`이며, 문제의 문구는 **277행**이다.

출력 원문:

```text
 256:       {/* ── 범례 ─────────────────────────────────────────── */}
 257:       <div style={legendStyle} aria-label="수량 구분 안내">
 258:         <span style={legendItemStyle}>
 259:           {/* 가용재고 도트: brand-500(#2D77A8) — 실제 가용재고 기본 텍스트와 일관 */}
 260:           <span style={legendDotStyle('var(--color-brand-500, #2D77A8)')} />
 261:           <strong>가용재고</strong> = 실재고 &minus; 예약재고 (전환 가능)
 262:         </span>
 263:         <span style={legendItemStyle}>
 264:           {/* 예약재고 도트: neutral-500(#6B7280) */}
 265:           <span style={legendDotStyle('var(--color-neutral-500, #6B7280)')} />
 266:           <strong>예약재고</strong> = 전환(전표 발행) 으로 잠긴 수량
 267:         </span>
 268:         <span style={legendItemStyle}>
 269:           {/* 실재고 도트: neutral-700(#363D49) */}
 270:           <span style={legendDotStyle('var(--color-neutral-700, #363D49)')} />
 271:           <strong>실재고</strong> = 물리 보유 수량
 272:         </span>
 273:         <span style={{ ...legendItemStyle, color: 'var(--color-danger-700, #991B1B)', fontWeight: 500 }}>
 274:           가용 0 → 빨강 강조 (전환 불가)
 275:         </span>
 276:         <span style={{ ...legendItemStyle, color: 'var(--color-neutral-500, #6B7280)' }}>
 277:           가상 창고(VIRTUAL): 수량 개념 없음 (— 표시)
 278:         </span>
 279:       </div>
```

### 6. 선택지 (가)의 행 수: 현재 행 단위에 맞춘 전 창고 매트릭스

현 화면 한 행의 키는 `productCode + warehouseCode`이므로, 재고 행이 없는 창고를 기존 행 구조로 “포함”하려면 현재 재고에 등장하는 품목 집합과 미삭제 창고 집합의 누락 조합을 합성해야 한다. 창고당 제목 행 하나를 넣는 방식은 현 DTO에 품목 없는 행을 표현할 계약이 없어 같은 화면 행 단위가 아니다.

실행 SQL:

```sql
WITH active_w AS (SELECT id, type FROM warehouses WHERE is_deleted = false), active_p AS (SELECT DISTINCT product_id FROM stock_balances WHERE is_deleted = false), existing AS (SELECT DISTINCT product_id, warehouse_id FROM stock_balances WHERE is_deleted = false), matrix AS (SELECT p.product_id, w.id AS warehouse_id, w.type FROM active_p p CROSS JOIN active_w w) SELECT (SELECT COUNT(*) FROM active_w) AS warehouse_count, (SELECT COUNT(*) FROM active_p) AS stocked_product_count, (SELECT COUNT(*) FROM existing) AS existing_balance_pairs, (SELECT COUNT(*) FROM matrix) AS full_matrix_pairs, (SELECT COUNT(*) FROM matrix m LEFT JOIN existing e ON e.product_id=m.product_id AND e.warehouse_id=m.warehouse_id WHERE e.product_id IS NULL) AS missing_pairs_to_add;
WITH active_w AS (SELECT id, type FROM warehouses WHERE is_deleted = false), active_p AS (SELECT DISTINCT product_id FROM stock_balances WHERE is_deleted = false), existing AS (SELECT DISTINCT product_id, warehouse_id FROM stock_balances WHERE is_deleted = false), matrix AS (SELECT p.product_id, w.id AS warehouse_id, w.type FROM active_p p CROSS JOIN active_w w) SELECT m.type AS warehouse_type, COUNT(*) AS full_matrix_pairs, COUNT(e.product_id) AS existing_balance_pairs, COUNT(*) - COUNT(e.product_id) AS missing_pairs_to_add FROM matrix m LEFT JOIN existing e ON e.product_id=m.product_id AND e.warehouse_id=m.warehouse_id GROUP BY m.type ORDER BY m.type;
```

출력 원문:

```text
 warehouse_count | stocked_product_count | existing_balance_pairs | full_matrix_pairs | missing_pairs_to_add 
-----------------+-----------------------+------------------------+-------------------+----------------------
              30 |                   103 |                    206 |              3090 |                 2884
(1 row)

 warehouse_type | full_matrix_pairs | existing_balance_pairs | missing_pairs_to_add 
----------------+-------------------+------------------------+----------------------
 CONSIGNMENT    |               103 |                      0 |                  103
 HEADQUARTERS   |              2781 |                    103 |                 2678
 VEHICLE        |               103 |                    103 |                    0
 VIRTUAL        |               103 |                      0 |                  103
(4 rows)
```

정량 결과: “현재 재고에 등장하는 103개 품목 × 미삭제 30개 창고”를 전체 창고 조회로 정의하면 **206행 → 3,090행**, 즉 **2,884행 증가**다. 페이지 크기 50 기준 총 페이지는 **5페이지 → 62페이지**가 된다. 특정 재고 0 창고를 선택하면 현재 0행이지만 이 정의에서는 창고당 103행이 된다. 이 중 VIRTUAL 합성분은 103행이다.

주의: 이 수치는 “현재 재고에 한 번이라도 등장하는 품목 103개”를 품목 모집단으로 삼은 경우다. 재고가 어느 창고에도 한 번도 없어서 `stock_balances`에 전혀 등장하지 않는 전체 상품 카탈로그까지 포함하는 정의는 product DB의 별도 모집단과 새 계약이 필요하며, 이번 수치 3,090행에 포함하지 않았다.

현재 103개 품목이 모두 정확히 두 재고 보유 창고에 한 행씩 있는지도 재확인했다.

실행 SQL:

```sql
WITH per_product AS (SELECT product_id, COUNT(DISTINCT warehouse_id) AS warehouse_count, COUNT(*) AS balance_rows FROM stock_balances WHERE is_deleted=false GROUP BY product_id) SELECT warehouse_count, balance_rows, COUNT(*) AS product_count FROM per_product GROUP BY warehouse_count, balance_rows ORDER BY warehouse_count, balance_rows;
```

출력 원문:

```text
 warehouse_count | balance_rows | product_count 
-----------------+--------------+---------------
               2 |            2 |           103
(1 row)
```

따라서 현재 206행은 103개 품목이 재고 보유 2개 창고에 각각 존재한 결과이며, 누락 조합 2,884행 계산에 편중이나 중복은 없다.

### 7. 선택지별 영향 범위

아래는 비용과 영향만 기술한다. 어느 선택지가 화면 목적에 맞는지는 판정하지 않는다.

#### (가) 재고 0인 창고를 “전체 창고” 조회에 포함

- **정량 영향:** 현재 재고 등장 품목 103개를 모집단으로 하면 206행에서 3,090행으로 **2,884행 증가**한다. 50행 페이지 기준 5페이지에서 62페이지가 된다. 재고 행이 없는 창고 28곳은 각각 103행씩 생긴다.
- **백엔드 변경 지점:** `StockBalanceRepository.java:46-65`의 엔티티 페이지 쿼리는 없는 `StockBalance`를 표현할 수 없다. 따라서 이 메서드를 단순 JOIN 수정하는 수준이 아니라, 창고×품목 누락 조합을 반환하는 projection/DTO 조회를 새로 두거나 `StockService.java:71-87`에서 창고 목록과 품목 목록을 합성해야 한다. 합성 응답을 만들려면 `StockBalanceResponse.java:8-40`에 실재 엔티티가 없는 0수량 행 생성 경계도 필요하다. `StockController.java:83-90`의 URL은 유지할 수 있지만 `totalElements`, `totalPages`, 필터·정렬 계약은 달라진다.
- **프런트 변경 가능 지점:** `InventoryStockBalancePage.tsx:217-240`에는 이미 창고 목록과 balance 페이지 두 query가 있다. 다만 현재 balance 응답이 서버 페이지 단위이므로 프런트에서 현재 페이지만 머지하면 전역 중복 제거와 `totalElements`를 정확히 계산할 수 없다. 프런트 합성으로 선택할 경우 전체 품목 모집단/페이지 계약을 추가로 정해야 한다. 수량 셀 렌더 자체는 0을 이미 표시할 수 있다.
- **화면 내부 연쇄 영향:** `InventoryStockBalancePage.tsx:242-244`의 `zeroAvailableCount`는 전체가 아니라 현재 페이지 `rows`만 센다. 0행을 대량 합성하면 하단 “가용재고 0 품목”은 계속 페이지별 수치가 된다. 선택 창고가 재고 0 창고일 때는 현재 0행에서 103행으로 바뀐다.
- **다른 production 화면:** `listStockBalances()` production 호출자는 현 재고 현황 화면 한 곳뿐이다. 주문·전표의 공용 재고조회 모달은 `POST /inventory/balances/batch`와 `listWarehouses()`를 사용하는 별도 경로이므로, `GET /inventory/balances`만 바꾸면 그 화면들은 직접 영향이 없다.
- **집계·엑셀:** 조회 응답에서만 0행을 합성하고 DB에 저장하지 않는다면 안전재고 합산, 재고실사, 재고 차감·입고 수량에는 영향이 없다. 이들은 `findBalancePage`가 아니라 `findByProductIdAndWarehouse_IdAndIsDeletedFalse`, `findAllByProductIdInAndIsDeletedFalse`, `findAllByWarehouse_IdAndIsDeletedFalse` 등을 쓴다. 엑셀도 `findAll`/`findAllByWarehouse...`를 사용하므로 기존 실재 `stock_balances`만 내보낸다. 화면과 엑셀의 행 집합은 이 경우 달라진다.
- **API 호환 범위:** 합성을 `productId == null`인 전체 현황에만 적용하면 현재 화면 중심 변경이다. `productId`가 있는 호출까지 적용하면 단일 품목 조회도 현재 2행에서 30행으로 바뀌며 운영 smoke/IT/외부 소비자의 기대값도 바뀐다. 어느 범위로 할지는 별도 계약 선택이다.
- **성능 표면:** 현재 DB 기준 count/조회 대상이 15배(206→3,090)로 늘고 페이지가 5→62가 된다. 실재 행을 쓰는 합계 계산은 그대로지만 목록 count·정렬·전송량은 늘어난다. 실제 부하 측정은 이번 라운드에서 하지 않았다.

호출·집계 경계 검색 출력 원문:

```text
clients\desktop\src\renderer\api\inventory.ts:352:export async function listStockBalances(
clients\desktop\src\renderer\routes\warehouse\InventoryStockBalancePage.tsx:225:      listStockBalances({
services\inventory-service\src\main\java\com\samhanair\logis\inventory\web\StockController.java:89:        return ApiResponse.ok(stockService.findBalancePage(productId, warehouseId, pageable));
services\inventory-service\src\main\java\com\samhanair\logis\inventory\repository\StockBalanceRepository.java:63:    Page<StockBalance> findBalancePage(@Param("productId") UUID productId,
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\StockService.java:71:    public Page<StockBalanceResponse> findBalancePage(UUID productId, UUID warehouseId, Pageable pageable) {
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\StockService.java:73:                stockBalanceRepository.findBalancePage(productId, warehouseId, pageable);
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\StockExcelExportService.java:83:                    .findAllByWarehouse_IdAndIsDeletedFalse(warehouseId, pageable);
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\StockExcelExportService.java:86:                    .findAll(pageable);
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\InventoryAuditService.java:115:                .findAllByWarehouse_IdAndIsDeletedFalse(warehouse.getId(), Pageable.unpaged());
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\InventoryAuditService.java:363:                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\SafetyStockService.java:263:                    .findByProductIdAndWarehouse_IdAndIsDeletedFalse(
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\SafetyStockService.java:270:                    .findAllByProductIdInAndIsDeletedFalse(List.of(config.getProductId()))
```

안전재고 합산 구현 출력 원문:

```text
 252:     // ------------------------------------------------------------------
 253: 
 254:     /**
 255:      * SafetyStockConfig 의 warehouseId 유무에 따라 현재 가용 재고 수량을 계산한다.
 256:      *
 257:      * @param config 안전재고 설정 엔티티
 258:      * @return warehouseId != null 이면 해당 창고 availableQty, null 이면 productId 전체 창고 합산
 259:      */
 260:     private int resolveCurrentQty(SafetyStockConfig config) {
 261:         if (config.getWarehouseId() != null) {
 262:             return stockBalanceRepository
 263:                     .findByProductIdAndWarehouse_IdAndIsDeletedFalse(
 264:                             config.getProductId(), config.getWarehouseId())
 265:                     .map(b -> b.getAvailableQty())
 266:                     .orElse(0);
 267:         } else {
 268:             // 전체 창고 합산
 269:             return stockBalanceRepository
 270:                     .findAllByProductIdInAndIsDeletedFalse(List.of(config.getProductId()))
 271:                     .stream()
 272:                     .mapToInt(b -> b.getAvailableQty())
 273:                     .sum();
 274:         }
 275:     }
```

다른 production 재고조회 화면의 별도 경로 검색 출력 원문:

```text
clients\desktop\src\renderer\api\inventory.ts:410:export async function fetchProductBalancesMatrix(
clients\desktop\src\renderer\routes\components\InventoryLookupModal.tsx:88:    queryFn: () => fetchProductBalancesMatrix(lines),
clients\desktop\src\renderer\routes\components\InventoryLookupModal.tsx:68:export function InventoryLookupModal({
clients\desktop\src\renderer\routes\SalesPartnerOrderDetailPage.tsx:28:import { InventoryLookupModal } from './components/InventoryLookupModal'
clients\desktop\src\renderer\routes\SalesPartnerOrderDetailPage.tsx:1816:      <InventoryLookupModal
clients\desktop\src\renderer\routes\SlipDetailPage.tsx:73:import { InventoryLookupModal } from './components/InventoryLookupModal'
clients\desktop\src\renderer\routes\SlipDetailPage.tsx:4061:      <InventoryLookupModal
clients\desktop\src\renderer\routes\SlipFormPage.tsx:13: * - `<InventoryLookupModal>` 모달 (모델명 × 창고 matrix)
clients\desktop\src\renderer\routes\SlipFormPage.tsx:110:import { InventoryLookupModal } from './components/InventoryLookupModal'
clients\desktop\src\renderer\routes\SlipFormPage.tsx:631:  // 재고조회 모달 state — 신 InventoryLookupModal 은 자체 페치(useQuery).
clients\desktop\src\renderer\routes\SlipFormPage.tsx:1812:      {/* 재고조회 모달 — 신 공용 InventoryLookupModal (가용/실/예약 자체 페치) */}
clients\desktop\src\renderer\routes\SlipFormPage.tsx:1814:      <InventoryLookupModal
```

#### (나) VIRTUAL을 `—`로 표시

- **선택지 성립 여부:** 현재 `VR-001 가상창고`가 실제로 1곳 있으므로 성립한다. 재고 행이 없어서 현재 렌더 0행이다.
- **정량 영향:** 현재 재고 등장 품목 103개 각각에 VIRTUAL 조합만 합성하면 **103행 증가**, 206행에서 309행이 된다. 50행 페이지 기준 5페이지에서 7페이지가 된다. 다른 재고 0 창고 27곳은 계속 빠진다.
- **셀 렌더 변경:** 필요 없다. `InventoryStockBalancePage.tsx:137-185`가 이미 `warehouseType === 'VIRTUAL'`이면 가용·예약·실재고 모두 `—`로 렌더한다.
- **필수 데이터 변경 지점:** `StockBalanceRepository.java:46-65`/`StockService.java:71-87`에서 VIRTUAL 합성 행을 응답에 넣거나, `InventoryStockBalancePage.tsx:217-240`에서 VIRTUAL 창고와 품목을 합쳐야 한다. 백엔드 방식은 total/page 계약이 206→309로 바뀐다. 프런트 방식은 현재 서버 페이지 응답만으로 전체 103개 품목을 안정적으로 알 수 없어 페이지 경계와 총건수 처리가 추가로 필요하다.
- **다른 화면·집계:** `GET /inventory/balances`에만 합성하면 (가)와 같이 다른 production 화면과 DB 집계는 직접 영향이 없다. 단일 품목 필터에도 VIRTUAL을 포함할지 여부에 따라 기존 API 호출의 행 수는 품목당 +1이 될 수 있다.
- **mock 차이:** desktop mock은 이미 VIRTUAL 한 행을 강제로 넣어 `—` 렌더가 도달한다. 실 DB/소스 조회는 그 행을 만들지 않는다. 따라서 mock 화면과 실동작이 현재 다르다.

mock의 VIRTUAL fixture 출력 원문:

```text
 5279:   // GET /inventory/balances — 재고 현황 목록 (Phase 2.6c 신규)
 5280:   // warehouseId 필터 + page/size 지원. 화면 노출: productCode/productName/warehouseCode/warehouseName (UUID 비공개).
 5281:   // VITE_MOCK_MODE 한정 테스트용 — QA 증빙 캡처에는 미사용.
 5282:   // reservedQty: 주문 전환(reserve) 으로 잠긴 수량 — 일부 행 현실적 예약값 포함(0 고정 해소).
 5283:   if (method === 'GET' && url.includes('/inventory/balances') && !url.includes('/batch')) {
 5284:     const mockRows = [
 5285:       // 본사창고 HQ: AJ040 — 예약 3건 (주문 전환 중)
 5286:       { productId: 'p-aj040', productCode: 'AJ040RXH4BC1', productName: '시스템에어컨 4Way 4HP', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 9, reservedQty: 3, totalQty: 12 },
 5287:       // 차량창고 VH: AJ040 — 예약 1건 (당일 출고 전환 중)
 5288:       { productId: 'p-aj040', productCode: 'AJ040RXH4BC1', productName: '시스템에어컨 4Way 4HP', warehouseId: 'wh-vh', warehouseCode: 'VH-001', warehouseName: '1호차 차량재고', warehouseType: 'VEHICLE', availableQty: 2, reservedQty: 1, totalQty: 3 },
 5289:       // 본사창고 HQ: AJ052 — 예약 1건
 5290:       { productId: 'p-aj052', productCode: 'AJ052RXH5BC1', productName: '시스템에어컨 4Way 5HP', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 4, reservedQty: 1, totalQty: 5 },
 5291:       // 차량창고 VH: AJ052 — 예약 2건 (전환 대기)
 5292:       { productId: 'p-aj052', productCode: 'AJ052RXH5BC1', productName: '시스템에어컨 4Way 5HP', warehouseId: 'wh-vh', warehouseCode: 'VH-001', warehouseName: '1호차 차량재고', warehouseType: 'VEHICLE', availableQty: 0, reservedQty: 2, totalQty: 2 },
 5293:       // 본사창고 HQ: AJ036 — 예약 2건
 5294:       { productId: 'p-aj036', productCode: 'AJ036NCH3CH', productName: '천장형 1Way 3HP', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 6, reservedQty: 2, totalQty: 8 },
 5295:       // 위탁창고 CS: AJ036 — 예약 없음 (위탁 재고 특성상 예약 미발생)
 5296:       { productId: 'p-aj036', productCode: 'AJ036NCH3CH', productName: '천장형 1Way 3HP', warehouseId: 'wh-cs', warehouseCode: 'CS-001', warehouseName: '거래처 위탁창고', warehouseType: 'CONSIGNMENT', availableQty: 1, reservedQty: 0, totalQty: 1 },
 5297:       // 본사창고 HQ: AJ100 — 가용 0 강조 케이스 (예약 2건, 전환 불가)
 5298:       { productId: 'p-aj100', productCode: 'AJ100NCDKH', productName: '실외기 10HP', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 0, reservedQty: 2, totalQty: 2 },
 5299:       // 본사창고 HQ: MWR-WE10N — 예약 5건
 5300:       { productId: 'p-mwr10', productCode: 'MWR-WE10N', productName: '유선 리모컨 (WE10N)', warehouseId: 'wh-hq', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 40, reservedQty: 5, totalQty: 45 },
 5301:       // 차량창고 VH: MWR-WE10N — 예약 3건 (당일 출고 묶음)
 5302:       { productId: 'p-mwr10', productCode: 'MWR-WE10N', productName: '유선 리모컨 (WE10N)', warehouseId: 'wh-vh', warehouseCode: 'VH-001', warehouseName: '1호차 차량재고', warehouseType: 'VEHICLE', availableQty: 7, reservedQty: 3, totalQty: 10 },
 5303:       // 가상창고 VR: PC1NWSK3NW — VIRTUAL 수량 개념 없음 (— 표시 검증)
 5304:       { productId: 'p-pc1nw', productCode: 'PC1NWSK3NW', productName: 'WIFI 판넬', warehouseId: 'wh-vr', warehouseCode: 'VR-001', warehouseName: '가상창고', warehouseType: 'VIRTUAL', availableQty: 0, reservedQty: 0, totalQty: 0 },
 5305:     ]
 5306:     const params = mockLocationParams()
 5307:     const productIdFilter = params.get('productId')
 5308:     const warehouseIdFilter = params.get('warehouseId')
 5309:     const filtered = mockRows.filter((r) =>
 5310:       (!productIdFilter || r.productId === productIdFilter) &&
```

#### (다) 범례를 현재 동작에 맞게 수정

- **변경 지점:** `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:277`의 문구 한 곳이다.
- **데이터·행 수:** 206행 그대로다. API, 저장소, 페이지네이션, 집계, 엑셀, 다른 화면에 영향이 없다.
- **연쇄 범위:** 현재 exact 문구의 실행 소스는 위 277행 한 곳이다. 검색에 잡힌 나머지는 과거 QA 로그와 과거 개발 보고서이므로 실행 동작은 아니다. 향후 화면 QA의 텍스트 기대값/증거는 새 문구에 맞춰야 하지만 현 Playwright에는 이 exact 문구 assertion이 없다.
- **남는 동작:** VIRTUAL 창고가 선택 목록에는 있어도 선택 조회 결과는 0행인 현재 동작은 그대로다. 셀의 `VIRTUAL → —` 렌더 분기는 도달하지 않는 dead path로 남는다.

실행 소스 범위 exact 문구 검색 출력 원문:

```text
clients\desktop\src\renderer\routes\warehouse\InventoryStockBalancePage.tsx:277:          가상 창고(VIRTUAL): 수량 개념 없음 (— 표시)
```

### 8. 종료 직전 DB 재확인

공유 스택을 다른 트랙도 사용하므로 조사 종료 직전에 같은 핵심 수치를 다시 읽었다.

실행 SQL:

```sql
SELECT CURRENT_TIMESTAMP AS rechecked_at;
WITH active_balances AS (SELECT * FROM stock_balances WHERE is_deleted=false), active_warehouses AS (SELECT * FROM warehouses WHERE is_deleted=false) SELECT (SELECT COUNT(*) FROM active_warehouses) AS undeleted_warehouses, (SELECT COUNT(DISTINCT warehouse_id) FROM active_balances) AS warehouses_with_balance_rows, (SELECT COUNT(*) FROM active_balances) AS balance_rows, (SELECT COUNT(DISTINCT product_id) FROM active_balances) AS stocked_products, (SELECT COUNT(*) FROM active_warehouses WHERE type='VIRTUAL') AS virtual_warehouses, (SELECT COUNT(*) FROM active_balances b JOIN active_warehouses w ON w.id=b.warehouse_id WHERE w.type='VIRTUAL') AS virtual_balance_rows;
WITH b AS (SELECT warehouse_id, COUNT(*) AS balance_rows FROM stock_balances WHERE is_deleted=false GROUP BY warehouse_id) SELECT w.type AS warehouse_type, COUNT(*) AS undeleted_warehouses, COUNT(*) FILTER (WHERE COALESCE(b.balance_rows,0)>0) AS warehouses_with_balance_rows, COALESCE(SUM(b.balance_rows),0) AS balance_rows FROM warehouses w LEFT JOIN b ON b.warehouse_id=w.id WHERE w.is_deleted=false GROUP BY w.type ORDER BY w.type;
```

출력 원문:

```text
         rechecked_at         
------------------------------
 2026-08-04 10:31:09.43223+09
(1 row)

 undeleted_warehouses | warehouses_with_balance_rows | balance_rows | stocked_products | virtual_warehouses | virtual_balance_rows 
----------------------+------------------------------+--------------+------------------+--------------------+----------------------
                   30 |                            2 |          206 |              103 |                  1 |                    0
(1 row)

 warehouse_type | undeleted_warehouses | warehouses_with_balance_rows | balance_rows 
----------------+----------------------+------------------------------+--------------
 CONSIGNMENT    |                    1 |                            0 |            0
 HEADQUARTERS   |                   27 |                            1 |          103
 VEHICLE        |                    1 |                            1 |          103
 VIRTUAL        |                    1 |                            0 |            0
(4 rows)
```

종료 시각에도 시작 측정과 동일했다.

## 결론

- **실수치:** 2026-08-04 10:17 최초 측정과 10:31 종료 재측정 모두 미삭제 창고 30곳, 재고 잔액 행 보유 창고 2곳, 활성 재고 잔액 206행, 재고 등장 품목 103개다. 유형 분포는 `HEADQUARTERS 27 / VEHICLE 1 / CONSIGNMENT 1 / VIRTUAL 1`이다.
- **실제 VIRTUAL:** `VR-001 가상창고` 1곳이 존재하며 활성 재고 잔액은 0행이다. 따라서 VIRTUAL 표시는 실제 선택지다.
- **행 소실 위치:** `StockBalanceRepository.java:49-61`이 존재하는 미삭제 `StockBalance`만 SELECT/COUNT한다. 창고가 조회 루트가 아니므로 재고 행이 없는 창고는 서비스·응답·프런트에 도달하지 않는다. 응답 필터와 프런트 행 필터는 없다.
- **렌더와 범례:** `InventoryStockBalancePage.tsx:137-185`의 VIRTUAL 셀 렌더는 이미 세 수량을 `—`로 표시한다. 범례 원문은 같은 파일 **277행**이다. 데이터가 렌더 분기에 도달하지 않는 것이 불일치의 원인이다.
- **선택지 비용:** (가) 현재 재고 등장 품목을 기준으로 전 창고 매트릭스를 만들면 206→3,090행, **+2,884행**이다. (나) VIRTUAL 조합만 만들면 206→309행, **+103행**이며 셀 렌더 수정은 필요 없다. (다)는 277행 문구만 바꾸며 행 수·API·집계는 그대로다.
- **상태:** `DONE` — 진단과 영향 측정 완료, 코드·DB 변경 없음.

## 이 라운드가 보지 않은 것

- 2026-07-24 자로 오래된 배포 이미지의 API는 호출하지 않았다. 배포본과 현재 소스가 다를 수 있어 판정 근거를 현재 작업공간 소스와 `inventory_db` 읽기 전용 SQL로 제한했다.
- 브라우저/실 배포 화면을 다시 열어 캡처하지 않았다. 실 DB에서 VIRTUAL 응답 후보가 0행임과 프런트 렌더 분기를 소스로 확정했다.
- `product_db` 전체 상품 카탈로그는 세지 않았다. (가)의 3,090행은 `inventory_db.stock_balances`에 현재 한 번이라도 등장하는 103개 품목만 모집단으로 한 수치다. 재고 행이 어느 창고에도 없는 상품까지 포함하는 별도 정의는 미측정이다.
- 3,090행 매트릭스의 실제 SQL 실행계획, 응답 지연, 메모리, 네트워크 부하는 측정하지 않았다. 테스트·benchmark 실행 금지 지시를 지켰다.
- 인증·권한별 API 응답과 2026-07-24 배포본의 계약 차이는 확인하지 않았다.
- 코드 수정, 테스트 추가·실행, DB 쓰기, 이미지 재빌드·재배포, git 명령은 수행하지 않았다.
- 화면 목적과 (가)/(나)/(다) 중 어느 선택지가 맞는지는 판단하지 않았다.
