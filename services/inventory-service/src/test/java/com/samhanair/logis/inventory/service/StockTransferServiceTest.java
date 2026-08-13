package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockTransfer;
import com.samhanair.logis.inventory.domain.TransferReason;
import com.samhanair.logis.inventory.domain.TransferStatus;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.StockTransferRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.CreateTransferRequest;
import com.samhanair.logis.inventory.web.dto.TransferDetailResponse;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.math.BigDecimal;
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
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class StockTransferServiceTest {

    @Mock private StockTransferRepository transferRepository;
    @Mock private WarehouseRepository warehouseRepository;
    @Mock private ProductClient productClient;
    @Mock private StockService stockService;
    @Mock private EntityManager entityManager;
    @Mock private Query advisoryLockQuery;

    @InjectMocks
    private StockTransferService service;

    private Warehouse mainWarehouse;
    private Warehouse busanWarehouse;
    private Warehouse virtualWarehouse;
    private UUID mainId;
    private UUID busanId;
    private UUID virtualId;
    private UUID productId;

    @BeforeEach
    void setUp() {
        mainWarehouse = Warehouse.create("HQ-001", "본사창고", WarehouseType.HEADQUARTERS, null, 1, null);
        busanWarehouse = Warehouse.create("VH-001", "1호차 차량재고", WarehouseType.VEHICLE, null, 2, null);
        virtualWarehouse = Warehouse.create("VR-001", "가상창고", WarehouseType.VIRTUAL, null, 3, null);
        mainId = UUID.randomUUID();
        busanId = UUID.randomUUID();
        virtualId = UUID.randomUUID();
        ReflectionTestUtils.setField(mainWarehouse, "id", mainId);
        ReflectionTestUtils.setField(busanWarehouse, "id", busanId);
        ReflectionTestUtils.setField(virtualWarehouse, "id", virtualId);

        productId = UUID.randomUUID();

        lenient().when(warehouseRepository.findById(mainId)).thenReturn(Optional.of(mainWarehouse));
        lenient().when(warehouseRepository.findById(busanId)).thenReturn(Optional.of(busanWarehouse));
        lenient().when(warehouseRepository.findById(virtualId)).thenReturn(Optional.of(virtualWarehouse));
        lenient().when(productClient.lookup(any())).thenReturn(List.of(
                new ProductSummary(productId, "AC", "SHA", UUID.randomUUID(),
                        new BigDecimal("1000000.00"), "ACTIVE")));
        lenient().when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))"))
                .thenReturn(advisoryLockQuery);
        lenient().when(advisoryLockQuery.setParameter(anyInt(), any())).thenReturn(advisoryLockQuery);
        lenient().when(advisoryLockQuery.getSingleResult()).thenReturn(0L);
    }

    @Test
    void create_validatesAndPersistsWithGeneratedTransferNo() {
        when(transferRepository.findMaxSequenceByTransferNoPrefix(any())).thenReturn(7);
        when(transferRepository.save(any(StockTransfer.class))).thenAnswer(inv -> {
            StockTransfer t = inv.getArgument(0);
            ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
            return t;
        });

        TransferDetailResponse response = service.create(new CreateTransferRequest(
                mainId, busanId, TransferReason.REBALANCE, "정기 재배치",
                List.of(new CreateTransferRequest.TransferLineRequest(productId, 5))),
                "user-1");

        assertThat(response.status()).isEqualTo(TransferStatus.REQUESTED);
        assertThat(response.transferNo())
                .matches("\\d{4}/\\d{2}/\\d{2}-8")
                .doesNotStartWith("T-")
                .doesNotStartWith("TR-");
        assertThat(response.lines()).hasSize(1);
        assertThat(response.lines().get(0).requestedQuantity()).isEqualTo(5);
    }

    @Test
    void create_sameSourceAndDestination_throwsInvalidInput() {
        assertThatThrownBy(() -> service.create(new CreateTransferRequest(
                mainId, mainId, TransferReason.REBALANCE, null,
                List.of(new CreateTransferRequest.TransferLineRequest(productId, 1))), "u"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void approve_thenShip_thenReceive_thenConfirm_walksThroughHappyPath() {
        StockTransfer t = freshTransfer(mainWarehouse, busanWarehouse);
        UUID id = t.getId();
        when(transferRepository.findById(id)).thenReturn(Optional.of(t));

        service.approve(id, "approver-1");
        assertThat(t.getStatus()).isEqualTo(TransferStatus.APPROVED);

        service.ship(id);
        assertThat(t.getStatus()).isEqualTo(TransferStatus.SHIPPED);

        service.receive(id);
        assertThat(t.getStatus()).isEqualTo(TransferStatus.RECEIVED);

        service.confirm(id, "approver-1");
        assertThat(t.getStatus()).isEqualTo(TransferStatus.CONFIRMED);
        assertThat(t.getConfirmedAt()).isNotNull();
    }

    @Test
    void ship_withVirtualSource_skipsInTransitAndJumpsToReceived() {
        StockTransfer t = freshTransfer(virtualWarehouse, mainWarehouse);
        UUID id = t.getId();
        when(transferRepository.findById(id)).thenReturn(Optional.of(t));

        service.approve(id, "approver-1");
        service.ship(id);

        assertThat(t.getStatus()).isEqualTo(TransferStatus.RECEIVED);
        assertThat(t.getShippedAt()).isNotNull();
        assertThat(t.getReceivedAt()).isNotNull();
    }

    @Test
    void ship_withVirtualDestination_skipsInTransit() {
        StockTransfer t = freshTransfer(mainWarehouse, virtualWarehouse);
        UUID id = t.getId();
        when(transferRepository.findById(id)).thenReturn(Optional.of(t));

        service.approve(id, "approver-1");
        service.ship(id);

        assertThat(t.getStatus()).isEqualTo(TransferStatus.RECEIVED);
    }

    @Test
    void approve_fromShipped_throwsConflict() {
        StockTransfer t = freshTransfer(mainWarehouse, busanWarehouse);
        UUID id = t.getId();
        when(transferRepository.findById(id)).thenReturn(Optional.of(t));

        service.approve(id, "approver");
        service.ship(id);

        assertThatThrownBy(() -> service.approve(id, "approver"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("출고")
                .hasMessageNotContaining("SHIPPED")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void reject_setsStatusAndKeepsApprover() {
        StockTransfer t = freshTransfer(mainWarehouse, busanWarehouse);
        UUID id = t.getId();
        when(transferRepository.findById(id)).thenReturn(Optional.of(t));

        service.reject(id, "approver-1", "재고 불일치");

        assertThat(t.getStatus()).isEqualTo(TransferStatus.REJECTED);
        assertThat(t.getApproverId()).isEqualTo("approver-1");
    }

    @Test
    void cancel_fromApproved_succeeds() {
        StockTransfer t = freshTransfer(mainWarehouse, busanWarehouse);
        UUID id = t.getId();
        when(transferRepository.findById(id)).thenReturn(Optional.of(t));

        service.approve(id, "approver-1");
        service.cancel(id, "user-1");

        assertThat(t.getStatus()).isEqualTo(TransferStatus.CANCELED);
    }

    @Test
    void cancel_fromShipped_throwsConflict() {
        StockTransfer t = freshTransfer(mainWarehouse, busanWarehouse);
        UUID id = t.getId();
        when(transferRepository.findById(id)).thenReturn(Optional.of(t));

        service.approve(id, "approver-1");
        service.ship(id);

        assertThatThrownBy(() -> service.cancel(id, "user-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("출고")
                .hasMessageNotContaining("SHIPPED")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void receive_fromInTransit_succeeds() {
        StockTransfer t = freshTransfer(mainWarehouse, busanWarehouse);
        UUID id = t.getId();
        when(transferRepository.findById(id)).thenReturn(Optional.of(t));

        service.approve(id, "approver-1");
        service.ship(id);
        // 실물간 → SHIPPED. 그다음 markInTransit (도메인) 직접 호출
        t.markInTransit();
        assertThat(t.getStatus()).isEqualTo(TransferStatus.IN_TRANSIT);

        service.receive(id);
        assertThat(t.getStatus()).isEqualTo(TransferStatus.RECEIVED);
    }

    @Test
    void getOne_notFound_throwsNotFound() {
        UUID missing = UUID.randomUUID();
        when(transferRepository.findById(missing)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getOne(missing))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void nextTransferNo_format_matchesBusinessNumberStandard() {
        when(transferRepository.findMaxSequenceByTransferNoPrefix(any())).thenReturn(0);

        String no = service.nextTransferNo(LocalDate.of(2026, 5, 4));

        assertThat(no).isEqualTo("2026/05/04-1");
    }

    @Test
    void nextTransferNo_usesLastSequenceNotRowCount() {
        when(transferRepository.findMaxSequenceByTransferNoPrefix("2026/05/04-")).thenReturn(7);

        String no = service.nextTransferNo(LocalDate.of(2026, 5, 4));

        assertThat(no).isEqualTo("2026/05/04-8");
    }

    private StockTransfer freshTransfer(Warehouse src, Warehouse dst) {
        StockTransfer t = StockTransfer.create("2026/05/04-1", src, dst,
                TransferReason.REBALANCE, null, "user-1");
        ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        return t;
    }
}
