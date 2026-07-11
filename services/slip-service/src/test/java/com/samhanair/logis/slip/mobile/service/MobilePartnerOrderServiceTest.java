package com.samhanair.logis.slip.mobile.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.mobile.dto.MobilePartnerOrderRequest;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipNumberService;
import com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** MobilePartnerOrderService — 모바일 주문 발행 도메인 가드 회귀 검증. */
@ExtendWith(MockitoExtension.class)
class MobilePartnerOrderServiceTest {

    @Mock private SlipRepository slipRepository;
    @Mock private SlipNumberService slipNumberService;
    @Mock private ProductClient productClient;
    @Mock private PartnerInternalClient partnerInternalClient;
    @Mock private OutboundCutoffGuard cutoffGuard;
    @Mock private Clock clock;

    @InjectMocks private MobilePartnerOrderService service;

    private UUID partnerId;
    private UUID productId;

    @BeforeEach
    void setUp() {
        partnerId = UUID.randomUUID();
        productId = UUID.randomUUID();
    }

    @Test
    void createOrder_nullSourceWarehouse_throwsCleanDomainMessage() {
        when(partnerInternalClient.verifyPartnerCode("P-001"))
                .thenReturn(PartnerInternalClient.PartnerVerifyResult.found(Optional.of(partnerId)));
        when(productClient.lookup(List.of(productId))).thenReturn(List.of(
                new ProductSummary(productId, "에어컨", "AC-1", UUID.randomUUID(),
                        new BigDecimal("1000.00"), "ACTIVE")));
        when(slipNumberService.next(LocalDate.of(2026, 7, 11), SlipType.OUTBOUND))
                .thenReturn("2026/07/11-1");
        when(slipNumberService.extractSeqNo("2026/07/11-1")).thenReturn(1);

        MobilePartnerOrderRequest request = new MobilePartnerOrderRequest(
                "P-001",
                LocalDate.of(2026, 7, 11),
                null,
                "서울시 중구",
                "010-0000-0000",
                "현장 주문",
                List.of(new MobilePartnerOrderRequest.MobileOrderLineRequest(
                        productId,
                        "에어컨",
                        "AC-1",
                        "EA",
                        1,
                        BigDecimal.ZERO,
                        null)));

        assertThatThrownBy(() -> service.createOrder(request, "sales-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("출고 창고")
                .hasMessageNotContaining("sourceWarehouseId");

        verify(cutoffGuard, never()).assertWithinCutoff(any(), any());
        verify(slipRepository, never()).save(any(Slip.class));
    }
}
