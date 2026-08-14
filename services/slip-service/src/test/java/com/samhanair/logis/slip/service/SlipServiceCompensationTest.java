package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.SourceOperationContext;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * SlipService 원격 재고 보상 실패 감사 단위 테스트.
 */
@ExtendWith(MockitoExtension.class)
class SlipServiceCompensationTest {

    @Mock private SlipRepository slipRepository;
    @Mock private SlipNumberService slipNumberService;
    @Mock private ProductClient productClient;
    @Mock private InventoryClient inventoryClient;
    @Mock private SlipAuditLogService auditLogService;
    @Mock private SlipEditRequestService editRequestService;
    @Mock private PartnerInternalClient partnerInternalClient;
    @Mock private UserInternalClient userInternalClient;
    @Mock private WarehouseInternalClient warehouseInternalClient;
    @Mock private SlipRevisionService slipRevisionService;
    @Mock private SlipRealtimeBroker broker;
    @Mock private CompensationAuditWriter compensationAuditWriter;
    @Mock private com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService priceMemoryService;
    @Mock private com.samhanair.logis.slip.service.closing.SlipClosedDateGuard closedDateGuard;

    @InjectMocks private SlipService service;

    private UUID serialProductId;
    private UUID batchProductId;
    private UUID sourceWarehouseId;
    private UUID destinationWarehouseId;
    private UUID partnerId;
    private UUID slipId;

    @BeforeEach
    void setUp() {
        serialProductId = UUID.randomUUID();
        batchProductId = UUID.randomUUID();
        sourceWarehouseId = UUID.randomUUID();
        destinationWarehouseId = UUID.randomUUID();
        partnerId = UUID.randomUUID();
        slipId = UUID.randomUUID();

        lenient().when(warehouseInternalClient.findWarehouseName(any())).thenReturn(Optional.empty());
    }

    @Test
    void accept_secondReserveFailsAndFirstReleaseFails_recordsAuditAndKeepsOriginalSuppressed() {
        Slip slip = preparedOutboundMixed(SlipStatus.SENT);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(serialProductId)).thenReturn(product(serialProductId,
                "AC-SERIAL-COMP", true));
        when(productClient.requireExists(batchProductId)).thenReturn(product(batchProductId,
                "PIPE-BATCH-COMP", false));
        BusinessException original = new BusinessException(ErrorCode.CONFLICT, "batch reserve 실패");
        BusinessException compensationFailure = new BusinessException(ErrorCode.INTERNAL_ERROR, "release 실패");
        org.mockito.Mockito.doThrow(original)
                .when(inventoryClient).reserve(eq(batchProductId), eq(sourceWarehouseId),
                        eq(4), anyString(), eq(slipId));
        org.mockito.Mockito.doThrow(compensationFailure)
                .when(inventoryClient).releaseInstances(eq(slip.getSlipNo()), eq("AC-SERIAL-COMP"));

        Throwable thrown = catchThrowable(() -> service.accept(slipId, "warehouse-1"));

