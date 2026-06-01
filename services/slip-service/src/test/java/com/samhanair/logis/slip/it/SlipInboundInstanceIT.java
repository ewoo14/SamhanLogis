package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * S2 입고 전표 complete() 인스턴스 분기 통합 테스트.
 *
 * <p>DB에는 실제 Slip 을 저장하고 ProductClient/InventoryClient 는 {@code @MockBean} 으로 격리한다.
 * inventory 실패 케이스는 service 트랜잭션 롤백으로 DB 상태가 PROCESSING 에 남는지 확인한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class SlipInboundInstanceIT extends AbstractPostgresIT {

    @Autowired
    private SlipService slipService;

    @Autowired
    private SlipRepository slipRepository;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    private UUID destinationWarehouseId;
    private UUID partnerId;

    /**
     * 외부 client fail-soft/격리 stub 및 공통 UUID 픽스처 설정.
     */
    @BeforeEach
    void setUp() {
        destinationWarehouseId = UUID.randomUUID();
        partnerId = UUID.randomUUID();
        lenient().when(userInternalClient.resolveFullName(any())).thenReturn(Optional.of("담당자"));
        lenient().when(warehouseInternalClient.findWarehouseName(any())).thenReturn(Optional.of("입고창고"));
    }

    @Test
    @DisplayName("serial 라인은 inboundInstances 를 호출하고 기존 inbound 는 호출하지 않는다")
    void complete_serialLine_callsInboundInstances() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(null, line(productId, "에어컨", "MODEL-SERIAL", 2,
                new BigDecimal("500000.00")));
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));

        slipService.complete(slip.getId());

        verify(inventoryClient).inboundInstances(eq(productId), eq("AC-S2"),
                eq(destinationWarehouseId), eq(2), eq("구매"), eq(slip.getSlipNo()),
                eq(new BigDecimal("500000.00")));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    @DisplayName("batch 라인은 기존 inbound lot 경로를 유지한다")
    void complete_batchLine_callsLotInbound() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(null, line(productId, "배관", "PIPE-BATCH", 5,
                new BigDecimal("10000.00")));
        when(productClient.requireExists(productId)).thenReturn(product(productId, false));

        slipService.complete(slip.getId());

        verify(inventoryClient).inbound(eq(productId), eq(destinationWarehouseId), eq(5),
                eq(slip.getSlipNo()), eq(new BigDecimal("10000.00")));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
    }

    @Test
    @DisplayName("혼합 전표는 serial/batch 라인을 각각 한 번씩 분기한다")
    void complete_mixedLines_routesEachLine() {
        UUID serialProductId = UUID.randomUUID();
        UUID batchProductId = UUID.randomUUID();
        Slip slip = saveInboundSlip(null,
                line(serialProductId, "에어컨", "MODEL-SERIAL", 2, new BigDecimal("500000.00")),
                line(batchProductId, "배관", "PIPE-BATCH", 5, new BigDecimal("10000.00")));
        when(productClient.requireExists(serialProductId)).thenReturn(product(serialProductId, true));
        when(productClient.requireExists(batchProductId)).thenReturn(product(batchProductId, false));

        slipService.complete(slip.getId());

        verify(inventoryClient, times(1)).inboundInstances(eq(serialProductId), eq("AC-S2"),
                eq(destinationWarehouseId), eq(2), eq("구매"), eq(slip.getSlipNo()),
                eq(new BigDecimal("500000.00")));
        verify(inventoryClient, times(1)).inbound(eq(batchProductId), eq(destinationWarehouseId),
                eq(5), eq(slip.getSlipNo()), eq(new BigDecimal("10000.00")));
    }

    @Test
    @DisplayName("BORROW 입고 태그는 inboundType=차용으로 파생한다")
    void complete_borrowTag_usesBorrowInboundType() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(DeliveryTag.BORROW, line(productId, "에어컨", "MODEL-BORROW", 1,
                new BigDecimal("500000.00")));
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));

        slipService.complete(slip.getId());

        verify(inventoryClient).inboundInstances(eq(productId), eq("AC-S2"),
                eq(destinationWarehouseId), eq(1), eq("차용"), eq(slip.getSlipNo()),
                eq(new BigDecimal("500000.00")));
    }

    @Test
    @DisplayName("RETURN 태그라도 batch 라인은 기존 inbound lot 경로를 유지한다")
    void complete_returnTag_batchLine_callsLotInbound() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(DeliveryTag.RETURN, line(productId, "배관", "PIPE-BATCH", 3,
                new BigDecimal("10000.00")));
        when(productClient.requireExists(productId)).thenReturn(product(productId, false));

        slipService.complete(slip.getId());

        verify(inventoryClient).inbound(eq(productId), eq(destinationWarehouseId), eq(3),
                eq(slip.getSlipNo()), eq(new BigDecimal("10000.00")));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
    }

    @Test
    @DisplayName("RETURN_TRIP 태그 serial 라인은 S4 범위라 CONFLICT")
    void complete_returnTripTag_serialLine_throwsConflict() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(DeliveryTag.RETURN_TRIP, line(productId, "에어컨",
                "MODEL-RETURN-TRIP", 1, new BigDecimal("500000.00")));
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));

        assertThatThrownBy(() -> slipService.complete(slip.getId()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    @DisplayName("inventory 실패 시 complete 트랜잭션은 롤백되어 상태가 PROCESSING 에 남는다")
    void complete_inventoryFailure_rollsBackSlipStatus() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(null, line(productId, "에어컨", "MODEL-SERIAL", 1,
                new BigDecimal("500000.00")));
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));
        doThrow(new BusinessException(ErrorCode.INTERNAL_ERROR, "inventory 실패"))
                .when(inventoryClient)
                .inboundInstances(eq(productId), eq("AC-S2"), eq(destinationWarehouseId),
                        eq(1), eq("구매"), eq(slip.getSlipNo()), eq(new BigDecimal("500000.00")));

        assertThatThrownBy(() -> slipService.complete(slip.getId()))
                .isInstanceOf(BusinessException.class);

        Slip reloaded = slipRepository.findById(slip.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(SlipStatus.PROCESSING);
    }

    private ProductSummary product(UUID productId, boolean serialManaged) {
        return new ProductSummary(productId, "테스트 품목", "MODEL", "AC-S2", UUID.randomUUID(),
                new BigDecimal("500000.00"), "ACTIVE", serialManaged);
    }

    private Slip saveInboundSlip(DeliveryTag deliveryTag, SlipLineSpec... lineSpecs) {
        Slip slip = Slip.createInbound("2026/06/01-" + UUID.randomUUID(), LocalDate.of(2026, 6, 1),
                1, destinationWarehouseId, partnerId, "테스트 거래처", deliveryTag, null, "u");
        for (SlipLineSpec spec : lineSpecs) {
            slip.addLine(SlipLine.create(slip, spec.productId(), spec.productName(), spec.modelName(),
                    null, spec.quantity(), spec.unitPrice(), null));
        }
        ReflectionTestUtils.setField(slip, "status", SlipStatus.PROCESSING);
        return slipRepository.saveAndFlush(slip);
    }

    private SlipLineSpec line(UUID productId, String productName, String modelName,
                              int quantity, BigDecimal unitPrice) {
        return new SlipLineSpec(productId, productName, modelName, quantity, unitPrice);
    }

    private record SlipLineSpec(UUID productId, String productName, String modelName,
                                int quantity, BigDecimal unitPrice) {
    }
}
