package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderLineRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import com.samhanair.logis.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class PartnerOrderDeleteServiceTest {

    @Mock
    private PartnerOrderRepository orderRepository;
    @Mock
    private PartnerOrderLineRepository lineRepository;
    @Mock
    private PartnerOrderAuditLogService auditLogService;
    @Mock
    private PartnerOrderRevisionService revisionService;
    @Mock
    private PartnerOrderBoardChangePublisher boardChangePublisher;

    @Test
    void restoreDeleted_ignoresHistoricalEditLinesAndRestoresCurrentDeleteLines() {
        UUID orderId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        String actor = actorId.toString();
        LocalDateTime deleteTime = LocalDateTime.of(2026, 8, 7, 1, 2, 3);
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "GS01", "1234567890", "2026/08/07-1", "idempotency-" + orderId,
                BigDecimal.ZERO, UUID.randomUUID(), null, null);
        ReflectionTestUtils.setField(order, "id", orderId);
        PartnerOrderLine historical = PartnerOrderLine.create(
                UUID.randomUUID(), "OLD", "과거라인", "homemulti", 1,
                new BigDecimal("10000"), null);
        historical.markDeleted("system-partner-order-update",
                deleteTime.minusMinutes(1));
        PartnerOrderLine current = PartnerOrderLine.create(
                UUID.randomUUID(), "CURRENT", "현재라인", "homemulti", 1,
                new BigDecimal("20000"), null);
        current.markDeleted(actor, deleteTime);
        order.markDeleted(actor, deleteTime);

        when(orderRepository.findByOrderNoIncludingDeleted(order.getOrderNo()))
                .thenReturn(Optional.of(order));
        when(lineRepository.findAllIncludingDeletedByPartnerOrderId(orderId))
                .thenReturn(List.of(historical, current));
        when(orderRepository.saveAndFlush(any(PartnerOrder.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        PartnerOrderDeleteService service = new PartnerOrderDeleteService(
                orderRepository, lineRepository, auditLogService, revisionService,
                boardChangePublisher);

        service.restoreDeleted(order.getOrderNo(), actorId, "복원자");

        assertThat(order.getIsDeleted()).isFalse();
        assertThat(historical.getIsDeleted()).isTrue();
        assertThat(current.getIsDeleted()).isFalse();
    }

    @Test
    void restoreDeleted_rejectsWhenDeletedLinesCannotBeAttributedToCurrentDelete() {
        UUID orderId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        LocalDateTime deleteTime = LocalDateTime.of(2026, 8, 7, 1, 2, 3);
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "GS01", "1234567890", "2026/08/07-2", "idempotency-" + orderId,
                BigDecimal.ZERO, UUID.randomUUID(), null, null);
        ReflectionTestUtils.setField(order, "id", orderId);
        PartnerOrderLine historical = PartnerOrderLine.create(
                UUID.randomUUID(), "OLD", "과거라인", "homemulti", 1,
                new BigDecimal("10000"), null);
        historical.markDeleted("system-partner-order-update", deleteTime.minusMinutes(1));
        order.markDeleted(actorId.toString(), deleteTime);
        when(orderRepository.findByOrderNoIncludingDeleted(order.getOrderNo()))
                .thenReturn(Optional.of(order));
        when(lineRepository.findAllIncludingDeletedByPartnerOrderId(orderId))
                .thenReturn(List.of(historical));

        PartnerOrderDeleteService service = new PartnerOrderDeleteService(
                orderRepository, lineRepository, auditLogService, revisionService,
                boardChangePublisher);

        assertThatThrownBy(() -> service.restoreDeleted(order.getOrderNo(), actorId, "복원자"))
                .isInstanceOf(BusinessException.class);
    }
}
