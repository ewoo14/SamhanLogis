package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
}
