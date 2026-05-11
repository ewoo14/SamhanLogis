package com.samhanair.logis.dashboard.seed;

import com.samhanair.logis.dashboard.domain.KpiCategory;
import com.samhanair.logis.dashboard.domain.KpiSnapshot;
import com.samhanair.logis.dashboard.domain.RealTimeStock;
import com.samhanair.logis.dashboard.domain.SalesAggregate;
import com.samhanair.logis.dashboard.repository.KpiSnapshotRepository;
import com.samhanair.logis.dashboard.repository.RealTimeStockRepository;
import com.samhanair.logis.dashboard.repository.SalesAggregateRepository;
import com.samhanair.logis.dashboard.service.MaterializedViewRefreshService;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
 * Stage 4 (back-office) local-test seed — dashboard-service KPI / 실시간 재고 / 매출 집계 + MV refresh.
 *
 * <p>건수 분포:
 * <ul>
 *   <li>{@link KpiSnapshot} — DAILY_SALES 100 row (2026-01-01 ~ 2026-04-10) +
 *       MONTHLY_SALES 5 row (2026-01 ~ 2026-05) + ORDER_COUNT 30 row (2026-04 ~ 2026-05)</li>
 *   <li>{@link RealTimeStock} 200 row — Stage 1 product 100 × 2 warehouse (WH-001 / WH-002)</li>
 *   <li>{@link SalesAggregate} 150 row — 30일 (2026-04-01 ~ 2026-04-30) × Stage 1 partner 5개 VIP</li>
 * </ul>
 *
 * <p>Seeding 완료 직후 {@link MaterializedViewRefreshService#refreshAll()} 로 2 materialized view
 * (mv_realtime_stock_summary / mv_sales_daily_summary) 강제 refresh — admin dashboard 즉시 조회 가능.
 *
 * <p><b>이중 가드</b>: {@code @Profile("dev")} + {@code app.dashboard.seed-test-data=true} 둘 다 true 시 실행.
 *
 * <p><b>Idempotency</b>: 결정적 UUID + existsById skip. UUID 도출 패턴은 다른 Stage seeder 와 통일.
 *
 * <p><b>외부 의존</b>:
 * <ul>
 *   <li>Stage 1 product UUID — {@code samhan-seed:product:M-2026-NNN} 결정 도출 (100 product)</li>
 *   <li>Stage 1 partner UUID — {@code samhan-seed:partner:P-2026-NNNN} 결정 도출 (50 중 5 VIP)</li>
 *   <li>Stage 2 inventory warehouse code — WH-001 (수도권) / WH-002 (영남권) 가정</li>
 * </ul>
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.dashboard.seed-test-data", havingValue = "true")
@Order(70)
public class DashboardSnapshotSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DashboardSnapshotSeeder.class);

    /** Stage 1 PartnerSeeder 의 50건 중 VIP 5개 (sales aggregate 거래처). */
    private static final int[] VIP_PARTNER_SEQ = {1, 2, 5, 7, 11};

    /** Stage 2 inventory 의 2 창고 코드. */
    private static final String[] WAREHOUSES = {"WH-001", "WH-002"};

    /** Stage 1 product 100건 — sequential M-2026-001 ~ M-2026-100. */
    private static final int PRODUCT_COUNT = 100;
    private static final String PRODUCT_CODE_FMT = "M-2026-%03d";
    private static final String PARTNER_CODE_FMT = "P-2026-%04d";

    private final KpiSnapshotRepository kpiRepository;
    private final RealTimeStockRepository realTimeStockRepository;
    private final SalesAggregateRepository salesAggregateRepository;
    private final MaterializedViewRefreshService materializedViewRefreshService;

    public DashboardSnapshotSeeder(KpiSnapshotRepository kpiRepository,
                                   RealTimeStockRepository realTimeStockRepository,
                                   SalesAggregateRepository salesAggregateRepository,
                                   MaterializedViewRefreshService materializedViewRefreshService) {
        this.kpiRepository = kpiRepository;
        this.realTimeStockRepository = realTimeStockRepository;
        this.salesAggregateRepository = salesAggregateRepository;
        this.materializedViewRefreshService = materializedViewRefreshService;
    }

    @Override
    @Transactional
    public void run(String... args) {
        seedKpiSnapshots();
        seedRealtimeStocks();
        seedSalesAggregates();
        refreshMaterializedViews();
    }

    // ------------------------------------------------------------------
    // 1) KPI Snapshot — DAILY_SALES 100 + MONTHLY_SALES 5 + ORDER_COUNT 30
    // ------------------------------------------------------------------
    private void seedKpiSnapshots() {
        int created = 0;
        int skipped = 0;

        // DAILY_SALES 100 row — 2026-01-01 ~ 2026-04-10 (100일)
        LocalDate dailyBase = LocalDate.of(2026, 1, 1);
        for (int i = 0; i < 100; i++) {
            LocalDate date = dailyBase.plusDays(i);
            UUID id = deterministicId("kpi", "DAILY_SALES:" + date);
            if (kpiRepository.existsById(id)
                    || kpiRepository.existsBySnapshotDateAndCategory(date, KpiCategory.DAILY_SALES)) {
                skipped++;
                continue;
            }
            // 매출 100만원 ~ 5천만원 결정적 분포
            long amount = 1_000_000L + ((i * 173) % 50) * 1_000_000L;
            KpiSnapshot snapshot = KpiSnapshot.of(date, KpiCategory.DAILY_SALES,
                    BigDecimal.valueOf(amount).setScale(4, RoundingMode.HALF_UP));
            forceId(snapshot, id);
            kpiRepository.save(snapshot);
            created++;
        }

        // MONTHLY_SALES 5 row — 2026-01 ~ 2026-05 (월 첫째 날)
        for (int m = 1; m <= 5; m++) {
            LocalDate date = LocalDate.of(2026, m, 1);
            UUID id = deterministicId("kpi", "MONTHLY_SALES:" + date);
            if (kpiRepository.existsById(id)
                    || kpiRepository.existsBySnapshotDateAndCategory(date, KpiCategory.MONTHLY_SALES)) {
                skipped++;
                continue;
            }
            long amount = 100_000_000L + (m * 17_000_000L); // 1억 ~ 1.85억 결정적
            KpiSnapshot snapshot = KpiSnapshot.of(date, KpiCategory.MONTHLY_SALES,
                    BigDecimal.valueOf(amount).setScale(4, RoundingMode.HALF_UP));
            forceId(snapshot, id);
            kpiRepository.save(snapshot);
            created++;
        }

        // ORDER_COUNT 30 row — 2026-04-01 ~ 2026-04-30
        LocalDate orderBase = LocalDate.of(2026, 4, 1);
        for (int i = 0; i < 30; i++) {
            LocalDate date = orderBase.plusDays(i);
            UUID id = deterministicId("kpi", "ORDER_COUNT:" + date);
            if (kpiRepository.existsById(id)
                    || kpiRepository.existsBySnapshotDateAndCategory(date, KpiCategory.ORDER_COUNT)) {
                skipped++;
                continue;
            }
            long count = 5L + (i * 7) % 25; // 5 ~ 29 주문 결정적
            KpiSnapshot snapshot = KpiSnapshot.of(date, KpiCategory.ORDER_COUNT,
                    BigDecimal.valueOf(count).setScale(4, RoundingMode.HALF_UP));
            forceId(snapshot, id);
            kpiRepository.save(snapshot);
            created++;
        }

        log.info("DashboardSnapshotSeeder kpi — created {} (skipped {})", created, skipped);
    }

    // ------------------------------------------------------------------
    // 2) RealtimeStock — 100 product × 2 warehouse = 200 row
    // ------------------------------------------------------------------
    private void seedRealtimeStocks() {
        int created = 0;
        int skipped = 0;
        LocalDateTime refreshedAt = LocalDateTime.of(2026, 5, 9, 0, 0);

        for (int p = 1; p <= PRODUCT_COUNT; p++) {
            String productCode = String.format(PRODUCT_CODE_FMT, p);
            UUID productId = deterministicId("product", productCode);

            for (String warehouse : WAREHOUSES) {
                UUID id = deterministicId("realtime-stock",
                        productCode + ":" + warehouse);
                // Idempotent — UUID + (productId, warehouseCode) partial unique 양쪽 체크
                if (realTimeStockRepository.existsById(id)
                        || realTimeStockRepository.existsByProductIdAndWarehouseCode(productId, warehouse)) {
                    skipped++;
                    continue;
                }
                // 결정적 수량 — 0 ~ 999.9999 (분수 호환)
                long base = ((p * 13L + warehouse.hashCode()) % 1000 + 1000) % 1000;
                BigDecimal qty = BigDecimal.valueOf(base * 1000)
                        .add(BigDecimal.valueOf((p * 47L) % 9999))
                        .divide(BigDecimal.valueOf(10), 4, RoundingMode.HALF_UP);
                RealTimeStock stock = RealTimeStock.of(productId, warehouse, qty, refreshedAt);
                forceId(stock, id);
                realTimeStockRepository.save(stock);
                created++;
            }
        }
        log.info("DashboardSnapshotSeeder realtime-stock — created {} (skipped {})",
                created, skipped);
    }

    // ------------------------------------------------------------------
    // 3) SalesAggregate — 30일 × 5 거래처 = 150 row
    // ------------------------------------------------------------------
    private void seedSalesAggregates() {
        int created = 0;
        int skipped = 0;
        LocalDate base = LocalDate.of(2026, 4, 1);

        for (int d = 0; d < 30; d++) {
            LocalDate date = base.plusDays(d);
            for (int partnerSeq : VIP_PARTNER_SEQ) {
                String partnerCode = String.format(PARTNER_CODE_FMT, partnerSeq);
                UUID partnerId = deterministicId("partner", partnerCode);
                UUID id = deterministicId("sales-aggregate",
                        date + ":" + partnerCode);
                // Idempotent — UUID + (date, partnerId) partial unique 양쪽 체크
                if (salesAggregateRepository.existsById(id)
                        || salesAggregateRepository.existsByAggregateDateAndPartnerId(date, partnerId)) {
                    skipped++;
                    continue;
                }
                long amount = 3_000_000L + ((d * 211L + partnerSeq * 79L) % 30) * 500_000L;
                int itemCount = 3 + (int) ((d * 7L + partnerSeq) % 12); // 3 ~ 14
                SalesAggregate agg = SalesAggregate.of(date, partnerId,
                        BigDecimal.valueOf(amount).setScale(4, RoundingMode.HALF_UP),
                        itemCount);
                forceId(agg, id);
                salesAggregateRepository.save(agg);
                created++;
            }
        }
        log.info("DashboardSnapshotSeeder sales-aggregate — created {} (skipped {})",
                created, skipped);
    }

    // ------------------------------------------------------------------
    // 4) Materialized View refresh — fail-soft (H2 미지원 환경 회피)
    // ------------------------------------------------------------------
    private void refreshMaterializedViews() {
        try {
            MaterializedViewRefreshService.RefreshResult result =
                    materializedViewRefreshService.refreshAll();
            log.info("DashboardSnapshotSeeder MV refresh — realtimeStockOk={} salesDailyOk={}",
                    result.realtimeStockOk(), result.salesDailyOk());
        } catch (RuntimeException ex) {
            log.warn("DashboardSnapshotSeeder MV refresh skipped (fail-soft) — {}",
                    ex.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // 공용
    // ------------------------------------------------------------------

    static UUID deterministicId(String type, String key) {
        return UUID.nameUUIDFromBytes(("samhan-seed:" + type + ":" + key).getBytes());
    }

    private static void forceId(Object entity, UUID id) {
        try {
            Class<?> clazz = entity.getClass();
            Field f = null;
            while (clazz != null && f == null) {
                try {
                    f = clazz.getDeclaredField("id");
                } catch (NoSuchFieldException nsfe) {
                    clazz = clazz.getSuperclass();
                }
            }
            if (f == null) {
                throw new NoSuchFieldException("id");
            }
            f.setAccessible(true);
            f.set(entity, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to set deterministic id on "
                    + entity.getClass().getSimpleName(), e);
        }
    }
}
