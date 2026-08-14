package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.domain.InventoryAudit;
import com.samhanair.logis.inventory.domain.InventoryAuditLine;
import com.samhanair.logis.inventory.domain.InventoryAuditNumberSequence;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.InventoryAuditLineRepository;
import com.samhanair.logis.inventory.repository.InventoryAuditNumberSequenceRepository;
import com.samhanair.logis.inventory.repository.InventoryAuditRepository;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.AuditDetailResponse;
import com.samhanair.logis.inventory.web.dto.AuditLineRequest;
import com.samhanair.logis.inventory.web.dto.CreateAuditRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 재고 실사 service 단위 테스트 — 4 시나리오:
 * <ol>
 *   <li>전이 (PLANNED → IN_PROGRESS → COMPLETED)</li>
 *   <li>차이 분개 (양수/음수/0)</li>
 *   <li>바코드 입력 vs 수동 입력</li>
 *   <li>Stock 조정 (balance.adjust + ADJUST movement)</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class InventoryAuditServiceTest {

    @Mock private InventoryAuditRepository auditRepository;
    @Mock private InventoryAuditNumberSequenceRepository auditNumberSequenceRepository;
    @Mock private InventoryAuditLineRepository auditLineRepository;
    @Mock private WarehouseRepository warehouseRepository;
    @Mock private StockBalanceRepository stockBalanceRepository;
    @Mock private StockLotRepository stockLotRepository;
    @Mock private StockMovementRepository stockMovementRepository;
    @Mock private ProductClient productClient;
    @Mock private AccountingClient accountingClient;
    // PR-H4b — shared:realtime-abstraction inject (단위 테스트는 mock 으로 격리, 실 audit 동작 검증은 별도 IT)
    @Mock private com.samhanair.logis.shared.realtime.lock.EditLockGuard editLockGuard;
    @Mock private com.samhanair.logis.inventory.realtime.service.InventoryEditRequestService editRequestService;
    @Mock private com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder auditLogRecorder;

    @InjectMocks
    private InventoryAuditService service;

    private Warehouse warehouse;
    private UUID warehouseId;
    private UUID productId;

    @BeforeEach
    void setUp() {
        warehouse = Warehouse.create("HQ-001", "본사창고", WarehouseType.HEADQUARTERS, null, 1, null);
        warehouseId = UUID.randomUUID();
        productId = UUID.randomUUID();
        ReflectionTestUtils.setField(warehouse, "id", warehouseId);

        lenient().when(warehouseRepository.findById(warehouseId))
                .thenReturn(Optional.of(warehouse));
        lenient().when(auditNumberSequenceRepository.findLockedByAuditDate(any()))
                .thenAnswer(inv -> Optional.of(InventoryAuditNumberSequence.create(inv.getArgument(0))));
        lenient().when(productClient.requireExists(any(UUID.class)))
                .thenAnswer(inv -> new ProductSummary(inv.getArgument(0), "상품", "SKU", "SKU-001",
                        UUID.randomUUID(), BigDecimal.ZERO, "ACTIVE", false, true));
    }

    @Test
    void create_snapshotsAllStockBalancesAsLines() {
        StockBalance balance = newBalance(productId, warehouse, 100);
        when(stockBalanceRepository.findAllByWarehouse_IdAndIsDeletedFalse(eq(warehouseId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(balance)));
        when(productClient.lookup(anyList())).thenReturn(List.of(
                new ProductSummary(productId, "AC", "SHA-001", UUID.randomUUID(),
                        new BigDecimal("100000.00"), "ACTIVE")));
        when(stockLotRepository.findAvailableLotsForFifo(productId, warehouseId)).thenReturn(List.of());
        when(auditRepository.save(any(InventoryAudit.class))).thenAnswer(inv -> {
            InventoryAudit a = inv.getArgument(0);
            ReflectionTestUtils.setField(a, "id", UUID.randomUUID());
            return a;
        });

        AuditDetailResponse response = service.create(
                new CreateAuditRequest(warehouseId, LocalDate.of(2026, 12, 31)),
                "user-1");

        assertThat(response.status()).isEqualTo(AuditStatus.PLANNED);
        assertThat(response.auditNo()).matches("\\d{4}/\\d{2}/\\d{2}-\\d+");
        assertThat(response.lines()).hasSize(1);
        assertThat(response.lines().get(0).expectedQty()).isEqualTo(100);
        assertThat(response.lines().get(0).productName()).isEqualTo("AC");
        assertThat(response.lines().get(0).unitCost()).isEqualByComparingTo("100000.00");
    }

    @Test
    void recordsAuditLineByExistingProductCodeWithLeadingZero() throws Exception {
        InventoryAudit audit = InventoryAudit.create("2026/08/14-3", warehouse,
                LocalDate.of(2026, 8, 12));
        ReflectionTestUtils.setField(audit, "id", UUID.randomUUID());
        audit.start();
        InventoryAuditLine line = InventoryAuditLine.snapshot(audit, productId, "실사 품목", 3,
                BigDecimal.ONE);
        audit.addLine(line);
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));
        UUID resolvedId = productId;
        when(productClient.requireExistsByCode("0000098"))
                .thenReturn(new ProductSummary(resolvedId, "실사 품목", "SKU", "0000098",
                        UUID.randomUUID(), BigDecimal.ONE, "ACTIVE", false, true));

        AuditLineRequest request = new ObjectMapper().readValue(
                "{\"productCode\":\"0000098\",\"actualQty\":4,\"scanned\":true}",
                AuditLineRequest.class);
        service.recordLine(audit.getId(), request);

        assertThat(line.getActualQty()).isEqualTo(4);
        assertThat(line.getDiffQty()).isEqualTo(1);
        verify(productClient).requireExistsByCode("0000098");
    }

    @Test
    void create_excludesNonGoodsBalancesFromAuditSnapshot() {
        StockBalance balance = newBalance(productId, warehouse, 2);
        when(stockBalanceRepository.findAllByWarehouse_IdAndIsDeletedFalse(eq(warehouseId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(balance)));
        when(productClient.lookup(anyList())).thenReturn(List.of(new ProductSummary(
                productId, "운임", "FREIGHT", "FREIGHT-001", UUID.randomUUID(),
                new BigDecimal("100000.00"), "ACTIVE", false, false)));
        when(auditRepository.save(any(InventoryAudit.class))).thenAnswer(inv -> {
            InventoryAudit a = inv.getArgument(0);
            ReflectionTestUtils.setField(a, "id", UUID.randomUUID());
            return a;
        });

        AuditDetailResponse response = service.create(
                new CreateAuditRequest(warehouseId, LocalDate.of(2026, 12, 31)), "user-1");

        assertThat(response.lines()).isEmpty();
    }

    @Test
    void create_acquiresNumberSequenceLockAfterExternalSnapshotLookups() {
        StockBalance balance = newBalance(productId, warehouse, 100);
        when(stockBalanceRepository.findAllByWarehouse_IdAndIsDeletedFalse(eq(warehouseId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(balance)));
        when(productClient.lookup(anyList())).thenReturn(List.of(
                new ProductSummary(productId, "AC", "SHA-001", UUID.randomUUID(),
                        new BigDecimal("100000.00"), "ACTIVE")));
        when(stockLotRepository.findAvailableLotsForFifo(productId, warehouseId)).thenReturn(List.of());
        when(auditRepository.save(any(InventoryAudit.class))).thenAnswer(inv -> {
            InventoryAudit a = inv.getArgument(0);
            ReflectionTestUtils.setField(a, "id", UUID.randomUUID());
            return a;
        });

        service.create(new CreateAuditRequest(warehouseId, LocalDate.of(2026, 12, 31)), "user-1");

        InOrder order = inOrder(productClient, stockLotRepository, auditNumberSequenceRepository, auditRepository);
        order.verify(productClient).lookup(anyList());
        order.verify(stockLotRepository).findAvailableLotsForFifo(productId, warehouseId);
        order.verify(auditNumberSequenceRepository).insertIfAbsent(any(UUID.class), any(LocalDate.class));
        order.verify(auditRepository).save(any(InventoryAudit.class));
    }

    @Test
    void start_transitionsPlannedToInProgress() {
        InventoryAudit audit = freshAudit();
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        service.start(audit.getId());

        assertThat(audit.getStatus()).isEqualTo(AuditStatus.IN_PROGRESS);
        assertThat(audit.getStartedAt()).isNotNull();
    }

    @Test
    void start_fromInProgress_throwsConflict() {
        InventoryAudit audit = freshAudit();
        audit.start(); // already IN_PROGRESS
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        assertThatThrownBy(() -> service.start(audit.getId()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void recordLine_setsActualQtyAndComputesDiff_scannedFlag() {
        InventoryAudit audit = freshAudit();
        InventoryAuditLine line = InventoryAuditLine.snapshot(
                audit, productId, "AC", 10, new BigDecimal("100000.00"));
        audit.addLine(line);
        audit.start();
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        // 바코드 스캔 입력 — actualQty=8, diff=-2
        service.recordLine(audit.getId(), new AuditLineRequest(productId, 8, true));

        assertThat(line.getActualQty()).isEqualTo(8);
        assertThat(line.getDiffQty()).isEqualTo(-2);
        assertThat(line.getDiffAmount()).isEqualByComparingTo("-200000.00");
        assertThat(line.isBarcodeScanned()).isTrue();
        assertThat(line.getScannedAt()).isNotNull();
    }

    @Test
    void recordLine_manualEntry_doesNotMarkBarcodeScanned() {
        InventoryAudit audit = freshAudit();
        InventoryAuditLine line = InventoryAuditLine.snapshot(
                audit, productId, "AC", 10, new BigDecimal("50000.00"));
        audit.addLine(line);
        audit.start();
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        service.recordLine(audit.getId(), new AuditLineRequest(productId, 12, false));

        assertThat(line.getActualQty()).isEqualTo(12);
        assertThat(line.getDiffQty()).isEqualTo(2);
        assertThat(line.getDiffAmount()).isEqualByComparingTo("100000.00");
        assertThat(line.isBarcodeScanned()).isFalse();
        assertThat(line.getScannedAt()).isNull();
    }

    @Test
    void recordLine_unknownProduct_throwsInvalidInput() {
        InventoryAudit audit = freshAudit();
        audit.start();
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        UUID unknown = UUID.randomUUID();
        assertThatThrownBy(() -> service.recordLine(audit.getId(),
                new AuditLineRequest(unknown, 5, false)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void complete_negativeDiff_triggersJournalAndAdjustsStock() {
        InventoryAudit audit = freshAudit();
        InventoryAuditLine line = InventoryAuditLine.snapshot(
                audit, productId, "AC", 100, new BigDecimal("100000.00"));
        audit.addLine(line);
        audit.start();
        line.recordActual(95, false); // diff -5, diffAmount -500000
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        StockBalance balance = newBalance(productId, warehouse, 100);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouseId))
                .thenReturn(Optional.of(balance));

        service.complete(audit.getId(), "actor-1");

        assertThat(audit.getStatus()).isEqualTo(AuditStatus.COMPLETED);
        assertThat(audit.getCompletedAt()).isNotNull();
        assertThat(audit.getTotalDiffAmount()).isEqualByComparingTo("-500000.00");
        // Stock 조정 — balance.adjust(-5) → totalQty 95
        assertThat(balance.getTotalQty()).isEqualTo(95);
        // ADJUST movement 1건 기록
        verify(stockMovementRepository, times(1)).save(any());
        // 차이 분개 trigger — diff -500000 호출
        ArgumentCaptor<BigDecimal> diffCaptor = ArgumentCaptor.forClass(BigDecimal.class);
        verify(accountingClient, times(1))
                .createAuditAdjustmentJournal(eq(audit.getId()), eq(audit.getAuditNo()),
                        eq(audit.getAuditDate()), diffCaptor.capture());
        assertThat(diffCaptor.getValue()).isEqualByComparingTo("-500000.00");
    }

    @Test
    void complete_nonGoodsDiff_doesNotAdjustStockOrCreateMovement() {
        InventoryAudit audit = freshAudit();
        InventoryAuditLine line = InventoryAuditLine.snapshot(
                audit, productId, "운임", 2, new BigDecimal("100000.00"));
        audit.addLine(line);
        audit.start();
        line.recordActual(1, false); // diff -1
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));
        when(productClient.requireExists(productId)).thenReturn(new ProductSummary(
                productId, "운임", "FREIGHT", "FREIGHT-001", UUID.randomUUID(),
                new BigDecimal("100000.00"), "ACTIVE", false, false));

        StockBalance balance = newBalance(productId, warehouse, 2);

        service.complete(audit.getId(), "actor-1");

        assertThat(balance.getTotalQty()).isEqualTo(2);
        verify(stockMovementRepository, never()).save(any());
        verify(accountingClient, never()).createAuditAdjustmentJournal(any(), any(), any(), any());
    }

    @Test
    void complete_negativeDiffBelowAvailable_throwsConflictWithOriginalMessage() {
        InventoryAudit audit = freshAudit();
        InventoryAuditLine line = InventoryAuditLine.snapshot(
                audit, productId, "AC", 100, new BigDecimal("100000.00"));
        audit.addLine(line);
        audit.start();
        line.recordActual(95, false); // diff -5
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        StockBalance balance = newBalance(productId, warehouse, 2);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouseId))
                .thenReturn(Optional.of(balance));

        assertThatThrownBy(() -> service.complete(audit.getId(), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
                    assertThat(be.getMessage()).isEqualTo("조정 결과 가용 재고가 음수입니다: -3");
                });
        verify(stockMovementRepository, never()).save(any());
        verify(accountingClient, never()).createAuditAdjustmentJournal(any(), any(), any(), any());
    }

    @Test
    void complete_accountingFailure_returnsSafeUserMessage() {
        InventoryAudit audit = freshAudit();
        InventoryAuditLine line = InventoryAuditLine.snapshot(
                audit, productId, "AC", 100, new BigDecimal("100000.00"));
        audit.addLine(line);
        audit.start();
        line.recordActual(95, false);
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouseId))
                .thenReturn(Optional.of(newBalance(productId, warehouse, 100)));
        doThrow(new BusinessException(ErrorCode.INVALID_INPUT, "accounting-service 4xx: 404"))
                .when(accountingClient)
                .createAuditAdjustmentJournal(any(), any(), any(), any());

        assertThatThrownBy(() -> service.complete(audit.getId(), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.INTERNAL_ERROR);
                    assertThat(be.getMessage()).isEqualTo(
                            "회계 연동에 실패했습니다. 실사 완료와 재고 조정이 취소되었습니다. 잠시 후 다시 시도해 주세요.");
                    assertThat(be.getMessage()).doesNotContain("404", "accounting-service", audit.getId().toString());
                });
    }

    @Test
    void complete_positiveDiff_triggersJournalIncrease() {
        InventoryAudit audit = freshAudit();
        InventoryAuditLine line = InventoryAuditLine.snapshot(
                audit, productId, "AC", 50, new BigDecimal("100000.00"));
        audit.addLine(line);
        audit.start();
        line.recordActual(53, true); // diff +3, diffAmount +300000
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        StockBalance balance = newBalance(productId, warehouse, 50);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouseId))
                .thenReturn(Optional.of(balance));

        service.complete(audit.getId(), "actor-1");

        assertThat(audit.getTotalDiffAmount()).isEqualByComparingTo("300000.00");
        assertThat(balance.getTotalQty()).isEqualTo(53);
        verify(accountingClient, times(1)).createAuditAdjustmentJournal(
                any(), any(), any(), any());
    }

    @Test
    void complete_zeroDiff_skipsJournal() {
        InventoryAudit audit = freshAudit();
        InventoryAuditLine line = InventoryAuditLine.snapshot(
                audit, productId, "AC", 100, new BigDecimal("100000.00"));
        audit.addLine(line);
        audit.start();
        line.recordActual(100, true); // diff 0
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        service.complete(audit.getId(), "actor-1");

        assertThat(audit.getStatus()).isEqualTo(AuditStatus.COMPLETED);
        assertThat(audit.getTotalDiffAmount()).isEqualByComparingTo("0");
        verify(accountingClient, never()).createAuditAdjustmentJournal(any(), any(), any(), any());
        verify(stockMovementRepository, never()).save(any());
    }

    @Test
    void cancel_fromPlanned_succeeds() {
        InventoryAudit audit = freshAudit();
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        service.cancel(audit.getId());

        assertThat(audit.getStatus()).isEqualTo(AuditStatus.CANCELLED);
        assertThat(audit.getCancelledAt()).isNotNull();
    }

    @Test
    void cancel_fromCompleted_throwsConflict() {
        InventoryAudit audit = freshAudit();
        audit.start();
        audit.complete();
        when(auditRepository.findById(audit.getId())).thenReturn(Optional.of(audit));

        assertThatThrownBy(() -> service.cancel(audit.getId()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void getOne_notFound_throwsNotFound() {
        UUID missing = UUID.randomUUID();
        when(auditRepository.findById(missing)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getOne(missing))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void nextAuditNo_format_usesSlashDateAndUnpaddedSequence() {
        LocalDate date = LocalDate.of(2026, 12, 31);
        InventoryAuditNumberSequence sequence = InventoryAuditNumberSequence.create(date);
        sequence.next();
        sequence.next();
        when(auditNumberSequenceRepository.findLockedByAuditDate(date)).thenReturn(Optional.of(sequence));

        String no = service.nextAuditNo(date);

        assertThat(no).isEqualTo("2026/12/31-3");
    }

    @Test
    void nextAuditNo_sameDateAdvancesSequenceWithoutRecountRace() {
        LocalDate date = LocalDate.of(2026, 12, 31);
        InventoryAuditNumberSequence sequence = InventoryAuditNumberSequence.create(date);
        sequence.next();
        sequence.next();
        when(auditNumberSequenceRepository.findLockedByAuditDate(date)).thenReturn(Optional.of(sequence));

        String first = service.nextAuditNo(date);
        String second = service.nextAuditNo(date);

        assertThat(first).isEqualTo("2026/12/31-3");
        assertThat(second).isEqualTo("2026/12/31-4");
    }

    private InventoryAudit freshAudit() {
        InventoryAudit audit = InventoryAudit.create(
                "2026/12/31-1", warehouse, LocalDate.of(2026, 12, 31));
        ReflectionTestUtils.setField(audit, "id", UUID.randomUUID());
        return audit;
    }

    private StockBalance newBalance(UUID pid, Warehouse w, int totalQty) {
        StockBalance b = StockBalance.create(pid, w);
        ReflectionTestUtils.setField(b, "id", UUID.randomUUID());
        b.addInbound(totalQty);
        return b;
    }
}
