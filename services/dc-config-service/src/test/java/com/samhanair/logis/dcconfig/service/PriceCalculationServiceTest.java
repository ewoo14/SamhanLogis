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
    void order_without_main_equipment_applies_40_percent_only_to_variable_discount_items() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(
                        new PriceCalculationRequest.Line(
                                "L1", "ERV-001", new BigDecimal("1000000"),
                                "HOMEMULTI", 1,
                                false, false, false, false, false, false,
                                null, true, "HVAC"),
                        new PriceCalculationRequest.Line(
                                "L2", "MAT-001", new BigDecimal("500000"),
                                "HOMEMULTI", 1,
                                false, false, false, false, false, false,
                                null, false, "PIPING")));

        PriceCalculationResponse res = service.calculate(req);

        assertThat(res.lines().get(0).appliedRate()).isEqualByComparingTo("0.40");
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("600000");
        assertThat(res.lines().get(1).appliedRate()).isEqualByComparingTo("0");
        assertThat(res.lines().get(1).finalPrice()).isEqualByComparingTo("500000");
    }

    @Test
    void order_with_outdoor_or_indoor_does_not_apply_40_percent() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        PriceCalculationRequest outdoorReq = new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "OUT-001", new BigDecimal("1000000"),
                        "HOMEMULTI", 1,
                        false, false, false, false, false, false,
                        null, true, "OUTDOOR")));
        PriceCalculationRequest indoorReq = new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "IND-001", new BigDecimal("1000000"),
                        "HOMEMULTI", 1,
                        false, false, false, false, false, false,
                        null, true, "INDOOR_WALL")));

        assertThat(service.calculate(outdoorReq).lines().get(0).appliedRate())
                .isEqualByComparingTo("0.0700");
        assertThat(service.calculate(indoorReq).lines().get(0).appliedRate())
                .isEqualByComparingTo("0.0700");
    }

    @Test
    void order_with_unclassified_item_does_not_apply_40_percent() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(
                        new PriceCalculationRequest.Line(
                                "L1", "ERV-001", new BigDecimal("1000000"),
                                "HOMEMULTI", 1,
                                false, false, false, false, false, false,
                                null, true, "HVAC"),
                        new PriceCalculationRequest.Line(
                                "L2", "UNKNOWN-001", new BigDecimal("500000"),
                                "HOMEMULTI", 1,
                                false, false, false, false, false, false,
                                null, true, "UNCLASSIFIED")));

        PriceCalculationResponse res = service.calculate(req);

        assertThat(res.lines().get(0).appliedRate()).isEqualByComparingTo("0.0700");
        assertThat(res.lines().get(1).appliedRate()).isEqualByComparingTo("0.0700");
    }

    @Test
    void order_with_unknown_physical_category_does_not_apply_40_percent() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        PriceCalculationResponse res = service.calculate(new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(line("FUTURE_UNKNOWN", true))));

        assertThat(res.lines().get(0).appliedRate()).isEqualByComparingTo("0.0700");
    }

    @Test
    void order_without_main_equipment_does_not_override_fixed_discount() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(new PriceCalculationRequest.Line(
                        "L1", "ERV-001", new BigDecimal("1000000"),
                        "HOMEMULTI", 1,
                        false, false, false, false, false, false,
                        new BigDecimal("0.25"), true, "HVAC")));

        PriceCalculationResponse res = service.calculate(req);

        assertThat(res.lines().get(0).appliedRate()).isEqualByComparingTo("0.25");
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("750000");
    }

    @Test
    void fixed_dc_495000_to_420750_remains_unchanged_with_order_rule_input() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        PriceCalculationResponse res = service.calculate(new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(new PriceCalculationRequest.Line(
                        "FIXED-S-15", "FIXED-S-15", new BigDecimal("495000"),
                        "HOMEMULTI", 1,
                        false, false, false, false, false, false,
                        new BigDecimal("0.15"), true, "HVAC"))));

        assertThat(res.lines().get(0).appliedRate()).isEqualByComparingTo("0.15");
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("420750");
    }

    @Test
    void nonVariableMulti_usesDeliveryPriceWithoutGlobalDiscount() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        PriceCalculationRequest req = new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service",
                List.of(new PriceCalculationRequest.Line(
                        "L-NONVAR", "HM-NONVAR", new BigDecimal("300960"),
                        "HOMEMULTI", 1,
                        false, false, false, false, false, false,
                        null, false)));

        PriceCalculationResponse res = service.calculate(req);

        // order-app useK2=false: deliveryPrice는 전역DC를 거치지 않고 그대로 표시한다.
        assertThat(res.lines().get(0).appliedRate()).isEqualByComparingTo("0");
        assertThat(res.lines().get(0).finalPrice()).isEqualByComparingTo("300960");
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

    @Test
    void order_rule_combination_matrix_preserves_expected_rates() {
        config.changeRounding(0, UnitRoundMode.ROUND);

        assertRate(List.of(line("OUTDOOR", true)), "0.0700");
        assertRate(List.of(line("INDOOR_WALL", true)), "0.0700");
        assertRate(List.of(line("OUTDOOR", true), line("INDOOR", true)), "0.0700");
        assertRate(List.of(line("HVAC", true)), "0.40");
        assertRate(List.of(line("PIPING", false)), "0");
        assertRate(List.of(line("UNCLASSIFIED", true)), "0.0700");
        assertRate(List.of(line("UNCLASSIFIED", true), line("HVAC", true)), "0.0700");
        assertRate(List.of(line("UNCLASSIFIED", true), line("OUTDOOR", true)), "0.0700");
        assertRate(List.of(line("HVAC", true)), "0.40");

        PriceCalculationResponse empty = service.calculate(new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service", List.of()));
        assertThat(empty.lines()).isEmpty();
        assertThat(empty.totalDiscountAmount()).isEqualByComparingTo("0");
    }

    private void assertRate(List<PriceCalculationRequest.Line> lines, String expectedRate) {
        PriceCalculationResponse response = service.calculate(new PriceCalculationRequest(
                "P-CALC-001", "partner-order-service", lines));
        assertThat(response.lines()).isNotEmpty();
        assertThat(response.lines().get(0).appliedRate()).isEqualByComparingTo(expectedRate);
    }

    private PriceCalculationRequest.Line line(String physicalCategoryCode, boolean variableDiscount) {
        return new PriceCalculationRequest.Line(
                physicalCategoryCode, physicalCategoryCode, new BigDecimal("1000000"),
                "HOMEMULTI", 1,
                false, false, false, false, false, false,
                null, variableDiscount, physicalCategoryCode);
    }
}
