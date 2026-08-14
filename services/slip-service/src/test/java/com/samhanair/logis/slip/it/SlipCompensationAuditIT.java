package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.SlipService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 보상 실패 감사가 원본 slip 트랜잭션 롤백과 독립 커밋되는지 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class SlipCompensationAuditIT extends AbstractPostgresIT {

    private static final String TEST_SLIP_NO_PREFIX = "2026/06/03-COMP-";
    private static final String CLEANUP_USER = "SlipCompensationAuditIT";
    private static final AtomicInteger SLIP_NO_SEQUENCE = new AtomicInteger(1);

    @Autowired
    private SlipService slipService;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private SerialCompensationFailureRepository failureRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    // 보상 감사 흐름이 CompensationAlertNotifier 를 통해 NotificationClient 에 (전이적으로) 의존하므로
    // 외부 client 격리 규칙에 따라 명시적으로 mock 한다(alert 기본 비활성과 무관하게 컨텍스트 결합 제거).
    @MockBean
    private NotificationClient notificationClient;

    private UUID serialProductId;
    private UUID batchProductId;
    private UUID sourceWarehouseId;
    private UUID destinationWarehouseId;
    private UUID partnerId;

    @BeforeEach
    void setUp() {
        cleanup();
        serialProductId = UUID.randomUUID();
        batchProductId = UUID.randomUUID();
        sourceWarehouseId = UUID.randomUUID();
        destinationWarehouseId = UUID.randomUUID();
        partnerId = UUID.randomUUID();

        lenient().when(userInternalClient.resolveFullName(any())).thenReturn(Optional.of("담당자"));
        lenient().when(warehouseInternalClient.findWarehouseName(any())).thenReturn(Optional.empty());
        lenient().when(partnerInternalClient.resolveBusinessNumber(any())).thenReturn(Optional.empty());
        when(productClient.requireExists(serialProductId)).thenReturn(product(serialProductId,
                "AC-COMP-IT", true));
        when(productClient.requireExists(batchProductId)).thenReturn(product(batchProductId,
                "PIPE-COMP-IT", false));
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void accept_compensationFailure_commitsAuditEvenWhenSlipRollback() {
        Slip slip = saveSentOutboundSlip();
        BusinessException original = new BusinessException(ErrorCode.CONFLICT, "batch reserve 실패");
        BusinessException compensationFailure = new BusinessException(ErrorCode.INTERNAL_ERROR, "release 실패");
        doThrow(original)
                .when(inventoryClient).reserve(eq(batchProductId), eq(sourceWarehouseId),
                        eq(4), anyString(), eq(slip.getId()));
        doThrow(compensationFailure)
                .when(inventoryClient).releaseInstances(eq(slip.getSlipNo()), eq("AC-COMP-IT"));

        assertThatThrownBy(() -> slipService.accept(slip.getId(), "warehouse-1"))
                .isSameAs(original)
                .satisfies(ex -> assertThat(ex.getSuppressed()).containsExactly(compensationFailure));

        Slip reloaded = slipRepository.findById(slip.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(SlipStatus.SENT);
        assertThat(failureRepository.findAll()).hasSize(1);
        SerialCompensationFailure failure = failureRepository.findAll().get(0);
        assertThat(failure.getSlipId()).isEqualTo(slip.getId());
        assertThat(failure.getSlipNo()).isEqualTo(slip.getSlipNo());
        assertThat(failure.getPhase()).isEqualTo(CompensationPhase.ACCEPT_RESERVE);
        assertThat(failure.getProductCode()).isEqualTo("AC-COMP-IT");
        assertThat(failure.getAttemptedOperation()).isEqualTo(CompensationOperation.RELEASE_INSTANCES);
        assertThat(failure.getFailureReason()).isEqualTo("BusinessException: release 실패");
        assertThat(failure.getOriginalFailureReason()).isEqualTo("BusinessException: batch reserve 실패");
        assertThat(failure.isResolved()).isFalse();
        assertThat(failure.getCreatedAt()).isNotNull();
        assertThat(failure.getOccurredAt()).isNotNull();

        // REQUIRES_NEW 물리 커밋 독립성을 raw JDBC 로 직접 증명한다 — JPA 1차 캐시/@SQLRestriction 개입
        // 없이, 원본 slip 트랜잭션 롤백에도 audit 행이 DB 에 실제 잔존함을 확인한다.
        Integer committedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM serial_compensation_failures WHERE slip_id = ? AND is_deleted = false",
                Integer.class, slip.getId());
        assertThat(committedCount).isEqualTo(1);
    }

    private ProductSummary product(UUID productId, String productCode, boolean serialManaged) {
        return new ProductSummary(productId, "테스트 품목", "MODEL", productCode, UUID.randomUUID(),
                new BigDecimal("500000.00"), "ACTIVE", serialManaged);
    }

    private Slip saveSentOutboundSlip() {
        int seqNo = SLIP_NO_SEQUENCE.getAndIncrement();
        Slip slip = Slip.createOutbound(TEST_SLIP_NO_PREFIX + seqNo,
                LocalDate.of(2026, 6, 3), seqNo,
                sourceWarehouseId, destinationWarehouseId, partnerId, "삼한공조",
                DeliveryTag.SALE, null, "u");
        slip.addLine(SlipLine.create(slip, serialProductId, "에어컨", "MODEL-SERIAL", null,
                2, new BigDecimal("500000.00"), null));
        slip.addLine(SlipLine.create(slip, batchProductId, "배관", "PIPE-BATCH", null,
                4, new BigDecimal("10000.00"), null));
        ReflectionTestUtils.setField(slip, "status", SlipStatus.SENT);
        return slipRepository.saveAndFlush(slip);
    }

    private void cleanup() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.executeWithoutResult(status -> {
            jdbcTemplate.update("""
                    UPDATE serial_compensation_failures
                       SET is_deleted = true,
                           deleted_at = CURRENT_TIMESTAMP,
                           deleted_by = ?
                     WHERE is_deleted = false
                       AND slip_no LIKE ?
                    """, CLEANUP_USER, TEST_SLIP_NO_PREFIX + "%");
            jdbcTemplate.update("""
                    UPDATE slip_lines
                       SET is_deleted = true,
                           deleted_at = CURRENT_TIMESTAMP,
                           deleted_by = ?
                     WHERE is_deleted = false
                       AND slip_id IN (
                           SELECT id FROM slips WHERE slip_no LIKE ?
                       )
                    """, CLEANUP_USER, TEST_SLIP_NO_PREFIX + "%");
            jdbcTemplate.update("""
                    UPDATE slips
                       SET is_deleted = true,
                           deleted_at = CURRENT_TIMESTAMP,
                           deleted_by = ?
                     WHERE is_deleted = false
                       AND slip_no LIKE ?
                    """, CLEANUP_USER, TEST_SLIP_NO_PREFIX + "%");
        });
    }
}
