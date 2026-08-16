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
    void history_includesLegacyOrderWhenConfirmedEventExistsButConfirmedAtIsNull() {
        PartnerOrder legacyOrder = order("2026/05/31-1", true, BigDecimal.TEN);
        when(legacyOrder.getConfirmedAt()).thenReturn(null);
        Pageable pageable = PageRequest.of(0, 20);
        when(partnerSelfScopeGuard.partnerScopeOrNull("2118712345")).thenReturn("2118712345");
        when(orderRepository.findAllHistoryIncludingDeletedByNormalizedBizCodeAndConfirmedEventOrderByEffectiveDateDesc(
                eq("2118712345"), any(), any(), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(legacyOrder), pageable, 1));

        Page<HistoryResponse> result = service.findHistory(
                "211-87-12345", LocalDateTime.MIN, LocalDateTime.MAX, pageable, "2118712345");

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).singleElement()
                .extracting(HistoryResponse::isDeleted)
                .isEqualTo(true);
        verify(orderRepository, never()).findAllByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                any(), any(), any(), any());
    }

    @Test
    void partnerScopedHistory_includesDeletedOrderOnlyThroughHistorySpecificQuery() {
        Pageable pageable = PageRequest.of(0, 20);
        when(partnerSelfScopeGuard.partnerScopeOrNull("P-001")).thenReturn("P-001");
        when(orderRepository.existsByNormalizedBizCodeAndNormalizedPartnerCodeNot("1234567890", "p001"))
                .thenReturn(false);
        PartnerOrder deletedOrder = order("2026/08/16-2", true, BigDecimal.TEN);
        when(orderRepository.findAllHistoryIncludingDeletedByNormalizedPartnerCodeAndNormalizedBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                eq("p001"), eq("1234567890"), any(), any(), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(deletedOrder), pageable, 1));

        Page<HistoryResponse> result = service.findHistory(
                "1234567890", LocalDateTime.MIN, LocalDateTime.MAX, pageable, "P-001");

        assertThat(result.getContent()).singleElement().extracting(HistoryResponse::isDeleted)
                .isEqualTo(true);
        verify(orderRepository, never()).findAllByPartnerCodeAndBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                any(), any(), any(), any(), any());
    }

    @Test
    void partnerScopedHistory_matchesBizNoFormattingAndLegacyCodeWithoutReturningOtherPartner() {
        Pageable pageable = PageRequest.of(0, 20);
        when(partnerSelfScopeGuard.partnerScopeOrNull("2118712345")).thenReturn("2118712345");
        PartnerOrder deletedOrder = order("2026/08/16-3", true, BigDecimal.TEN);
        when(orderRepository.findAllHistoryIncludingDeletedByNormalizedBizCodeAndConfirmedEventOrderByEffectiveDateDesc(
                eq("2118712345"), any(), any(), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(deletedOrder), pageable, 1));

        Page<HistoryResponse> result = service.findHistory(
                "211-87-12345", LocalDateTime.MIN, LocalDateTime.MAX, pageable, "2118712345");

        assertThat(result.getContent()).singleElement().extracting(HistoryResponse::isDeleted)
                .isEqualTo(true);
        verify(orderRepository, never()).findAllHistoryIncludingDeletedByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                any(), any(), any(), any());
    }

    @Test
    void historyResponse_exposesTheFieldsConsumedByBothHistoryScreens() {
        PartnerOrder order = order("2026/08/16-4", true, BigDecimal.TEN);
        when(order.getDeliveryAddress()).thenReturn("서울시 중구");
        when(order.getMemo()).thenReturn("배송 메모");
        when(order.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 8, 15, 9, 0));

        HistoryResponse response = HistoryResponse.from(order);

        assertThat(response.outDate()).isEqualTo(order.getConfirmedAt());
        assertThat(response.orderDate()).isEqualTo(order.getCreatedAt());
        assertThat(response.addr()).isEqualTo("서울시 중구");
        assertThat(response.note()).isEqualTo("배송 메모");
        assertThat(response.isDeleted()).isTrue();
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
