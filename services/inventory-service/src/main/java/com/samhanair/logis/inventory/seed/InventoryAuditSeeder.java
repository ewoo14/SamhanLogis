package com.samhanair.logis.inventory.seed;

import com.samhanair.logis.inventory.domain.InventoryAudit;
import com.samhanair.logis.inventory.domain.InventoryAuditLine;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.InventoryAuditRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * P2 — 재고 실사(InventoryAudit) 픽스처 시드.
 *
 * <p>목적: 실사 기능 UI/IT 검증을 위한 다단계 픽스처.
 * <ul>
 *   <li>PLANNED   3건 — 계획 수립 후 미착수 (2026-03, 2026-04, 2026-05)</li>
 *   <li>IN_PROGRESS 2건 — 진행중 (actual_qty 일부만 입력, 일부 null)</li>
 *   <li>COMPLETED  3건 — 완료 + totalDiffAmount 산출 (차이 +/- 혼합)</li>
 *   <li>CANCELLED  1건 — 취소 (기록 보존 검증용)</li>
 * </ul>
 * 합계 9건 × 창고 1개(HQ-001) = 9 audit row. 각 실사 라인은 5건 고정.
 *
 * <p>활성 조건 (StockBalanceSeeder 와 동일 toggle):
 * <ul>
 *   <li>{@link Profile @Profile("dev")}</li>
 *   <li>{@link ConditionalOnProperty}({@code app.seed-test-data=true})</li>
 * </ul>
 *
 * <p>{@link Order} 20 — StockBalanceSeeder(10) 완료 후 실행 (창고/재고 데이터 의존).
 *
 * <p>product modelName 은 {@link StockBalanceSeeder#PRODUCT_MODEL_NAMES} 공유 상수를 참조한다
 * (출처: product-service HvacProductSeeder, 4 seeder 동일 유지).
 *
 * <p>idempotency: {@code auditNo} EXISTS 체크 + 중복 시 skip. 안전 재실행.
 *
 * <p>채번: {@code yyyy/MM/dd-N} 결정적 패턴 — InventoryAuditRepository.countByAuditNoStartingWith
 * 를 경유하지 않고 직접 포맷 (시드 전용, 운영 채번과 충돌 방지 위해 일자는 2026-01~2026-05 고정).
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.seed-test-data", havingValue = "true")
@Order(20)
public class InventoryAuditSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(InventoryAuditSeeder.class);

    /** V2 시드 본사창고 UUID — V2__seed_inventory_warehouses.sql HQ-001 row 와 동일. */
    private static final UUID HQ_WAREHOUSE_ID =
            UUID.fromString("11111111-1111-1111-1111-000000000001");

    private static final String PRODUCT_UUID_PREFIX = "samhan-seed:product:";

    /** 실사 라인 수 고정 — 각 실사 5개 제품 비교. */
    private static final int LINES_PER_AUDIT = 5;

    private final InventoryAuditRepository auditRepository;
    private final WarehouseRepository warehouseRepository;

    public InventoryAuditSeeder(InventoryAuditRepository auditRepository,
                                WarehouseRepository warehouseRepository) {
        this.auditRepository = auditRepository;
        this.warehouseRepository = warehouseRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        log.info("[InventoryAuditSeeder] P2 실사 시드 시작 — 9건 (PLANNED 3 / IN_PROGRESS 2 / COMPLETED 3 / CANCELLED 1)");

        Warehouse hq = warehouseRepository.findById(HQ_WAREHOUSE_ID).orElse(null);
        if (hq == null) {
            log.warn("[InventoryAuditSeeder] HQ-001 창고(UUID={}) 없음 — 시드 스킵. StockBalanceSeeder 먼저 실행 확인 필요",
                    HQ_WAREHOUSE_ID);
            return;
        }

        List<AuditSpec> specs = buildSpecs();
        int created = 0;
        int skipped = 0;

        for (AuditSpec spec : specs) {
            String auditNo = spec.auditNo();
            if (auditRepository.countByAuditNoStartingWith(auditNo) > 0) {
                skipped++;
                continue;
            }

            try {
                InventoryAudit audit = buildAudit(spec, hq);
                auditRepository.save(audit);
                created++;
            } catch (RuntimeException ex) {
                log.error("[InventoryAuditSeeder] 시드 실패 auditNo={} status={} : {}",
                        auditNo, spec.targetStatus(), ex.getMessage());
                throw ex;
            }
        }

        log.info("[InventoryAuditSeeder] 완료 — 신규 {}건, skip {}건 (총 {}건)",
                created, skipped, created + skipped);
    }

    // ---- spec 빌더 -------------------------------------------------------

    /**
     * 9건 spec:
     * PLANNED 3건 (2026-03, 2026-04, 2026-05) /
     * IN_PROGRESS 2건 (2026-02-15, 2026-02-28) /
     * COMPLETED 3건 (2026-01-31, 2026-02-01, 2026-02-28) /
     * CANCELLED 1건 (2026-03-15).
     */
    private List<AuditSpec> buildSpecs() {
        return List.of(
                // PLANNED — 3건
                new AuditSpec("2026/03/01-1", LocalDate.of(2026, 3, 1),  AuditPhase.PLANNED,  0),
                new AuditSpec("2026/04/01-1", LocalDate.of(2026, 4, 1),  AuditPhase.PLANNED,  1),
                new AuditSpec("2026/05/01-1", LocalDate.of(2026, 5, 1),  AuditPhase.PLANNED,  2),
                // IN_PROGRESS — 2건 (절반만 actual_qty 입력)
                new AuditSpec("2026/02/15-1", LocalDate.of(2026, 2, 15), AuditPhase.IN_PROGRESS, 3),
                new AuditSpec("2026/02/28-1", LocalDate.of(2026, 2, 28), AuditPhase.IN_PROGRESS, 4),
                // COMPLETED — 3건 (완료 + 차이금액 산출)
                new AuditSpec("2026/01/31-1", LocalDate.of(2026, 1, 31), AuditPhase.COMPLETED, 5),
                new AuditSpec("2026/02/01-1", LocalDate.of(2026, 2, 1),  AuditPhase.COMPLETED, 6),
                new AuditSpec("2026/02/28-2", LocalDate.of(2026, 2, 28), AuditPhase.COMPLETED, 7),
                // CANCELLED — 1건
                new AuditSpec("2026/03/15-1", LocalDate.of(2026, 3, 15), AuditPhase.CANCELLED, 8)
        );
    }

    // ---- audit builder ---------------------------------------------------

    private InventoryAudit buildAudit(AuditSpec spec, Warehouse warehouse) {
        InventoryAudit audit = InventoryAudit.create(spec.auditNo(), warehouse, spec.auditDate());

        // 라인 5건 snapshot
        for (int li = 0; li < LINES_PER_AUDIT; li++) {
            // 출처: product-service HvacProductSeeder, 4 seeder 동일 유지 (inventory/slip/partner-order)
            int productSeq = ((spec.idx() * 17 + li * 11) % StockBalanceSeeder.PRODUCT_MODEL_NAMES.length) + 1;
            String modelName = StockBalanceSeeder.PRODUCT_MODEL_NAMES[productSeq - 1];
            UUID productId = deterministicUuid(PRODUCT_UUID_PREFIX + modelName);
            String productName = "냉난방기-" + modelName;
            int expectedQty = 30 + (productSeq * 7 + spec.idx() * 13) % 471;
            BigDecimal unitCost = computeUnitCost(productSeq);

            InventoryAuditLine line = InventoryAuditLine.snapshot(
                    audit, productId, productName, expectedQty, unitCost);
            audit.addLine(line);
        }

        // 상태 전이
        switch (spec.targetStatus()) {
            case PLANNED -> { /* 전이 없음 */ }
            case IN_PROGRESS -> {
                audit.start();
                // IN_PROGRESS: 처음 2~3건만 actual_qty 입력 (나머지 null — 진행중 시나리오)
                List<InventoryAuditLine> lines = audit.getLines();
                int inputCount = (spec.idx() % 2 == 0) ? 2 : 3;
                for (int i = 0; i < Math.min(inputCount, lines.size()); i++) {
                    InventoryAuditLine line = lines.get(i);
                    // 약간의 차이 (+1 ~ -1) 로 실제 실사 시나리오 반영
                    int actual = line.getExpectedQty() + (i % 3 == 0 ? 1 : (i % 3 == 1 ? -1 : 0));
                    line.recordActual(Math.max(0, actual), i % 2 == 0);  // 짝수 라인은 바코드 스캔
                }
            }
            case COMPLETED -> {
                audit.start();
                // COMPLETED: 모든 라인 actual_qty 입력 후 complete()
                for (int i = 0; i < audit.getLines().size(); i++) {
                    InventoryAuditLine line = audit.getLines().get(i);
                    // 차이 분포: +2, 0, -1, +3, -2 순환 (완료 시 totalDiffAmount 산출 검증용)
                    int[] diffs = {2, 0, -1, 3, -2};
                    int actual = Math.max(0, line.getExpectedQty() + diffs[i % diffs.length]);
                    line.recordActual(actual, true);  // 완료 건은 모두 바코드 스캔 처리
                }
                audit.complete();
            }
            case CANCELLED -> {
                audit.start();
                audit.cancel();
            }
        }

        return audit;
    }

    // ---- 헬퍼 ----------------------------------------------------------

    private static BigDecimal computeUnitCost(int productSeq) {
        long base = 200_000L + (productSeq * 7_919L) % 1_500_000L;
        return BigDecimal.valueOf((base / 10_000L) * 10_000L);
    }

    private static UUID deterministicUuid(String name) {
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }

    // ---- 내부 타입 ------------------------------------------------------

    enum AuditPhase { PLANNED, IN_PROGRESS, COMPLETED, CANCELLED }

    private record AuditSpec(String auditNo, LocalDate auditDate,
                             AuditPhase targetStatus, int idx) {}
}
