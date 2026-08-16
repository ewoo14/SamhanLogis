package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.web.dto.HistoryResponse;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class PartnerOrderHistoryServiceTest {

    @Mock
    private PartnerOrderRepository orderRepository;

    @Mock
    private PartnerSelfScopeGuard partnerSelfScopeGuard;

    private PartnerOrderHistoryService service;

    @BeforeEach
    void setUp() {
        service = new PartnerOrderHistoryService(orderRepository, partnerSelfScopeGuard);
        lenient().when(partnerSelfScopeGuard.partnerScopeOrNull(null)).thenReturn(null);
    }

    @Test
    void history_includesDeletedOrderAndExposesDeletedFlagWithoutChangingAmountOrCount() {
        PartnerOrder deletedOrder = order("2026/08/16-1", true, BigDecimal.valueOf(125000));
        Pageable pageable = PageRequest.of(0, 20);
        Page<PartnerOrder> page = new PageImpl<>(List.of(deletedOrder), pageable, 1);
        when(orderRepository.findAllHistoryIncludingDeletedByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                eq("1234567890"), any(), any(), eq(pageable))).thenReturn(page);

        Page<HistoryResponse> result = service.findHistory(
                "1234567890", LocalDateTime.MIN, LocalDateTime.MAX, pageable);

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).singleElement()
                .extracting(HistoryResponse::isDeleted, HistoryResponse::totalAmount)
                .containsExactly(true, BigDecimal.valueOf(125000));
        verify(orderRepository, never()).findAllByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                any(), any(), any(), any());
    }

    @Test
    void partnerScopedHistory_includesDeletedOrderOnlyThroughHistorySpecificQuery() {
        Pageable pageable = PageRequest.of(0, 20);
        when(partnerSelfScopeGuard.partnerScopeOrNull("P-001")).thenReturn("P-001");
        when(orderRepository.existsByBizCodeAndPartnerCodeNot("1234567890", "P-001"))
                .thenReturn(false);
        PartnerOrder deletedOrder = order("2026/08/16-2", true, BigDecimal.TEN);
        when(orderRepository.findAllHistoryIncludingDeletedByPartnerCodeAndBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                eq("P-001"), eq("1234567890"), any(), any(), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(deletedOrder), pageable, 1));

        Page<HistoryResponse> result = service.findHistory(
                "1234567890", LocalDateTime.MIN, LocalDateTime.MAX, pageable, "P-001");

        assertThat(result.getContent()).singleElement().extracting(HistoryResponse::isDeleted)
                .isEqualTo(true);
        verify(orderRepository, never()).findAllByPartnerCodeAndBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                any(), any(), any(), any(), any());
    }

    private PartnerOrder order(String orderNo, boolean deleted, BigDecimal amount) {
        PartnerOrder order = mock(PartnerOrder.class);
        when(order.getOrderNo()).thenReturn(orderNo);
        when(order.getSlipNo()).thenReturn("SLIP-" + orderNo);
        when(order.getStatus()).thenReturn(PartnerOrderStatus.CONFIRMED);
        when(order.getSlipPublishStatus()).thenReturn(SlipPublishStatus.PUBLISHED);
        when(order.getTotalAmount()).thenReturn(amount);
        when(order.getConfirmedAt()).thenReturn(LocalDateTime.of(2026, 8, 16, 10, 0));
        when(order.getIsDeleted()).thenReturn(deleted);
        return order;
    }
}
