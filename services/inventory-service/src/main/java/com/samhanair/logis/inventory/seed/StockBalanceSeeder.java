package com.samhanair.logis.inventory.seed;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * feature/local-test-setup Stage 2 — StockBalance 200건 시드 (100 product × 2 warehouse).
 *
 * <p>활성 조건 (이중 가드):
 * <ul>
 *   <li>{@link Profile @Profile("dev")} — local/dev 프로파일 한정</li>
 *   <li>{@link ConditionalOnProperty}({@code app.seed-test-data=true}) — product/inventory 공통 toggle</li>
 * </ul>
 *
 * <p>대상 제품: Stage 1 이 시드한 product 100건.
 * modelName 은 product-service {@code HvacProductSeeder.buildAllRows} 와 1:1 동기화된 명시 배열
 * ({@link #PRODUCT_MODEL_NAMES}) 을 사용한다.
 * UUID = {@code UUID.nameUUIDFromBytes("samhan-seed:product:" + modelName)} — Stage 1 과 동일 namespace.
 *
 * <p>출처: product-service HvacProductSeeder, 4 seeder 동일 유지 (inventory/slip/partner-order).
 *
 * <p>대상 창고: V2 시드 본사창고(HQ-001) + 1호차 차량재고(VH-001) — id 는 V2 SQL 의 명시 UUID 사용.
 *
 * <p>잔량 분포 (결정적): {@code quantity = 30 + (productSeq * 7 + warehouseSeq * 13) % 471}.
 * 결과 범위 30~500. slip-service 의 COMPLETED 슬립 차감 (수량 1~10) 을 충분히 견디는 분포.
 *
 * <p>idempotency: id (deterministic UUID) 의 EXISTS 체크 + 중복 시 skip. 안전 재실행.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.seed-test-data", havingValue = "true")
@Order(10)
public class StockBalanceSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(StockBalanceSeeder.class);

    /** Stage 1 product 결정성 UUID namespace prefix. modelName 만 가변. */
    private static final String PRODUCT_UUID_PREFIX = "samhan-seed:product:";
    /** StockBalance 결정성 UUID namespace prefix. {warehouseCode}:{modelName} 가변. */
    private static final String STOCK_BALANCE_UUID_PREFIX = "samhan-seed:stock-balance:";

    /**
     * product-service HvacProductSeeder.buildAllRows 와 1:1 동기화된 실 modelName 100개.
     * 출처: product-service HvacProductSeeder, 4 seeder 동일 유지 (inventory/slip/partner-order).
     *
     * <p>변경 시 반드시 HvacProductSeeder.buildAllRows 를 먼저 확인하고 4 seeder 동시 갱신.
     *
     * <ul>
     *   <li>seq 1~30  벽걸이  : {@code AR%02dTXEAAWKNEU-%02d}</li>
     *   <li>seq 31~50 스탠드  : {@code AF%02dBX1NWAEAH-%02d}</li>
     *   <li>seq 51~75 DVM-S  : {@code AM%03dBNNDEH-%02d} (hp*10)</li>
     *   <li>seq 76~85 천장형  : {@code AC%03dCNCDEH-%02d} ((idx+1)*100)</li>
     *   <li>seq 86~95 공기청정기: {@code AX%02dB%dNNDB-%02d}</li>
     *   <li>seq 96~100 부속   : 고정 5종</li>
     * </ul>
     */
    static final String[] PRODUCT_MODEL_NAMES = {
            // seq 1~10 벽걸이 (pyongWall = {5,6,7,9,11,13,15,16,18,20})
            "AR05TXEAAWKNEU-01", "AR06TXEAAWKNEU-02", "AR07TXEAAWKNEU-03",
            "AR09TXEAAWKNEU-04", "AR11TXEAAWKNEU-05", "AR13TXEAAWKNEU-06",
            "AR15TXEAAWKNEU-07", "AR16TXEAAWKNEU-08", "AR18TXEAAWKNEU-09",
            "AR20TXEAAWKNEU-10",
            // seq 11~20 벽걸이 (순환)
            "AR05TXEAAWKNEU-11", "AR06TXEAAWKNEU-12", "AR07TXEAAWKNEU-13",
            "AR09TXEAAWKNEU-14", "AR11TXEAAWKNEU-15", "AR13TXEAAWKNEU-16",
            "AR15TXEAAWKNEU-17", "AR16TXEAAWKNEU-18", "AR18TXEAAWKNEU-19",
            "AR20TXEAAWKNEU-20",
            // seq 21~30 벽걸이 (순환)
            "AR05TXEAAWKNEU-21", "AR06TXEAAWKNEU-22", "AR07TXEAAWKNEU-23",
            "AR09TXEAAWKNEU-24", "AR11TXEAAWKNEU-25", "AR13TXEAAWKNEU-26",
            "AR15TXEAAWKNEU-27", "AR16TXEAAWKNEU-28", "AR18TXEAAWKNEU-29",
            "AR20TXEAAWKNEU-30",
            // seq 31~38 스탠드 (pyongStand = {15,17,18,20,23,25,26,30})
            "AF15BX1NWAEAH-31", "AF17BX1NWAEAH-32", "AF18BX1NWAEAH-33",
            "AF20BX1NWAEAH-34", "AF23BX1NWAEAH-35", "AF25BX1NWAEAH-36",
            "AF26BX1NWAEAH-37", "AF30BX1NWAEAH-38",
            // seq 39~46 스탠드 (순환)
            "AF15BX1NWAEAH-39", "AF17BX1NWAEAH-40", "AF18BX1NWAEAH-41",
            "AF20BX1NWAEAH-42", "AF23BX1NWAEAH-43", "AF25BX1NWAEAH-44",
            "AF26BX1NWAEAH-45", "AF30BX1NWAEAH-46",
            // seq 47~50 스탠드 (순환)
            "AF15BX1NWAEAH-47", "AF17BX1NWAEAH-48", "AF18BX1NWAEAH-49",
            "AF20BX1NWAEAH-50",
            // seq 51~63 DVM-S (hpDvm = {3,4,5,6,7,8,10,12,14,16,18,20,22})
            "AM030BNNDEH-51", "AM040BNNDEH-52", "AM050BNNDEH-53",
            "AM060BNNDEH-54", "AM070BNNDEH-55", "AM080BNNDEH-56",
            "AM100BNNDEH-57", "AM120BNNDEH-58", "AM140BNNDEH-59",
            "AM160BNNDEH-60", "AM180BNNDEH-61", "AM200BNNDEH-62",
            "AM220BNNDEH-63",
            // seq 64~75 DVM-S (순환)
            "AM030BNNDEH-64", "AM040BNNDEH-65", "AM050BNNDEH-66",
            "AM060BNNDEH-67", "AM070BNNDEH-68", "AM080BNNDEH-69",
            "AM100BNNDEH-70", "AM120BNNDEH-71", "AM140BNNDEH-72",
            "AM160BNNDEH-73", "AM180BNNDEH-74", "AM200BNNDEH-75",
            // seq 76~85 천장형 ((idx+1)*100 → 100,200,...,1000)
            "AC100CNCDEH-76", "AC200CNCDEH-77", "AC300CNCDEH-78",
            "AC400CNCDEH-79", "AC500CNCDEH-80", "AC600CNCDEH-81",
            "AC700CNCDEH-82", "AC800CNCDEH-83", "AC900CNCDEH-84",
            "AC1000CNCDEH-85",
            // seq 86~95 공기청정기 (m2 = {17,23,30,35,40,50,60,75,90,100})
            "AX17B17NNDB-86", "AX23B23NNDB-87", "AX30B30NNDB-88",
            "AX35B35NNDB-89", "AX40B40NNDB-90", "AX50B50NNDB-91",
            "AX60B60NNDB-92", "AX75B75NNDB-93", "AX90B90NNDB-94",
            "AX100B100NNDB-95",
            // seq 96~100 부속 (고정 5종)
            "PIPE-CU-15A", "PIPE-CU-22A", "INSUL-T20",
            "REMOTE-MR-DH00", "COMM-MIM-N10"
    };

    /** V2 시드 본사창고 UUID — V2__seed_inventory_warehouses.sql 의 HQ-001 row. */
    private static final UUID HQ_WAREHOUSE_ID =
            UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final String HQ_WAREHOUSE_CODE = "HQ-001";
    /** V2 시드 1호차 차량재고 UUID — V2__seed_inventory_warehouses.sql 의 VH-001 row. */
    private static final UUID VH_WAREHOUSE_ID =
            UUID.fromString("11111111-1111-1111-1111-000000000002");
    private static final String VH_WAREHOUSE_CODE = "VH-001";

    private final JdbcTemplate jdbcTemplate;
    private final ProductSeedIntegrityValidator productSeedIntegrityValidator;

    public StockBalanceSeeder(JdbcTemplate jdbcTemplate, ProductSeedIntegrityValidator productSeedIntegrityValidator) {
        this.jdbcTemplate = jdbcTemplate;
        this.productSeedIntegrityValidator = productSeedIntegrityValidator;
    }

    @Override
    @Transactional
    public void run(String... args) {
        log.info("[StockBalanceSeeder] Stage 2 시드 시작 — 100 product × 2 warehouse = 200 row");
        productSeedIntegrityValidator.validate(Arrays.asList(PRODUCT_MODEL_NAMES));

        int created = 0;
        int skipped = 0;
        for (int productSeq = 1; productSeq <= PRODUCT_MODEL_NAMES.length; productSeq++) {
            String modelName = PRODUCT_MODEL_NAMES[productSeq - 1];
            UUID productId = ProductSeedIntegrityValidator.productId(modelName);
            int qHq = computeQuantity(productSeq, 1);
            int qVh = computeQuantity(productSeq, 2);
            if (insertIfAbsent(productId, HQ_WAREHOUSE_ID, HQ_WAREHOUSE_CODE, modelName, qHq)) {
                created++;
            } else {
                skipped++;
            }
            if (insertIfAbsent(productId, VH_WAREHOUSE_ID, VH_WAREHOUSE_CODE, modelName, qVh)) {
                created++;
            } else {
                skipped++;
            }
        }
        log.info("[StockBalanceSeeder] 완료 — 신규 {}건, skip {}건 (총 {}건)",
                created, skipped, created + skipped);
    }

    private boolean insertIfAbsent(UUID productId, UUID warehouseId, String warehouseCode,
                                   String productCode, int quantity) {
        UUID stockBalanceId = deterministicUuid(
                STOCK_BALANCE_UUID_PREFIX + warehouseCode + ":" + productCode);
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM stock_balances WHERE id = ?",
                Integer.class, stockBalanceId);
        if (cnt != null && cnt > 0) {
            return false;
        }
        Timestamp now = Timestamp.valueOf(LocalDateTime.now());
        jdbcTemplate.update(
                "INSERT INTO stock_balances ("
                        + "  id, product_id, warehouse_id, available_qty, reserved_qty, total_qty,"
                        + "  version, created_at, created_by, is_deleted"
                        + ") VALUES (?, ?, ?, ?, 0, ?, 0, ?, 'system', FALSE)",
                stockBalanceId, productId, warehouseId, quantity, quantity, now);
        return true;
    }

    /**
     * 결정적 잔량 — productSeq(1~100) + warehouseSeq 기반 (재실행 시 동일).
     * 범위 30~500 → COMPLETED 시 slip 차감 (1~10) 여유. available_qty > 0 보장.
     *
     * @param productSeq   1~100 product 순번 (PRODUCT_MODEL_NAMES 배열 인덱스+1)
     * @param warehouseSeq 1=HQ, 2=VH
     * @return 30 이상 500 이하 결정적 정수
     */
    private static int computeQuantity(int productSeq, int warehouseSeq) {
        return 30 + ((productSeq * 7 + warehouseSeq * 13) % 471);
    }

    /**
     * Type-3 (name-based MD5) UUID — Stage 1 / Stage 2 공통 namespace 표준.
     * UTF-8 byte 입력, 같은 문자열은 항상 같은 UUID.
     */
    private static UUID deterministicUuid(String name) {
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }
}
