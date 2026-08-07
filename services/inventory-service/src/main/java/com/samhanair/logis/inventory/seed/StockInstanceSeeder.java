package com.samhanair.logis.inventory.seed;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDateTime;
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
 * Phase INV-S S1 — serial-managed 품목(에어컨 계열) 창고별 AVAILABLE 인스턴스 시드.
 *
 * <p>목적: FIFO(received_at ASC) 및 역-FIFO(outbound_at DESC) IT 검증을 위해
 * 인스턴스별 {@code received_at} 을 분산하여 저장.
 *
 * <p>활성 조건 (이중 가드):
 * <ul>
 *   <li>{@link Profile @Profile("dev")} — local/dev 프로파일 한정</li>
 *   <li>{@link ConditionalOnProperty}({@code app.seed-test-data=true}) — product/inventory 공통 toggle</li>
 * </ul>
 *
 * <p>대상 품목: serial-managed 에어컨 계열 샘플 4종 (벽걸이/스탠드/시스템에어컨/천장형 각 1개).
 * productId/productCode = {@link StockBalanceSeeder#PRODUCT_MODEL_NAMES} 의 결정적 UUID 카탈로그와 정합.
 * product-service {@code HvacProductSeeder} 동일 namespace {@code "samhan-seed:product:<modelName>"}.
 *
 * <p>창고: V2 시드 HQ-001(본사) + VH-001(1호차) 각 3개 인스턴스 (received_at 1시간 간격 분산).
 *
 * <p>idempotency: id (결정적 UUID) EXISTS 체크 + 중복 시 skip. 안전 재실행.
 *
 * <p>batch 품목(부자재 등)은 기존 {@link StockBalanceSeeder}({@code stock_lots}/{@code stock_balances}) 유지,
 * 본 seeder 에서 무변경.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.seed-test-data", havingValue = "true")
@Order(11)
public class StockInstanceSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(StockInstanceSeeder.class);

    /** product-service HvacProductSeeder 와 동일 namespace — 결정적 UUID single source. */
    private static final String PRODUCT_UUID_PREFIX = "samhan-seed:product:";
    /** StockInstance 결정적 UUID namespace. */
    private static final String INSTANCE_UUID_PREFIX = "samhan-seed:stock-instance:";

    /**
     * serial-managed 에어컨 계열 샘플 4종.
     * product-service HvacProductSeeder.buildAllRows seq 1/31/51/76 에 해당.
     * [[project_seed_product_uuid_catalog]] 정합.
     */
    private static final String[] SERIAL_MODEL_NAMES = {
            "AR05TXEAAWKNEU-01",   // 벽걸이 5평형 (seq 1)
            "AF15BX1NWAEAH-31",    // 스탠드 15평형 (seq 31)
            "AM030BNNDEH-51",       // 시스템에어컨 DVM-S 3HP (seq 51)
            "AC100CNCDEH-76"        // 천장형 100형 (seq 76)
    };

    /** 대응 품목코드 (product-service HvacProductSeeder.buildAllRows seq 기반, 01{seq:04d}). */
    private static final String[] PRODUCT_CODES = {
            "010001",
            "010031",
            "010051",
            "010076"
    };

    /** V2 시드 본사창고 UUID. */
    private static final UUID HQ_WAREHOUSE_ID =
            UUID.fromString("11111111-1111-1111-1111-000000000001");
    /** V2 시드 1호차 차량재고 UUID. */
    private static final UUID VH_WAREHOUSE_ID =
            UUID.fromString("11111111-1111-1111-1111-000000000002");

    /** 인스턴스 기준 received_at — 1시간 간격 분산 (FIFO 순서 검증). */
    private static final LocalDateTime BASE_RECEIVED_AT =
            LocalDateTime.of(2025, 1, 1, 9, 0, 0);

    private final JdbcTemplate jdbcTemplate;

    public StockInstanceSeeder(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void run(String... args) {
        log.info("[StockInstanceSeeder] Phase INV-S S1 인스턴스 시드 시작 — {}종 × 2창고 × 3인스턴스",
                SERIAL_MODEL_NAMES.length);

        int created = 0;
        int skipped = 0;

        for (int productSeq = 0; productSeq < SERIAL_MODEL_NAMES.length; productSeq++) {
            String modelName = SERIAL_MODEL_NAMES[productSeq];
            UUID productId = deterministicUuid(PRODUCT_UUID_PREFIX + modelName);
            String productCode = PRODUCT_CODES[productSeq];

            // 각 창고에 3개 인스턴스 (received_at 1시간 간격)
            for (UUID warehouseId : new UUID[]{HQ_WAREHOUSE_ID, VH_WAREHOUSE_ID}) {
                for (int instanceSeq = 0; instanceSeq < 3; instanceSeq++) {
                    LocalDateTime receivedAt = BASE_RECEIVED_AT
                            .plusHours((long) productSeq * 10 + instanceSeq);
                    // 결정적 UUID: product+warehouse+instance 조합
                    UUID instanceId = deterministicUuid(
                            INSTANCE_UUID_PREFIX + modelName + ":" + warehouseId + ":" + instanceSeq);

                    if (insertIfAbsent(instanceId, productId, productCode, warehouseId, receivedAt)) {
                        created++;
                    } else {
                        skipped++;
                    }
                }
            }
        }
        log.info("[StockInstanceSeeder] 완료 — 신규 {}건, skip {}건", created, skipped);
    }

    /**
     * 인스턴스가 없으면 INSERT, 있으면 skip.
     *
     * @param id          결정적 UUID
     * @param productId   제품 UUID
     * @param productCode 품목코드
     * @param warehouseId 창고 UUID
     * @param receivedAt  입고일시 (FIFO 분산)
     * @return true=신규 생성, false=skip
     */
    private boolean insertIfAbsent(UUID id, UUID productId, String productCode,
                                   UUID warehouseId, LocalDateTime receivedAt) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM stock_instances WHERE id = ?", Integer.class, id);
        if (cnt != null && cnt > 0) {
            return false;
        }
        Timestamp now = Timestamp.valueOf(LocalDateTime.now());
        Timestamp receivedTs = Timestamp.valueOf(receivedAt);
        BigDecimal unitCost = new BigDecimal("500000.00");

        jdbcTemplate.update(
                "INSERT INTO stock_instances ("
                        + "  id, product_id, product_code, warehouse_id, status,"
                        + "  inbound_type, received_at, unit_cost,"
                        + "  created_at, created_by, is_deleted"
                        + ") VALUES (?, ?, ?, ?, 'AVAILABLE', '구매', ?, ?, ?, 'system', FALSE)",
                id, productId, productCode, warehouseId,
                receivedTs, unitCost, now);
        return true;
    }

    /**
     * Type-3 (name-based MD5) UUID — {@link StockBalanceSeeder} 공통 namespace 표준.
     */
    private static UUID deterministicUuid(String name) {
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }
}
