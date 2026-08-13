package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 주문 확정과 미리보기가 공유하는 서버 가격 라인 생성 계약 테스트. */
@ExtendWith(MockitoExtension.class)
class PartnerOrderPriceCalculationServiceTest {

    @Mock
    private ProductClient productClient;
    @Mock
    private DcConfigClient dcConfigClient;

    @InjectMocks
    private PartnerOrderPriceCalculationService service;

    @Test
    void preview_and_confirm_share_the_same_server_calculation_input() {
        UUID productId = UUID.randomUUID();
        ProductSummary product = new ProductSummary(
                productId, "전열교환기", "ERV-001", UUID.randomUUID(), new BigDecimal("1000000"), "ACTIVE",
                "ERV-001", "SINGLE", "HOME_MULTI", null, "000000",
                new BigDecimal("1000000"), new BigDecimal("1000000"), true, "HVAC");
        when(productClient.lookupByModelCodes(List.of("ERV-001"))).thenReturn(List.of(product));
        when(dcConfigClient.calculateDetailed(any(), any())).thenReturn(
                new DcConfigClient.CalculationResult(
                        java.util.Map.of("0", new DcConfigClient.CalculatedLine(
                                new BigDecimal("600000"), new BigDecimal("0.40"))), true));

        PartnerOrderPriceCalculationService.Calculation result = service.calculate(
                "P-001", new ConfirmRequest(List.of(
                        new ConfirmLineRequest(null, "ERV-001", "homemulti", 1, null))));

        assertThat(result.available()).isTrue();
        assertThat(result.lines()).hasSize(1);
        assertThat(result.lines().get(0).finalPrice()).isEqualByComparingTo("600000");
        assertThat(result.lines().get(0).appliedRate()).isEqualByComparingTo("0.40");
    }

    @Test
    void fixed_discount_none은_보조_endpoint_장애에도_600000원으로_계산된다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000040");
        ProductSummary product = new ProductSummary(
                productId, "QA-HVAC-001", "QA-HVAC-001", UUID.randomUUID(),
                new BigDecimal("1000000"), "ACTIVE", "QA-HVAC-001", "SINGLE", "homemulti",
                null, "NONE", "000000", new BigDecimal("1000000"), new BigDecimal("1000000"),
                true, "HVAC");
        when(productClient.lookup(List.of(productId))).thenReturn(List.of(product));
        when(dcConfigClient.calculateDetailed(any(), any())).thenReturn(
                new DcConfigClient.CalculationResult(
                        java.util.Map.of("0", new DcConfigClient.CalculatedLine(
                                new BigDecimal("600000"), new BigDecimal("0.40"))), true));

        PartnerOrderPriceCalculationService.Calculation result = service.calculate(
                "P-QA-40", new ConfirmRequest(List.of(
                        new ConfirmLineRequest(productId, null, "homemulti", 1, null))));

        assertThat(result.available()).isTrue();
        assertThat(result.lines()).hasSize(1);
        assertThat(result.lines().get(0).finalPrice()).isEqualByComparingTo("600000");
        verify(productClient, never()).lookupFixedDiscountRates(any());
    }

    @Test
    void resolved_fixed_discount_rate는_보조_endpoint_장애에도_그대로_적용된다() {
        UUID productId = UUID.fromString("00000000-0000-0000-0000-000000000041");
        ProductSummary product = new ProductSummary(
                productId, "고정DC 품목", "FIXED-001", UUID.randomUUID(),
                new BigDecimal("1000000"), "ACTIVE", "FIXED-001", "SINGLE", "homemulti",
                new BigDecimal("15"), "S", "000000", new BigDecimal("1000000"),
                new BigDecimal("1000000"), true, "HVAC");
        when(productClient.lookup(List.of(productId))).thenReturn(List.of(product));
        when(dcConfigClient.calculateDetailed(any(), any())).thenReturn(
                new DcConfigClient.CalculationResult(
                        java.util.Map.of("0", new DcConfigClient.CalculatedLine(
                                new BigDecimal("850000"), new BigDecimal("0.15"))), true));

        PartnerOrderPriceCalculationService.Calculation result = service.calculate(
                "P-QA-40", new ConfirmRequest(List.of(
                        new ConfirmLineRequest(productId, null, "homemulti", 1, null))));

        assertThat(result.lines().get(0).finalPrice()).isEqualByComparingTo("850000");
        verify(productClient, never()).lookupFixedDiscountRates(any());
    }

    @Test
    void mixed_version이면_source_없는_legacy_품목만_보조조회한다() {
        UUID resolvedId = UUID.fromString("00000000-0000-0000-0000-000000000042");
        UUID legacyId = UUID.fromString("00000000-0000-0000-0000-000000000043");
        ProductSummary resolved = new ProductSummary(
                resolvedId, "현재 품목", "CURRENT-001", UUID.randomUUID(),
                new BigDecimal("1000000"), "ACTIVE", "CURRENT-001", "SINGLE", "homemulti",
                null, "NONE", "000000", new BigDecimal("1000000"), new BigDecimal("1000000"),
                true, "HVAC");
        ProductSummary legacy = new ProductSummary(
                legacyId, "구형 품목", "LEGACY-001", UUID.randomUUID(),
                new BigDecimal("1000000"), "ACTIVE", "LEGACY-001", "SINGLE", "homemulti",
                null, null, "000000", new BigDecimal("1000000"), new BigDecimal("1000000"),
                true, "HVAC");
        when(productClient.lookup(List.of(resolvedId, legacyId))).thenReturn(List.of(resolved, legacy));
        when(productClient.lookupFixedDiscountRates(List.of(legacyId)))
                .thenReturn(java.util.Map.of(legacyId, new BigDecimal("10")));
        when(dcConfigClient.calculateDetailed(any(), any())).thenReturn(
                new DcConfigClient.CalculationResult(
                        java.util.Map.of(
                                "0", new DcConfigClient.CalculatedLine(new BigDecimal("600000"), new BigDecimal("0.40")),
                                "1", new DcConfigClient.CalculatedLine(new BigDecimal("600000"), new BigDecimal("0.40"))), true));

        PartnerOrderPriceCalculationService.Calculation result = service.calculate(
                "P-QA-40", new ConfirmRequest(List.of(
                        new ConfirmLineRequest(resolvedId, null, "homemulti", 1, null),
                        new ConfirmLineRequest(legacyId, null, "homemulti", 1, null))));

        assertThat(result.available()).isTrue();
        assertThat(result.lines()).extracting(PartnerOrderPriceCalculationService.Line::finalPrice)
                .containsExactly(new BigDecimal("600000"), new BigDecimal("600000"));
        verify(productClient).lookupFixedDiscountRates(List.of(legacyId));
        ArgumentCaptor<List<DcConfigClient.PriceLine>> priceLines = ArgumentCaptor.forClass(List.class);
        verify(dcConfigClient).calculateDetailed(any(), priceLines.capture());
        assertThat(priceLines.getValue().get(0).fixedDiscountRate()).isNull();
        assertThat(priceLines.getValue().get(1).fixedDiscountRate()).isEqualByComparingTo("10");
    }
}
