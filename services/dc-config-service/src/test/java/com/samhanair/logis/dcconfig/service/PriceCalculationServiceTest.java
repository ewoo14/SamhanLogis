package com.samhanair.logis.dcconfig.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.domain.PriceCalculationLog;
import com.samhanair.logis.dcconfig.domain.UnitRoundMode;
import com.samhanair.logis.dcconfig.dto.PriceCalculationRequest;
import com.samhanair.logis.dcconfig.dto.PriceCalculationResponse;
import com.samhanair.logis.dcconfig.repository.PriceCalculationLogRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * legacy `applyConfigFromServer` 알고리즘 1:1 검증.
 *
 * <p>frontend `calcDcPrice.ts` 와 동일 결과 보장 — 분쟁 방지용 회귀 테스트.
 */
@ExtendWith(MockitoExtension.class)
class PriceCalculationServiceTest {

    @Mock
    private PartnerService partnerService;
    @Mock
    private DcConfigService dcConfigService;
    @Mock
    private PriceCalculationLogRepository logRepository;

    @InjectMocks
    private PriceCalculationService service;

    private Partner partner;
    private DcConfig config;

    @BeforeEach
    void setUp() {
        partner = Partner.create("P-CALC-001", "1234567890", "테스트", "주소",
                "010-0000-0000", "담당", PartnerGroup.DEALER_1ST, null, null);
        config = DcConfig.create(partner, DcConfigSource.LEGACY_CSV);
        // 홈멀티 7%, 상업멀티 10%
        config.changeRates(new BigDecimal("0.0700"), new BigDecimal("0.1000"));
        // 옵션 정액: 360=50000, 4way=60000, stand=30000
        config.changeOptionAmounts(
                new BigDecimal("50000"), new BigDecimal("60000"), new BigDecimal("40000"),
                new BigDecimal("30000"), new BigDecimal("20000"), new BigDecimal("10000"));
        config.changeRounding(1000, UnitRoundMode.ROUND);

        lenient().when(partnerService.getByPartnerCode("P-CALC-001")).thenReturn(partner);
        lenient().when(dcConfigService.findByPartnerCode("P-CALC-001")).thenReturn(Optional.of(config));
        lenient().when(logRepository.save(any(PriceCalculationLog.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void homemulti_appliesRateOnly() {
        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "estimate-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "AJ040RXH4BC1", new BigDecimal("1000000"),
                        "HOMEMULTI", 1,
                        false, false, false, false, false, false)));

        PriceCalculationResponse res = service.calculate(req);

        // 1,000,000 * (1 - 0.07) = 930,000 → round to 1000 = 930,000
        assertThat(res.lines()).hasSize(1);
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("930000");
        assertThat(res.lines().get(0).finalAmount()).isEqualByComparingTo("930000");
        assertThat(res.totalListAmount()).isEqualByComparingTo("1000000");
        assertThat(res.totalFinalAmount()).isEqualByComparingTo("930000");
        assertThat(res.totalDiscountAmount()).isEqualByComparingTo("70000");
    }

    @Test
    void other_withOptions_subtractsBoth() {
        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "BIG-COMM-360", new BigDecimal("2000000"),
                        "OTHER", 2,
                        true, false, false, true, false, false)));

        PriceCalculationResponse res = service.calculate(req);

        // OTHER → rate 0, so 2,000,000 remains 2,000,000
        // 옵션 (360 + stand) = 50,000 + 30,000 = 80,000
        // afterOption = 1,920,000 → round to 1000 = 1,920,000
        // qty 2 → finalAmount = 3,840,000
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("1920000");
        assertThat(res.lines().get(0).finalAmount()).isEqualByComparingTo("3840000");
        assertThat(res.totalListAmount()).isEqualByComparingTo("4000000");
        assertThat(res.totalFinalAmount()).isEqualByComparingTo("3840000");
        assertThat(res.totalDiscountAmount()).isEqualByComparingTo("160000");
    }

    @Test
    void commercial_fixedDc_takesPriority_withoutDisplayOnlyOptionDeduction() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(new PriceCalculationRequest.Line(
                        "AM360AXVHHR1SY", "AM360AXVHHR1SY", new BigDecimal("29053200"),
                        "COMMERCIAL_MULTI", 1,
                        true, false, false, false, false, false,
                        new BigDecimal("45.00"))));

        PriceCalculationResponse res = service.calculate(req);

        // order-app commUnitPrice: fixedDc=45% 우선, 6종 정액 옵션은 상업멀티 표시 단가에 미적용.
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("15979260");
        assertThat(res.lines().get(0).appliedRate()).isEqualByComparingTo("0.4500");
        assertThat(res.lines().get(0).appliedFixedAmount()).isEqualByComparingTo("0");
    }

    @Test
    void otherCategory_noRate_appliesNoDiscount() {
        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "estimate-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "ETC-001", new BigDecimal("500000"),
                        "OTHER", 1,
                        false, false, false, false, false, false)));

        PriceCalculationResponse res = service.calculate(req);

        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("500000");
        assertThat(res.totalDiscountAmount()).isEqualByComparingTo("0");
    }

    @Test
    void roundingMode_floor_truncatesDown() {
        config.changeRounding(1000, UnitRoundMode.FLOOR);

        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "estimate-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "RND-001", new BigDecimal("123456"),
                        "OTHER", 1,
                        false, false, false, false, false, false)));

        PriceCalculationResponse res = service.calculate(req);

        // OTHER → rate 0, no option → 123,456 → FLOOR to 1000 = 123,000
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("123000");
    }

    @Test
    void roundingMode_ceil_roundsUp() {
        config.changeRounding(1000, UnitRoundMode.CEIL);

        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "estimate-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "RND-002", new BigDecimal("123456"),
                        "OTHER", 1,
                        false, false, false, false, false, false)));

        PriceCalculationResponse res = service.calculate(req);

        // 123,456 → CEIL to 1000 = 124,000
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("124000");
    }

    @Test
    void noConfig_returnsListPriceUnchanged() {
        when(dcConfigService.findByPartnerCode("P-CALC-001")).thenReturn(Optional.empty());

        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "estimate-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "RND-003", new BigDecimal("500000"),
                        "HOMEMULTI", 1,
                        true, true, true, true, true, true)));

        PriceCalculationResponse res = service.calculate(req);

        // config 가 없으면 정상가 그대로 (반올림은 1원 단위 round 적용)
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("500000");
        assertThat(res.totalDiscountAmount()).isEqualByComparingTo("0");
    }

    @Test
    void optionDiscountExceedsBase_clampsToZero() {
        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "estimate-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "TINY-001", new BigDecimal("10000"),
                        "OTHER", 1,
                        true, true, true, true, true, true)));

        PriceCalculationResponse res = service.calculate(req);

        // 10,000 - (50000+60000+40000+30000+20000+10000) = negative → clamp 0
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("0");
    }
}
