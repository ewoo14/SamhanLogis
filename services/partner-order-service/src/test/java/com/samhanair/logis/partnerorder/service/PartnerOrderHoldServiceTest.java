package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderAuthorityEventPublisher;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class PartnerOrderHoldServiceTest {

    @Mock private PartnerOrderRepository orderRepository;
    @Mock private PartnerOrderBoardChangePublisher boardChangePublisher;
    @Mock private PartnerOrderAuthorityEventPublisher authorityEventPublisher;

    @Test
    void hold_publishes_one_authority_event_after_status_commit_request() {
        UUID orderId = UUID.randomUUID();
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "P001", "1234567890", "2026/08/07-HOLD", "hold-" + orderId,
                BigDecimal.ZERO, UUID.randomUUID(), null, null);
        ReflectionTestUtils.setField(order, "id", orderId);
        when(orderRepository.findByOrderNo(anyString())).thenReturn(Optional.of(order));
        when(orderRepository.saveAndFlush(order)).thenReturn(order);

        PartnerOrderHoldService service = new PartnerOrderHoldService(
                orderRepository, boardChangePublisher, authorityEventPublisher);

        service.hold(order.getOrderNo(), null, null);

        assertThat(order.getStatus().name()).isEqualTo("ON_HOLD");
        verify(authorityEventPublisher).publish(orderId, "STATUS", null);
    }
}