        assertThat(thrown).isSameAs(original);
        assertThat(thrown.getSuppressed()).containsExactly(compensationFailure);
        verify(compensationAuditWriter, times(1)).record(eq(slip), eq(CompensationPhase.ACCEPT_RESERVE),
                eq("AC-SERIAL-COMP"), eq(CompensationOperation.RELEASE_INSTANCES),
                same(compensationFailure), same(original));
    }

    @Test
    void accept_allCompensationsSucceed_doesNotRecordAudit() {
        Slip slip = preparedOutboundMixed(SlipStatus.SENT);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(serialProductId)).thenReturn(product(serialProductId,
                "AC-SERIAL-COMP", true));
        when(productClient.requireExists(batchProductId)).thenReturn(product(batchProductId,
                "PIPE-BATCH-COMP", false));
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.CONFLICT, "batch reserve 실패"))
                .when(inventoryClient).reserve(eq(batchProductId), eq(sourceWarehouseId),
                        eq(4), anyString(), eq(slipId));

        Throwable thrown = catchThrowable(() -> service.accept(slipId, "warehouse-1"));

        assertThat(thrown).isInstanceOf(BusinessException.class);
        assertThat(thrown.getSuppressed()).isEmpty();
        verifyNoInteractions(compensationAuditWriter);
        verify(inventoryClient, times(1)).releaseInstances(eq(slip.getSlipNo()), eq("AC-SERIAL-COMP"));
    }

    @Test
    void accept_successPath_doesNotRecordAudit() {
        Slip slip = preparedOutboundMixed(SlipStatus.SENT);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(serialProductId)).thenReturn(product(serialProductId,
                "AC-SERIAL-COMP", true));
        when(productClient.requireExists(batchProductId)).thenReturn(product(batchProductId,
                "PIPE-BATCH-COMP", false));

        service.accept(slipId, "warehouse-1");

        verifyNoInteractions(compensationAuditWriter);
        verify(inventoryClient, never()).releaseInstances(anyString(), anyString());
    }

    @Test
    void completeRecallInbound_batchInboundFailsAndUnrecallFails_recordsAuditAndKeepsOriginalSuppressed() {
        Slip slip = preparedRecallMixed(SlipStatus.PROCESSING);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(serialProductId)).thenReturn(product(serialProductId,
                "AC-RECALL-COMP", true));
        when(productClient.requireExists(batchProductId)).thenReturn(product(batchProductId,
                "PIPE-RECALL-COMP", false));
        BusinessException original = new BusinessException(ErrorCode.CONFLICT, "batch inbound 실패");
        BusinessException compensationFailure = new BusinessException(ErrorCode.INTERNAL_ERROR, "unrecall 실패");
        org.mockito.Mockito.doThrow(original)
                .when(inventoryClient).inbound(eq(batchProductId), eq(destinationWarehouseId),
                        eq(5), eq("2026/06/03-1"), eq(new BigDecimal("10000.00")),
                        any(SourceOperationContext.class));
        org.mockito.Mockito.doThrow(compensationFailure)
                .when(inventoryClient).unrecallInstances(eq("2026/06/03-1"), eq("AC-RECALL-COMP"));

        Throwable thrown = catchThrowable(() -> service.complete(slipId));

        assertThat(thrown).isSameAs(original);
        assertThat(thrown.getSuppressed()).containsExactly(compensationFailure);
        verify(compensationAuditWriter, times(1)).record(eq(slip), eq(CompensationPhase.COMPLETE_RECALL),
                eq("AC-RECALL-COMP"), eq(CompensationOperation.UNRECALL_INSTANCES),
                same(compensationFailure), same(original));
    }

    private ProductSummary product(UUID productId, String productCode, boolean serialManaged) {
        return new ProductSummary(productId, "테스트 품목", "MODEL", productCode, UUID.randomUUID(),
                new BigDecimal("500000.00"), "ACTIVE", serialManaged);
    }

    private Slip preparedOutboundMixed(SlipStatus status) {
        Slip slip = Slip.createOutbound("2026/06/03-1", LocalDate.of(2026, 6, 3), 1,
                sourceWarehouseId, destinationWarehouseId, partnerId, "삼한공조", DeliveryTag.SALE, null, "u");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.create(slip, serialProductId, "에어컨", "MODEL-SERIAL", null,
                2, new BigDecimal("500000.00"), null));
        slip.addLine(SlipLine.create(slip, batchProductId, "배관", "PIPE-BATCH", null,
                4, new BigDecimal("10000.00"), null));
        ReflectionTestUtils.setField(slip, "status", status);
        return slip;
    }

    private Slip preparedRecallMixed(SlipStatus status) {
        Slip slip = Slip.createInbound("2026/06/03-1", LocalDate.of(2026, 6, 3), 1,
                destinationWarehouseId, partnerId, "삼한공조", DeliveryTag.RETURN, null, "u");
        slip.setPartnerCode("P-RECALL-COMP");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.create(slip, serialProductId, "에어컨", "MODEL-SERIAL", null,
                2, new BigDecimal("500000.00"), null));
        slip.addLine(SlipLine.create(slip, batchProductId, "배관", "PIPE-BATCH", null,
                5, new BigDecimal("10000.00"), null));
        ReflectionTestUtils.setField(slip, "status", status);
        return slip;
    }
}
