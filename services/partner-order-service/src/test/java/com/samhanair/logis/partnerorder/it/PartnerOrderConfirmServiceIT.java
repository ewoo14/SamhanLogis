package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
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
 * confirm 흐름 D1 — slip 미발행 DRAFT 주문 생성 검증 (슬라이스 D1).
 *
 * <p>5 외부 client 모두 mock — confirm 은 slip-service 를 호출하지 않아야 한다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class PartnerOrderConfirmServiceIT extends AbstractPostgresIT {

    @Autowired
    private PartnerOrderConfirmService confirmService;

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
    void confirm_creates_draft_order_without_slip_publish() {
        UUID productId = UUID.randomUUID();
        Mockito.when(dcConfigClient.fetchDcConfig(Mockito.anyString()))
                .thenReturn(Map.of());
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 5kW", "HM-5000", null,
                        new BigDecimal("1000000"), "ACTIVE")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, "remark-1")));
        ConfirmResponse response = confirmService.confirm(
                "P-DRAFT", "1234567890", "user-draft", null, null, request);

        // 주문만 생성 — slip 미발행, 진행중(DRAFT)
        assertThat(response.slipNo()).isNull();
        assertThat(response.status()).isEqualTo("DRAFT");
        assertThat(response.slipPublishStatus()).isEqualTo(SlipPublishStatus.NOT_REQUIRED.name());

        // slip-service 미호출
        Mockito.verify(slipServiceClient, Mockito.never())
                .publishFromPartnerOrder(Mockito.anyMap(), Mockito.anyString());
    }

    @Test
    void confirm_does_not_enqueue_outbox() {
        UUID productId = UUID.randomUUID();
        Mockito.when(dcConfigClient.fetchDcConfig(Mockito.anyString()))
                .thenReturn(Map.of());
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 7kW", "HM-7000", null,
                        new BigDecimal("1500000"), "ACTIVE")));

        long before = outboxRepository.count();

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-NOOUTBOX", "9876543210", "user-nooutbox", null, null, request);

        assertThat(response.status()).isEqualTo("DRAFT");
        assertThat(outboxRepository.count()).isEqualTo(before);
    }
}
