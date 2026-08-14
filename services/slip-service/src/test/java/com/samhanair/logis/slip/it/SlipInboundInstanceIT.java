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
import com.samhanair.logis.slip.client.SourceOperationContext;
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
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * S2 입고 전표 complete() 인스턴스 분기 통합 테스트.
 *
 * <p>DB에는 실제 Slip 을 저장하고 ProductClient/InventoryClient 는 {@code @MockBean} 으로 격리한다.
 * inventory 실패 케이스는 service 트랜잭션 롤백으로 DB 상태가 PROCESSING 에 남는지 확인한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class SlipInboundInstanceIT extends AbstractPostgresIT {

    private static final String TEST_SLIP_NO_PREFIX = "2026/06/01-9";
    private static final String CLEANUP_USER = "SlipInboundInstanceIT";
    private static final AtomicInteger SLIP_NO_SEQUENCE = new AtomicInteger(9000);

    @Autowired
    private SlipService slipService;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @MockBean
    private com.samhanair.logis.slip.client.PartnerInternalClient partnerInternalClient;

    private UUID destinationWarehouseId;
    private UUID partnerId;

    /**
     * 외부 client fail-soft/격리 stub 및 공통 UUID 픽스처 설정.
     */
    @BeforeEach
    void setUp() {
        cleanupTestSlips();
        destinationWarehouseId = UUID.randomUUID();
        partnerId = UUID.randomUUID();
        lenient().when(userInternalClient.resolveFullName(any())).thenReturn(Optional.of("담당자"));
        lenient().when(warehouseInternalClient.findWarehouseName(any())).thenReturn(Optional.of("입고창고"));
        lenient().when(partnerInternalClient.resolveBusinessNumber(any())).thenReturn(Optional.empty());
    }

    @ParameterizedTest(name = "{0} 입고 태그의 QR/기존 인스턴스 경로가 정합하다")
    @EnumSource(value = DeliveryTag.class, names = {
            "PURCHASE", "BORROW", "RENTAL_RETURN", "RETURN",
            "DELIVERY_RETURN", "RETURN_TRIP", "REENTRY"
    })
    @DisplayName("입고 배송태그 7종은 QR 생성 여부에 따라 독립적으로 라우팅된다")
    void complete_allInboundTags_routesAccordingToQrPolicy(DeliveryTag deliveryTag) {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(deliveryTag, line(productId, "serial", "MODEL-ALL-TAGS", 1,
                new BigDecimal("500000.00")));
        if (RECALL_INBOUND_TAGS.contains(deliveryTag)) {
            slip.setPartnerCode("P-ALL-TAGS-" + deliveryTag.name());
            slipRepository.saveAndFlush(slip);
        }
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));

        slipService.complete(slip.getId());

        if (NEW_QR_INBOUND_TAGS.contains(deliveryTag)) {
            verify(inventoryClient).inboundInstances(eq(productId), eq("AC-S2"),
                    eq(destinationWarehouseId), eq(1), eq(deliveryTag.name()), eq(slip.getSlipNo()),
                    eq(new BigDecimal("500000.00")), any(SourceOperationContext.class));
            verify(inventoryClient, never()).recallInstances(anyString(), anyString(), anyInt(), anyString());
        } else {
            verify(inventoryClient).recallInstances(eq("P-ALL-TAGS-" + deliveryTag.name()),
                    eq("AC-S2"), eq(1), eq(slip.getSlipNo()));
            verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                    anyString(), anyString(), any(BigDecimal.class), any(SourceOperationContext.class));
        }
    }

    private static final Set<DeliveryTag> NEW_QR_INBOUND_TAGS = Set.of(
            DeliveryTag.PURCHASE, DeliveryTag.BORROW, DeliveryTag.RENTAL_RETURN);
    private static final Set<DeliveryTag> RECALL_INBOUND_TAGS = Set.of(
            DeliveryTag.RETURN, DeliveryTag.DELIVERY_RETURN,
            DeliveryTag.RETURN_TRIP, DeliveryTag.REENTRY);

    @AfterEach
    void tearDown() {
        cleanupTestSlips();
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
                eq(destinationWarehouseId), eq(2), eq("PURCHASE"), eq(slip.getSlipNo()),
                eq(new BigDecimal("500000.00")), any(SourceOperationContext.class));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class),
                any(SourceOperationContext.class));
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
                eq(slip.getSlipNo()), any(UUID.class), eq(new BigDecimal("10000.00")),
                any(SourceOperationContext.class));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class), any(SourceOperationContext.class));
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
                eq(destinationWarehouseId), eq(2), eq("PURCHASE"), eq(slip.getSlipNo()),
                eq(new BigDecimal("500000.00")), any(SourceOperationContext.class));
        verify(inventoryClient, times(1)).inbound(eq(batchProductId), eq(destinationWarehouseId),
                eq(5), eq(slip.getSlipNo()), any(UUID.class), eq(new BigDecimal("10000.00")),
                any(SourceOperationContext.class));
    }

    @Test
    @DisplayName("BORROW 입고 태그는 enum name 안정 키로 파생한다")
    void complete_borrowTag_usesBorrowInboundType() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(DeliveryTag.BORROW, line(productId, "에어컨", "MODEL-BORROW", 1,
                new BigDecimal("500000.00")));
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));

        slipService.complete(slip.getId());

        verify(inventoryClient).inboundInstances(eq(productId), eq("AC-S2"),
                eq(destinationWarehouseId), eq(1), eq("BORROW"), eq(slip.getSlipNo()),
                eq(new BigDecimal("500000.00")), any(SourceOperationContext.class));
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
                eq(slip.getSlipNo()), any(UUID.class), eq(new BigDecimal("10000.00")),
                any(SourceOperationContext.class));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class), any(SourceOperationContext.class));
    }

    @Test
    @DisplayName("RETURN_TRIP 태그 serial 라인은 recallInstances 를 호출한다")
    void complete_returnTripTag_serialLine_callsRecallInstances() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(DeliveryTag.RETURN_TRIP, line(productId, "에어컨",
                "MODEL-RETURN-TRIP", 1, new BigDecimal("500000.00")));
        slip.setPartnerCode("P-S4-IT-001");
        slipRepository.saveAndFlush(slip);
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));

        slipService.complete(slip.getId());

        verify(inventoryClient).recallInstances(eq("P-S4-IT-001"), eq("AC-S2"),
                eq(1), eq(slip.getSlipNo()));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class), any(SourceOperationContext.class));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class),
                any(SourceOperationContext.class));
    }

    @Test
    @DisplayName("RETURN 태그 serial 라인도 recallInstances 를 호출한다")
    void complete_returnTag_serialLine_callsRecallInstances() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(DeliveryTag.RETURN, line(productId, "에어컨",
                "MODEL-RETURN", 1, new BigDecimal("500000.00")));
        slip.setPartnerCode("P-S4-IT-003");
        slipRepository.saveAndFlush(slip);
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));

        slipService.complete(slip.getId());

        verify(inventoryClient).recallInstances(eq("P-S4-IT-003"), eq("AC-S2"),
                eq(1), eq(slip.getSlipNo()));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class), any(SourceOperationContext.class));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class),
                any(SourceOperationContext.class));
    }

    @Test
    @DisplayName("RETURN serial 회수 실패 시 complete 트랜잭션은 롤백되어 상태가 PROCESSING 에 남는다")
    void complete_returnSerialRecallFailure_rollsBackSlipStatus() {
        UUID productId = UUID.randomUUID();
        Slip slip = saveInboundSlip(DeliveryTag.RETURN, line(productId, "에어컨", "MODEL-RETURN", 1,
                new BigDecimal("500000.00")));
        slip.setPartnerCode("P-S4-IT-002");
        slipRepository.saveAndFlush(slip);
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));
        doThrow(new BusinessException(ErrorCode.CONFLICT, "회수 대상 부족"))
                .when(inventoryClient).recallInstances(eq("P-S4-IT-002"), eq("AC-S2"),
                        eq(1), eq(slip.getSlipNo()));

        assertThatThrownBy(() -> slipService.complete(slip.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("회수 대상 부족");

        Slip reloaded = slipRepository.findById(slip.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(SlipStatus.PROCESSING);
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class),
                any(SourceOperationContext.class));
        verify(inventoryClient, never()).unrecallInstances(anyString(), anyString());
    }

    @Test
    @DisplayName("RETURN 혼합전표에서 serial 회수 후 batch 입고 실패 시 unrecall 보상 및 complete 롤백")
    void complete_returnMixedBatchFailure_unrecallsSerialAndRollsBackSlipStatus() {
        UUID serialProductId = UUID.randomUUID();
        UUID batchProductId = UUID.randomUUID();
        Slip slip = saveInboundSlip(DeliveryTag.RETURN,
                line(serialProductId, "에어컨", "MODEL-RETURN-SERIAL", 2, new BigDecimal("500000.00")),
                line(batchProductId, "배관", "PIPE-BATCH", 5, new BigDecimal("10000.00")));
        slip.setPartnerCode("P-S4-IT-004");
        slipRepository.saveAndFlush(slip);
        when(productClient.requireExists(serialProductId)).thenReturn(product(serialProductId, true));
        when(productClient.requireExists(batchProductId)).thenReturn(product(batchProductId, false));
        doThrow(new BusinessException(ErrorCode.CONFLICT, "batch inbound 실패"))
                .when(inventoryClient).inbound(eq(batchProductId), eq(destinationWarehouseId), eq(5),
                        eq(slip.getSlipNo()), any(UUID.class), eq(new BigDecimal("10000.00")),
                        any(SourceOperationContext.class));

        assertThatThrownBy(() -> slipService.complete(slip.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("batch inbound 실패");

        org.mockito.InOrder inOrder = org.mockito.Mockito.inOrder(inventoryClient);
        inOrder.verify(inventoryClient).recallInstances(eq("P-S4-IT-004"), eq("AC-S2"),
                eq(2), eq(slip.getSlipNo()));
        inOrder.verify(inventoryClient).inbound(eq(batchProductId), eq(destinationWarehouseId), eq(5),
                eq(slip.getSlipNo()), any(UUID.class), eq(new BigDecimal("10000.00")),
                any(SourceOperationContext.class));
        inOrder.verify(inventoryClient).unrecallInstances(eq(slip.getSlipNo()), eq("AC-S2"));

        Slip reloaded = slipRepository.findById(slip.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(SlipStatus.PROCESSING);
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
                        eq(1), eq("PURCHASE"), eq(slip.getSlipNo()), eq(new BigDecimal("500000.00")),
                        any(SourceOperationContext.class));

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
        int seqNo = SLIP_NO_SEQUENCE.incrementAndGet();
        Slip slip = Slip.createInbound("2026/06/01-" + seqNo, LocalDate.of(2026, 6, 1),
                seqNo, destinationWarehouseId, partnerId, "테스트 거래처", deliveryTag, null, "u");
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

    private void cleanupTestSlips() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.executeWithoutResult(status -> {
            String slipNoPattern = TEST_SLIP_NO_PREFIX + "%";
            jdbcTemplate.update("""
                    UPDATE slip_lines
                       SET is_deleted = true,
                           deleted_at = CURRENT_TIMESTAMP,
                           deleted_by = ?
                     WHERE is_deleted = false
                       AND slip_id IN (
                           SELECT id FROM slips WHERE slip_no LIKE ?
                       )
                    """, CLEANUP_USER, slipNoPattern);
            jdbcTemplate.update("""
                    UPDATE slips
                       SET is_deleted = true,
                           deleted_at = CURRENT_TIMESTAMP,
                           deleted_by = ?
                     WHERE is_deleted = false
                       AND slip_no LIKE ?
                    """, CLEANUP_USER, slipNoPattern);
        });
    }

    private record SlipLineSpec(UUID productId, String productName, String modelName,
                                int quantity, BigDecimal unitPrice) {
    }
}
