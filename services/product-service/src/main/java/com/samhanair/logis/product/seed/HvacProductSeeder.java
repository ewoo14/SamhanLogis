package com.samhanair.logis.product.seed;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
 * Stage 1 (master data) local-test seed — Samsung HVAC 제품 100개.
 *
 * <p>출처:
 * <ul>
 *     <li>이카운트 품목 3 탭 캡처 (docs/migration/ecount-reference/091955~092016) — HVAC 단가 6종 발견</li>
 *     <li>memory feedback_uuid_no_user_visibility — modelName / productCode 사용자 노출, UUID 비공개</li>
 *     <li>memory project_korean_accounting — vatRateOnSales 10% 한국 부가세 표준</li>
 *     <li>{@link ProductSeedRunner} — 기존 시트 dry-run 시드와 병행 (V3/V4 매그) — 본 seeder 는
 *         dev 환경 + samsung-test 단가 100건만 별도 가드</li>
 * </ul>
 *
 * <p><b>이중 가드</b>: {@code @Profile("dev")} + {@code app.seed-test-data=true} 둘 다 만족 시만 실행.
 * application.yml default false. ProductSeedRunner 의 {@code @Profile("seed")} 와는 직교 (서로 배타).
 *
 * <p><b>serial_managed 보장</b>: V9 Flyway SQL 이 이미 에어컨 계열 카테고리의
 * {@code serial_managed=true} 를 DB 에 적용하지만, seeder 가 카테고리를 메모리에 로드한 후
 * {@link Category#markSerialManaged(boolean)} 을 호출하여 JPA 영속성 컨텍스트 내에서도
 * 일관성을 보장한다 (Flyway 없이 seeder 만 도는 테스트 컨텍스트 대비).
 *
 * <p><b>HVAC 단가 6종 비즈니스 룰</b> (이카운트 매트릭스):
 * <ul>
 *     <li>입고단가 (inboundPrice) = tonnage * 100,000 base</li>
 *     <li>출고단가 (outboundPrice) = inbound * 1.20 (일반 출하)</li>
 *     <li>⭐ 싱글 (singlePrice) = inbound * 1.50 (벽걸이 단일 거래)</li>
 *     <li>⭐ 실외기 (outdoorPrice) = inbound * 1.40 (실외기 교체)</li>
 *     <li>⭐ 멀티 50% (multi50Price) = inbound * 1.10</li>
 *     <li>⭐ 멀티 48% (multi48Price) = inbound * 1.12</li>
 *     <li>⭐ 멀티 45% (multi45Price) = inbound * 1.15</li>
 *     <li>⭐ 단품 35% (item35Price) = inbound * 1.30</li>
 * </ul>
 *
 * <p><b>Idempotency</b>: {@link ProductRepository#existsByModelNameAndIsDeletedFalse(String)} 로 중복 확인.
 * <p><b>결정적 UUID 보장 — jdbcTemplate native INSERT</b>: {@code @UuidGenerator} 가 붙은
 * JPA {@code save()} 는 Hibernate 6 의 {@code BeforeExecutionGenerator} 에 의해 INSERT 직전
 * UUID 를 항상 새로 생성하므로 리플렉션으로 주입한 결정적 UUID 를 덮어쓴다.
 * inventory-service {@link com.samhanair.logis.inventory.seed.StockBalanceSeeder} 와 동일하게
 * {@link JdbcTemplate} raw INSERT 를 사용하여 Hibernate UUID 생성 로직을 완전히 우회한다.
 * 도메인 메서드({@link Product#create} + setter chain)로 값을 계산 후 getter 로 읽어 INSERT.
 * Product 엔티티/도메인 운영 코드(Product.java) 는 무수정 — 회귀 0.
 * <p><b>도메인 메서드만(값 계산 목적)</b>: {@link Product#create} factory + {@code updateEcountMeta} /
 * {@code updateVatPolicy} / {@code updateInventoryPolicy} / {@code updateGroups} /
 * {@code updateHvacPriceMatrix} chain. {@code markDiscontinued} 만 4건 적용 (seq % 25 == 0).
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.seed-test-data", havingValue = "true")
@Order(100)
public class HvacProductSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(HvacProductSeeder.class);

    private static final BigDecimal RATE_OUTBOUND = new BigDecimal("1.20");
    private static final BigDecimal RATE_SINGLE   = new BigDecimal("1.50");
    private static final BigDecimal RATE_OUTDOOR  = new BigDecimal("1.40");
    private static final BigDecimal RATE_MULTI_50 = new BigDecimal("1.10");
    private static final BigDecimal RATE_MULTI_48 = new BigDecimal("1.12");
    private static final BigDecimal RATE_MULTI_45 = new BigDecimal("1.15");
    private static final BigDecimal RATE_ITEM_35  = new BigDecimal("1.30");
    private static final BigDecimal FIXED_DC_MULTI = new BigDecimal("45.00");
    private static final BigDecimal FIXED_DC_ITEM = new BigDecimal("35.00");

    /** V2 product_categories 시드의 결정적 UUID (V2__seed_product_categories.sql 와 1:1). */
    private static final java.util.UUID CAT_HVAC_ROOT      = java.util.UUID.fromString("00000000-0000-0000-0000-000000001001");
    /** V9 UPDATE 대상: 실내기 루트 카테고리 (INDOOR_WALL/INDOOR_CEILING 의 부모). */
    private static final java.util.UUID CAT_INDOOR         = java.util.UUID.fromString("00000000-0000-0000-0000-000000001002");
    private static final java.util.UUID CAT_OUTDOOR        = java.util.UUID.fromString("00000000-0000-0000-0000-000000001003");
    private static final java.util.UUID CAT_INDOOR_WALL    = java.util.UUID.fromString("00000000-0000-0000-0000-000000001004");
    private static final java.util.UUID CAT_INDOOR_CEILING = java.util.UUID.fromString("00000000-0000-0000-0000-000000001005");
    private static final java.util.UUID CAT_PIPING         = java.util.UUID.fromString("00000000-0000-0000-0000-000000001006");

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final JdbcTemplate jdbcTemplate;

    public HvacProductSeeder(ProductRepository productRepository,
                             CategoryRepository categoryRepository,
                             JdbcTemplate jdbcTemplate) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void run(String... args) {
        // 카테고리 prefetch — 100건 INSERT 동안 매번 lookup 회피
        Map<java.util.UUID, Category> catCache = new HashMap<>();
        loadCategory(catCache, CAT_HVAC_ROOT);
        loadCategory(catCache, CAT_INDOOR);
        loadCategory(catCache, CAT_OUTDOOR);
        loadCategory(catCache, CAT_INDOOR_WALL);
        loadCategory(catCache, CAT_INDOOR_CEILING);
        loadCategory(catCache, CAT_PIPING);

        if (catCache.isEmpty()) {
            log.warn("HvacProductSeeder skipped — V2 product_categories seed missing (categoryRepository empty)");
            return;
        }

        // 에어컨 계열 카테고리 serial_managed=true 보장
        // V9 Flyway SQL 이 DB 에 이미 적용하지만, JPA 영속성 컨텍스트 내 일관성 보장
        // (Flyway 없이 seeder 만 도는 테스트 컨텍스트, H2 in-memory 환경 대비)
        // V9 UPDATE 대상 5종: HVAC/INDOOR/OUTDOOR/INDOOR_WALL/INDOOR_CEILING 모두 포함
        markSerialManagedIfPresent(catCache, CAT_HVAC_ROOT);
        markSerialManagedIfPresent(catCache, CAT_INDOOR);
        markSerialManagedIfPresent(catCache, CAT_OUTDOOR);
        markSerialManagedIfPresent(catCache, CAT_INDOOR_WALL);
        markSerialManagedIfPresent(catCache, CAT_INDOOR_CEILING);
        // CAT_PIPING 은 batch 관리 — serial_managed=false 유지 (기본값)

        List<SeedRow> rows = buildAllRows();
        int created = 0;
        int skipped = 0;

        for (SeedRow row : rows) {
            if (productRepository.existsByModelNameAndIsDeletedFalse(row.modelName())) {
                skipped++;
                log.debug("Skipping seed (already present): {}", row.modelName());
                continue;
            }
            try {
                UUID deterministicId = deterministicId("product", row.modelName());
                Product product = buildProduct(row, catCache);
                // jdbcTemplate raw INSERT — Hibernate @UuidGenerator(BeforeExecutionGenerator) 우회.
                // JPA save() 는 INSERT 직전 UUID 를 항상 신규 생성하므로 결정적 UUID 를 보존할 수 없음.
                // inventory StockBalanceSeeder 와 동일한 패턴. Product 도메인/엔티티 수정 0 (회귀 없음).
                insertProductNative(deterministicId, row, product);
                created++;
            } catch (RuntimeException ex) {
                log.error("Failed to seed product {}: {}", row.modelName(), ex.getMessage(), ex);
            }
        }
        log.info("HvacProductSeeder created {} products (skipped {}, total {})",
                created, skipped, rows.size());
    }

    private void loadCategory(Map<java.util.UUID, Category> cache, java.util.UUID id) {
        categoryRepository.findById(id).ifPresent(c -> cache.put(id, c));
    }

    /**
     * 캐시에 카테고리가 존재하면 {@code serialManaged=true} 로 지정.
     * V9 Flyway 가 DB 에 적용하는 UPDATE 와 동일 효과를 JPA 레이어에서 보장하기 위함.
     *
     * @param cache 카테고리 캐시 맵
     * @param id    대상 카테고리 UUID
     */
    private void markSerialManagedIfPresent(Map<java.util.UUID, Category> cache, java.util.UUID id) {
        Category category = cache.get(id);
        if (category != null) {
            category.markSerialManaged(true);
        }
    }

    private Product buildProduct(SeedRow row, Map<java.util.UUID, Category> catCache) {
        Category category = catCache.get(row.categoryId());
        if (category == null) {
            // fallback to HVAC root if specific subtree missing (defensive)
            category = catCache.get(CAT_HVAC_ROOT);
        }

        // 입고단가 = tonnage * 100,000 base (HP/평형 기반)
        BigDecimal inbound = row.tonnageHp().multiply(new BigDecimal("100000"))
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal outbound = inbound.multiply(RATE_OUTBOUND).setScale(2, RoundingMode.HALF_UP);
        BigDecimal singlePrice = inbound.multiply(RATE_SINGLE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal outdoor = inbound.multiply(RATE_OUTDOOR).setScale(2, RoundingMode.HALF_UP);
        BigDecimal multi50 = inbound.multiply(RATE_MULTI_50).setScale(2, RoundingMode.HALF_UP);
        BigDecimal multi48 = inbound.multiply(RATE_MULTI_48).setScale(2, RoundingMode.HALF_UP);
        BigDecimal multi45 = inbound.multiply(RATE_MULTI_45).setScale(2, RoundingMode.HALF_UP);
        BigDecimal item35 = inbound.multiply(RATE_ITEM_35).setScale(2, RoundingMode.HALF_UP);

        // 기존 sellingPrice / purchasePrice 컬럼은 outbound / inbound 와 동기화 (legacy 호환)
        Product product = Product.create(
                row.name(),
                row.modelName(),
                category,
                outbound,                    // sellingPrice
                inbound,                     // purchasePrice
                "KRW",
                null,
                row.description());

        // 이카운트 품목 메타
        String productCode = String.format("01%04d", row.seq()); // 5자리
        String barcode = "880" + String.format("%010d", row.seq()); // 한국 EAN-13
        product.updateEcountMeta(
                productCode,
                row.specification(),
                row.unit(),
                "상품",
                true,
                barcode);

        // 부가세 정책 (한국 표준 10% / VAT 포함 default)
        product.updateVatPolicy(new BigDecimal("0.10"), new BigDecimal("0.10"), true);

        // 재고 정책
        int safetyStock = pickCyclic(row.seq(), 5, 10, 20);
        int leadTime = pickCyclic(row.seq(), 7, 14, 30);
        product.updateInventoryPolicy(safetyStock, leadTime, 1, "삼성전자(주)");

        // 분류 (group1 = Samsung 에어컨/부속, group2 = 카테고리)
        String group1 = row.group2().equals("부속") ? "Samsung 부속" : "Samsung 에어컨";
        product.updateGroups(group1, row.group2());

        // HVAC 특화 단가 6종 ⭐ 핵심
        product.updateHvacPriceMatrix(inbound, outbound, singlePrice, outdoor,
                multi50, multi48, multi45, item35);

        // V3 마이그 ProductCategory + UsageScope 채움 (compile validate)
        // (현재 categoryCode 매핑은 product_group2 기준 단순)
        // releasePrice / deliveryPrice 도 명시적으로 sync
        product.changePrices(outbound, inbound);
        product.changeFixedDiscountRate(resolveFixedDiscountRate(row));
        product.changeRemark(row.description());
        product.changeSpecText(row.specification());
        product.changeUsage(UsageScope.BOTH);
        product.changeBundle(ProductType.SINGLE, null);

        // 단종 4건 — seq % 25 == 0 (25/50/75/100)
        if (row.seq() % 25 == 0) {
            product.markDiscontinued();
        }
        return product;
    }

    private static int pickCyclic(int seq, int a, int b, int c) {
        return switch (seq % 3) {
            case 0 -> a;
            case 1 -> b;
            default -> c;
        };
    }

    /**
     * #773 S1c dev fixture 고정DC율.
     *
     * <p>현대 저장값은 percent 공간(0~100)이다. 레거시 Code.js 의 {@code fixedDc=0.45} 는
     * {@code expectRate=round(fixedDc*100)} 로 비교하므로 dev seed 도 45.00 을 저장한다.
     * 멀티/SET 성격 HVAC 는 45.00, 부속 단품은 35.00, 명확한 단일 상품은 null 로 둔다.
     */
    private BigDecimal resolveFixedDiscountRate(SeedRow row) {
        return switch (row.group2()) {
            case "스탠드", "시스템", "천장형" -> FIXED_DC_MULTI;
            case "부속" -> FIXED_DC_ITEM;
            default -> null;
        };
    }

    /**
     * 100개 row 빌드 (분류별 결정적 분포):
     * <ul>
     *     <li>벽걸이 (WIND-FREE) 30: seq 1~30 → 5/6/7/9/11/13/15/16/18/20 평형 순환</li>
     *     <li>스탠드 (BESPOKE) 20: seq 31~50</li>
     *     <li>시스템에어컨 (DVM-S) 25: seq 51~75</li>
     *     <li>천장형/매립형 10: seq 76~85</li>
     *     <li>공기청정기 10: seq 86~95</li>
     *     <li>부속/배관 5: seq 96~100</li>
     * </ul>
     */
    private List<SeedRow> buildAllRows() {
        java.util.ArrayList<SeedRow> rows = new java.util.ArrayList<>(100);

        // 벽걸이 30 (WIND-FREE)
        int[] pyongWall = {5, 6, 7, 9, 11, 13, 15, 16, 18, 20};
        for (int i = 1; i <= 30; i++) {
            int p = pyongWall[(i - 1) % pyongWall.length];
            String name = "삼성 윈드프리 " + p + "평형";
            String model = String.format("AR%02dTXEAAWKNEU-%02d", p, i);
            rows.add(new SeedRow(i, name, model,
                    p + "평형 / R32 / 인버터 / 윈드프리",
                    "EA", "벽걸이", CAT_INDOOR_WALL,
                    BigDecimal.valueOf(p),
                    "삼성 윈드프리 " + p + "평형 인버터 (벽걸이)"));
        }

        // 스탠드 20 (BESPOKE)
        int[] pyongStand = {15, 17, 18, 20, 23, 25, 26, 30};
        for (int i = 31; i <= 50; i++) {
            int p = pyongStand[(i - 31) % pyongStand.length];
            String name = "삼성 비스포크 스탠드 " + p + "평형";
            String model = String.format("AF%02dBX1NWAEAH-%02d", p, i);
            rows.add(new SeedRow(i, name, model,
                    p + "평형 / R32 / 인버터 / 비스포크",
                    "SET", "스탠드", CAT_INDOOR_WALL,
                    BigDecimal.valueOf(p).multiply(new BigDecimal("1.5")),
                    "삼성 비스포크 스탠드 " + p + "평형 (실내기+실외기 SET)"));
        }

        // 시스템에어컨 25 (DVM-S)
        int[] hpDvm = {3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22};
        for (int i = 51; i <= 75; i++) {
            int hp = hpDvm[(i - 51) % hpDvm.length];
            String name = "삼성 DVM-S " + hp + "HP";
            String model = String.format("AM%03dBNNDEH-%02d", hp * 10, i);
            rows.add(new SeedRow(i, name, model,
                    hp + "HP / R410A / 시스템에어컨",
                    "SET", "시스템", CAT_OUTDOOR,
                    BigDecimal.valueOf(hp).multiply(new BigDecimal("3")),
                    "삼성 DVM-S " + hp + "HP 시스템에어컨 (실외기 unit)"));
        }

        // 천장형/매립형 10
        String[] tonnages = {"3톤", "4톤", "5톤", "6톤", "8톤", "10톤", "12톤", "15톤", "18톤", "20톤"};
        BigDecimal[] tonHp = {new BigDecimal("8"), new BigDecimal("10"), new BigDecimal("12"),
                new BigDecimal("15"), new BigDecimal("18"), new BigDecimal("22"),
                new BigDecimal("25"), new BigDecimal("30"), new BigDecimal("36"), new BigDecimal("40")};
        for (int i = 76; i <= 85; i++) {
            int idx = i - 76;
            String name = "삼성 천장형 " + tonnages[idx];
            String model = String.format("AC%03dCNCDEH-%02d", (idx + 1) * 100, i);
            rows.add(new SeedRow(i, name, model,
                    tonnages[idx] + " / R410A / 천장형 4-way",
                    "SET", "천장형", CAT_INDOOR_CEILING,
                    tonHp[idx],
                    "삼성 4-way 천장 매립형 " + tonnages[idx]));
        }

        // 공기청정기 10
        int[] m2 = {17, 23, 30, 35, 40, 50, 60, 75, 90, 100};
        for (int i = 86; i <= 95; i++) {
            int m = m2[i - 86];
            String name = "삼성 비스포크 큐브 " + m + "㎡";
            String model = String.format("AX%02dB%dNNDB-%02d", m, m, i);
            rows.add(new SeedRow(i, name, model,
                    m + "㎡ / 미세먼지 99.999% / 큐브",
                    "EA", "공기청정기", CAT_INDOOR_WALL,
                    new BigDecimal(m).divide(new BigDecimal("10"), 2, RoundingMode.HALF_UP),
                    "삼성 비스포크 큐브 공기청정기 " + m + "㎡"));
        }

        // 부속/배관 5
        rows.add(new SeedRow(96, "동관 15A", "PIPE-CU-15A",
                "15A / Cu / 두께 0.8T", "M", "부속", CAT_PIPING,
                new BigDecimal("0.5"), "에어컨 냉매 배관 동관 15A"));
        rows.add(new SeedRow(97, "동관 22A", "PIPE-CU-22A",
                "22A / Cu / 두께 1.0T", "M", "부속", CAT_PIPING,
                new BigDecimal("0.7"), "에어컨 냉매 배관 동관 22A"));
        rows.add(new SeedRow(98, "절연재 T20", "INSUL-T20",
                "T20 / EPDM / 30M roll", "BOX", "부속", CAT_PIPING,
                new BigDecimal("0.3"), "냉매 배관 절연재 두께 20mm"));
        rows.add(new SeedRow(99, "유선 리모컨 MR-DH00", "REMOTE-MR-DH00",
                "유선 리모컨 / 7-segment LCD", "EA", "부속", CAT_PIPING,
                new BigDecimal("0.2"), "삼성 시스템에어컨 유선 리모컨"));
        rows.add(new SeedRow(100, "외부 통신 모듈 MIM-N10", "COMM-MIM-N10",
                "MIM-N10 / RS485 / Modbus", "EA", "부속", CAT_PIPING,
                new BigDecimal("0.4"), "DVM-S 외부 통신 모듈"));

        return rows;
    }

    /**
     * seed row.
     *
     * @param seq            1~100 (productCode 생성 + 단종 분포 결정)
     * @param name           한국어 제품명
     * @param modelName      Samsung 실모델 패턴 (unique 보장 위해 -seq suffix)
     * @param specification  규격 텍스트
     * @param unit           단위 (EA/SET/M/BOX)
     * @param group2         분류2 (벽걸이/스탠드/시스템/천장형/공기청정기/부속)
     * @param categoryId     V2 카테고리 UUID
     * @param tonnageHp      가격 산출 base (평형 또는 HP)
     * @param description    적요
     */
    private record SeedRow(
            int seq,
            String name,
            String modelName,
            String specification,
            String unit,
            String group2,
            java.util.UUID categoryId,
            BigDecimal tonnageHp,
            String description) {
    }

    /**
     * {@code samhan-seed:<type>:<key>} 결정적 UUID 도출 — Stage 1/2/3/4 seeder
     * 모두 동일 namespace 패턴 사용 (cross-stage 참조 정합).
     * UTF-8 바이트 사용 ({@link StandardCharsets#UTF_8}) — StockBalanceSeeder 와 동일 규칙.
     */
    private static UUID deterministicId(String type, String key) {
        return UUID.nameUUIDFromBytes(
                ("samhan-seed:" + type + ":" + key).getBytes(StandardCharsets.UTF_8));
    }

    /**
     * products 테이블 native INSERT — Hibernate {@code @UuidGenerator} 를 완전히 우회하여
     * 결정적 UUID 를 실제 PK 로 저장한다.
     *
     * <p>삽입 컬럼: seeder 가 채우는 필드만 명시 (나머지 nullable/default 는 DB 기본값 사용).
     * V1~V7 migration 의 NOT NULL + DEFAULT 컬럼은 모두 DEFAULT 로 처리 가능.
     *
     * @param id      결정적 UUID ({@code samhan-seed:product:<modelName>} 기반 Type-3)
     * @param row     시드 행 (modelName / seq 등 메타)
     * @param product 도메인 메서드 체인으로 값이 채워진 Product 객체 (getter 로 읽기만 함)
     */
    private void insertProductNative(UUID id, SeedRow row, Product product) {
        Timestamp now = Timestamp.valueOf(LocalDateTime.now());
        jdbcTemplate.update(
                "INSERT INTO products ("
                        + "  id, name, model_name, category_id,"
                        + "  selling_price, purchase_price, currency, status,"
                        + "  description,"
                        // V3 확장 컬럼
                        + "  product_type, has_variable_discount, fixed_discount_rate, discount_flags,"
                        + "  release_price, delivery_price, usage_scope,"
                        + "  spec_text, remark,"
                        // V5 이카운트 컬럼
                        + "  product_code, specification, unit, product_business_type,"
                        + "  inventory_qty_mgmt, barcode,"
                        + "  vat_rate_on_sales, vat_rate_on_purchase, price_includes_vat,"
                        + "  safety_stock_qty, lead_time_days, min_order_unit, purchase_source,"
                        + "  product_group1, product_group2,"
                        + "  inbound_price, outbound_price, single_price, outdoor_price,"
                        + "  multi_50_price, multi_48_price, multi_45_price, item_35_price,"
                        // V6 revision
                        + "  revision_count,"
                        // V7 세금 유형
                        + "  tax_type, unit_price_with_vat,"
                        // BaseEntity audit
                        + "  created_at, created_by, is_deleted"
                        + ") VALUES ("
                        + "  ?, ?, ?, ?,"
                        + "  ?, ?, ?, ?,"
                        + "  ?,"
                        + "  ?, ?, ?, ?,"
                        + "  ?, ?, ?,"
                        + "  ?, ?,"
                        + "  ?, ?, ?, ?,"
                        + "  ?, ?,"
                        + "  ?, ?, ?,"
                        + "  ?, ?, ?, ?,"
                        + "  ?, ?,"
                        + "  ?, ?, ?, ?,"
                        + "  ?, ?, ?, ?,"
                        + "  ?,"
                        + "  ?, ?,"
                        + "  ?, ?, ?"
                        + ")",
                // id, name, model_name, category_id
                id,
                product.getName(),
                product.getModelName(),
                product.getCategory().getId(),
                // selling_price, purchase_price, currency, status
                product.getSellingPrice(),
                product.getPurchasePrice(),
                product.getCurrency(),
                product.getStatus().name(),
                // description
                product.getDescription(),
                // product_type, has_variable_discount, fixed_discount_rate, discount_flags
                product.getProductType().name(),
                product.getHasVariableDiscount(),
                product.getFixedDiscountRate(),
                product.getDiscountFlags(),
                // release_price, delivery_price, usage_scope
                product.getReleasePrice(),
                product.getDeliveryPrice(),
                product.getUsageScope().name(),
                // spec_text, remark
                product.getSpecText(),
                product.getRemark(),
                // product_code, specification, unit, product_business_type
                product.getProductCode(),
                product.getSpecification(),
                product.getUnit(),
                product.getProductBusinessType(),
                // inventory_qty_mgmt, barcode
                product.getInventoryQtyMgmt(),
                product.getBarcode(),
                // vat_rate_on_sales, vat_rate_on_purchase, price_includes_vat
                product.getVatRateOnSales(),
                product.getVatRateOnPurchase(),
                product.getPriceIncludesVat(),
                // safety_stock_qty, lead_time_days, min_order_unit, purchase_source
                product.getSafetyStockQty(),
                product.getLeadTimeDays(),
                product.getMinOrderUnit(),
                product.getPurchaseSource(),
                // product_group1, product_group2
                product.getProductGroup1(),
                product.getProductGroup2(),
                // inbound_price, outbound_price, single_price, outdoor_price
                product.getInboundPrice(),
                product.getOutboundPrice(),
                product.getSinglePrice(),
                product.getOutdoorPrice(),
                // multi_50_price, multi_48_price, multi_45_price, item_35_price
                product.getMulti50Price(),
                product.getMulti48Price(),
                product.getMulti45Price(),
                product.getItem35Price(),
                // revision_count
                0,
                // tax_type, unit_price_with_vat
                product.getTaxType().name(),
                product.getUnitPriceWithVat(),
                // created_at, created_by, is_deleted
                now, "system", false
        );
    }
}
