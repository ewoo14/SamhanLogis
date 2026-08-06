package com.samhanair.logis.partnerorder.seed;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import jakarta.annotation.PostConstruct;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
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
 * PartnerOrderSeeder — Phase 9/10 Stage 3 local-test seed.
 *
 * <p>거래처 주문 30건 + 각 주문 1~3 라인 (~60 라인 합계) 을 결정적 (deterministic) 으로 생성한다.
 * Stage 1 partner 50개 / Stage 1 product 100개 / Stage 2 slip 100개 와 cross-service consistent
 * 매핑을 보존한다 (UUID 비공개 가드 — 모든 cross-ref 는 partnerCode / modelCode / slipNo 로 표현).
 *
 * <p>이중 가드 — {@code @Profile("dev")} + {@code @ConditionalOnProperty
 * (value = "app.partner-order.seed-test-data", havingValue = "true")} 양쪽 모두 활성일 때만 동작.
 *
 * <p>idempotent — orderNo ({@code 2026/04/15-1 ~ 2026/04/15-30}) 가 이미 존재하면 skip. {@link
 * PartnerOrder#create} factory 는 {@code status = CONFIRMING + slipPublishStatus = PENDING_RETRY}
 * 로 진입하므로, 30건 분포는 reflection 으로 status / slipPublishStatus / slipNo 를 강제 세팅한다
 * (테스트 fixture 한정 — 운영 코드는 markSlipPublished / cancel 등 정상 transition 사용).
 *
 * <p>분포 정합:
 * <ul>
 *   <li>status — DRAFT 5 / CONFIRMED 25 (CONFIRMED 중 SLIP_PUBLISHED 15)</li>
 *   <li>slipPublishStatus — PENDING_RETRY 15 / PUBLISHED 15</li>
 *   <li>slipNo — PUBLISHED 15건만 채움 (Stage 2 slip 의 yyyy/MM/dd-N 형식 매핑)</li>
 * </ul>
 *
 * @see com.samhanair.logis.user.seed.OrgChartSeeder 16 employee 시드 patron 패턴
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.partner-order.seed-test-data", havingValue = "true")
@Order(20) // user(seed) → partner → product → slip → partner-order
public class PartnerOrderSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderSeeder.class);

    /** Stage 2 slip 100 의 slipNo prefix — yyyy/MM/dd-N (slip-service SlipNumberService). */
    private static final String SLIP_DATE_PREFIX = "2026/04/15";

    /** 결정적 partner 표본 — 30 partner sample (partnerCode, partnerName, bizNo). */
    private static final List<PartnerSeed> PARTNER_POOL = List.of(
            new PartnerSeed("P-2026-0001", "에스엠하나공조", "211-87-12345"),
            new PartnerSeed("P-2026-0002", "한국공조시스템", "212-87-23456"),
            new PartnerSeed("P-2026-0003", "(주)서울에어컨", "213-87-34567"),
            new PartnerSeed("P-2026-0004", "(주)대한냉동", "214-87-45678"),
            new PartnerSeed("P-2026-0005", "송파공조", "215-87-56789"),
            new PartnerSeed("P-2026-0006", "강남에어시스템", "216-87-67890"),
            new PartnerSeed("P-2026-0007", "동작냉난방", "217-87-78901"),
            new PartnerSeed("P-2026-0008", "마포에어컨", "218-87-89012"),
            new PartnerSeed("P-2026-0009", "용산공조", "219-87-90123"),
            new PartnerSeed("P-2026-0010", "성북냉동", "220-87-01234"),
            new PartnerSeed("P-2026-0011", "광진에어시스템", "221-87-12345"),
            new PartnerSeed("P-2026-0012", "노원냉난방", "222-87-23456"),
            new PartnerSeed("P-2026-0013", "은평공조", "223-87-34567"),
            new PartnerSeed("P-2026-0014", "양천냉동", "224-87-45678"),
            new PartnerSeed("P-2026-0015", "구로에어컨", "225-87-56789"),
            new PartnerSeed("P-2026-0016", "금천공조시스템", "226-87-67890"),
            new PartnerSeed("P-2026-0017", "영등포냉난방", "227-87-78901"),
            new PartnerSeed("P-2026-0018", "관악에어", "228-87-89012"),
            new PartnerSeed("P-2026-0019", "서초공조", "229-87-90123"),
            new PartnerSeed("P-2026-0020", "강동냉동", "230-87-01234"),
            new PartnerSeed("P-2026-0021", "송파에어시스템", "231-87-12345"),
            new PartnerSeed("P-2026-0022", "강서공조", "232-87-23456"),
            new PartnerSeed("P-2026-0023", "동대문냉난방", "233-87-34567"),
            new PartnerSeed("P-2026-0024", "중랑에어컨", "234-87-45678"),
            new PartnerSeed("P-2026-0025", "성동공조", "235-87-56789"),
            new PartnerSeed("P-2026-0026", "도봉냉동", "236-87-67890"),
            new PartnerSeed("P-2026-0027", "강북에어시스템", "237-87-78901"),
            new PartnerSeed("P-2026-0028", "중구공조", "238-87-89012"),
            new PartnerSeed("P-2026-0029", "종로냉난방", "239-87-90123"),
            new PartnerSeed("P-2026-0030", "용산에어시스템", "240-87-01234")
    );

    /**
     * 결정적 product pool — 6 SKU 순환.
     *
     * <p>출처: product-service HvacProductSeeder, 4 seeder 동일 유지 (inventory/slip/partner-order).
     * modelName 은 HvacProductSeeder.buildAllRows 와 1:1 동기화.
     * UUID = {@code UUID.nameUUIDFromBytes("samhan-seed:product:" + modelName)} 동일 규칙.
     *
     * <p>categoryKey 매핑:
     * <ul>
     *   <li>homemulti → DVM-S 시스템에어컨 (seq 51: AM030BNNDEH-51, seq 57: AM100BNNDEH-57)</li>
     *   <li>singleSets → 벽걸이 (seq 1: AR05TXEAAWKNEU-01, seq 5: AR11TXEAAWKNEU-05)</li>
     *   <li>commercialMulti → 천장형 (seq 76: AC100CNCDEH-76)</li>
     *   <li>oldProducts → 스탠드 단종 (seq 50: AF20BX1NWAEAH-50, seq % 25 == 0)</li>
     * </ul>
     *
     * <p>stock_balances.available_qty &gt; 0 보장 (StockBalanceSeeder: 30~500 범위).
     * partner_order_lines.product_id = products.id = stock_balances.product_id 3중 정합.
     */
    private static final List<ProductSeed> PRODUCT_POOL = List.of(
            // homemulti → DVM-S 시스템에어컨 seq51 (AM030BNNDEH-51, 3HP)
            new ProductSeed("homemulti",       "AM030BNNDEH-51",  "삼성 DVM-S 3HP",          new BigDecimal("900000")),
            // homemulti → DVM-S 시스템에어컨 seq57 (AM100BNNDEH-57, 10HP)
            new ProductSeed("homemulti",       "AM100BNNDEH-57",  "삼성 DVM-S 10HP",         new BigDecimal("3000000")),
            // singleSets → 벽걸이 seq1 (AR05TXEAAWKNEU-01, 5평형)
            new ProductSeed("singleSets",      "AR05TXEAAWKNEU-01", "삼성 윈드프리 5평형",   new BigDecimal("750000")),
            // singleSets → 벽걸이 seq5 (AR11TXEAAWKNEU-05, 11평형)
            new ProductSeed("singleSets",      "AR11TXEAAWKNEU-05", "삼성 윈드프리 11평형",  new BigDecimal("1320000")),
            // commercialMulti → 천장형 seq76 (AC100CNCDEH-76, 3톤)
            new ProductSeed("commercialMulti", "AC100CNCDEH-76",  "삼성 천장형 3톤",          new BigDecimal("2400000")),
            // oldProducts → 스탠드 seq50 (AF20BX1NWAEAH-50, seq%25==0 → markDiscontinued)
            new ProductSeed("oldProducts",     "AF20BX1NWAEAH-50", "삼성 비스포크 스탠드 20평형 (단종)", new BigDecimal("2100000"))
    );

    private final PartnerOrderRepository partnerOrderRepository;

    public PartnerOrderSeeder(PartnerOrderRepository partnerOrderRepository) {
        this.partnerOrderRepository = partnerOrderRepository;
    }

    /** 시드 진입 표시 (운영 환경 오작동 조기 감지). */
    @PostConstruct
    void announce() {
        log.warn("[seed] PartnerOrderSeeder 활성 — dev profile + app.partner-order.seed-test-data=true");
    }

    @Override
    @Transactional
    public void run(String... args) {
        int created = 0;
        int skipped = 0;

        for (int seq = 1; seq <= 30; seq++) {
            String orderNo = SLIP_DATE_PREFIX + "-" + seq;
            Optional<PartnerOrder> existing = partnerOrderRepository.findByOrderNoIncludingDeleted(orderNo);
            if (existing.isPresent()) {
                skipped++;
                continue;
            }

            PartnerSeed partner = PARTNER_POOL.get((seq - 1) % PARTNER_POOL.size());
            String idempotencyKey = "PO-CONF-SEED-" + orderNo;
            int lineCount = ((seq - 1) % 3) + 1; // 1~3 결정적

            PartnerOrder order = PartnerOrder.create(
                    partner.partnerCode(), partner.bizNo(), orderNo,
                    idempotencyKey, BigDecimal.ZERO);

            for (int li = 0; li < lineCount; li++) {
                ProductSeed prod = PRODUCT_POOL.get((seq * 7 + li) % PRODUCT_POOL.size());
                int quantity = ((seq + li) % 5) + 1; // 1~5 결정적
                // deterministicProductId 입력 = 실 modelName (product-service HvacProductSeeder 동일 규칙)
                PartnerOrderLine line = PartnerOrderLine.create(
                        deterministicProductId(prod.modelName()),
                        prod.modelName(),
                        prod.productName(),
                        prod.categoryKey(),
                        quantity,
                        prod.outboundPrice(),
                        "Seed sample remark #" + (li + 1));
                order.addLine(line);
            }
            order.recomputeTotal();

            // 분포 강제 — factory 기본 (CONFIRMING + PENDING_RETRY) 를 reflection 으로 분포 매핑.
            // [1..5]   → DRAFT       + PENDING_RETRY (slipNo 미발급) — 임시저장 history 표시 용
            // [6..15]  → CONFIRMED   + PENDING_RETRY (slipNo 미발급) — outbox 큐 시뮬레이션
            // [16..30] → CONFIRMED   + PUBLISHED     + slipNo 채움    — 정상 발행 완료
            applyDistribution(order, seq);

            // confirmedAt 분포 — 2026-01 ~ 2026-05 (5개월 균등 분포).
            applyConfirmedAt(order, seq);

            partnerOrderRepository.save(order);
            created++;
        }

        log.info("[seed] PartnerOrderSeeder 완료 — created={} skipped={} (총 30건)", created, skipped);
    }

    /** seq 기반 분포 매핑 — reflection 사용 (testing fixture 한정). */
    private void applyDistribution(PartnerOrder order, int seq) {
        if (seq <= 5) {
            setField(order, "status", PartnerOrderStatus.DRAFT);
            setField(order, "slipPublishStatus", SlipPublishStatus.PENDING_RETRY);
        } else if (seq <= 15) {
            setField(order, "status", PartnerOrderStatus.CONFIRMED);
            setField(order, "slipPublishStatus", SlipPublishStatus.PENDING_RETRY);
        } else {
            // 16..30 → CONFIRMED + PUBLISHED + slipNo (Stage 2 slip 매핑)
            // slipNo 형식 = "yyyy/MM/dd-N" (slip-service SlipNumberService.next 동일 포맷)
            String slipNo = SLIP_DATE_PREFIX + "-" + seq;
            order.markSlipPublished(slipNo); // status=CONFIRMED + slipPublishStatus=PUBLISHED + slipNo
        }
    }

    /** seq 기반 confirmedAt 분포 — 2026-01 ~ 2026-05 (월별 6건). */
    private void applyConfirmedAt(PartnerOrder order, int seq) {
        int month = ((seq - 1) / 6) + 1; // seq 1..6 → 1월, 7..12 → 2월, ...
        int day = (((seq - 1) % 6) * 5) + 3; // 3, 8, 13, 18, 23, 28
        LocalDateTime ts = LocalDate.of(2026, month, day).atTime(10, 0);
        setField(order, "confirmedAt", ts);
    }

    /**
     * product modelName → 결정적 UUID.
     *
     * <p>출처: product-service HvacProductSeeder.deterministicId 동일 namespace 규칙.
     * {@code "samhan-seed:product:" + modelName} 로 UUID.nameUUIDFromBytes 적용.
     * partner_order_lines.product_id = products.id = stock_balances.product_id 3중 정합 보장.
     *
     * @param modelName HvacProductSeeder.buildAllRows 의 실 modelName (예: "AR05TXEAAWKNEU-01")
     * @return 결정적 product UUID
     */
    static UUID deterministicProductId(String modelName) {
        return UUID.nameUUIDFromBytes(("samhan-seed:product:" + modelName).getBytes(StandardCharsets.UTF_8));
    }

    /** Reflection 으로 BaseEntity / PartnerOrder 의 private 필드 강제 세팅 (시드 fixture 한정). */
    private static void setField(Object target, String fieldName, Object value) {
        try {
            Field f = findField(target.getClass(), fieldName);
            if (f == null) {
                throw new NoSuchFieldException(fieldName);
            }
            f.setAccessible(true);
            f.set(target, value);
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException("seed reflection 실패: " + fieldName, ex);
        }
    }

    private static Field findField(Class<?> cls, String name) {
        Class<?> c = cls;
        while (c != null && c != Object.class) {
            try {
                return c.getDeclaredField(name);
            } catch (NoSuchFieldException ignored) {
                c = c.getSuperclass();
            }
        }
        return null;
    }

    private record PartnerSeed(String partnerCode, String partnerName, String bizNo) {}

    /**
     * product-service HvacProductSeeder 실 modelName 기반 product 시드 레코드.
     *
     * @param categoryKey    거래처 주문 분류 키 (homemulti/singleSets/commercialMulti/oldProducts)
     * @param modelName      HvacProductSeeder.buildAllRows 의 실 modelName (UUID 산출 key)
     * @param productName    한국어 제품명 (UI 표시용)
     * @param outboundPrice  출고단가
     */
    private record ProductSeed(
            String categoryKey,
            String modelName,
            String productName,
            BigDecimal outboundPrice) {}
}
