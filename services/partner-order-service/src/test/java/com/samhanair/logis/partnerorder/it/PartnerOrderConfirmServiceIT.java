package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.service.PartnerOrderConfirmService;
import com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * confirm 흐름 happy + 5xx → outbox INSERT 검증 (설계서 §3.6 + §6).
 *
 * <p>5 외부 client 모두 mock — 가격/카탈로그/재고/slip 발행 결과를 stub 으로 통제.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class PartnerOrderConfirmServiceIT extends AbstractPostgresIT {

    @Autowired
    private PartnerOrderConfirmService confirmService;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @Autowired
    private SlipPublishOutboxRepository outboxRepository;

    @MockBean
    private DcConfigClient dcConfigClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private PartnerAuthClient partnerAuthClient;

    @Test
    void confirm_happy_path_sets_slipNo_and_published() {
        UUID productId = UUID.randomUUID();
        Mockito.when(dcConfigClient.fetchDcConfig(Mockito.anyString()))
                .thenReturn(Map.of());
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 5kW", "HM-5000", null,
                        new BigDecimal("1000000"), "ACTIVE")));
        Mockito.when(inventoryClient.reserve(Mockito.any(), Mockito.any(), Mockito.anyInt()))
                .thenReturn(Map.of("status", "OK"));
        Mockito.when(slipServiceClient.publishFromPartnerOrder(
                        Mockito.anyMap(), Mockito.anyString()))
                .thenReturn(PublishResult.published("S-2025-0001"));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, "remark-1")));
        ConfirmResponse response = confirmService.confirm(
                "P-HAPPY", "1234567890", "user-happy", null, null, request);

        assertThat(response.slipNo()).isEqualTo("S-2025-0001");
        assertThat(response.slipPublishStatus()).isEqualTo(SlipPublishStatus.PUBLISHED.name());
    }

    @Test
    void confirm_slip_5xx_queues_outbox_and_marks_pending_retry() {
        UUID productId = UUID.randomUUID();
        Mockito.when(dcConfigClient.fetchDcConfig(Mockito.anyString()))
                .thenReturn(Map.of());
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 7kW", "HM-7000", null,
                        new BigDecimal("1500000"), "ACTIVE")));
        Mockito.when(inventoryClient.reserve(Mockito.any(), Mockito.any(), Mockito.anyInt()))
                .thenReturn(Map.of("status", "OK"));
        Mockito.when(slipServiceClient.publishFromPartnerOrder(
                        Mockito.anyMap(), Mockito.anyString()))
                .thenThrow(new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 5xx"));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-RETRY", "9876543210", "user-retry", null, null, request);

        assertThat(response.slipNo()).isNull();
        assertThat(response.slipPublishStatus()).isEqualTo(SlipPublishStatus.PENDING_RETRY.name());

        // outbox 1건 INSERT 검증
        long outboxCount = outboxRepository.count();
        assertThat(outboxCount).isGreaterThanOrEqualTo(1);

        // PartnerOrder 도 PENDING_RETRY 상태
        long pendingCount = orderRepository.findAllBySlipPublishStatus(SlipPublishStatus.PENDING_RETRY).size();
        assertThat(pendingCount).isGreaterThanOrEqualTo(1);
    }
}
