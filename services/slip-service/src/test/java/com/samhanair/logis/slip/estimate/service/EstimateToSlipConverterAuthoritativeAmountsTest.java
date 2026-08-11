package com.samhanair.logis.slip.estimate.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipNumberService;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("견적→전표 권위 금액 변환")
class EstimateToSlipConverterAuthoritativeAmountsTest {

    private final SlipRepository slipRepository = mock(SlipRepository.class);
    private final SlipNumberService slipNumberService = mock(SlipNumberService.class);
    private final OutboundCutoffGuard cutoffGuard = mock(OutboundCutoffGuard.class);
    private final SlipClosedDateGuard closedDateGuard = mock(SlipClosedDateGuard.class);
    private final ProductClient productClient = mock(ProductClient.class);
    private final PartnerInternalClient partnerInternalClient = mock(PartnerInternalClient.class);
    private final EstimateToSlipConverter converter = new EstimateToSlipConverter(
            slipRepository,
            slipNumberService,
            cutoffGuard,
            closedDateGuard,
            Clock.fixed(Instant.parse("2026-07-22T00:00:00Z"), ZoneId.of("Asia/Seoul")),
            productClient,
            partnerInternalClient);

    @Test
    @DisplayName("권위 견적 라인의 공급가액·부가세·합계를 재반올림하지 않는다")
    void preservesAuthoritativeAmounts() {
        Estimate estimate = estimate();
        estimate.addLine(EstimateLine.createFromAuthoritativeAmounts(
                estimate, 1, UUID.randomUUID(), "품목", "모델", null, 3,
                new BigDecimal("100005"), new BigDecimal("10001"), new BigDecimal("110006"), null));

        Slip converted = convert(estimate);
        SlipLine line = converted.getLines().get(0);

        assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(line.getVatAmount()).isEqualByComparingTo("10001");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("36668.67");
        assertThat(line.getLineTotal()).isEqualByComparingTo("100005");
        assertThat(converted.getBusinessNumber()).isEqualTo("123-45-67890");
    }

    @Test
    @DisplayName("unitPriceWithVat가 없는 구 견적은 소수 공급단가 경로를 그대로 유지한다")
    void preservesLegacyEstimateLinePath() {
        Estimate estimate = estimate();
        estimate.addLine(EstimateLine.create(
                estimate, 1, UUID.randomUUID(), "품목", "모델", null, 1,
                new BigDecimal("1000.50"), null));

        Slip converted = convert(estimate);
        SlipLine line = converted.getLines().get(0);

        assertThat(line.getUnitPrice()).isEqualByComparingTo("1000.50");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("1100.55");
        assertThat(line.getLineTotal()).isEqualByComparingTo("1000.50");
    }

    @Test
    @DisplayName("레거시 BUNDLE 견적도 부모 라인으로 전표 변환하지 않고 안내 오류를 반환한다")
    void rejectsBundleParentBeforeCreatingSlip() {
        UUID parentId = UUID.randomUUID();
        Estimate estimate = estimate();
        estimate.addLine(EstimateLine.create(
                estimate, 1, parentId, "세트", "SET-1", null, 1,
                new BigDecimal("1000"), null));
        when(productClient.lookup(java.util.List.of(parentId))).thenReturn(java.util.List.of(
                new ProductSummary(parentId, "세트", "SET-1", "SET-1", null,
                        BigDecimal.TEN, "ACTIVE", false, "SET-1", "BUNDLE")));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> converter.convert(estimate))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("세트 품목은 구성품으로 전개된 견적만 전표로 변환할 수 있습니다");
        verifyNoInteractions(slipRepository);
    }

    @Test
    @DisplayName("견적 변환 시 partnerCode snapshot을 채운다")
    void resolvesPartnerCodeSnapshot() {
        Estimate estimate = estimate();
        UUID partnerId = estimate.getPartnerId();
        when(partnerInternalClient.resolvePartnerCode(partnerId))
                .thenReturn(Optional.of("P-ESTIMATE-001"));

        Slip converted = convert(estimate);

        assertThat(converted.getPartnerCode()).isEqualTo("P-ESTIMATE-001");
    }

    @Test
    @DisplayName("견적의 두 BUNDLE instanceKey를 전표 8행에 그대로 보존한다")
    void preservesTwoBundleInstanceKeys() {
        Estimate estimate = estimate();
        for (int instance = 1; instance <= 2; instance++) {
            BundleSetOptions options = new BundleSetOptions(
                    null, false, null, null, false, "server-key-" + instance);
            for (int component = 1; component <= 4; component++) {
                EstimateLine line = EstimateLine.create(
                        estimate, estimate.getLines().size() + 1, UUID.randomUUID(),
                        "구성품 " + component, "COMP-" + component, null, 1,
                        new BigDecimal("100"), null);
                line.assignBundleComponent("AC060CS6PBH1SY", component == 1, options);
                estimate.addLine(line);
            }
        }

        Slip converted = convert(estimate);

        assertThat(converted.getLines()).hasSize(8);
        assertThat(converted.getLines()).filteredOn(SlipLine::isSetHead).hasSize(2);
        assertThat(converted.getLines().stream()
                .map(line -> line.getBundleSetOptions().instanceKey())
                .distinct())
                .containsExactlyInAnyOrder("server-key-1", "server-key-2");
        assertThat(converted.getLines()).allSatisfy(line ->
                assertThat(line.getParentSetModel()).isEqualTo("AC060CS6PBH1SY"));
    }

    private Slip convert(Estimate estimate) {
        when(slipNumberService.next(any(LocalDate.class), eq(SlipType.OUTBOUND)))
                .thenReturn("2026/07/22-1");
        when(slipNumberService.extractSeqNo("2026/07/22-1")).thenReturn(1);
        when(slipRepository.save(any(Slip.class))).thenAnswer(invocation -> invocation.getArgument(0));
        return converter.convert(estimate);
    }

    private Estimate estimate() {
        return Estimate.create("Q-20260722-1", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), "거래처", "123-45-67890", null, null, null, "test-user");
    }
}
