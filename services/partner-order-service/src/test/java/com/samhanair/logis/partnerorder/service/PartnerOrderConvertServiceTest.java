package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.partnerorder.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderAuthorityEventPublisher;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.web.dto.ConvertToSlipRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class PartnerOrderConvertServiceTest {

    @Mock private PartnerOrderRepository orderRepository;
    @Mock private SlipServiceClient slipServiceClient;
    @Mock private InventoryClient inventoryClient;
    @Mock private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @Mock private PartnerOrderBoardChangePublisher boardChangePublisher;
    @Mock private PartnerOrderAuthorityEventPublisher authorityEventPublisher;

    @Test
    void successful_convert_publishes_one_authority_event() {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        PartnerOrder order = PartnerOrder.createFromConfirm(
                "P001", "1234567890", "2026/08/07-CONVERT", "convert-" + orderId,
                BigDecimal.ZERO);
        ReflectionTestUtils.setField(order, "id", orderId);
        PartnerOrderLine line = PartnerOrderLine.create(
                productId, "MODEL-X", "상품X", "homemulti", 2, new BigDecimal("10000"), null);
        ReflectionTestUtils.setField(line, "id", lineId);
        order.addLine(line);
        when(orderRepository.findByOrderNo(order.getOrderNo())).thenReturn(Optional.of(order));
        when(inventoryClient.resolveWarehouseIdByCode("WH-001")).thenReturn(warehouseId);
        when(inventoryClient.reserve(any(), any(), any(Integer.class), anyString(), any()))
                .thenReturn(InventoryClient.ReservationResult.reserved());
        when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(SlipServiceClient.PublishResult.published("SLIP-CONVERT-1"));
        when(orderRepository.saveAndFlush(order)).thenReturn(order);

        PartnerOrderConvertService service = new PartnerOrderConvertService(
                orderRepository, slipServiceClient, inventoryClient, approvalLineAuthorizeClient,
                boardChangePublisher, authorityEventPublisher);

        var result = service.convert(order.getOrderNo(),
                new ConvertToSlipRequest(List.of(new ConvertToSlipRequest.Item(lineId, 1)), "WH-001"),
                null, null);

        assertThat(result.slipNo()).isEqualTo("SLIP-CONVERT-1");
        verify(authorityEventPublisher).publish(orderId, "CONVERT", null);
    }
}
