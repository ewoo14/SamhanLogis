package com.samhanair.logis.slip.seed;

import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.domain.EstimateNumberSequence;
import com.samhanair.logis.slip.estimate.repository.EstimateNumberSequenceRepository;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * P2 (Stage 4) — 견적서(Estimate) 40건 + EstimateLine ~120건 시드.
 *
 * <p>활성 조건 (SlipSeeder 와 동일 toggle):
 * <ul>
 *   <li>{@link Profile @Profile("dev")} — local/dev 프로파일 한정</li>
 *   <li>{@link ConditionalOnProperty}({@code app.slip.seed-test-data=true})</li>
 * </ul>
 *
 * <p>분포 (40건):
 * <ul>
 *   <li>QUOTE_DRAFT   10건 (작성중 — 라인 1~3개)</li>
 *   <li>QUOTE_SENT    12건 (발송완료 — 거래처 수신 대기)</li>
 *   <li>QUOTE_ACCEPTED  8건 (수주완료 — 슬립 변환 대기)</li>
 *   <li>QUOTE_REJECTED  5건 (거절 — 거래처 부재/단가 이견)</li>
 *   <li>QUOTE_CONVERTED 5건 (슬립변환완료 — convertedSlipId 기록)</li>
 * </ul>
 *
 * <p>채번: 결정적 패턴 ({@code yyyy/MM/dd-N}) — EstimateNumberSequence 직접 관리
 * (EstimateNumberService 는 REQUIRED propagation → 별도 tx 필요, 시드는 직접 채번).
 *
 * <p>idempotency: {@code estimateNo} EXISTS 체크 + 중복 시 skip. 안전 재실행.
 *
 * <p>{@link Order} 40 — SlipSeeder(20) + DeliveryBatchSeeder(30) 완료 후 실행.
 * QUOTE_CONVERTED 건의 convertedSlipId 는 결정성 UUID (슬립 실제 row 와 soft-link 보장은 별도).
 */
@Component
@Profile("dev")
@ConditionalOnExpression("'${app.slip.seed-test-data:false}' == 'true' or '${app.slip.full-seed-test-data:false}' == 'true'")
@Order(40)
public class EstimateSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(EstimateSeeder.class);

    private static final String PARTNER_UUID_PREFIX = "samhan-seed:partner:";
    private static final String PARTNER_CODE_PATTERN = "P-2026-%04d";
    private static final int PARTNER_COUNT = 50;

    /** SlipSeeder 와 동일 직원 풀 (requester 결정성). */
    private static final List<String> EMPLOYEE_IDS = List.of(
            "kimmiseon", "janyeonggu", "obyeongseung", "hongjisu",
            "kimgicheol", "simmigwang", "jeongminguk", "leejiyong",
            "gyeonjinseong", "parkeunwoo", "sinhyeonmin",
            "leeseongmi", "heoyujin", "rahaeram", "kimeunji", "parkjisu");

    private static final List<String> PARTNER_NAMES = List.of(
            "(주)삼성가스", "(주)LG공조", "현대에어컨", "SK냉난방", "한국냉동(주)",
            "(주)대우공조", "GS파워", "하이에어(주)", "코오롱공조", "두산인프라코어",
            "롯데중앙연구소", "포스코ICT", "(주)한화시스템", "KT엔지니어링", "(주)효성중공업");

    private static final List<String> BUSINESS_NOS = List.of(
            "123-45-67890", "234-56-78901", "345-67-89012", "456-78-90123",
            "567-89-01234", "678-90-12345", "789-01-23456", "890-12-34567",
            "901-23-45678", "012-34-56789", "135-79-24680", "246-80-13579",
            "357-91-24681", "468-02-35792", "579-13-46803");

    private final EstimateRepository estimateRepository;
    private final EstimateNumberSequenceRepository sequenceRepository;

    public EstimateSeeder(EstimateRepository estimateRepository,
                          EstimateNumberSequenceRepository sequenceRepository) {
        this.estimateRepository = estimateRepository;
        this.sequenceRepository = sequenceRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        log.info("[EstimateSeeder] P2 시드 시작 — 40건 견적서 (DRAFT 10 / SENT 12 / ACCEPTED 8 / REJECTED 5 / CONVERTED 5)");

        List<EstimateSpec> specs = buildSpecs();
        Map<LocalDate, Integer> seqByDate = new HashMap<>();

        int created = 0;
        int skipped = 0;

        for (EstimateSpec spec : specs) {
            LocalDate estimateDate = computeEstimateDate(spec.idx());
            int seqNo = seqByDate.merge(estimateDate, 1, Integer::sum);
            String estimateNo = formatEstimateNo(estimateDate, seqNo);

            // idempotency
            if (estimateRepository.findByEstimateNoIncludingDeleted(estimateNo).isPresent()) {
                skipped++;
                continue;
            }

            // EstimateNumberSequence 직접 upsert (시드 전용 — service tx 격리 불필요)
            ensureSequence(estimateDate, seqNo);

            try {
                Estimate estimate = buildAndTransition(spec, estimateNo, estimateDate, seqNo);
                estimateRepository.save(estimate);
                created++;
            } catch (RuntimeException ex) {
                log.error("[EstimateSeeder] 시드 실패 estimateNo={} status={} : {}",
                        estimateNo, spec.targetStatus(), ex.getMessage());
                throw ex;
            }
        }

        log.info("[EstimateSeeder] 완료 — 신규 {}건, skip {}건 (총 {}건)",
                created, skipped, created + skipped);
    }

    // ---- spec 빌더 -------------------------------------------------------

    /**
     * 40건 spec 분포:
     * DRAFT 10 / SENT 12 / ACCEPTED 8 / REJECTED 5 / CONVERTED 5 = 40.
     */
    private List<EstimateSpec> buildSpecs() {
        List<EstimateSpec> specs = new ArrayList<>(40);
        int idx = 0;

        for (int i = 0; i < 10; i++) specs.add(new EstimateSpec(idx++, EstimatePhase.DRAFT));
        for (int i = 0; i < 12; i++) specs.add(new EstimateSpec(idx++, EstimatePhase.SENT));
        for (int i = 0; i < 8; i++)  specs.add(new EstimateSpec(idx++, EstimatePhase.ACCEPTED));
        for (int i = 0; i < 5; i++)  specs.add(new EstimateSpec(idx++, EstimatePhase.REJECTED));
        for (int i = 0; i < 5; i++)  specs.add(new EstimateSpec(idx++, EstimatePhase.CONVERTED));

        return specs;
    }

    /**
     * Estimate 1건 build + 도메인 메서드로 targetStatus 까지 전이.
     * QUOTE_CONVERTED 의 convertedSlipId 는 결정성 UUID (논리적 참조).
     */
    private Estimate buildAndTransition(EstimateSpec spec, String estimateNo,
                                        LocalDate estimateDate, int seqNo) {
        int partnerSeq = (spec.idx() % PARTNER_COUNT) + 1;
        String partnerCode = String.format(PARTNER_CODE_PATTERN, partnerSeq);
        UUID partnerId = deterministicUuid(PARTNER_UUID_PREFIX + partnerCode);

        int nameIdx = spec.idx() % PARTNER_NAMES.size();
        String partnerName = PARTNER_NAMES.get(nameIdx);
        String businessNo = BUSINESS_NOS.get(nameIdx);
        String partnerAddress = "서울시 강남구 테헤란로 " + (100 + spec.idx() * 7) + "길 " + (spec.idx() + 1);

        LocalDate validUntil = estimateDate.plusDays(30);
        String memo = buildMemo(spec);
        String requesterId = EMPLOYEE_IDS.get(spec.idx() % EMPLOYEE_IDS.size());

        Estimate estimate = Estimate.create(estimateNo, estimateDate, seqNo,
                partnerId, partnerName, businessNo, partnerAddress, validUntil, memo, requesterId);

        // 라인 추가 — (spec.idx() % 3) + 1 개 (1~3건)
        int lineCount = (spec.idx() % 3) + 1;
        for (int li = 0; li < lineCount; li++) {
            int productSeq = ((spec.idx() * 11 + li * 5) % HvacSeedProductCatalog.size()) + 1;
            HvacSeedProductCatalog.ProductSeed product = HvacSeedProductCatalog.byOneBasedSeq(productSeq);
            String modelName = product.modelName();
            UUID productId = HvacSeedProductCatalog.deterministicProductId(modelName);
            String productName = product.productName();
            String specification = sampleSpec(productSeq);
            int quantity = ((spec.idx() + li) % 5) + 1;  // 1~5
            BigDecimal unitPrice = computeUnitPrice(productSeq);

            estimate.addLine(EstimateLine.create(estimate, li + 1, productId,
                    productName, modelName, specification, quantity, unitPrice,
                    li == 0 ? "P2 시드" : null));
        }

        // 상태 전이
        switch (spec.targetStatus()) {
            case DRAFT -> { /* DRAFT — 전이 없음 */ }
            case SENT -> estimate.send();
            case ACCEPTED -> {
                estimate.send();
                estimate.accept();
            }
            case REJECTED -> {
                estimate.send();
                estimate.reject();
            }
            case CONVERTED -> {
                estimate.send();
                estimate.accept();
                // convertedSlipId = 결정성 UUID (실제 slip row 와 논리적 참조)
                UUID convertedSlipId = deterministicUuid("samhan-seed:converted-slip:" + estimateNo);
                estimate.markConverted(convertedSlipId);
            }
        }

        return estimate;
    }

    // ---- 헬퍼 ----------------------------------------------------------

    /** 견적 날짜 — 2026-01-01 ~ 2026-04-30 (119일) 분포. */
    private static LocalDate computeEstimateDate(int idx) {
        return LocalDate.of(2026, 1, 1).plusDays(idx % 119);
    }

    /** {@code yyyy/MM/dd-N} 형식. */
    private static String formatEstimateNo(LocalDate d, int seqNo) {
        return String.format("%04d/%02d/%02d-%d",
                d.getYear(), d.getMonthValue(), d.getDayOfMonth(), seqNo);
    }

    /**
     * EstimateNumberSequence row upsert — 시드 채번 정합.
     * seqNo 가 기존 lastSeq 보다 크면 lastSeq 갱신 (idempotent skip 케이스 포함).
     */
    private void ensureSequence(LocalDate date, int seqNo) {
        sequenceRepository.findByEstimateDate(date).ifPresentOrElse(
                seq -> { /* 이미 존재 — lastSeq 는 건드리지 않음 (skip 시 중복 방지) */ },
                () -> {
                    EstimateNumberSequence seq = EstimateNumberSequence.create(date);
                    // seq.next() 를 seqNo 만큼 반복해 lastSeq 를 seqNo 로 맞춤
                    for (int i = 0; i < seqNo; i++) seq.next();
                    sequenceRepository.save(seq);
                });
    }

    private static String buildMemo(EstimateSpec spec) {
        return switch (spec.targetStatus()) {
            case DRAFT    -> "[P2 시드] 작성중 — 거래처 견적 검토 대기 idx=" + spec.idx();
            case SENT     -> "[P2 시드] 발송완료 — 거래처 수신 확인 대기 idx=" + spec.idx();
            case ACCEPTED -> "[P2 시드] 수주완료 — 슬립 변환 예정 idx=" + spec.idx();
            case REJECTED -> "[P2 시드] 거절 — 단가 재협의 필요 idx=" + spec.idx();
            case CONVERTED -> "[P2 시드] 슬립변환완료 — 전표 발행 완료 idx=" + spec.idx();
        };
    }

    private static String sampleSpec(int productSeq) {
        String[] specs = {"220V", "380V", "4HP", "6HP", "8HP",
                          "5kW", "10kW", "Φ80×L1200", "DC24V", "30A"};
        return specs[productSeq % specs.length];
    }

    private static BigDecimal computeUnitPrice(int productSeq) {
        long base = 500_000L + (productSeq * 13_337L) % 2_000_000L;
        return BigDecimal.valueOf((base / 10_000L) * 10_000L);  // 1만원 단위 round
    }

    private static UUID deterministicUuid(String name) {
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }

    // ---- 내부 타입 ------------------------------------------------------

    /** 목표 단계 (EstimateStatus 축약 — seed 전용). */
    enum EstimatePhase { DRAFT, SENT, ACCEPTED, REJECTED, CONVERTED }

    /** 견적 spec — idx + targetStatus. */
    private record EstimateSpec(int idx, EstimatePhase targetStatus) {}
}
