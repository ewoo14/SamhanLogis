package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.client.SlipDetail;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockMovement;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class StockLedgerServiceTest {

    @Mock private ProductClient productClient;
    @Mock private StockMovementRepository movementRepository;
    @Mock private WarehouseRepository warehouseRepository;
    @Mock private SlipClient slipClient;
    @InjectMocks private StockLedgerService service;

    @Test
    @DisplayName("기간 시작 전 잔량과 기간 내 입출고의 누적 잔량을 계산한다")
    void calculatesOpeningAndRunningBalance() {
        UUID productId = UUID.randomUUID();
        ProductSummary product = mock(ProductSummary.class);
        when(product.id()).thenReturn(productId);
        when(product.name()).thenReturn("테스트 품목");
        when(productClient.requireExistsByCode("AP145BNPPHH1")).thenReturn(product);

        StockMovement opening = movement(MovementType.INBOUND, 10, LocalDateTime.of(2026, 7, 31, 9, 0));
        StockMovement inbound = movement(MovementType.INBOUND, 5, LocalDateTime.of(2026, 8, 2, 9, 0));
        StockMovement outbound = movement(MovementType.DEDUCT, -3, LocalDateTime.of(2026, 8, 3, 9, 0));
        when(movementRepository.findAllByProductIdOrderByOccurredAtAsc(productId))
                .thenReturn(List.of(opening, inbound, outbound));

        var ledger = service.getLedger("AP145BNPPHH1", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 3));

        assertThat(ledger.openingBalance()).isEqualTo(10);
        assertThat(ledger.rows()).extracting(StockLedgerRow::balance).containsExactly(15, 12);
        assertThat(ledger.rows()).extracting(StockLedgerRow::inboundQuantity).containsExactly(5, 0);
        assertThat(ledger.rows()).extracting(StockLedgerRow::outboundQuantity).containsExactly(0, 3);
        assertThat(ledger.closingBalance()).isEqualTo(12);
    }

    @Test
    @DisplayName("이동 출고와 이동 입고 movement를 수불부 물리 변동으로 포함한다")
    void includesTransferMovementsAsPhysicalRows() {
        UUID productId = UUID.randomUUID();
        ProductSummary product = mock(ProductSummary.class);
        when(product.id()).thenReturn(productId);
        when(product.name()).thenReturn("이동 품목");
        when(productClient.requireExistsByCode("TRANSFER-P1")).thenReturn(product);

        StockMovement transferOut = movement(MovementType.TRANSFER_OUT, -4,
                LocalDateTime.of(2026, 8, 13, 9, 0));
        StockMovement transferIn = movement(MovementType.TRANSFER_IN, 4,
                LocalDateTime.of(2026, 8, 13, 9, 1));
        when(movementRepository.findAllByProductIdOrderByOccurredAtAsc(productId))
                .thenReturn(List.of(transferOut, transferIn));

        var ledger = service.getLedger("TRANSFER-P1", LocalDate.of(2026, 8, 13),
                LocalDate.of(2026, 8, 13));

        assertThat(ledger.rows()).hasSize(2);
        assertThat(ledger.rows()).extracting(StockLedgerRow::inboundQuantity).containsExactly(0, 4);
        assertThat(ledger.rows()).extracting(StockLedgerRow::outboundQuantity).containsExactly(4, 0);
        assertThat(ledger.closingBalance()).isZero();
    }

    @Test
    @DisplayName("수불부 응답에는 UUID를 포함하지 않는다")
    void responseHasNoUuidFields() {
        var row = new StockLedgerRow(LocalDate.of(2026, 8, 2), "품목", "CODE", "창고", "거래처",
                "7343889694", null, 5, 0, 15, false);

        assertThat(row.toString()).doesNotContain("00000000-0000-0000-0000-000000000000");
        assertThat(StockLedgerRow.class.getRecordComponents())
                .extracting(component -> component.getType())
                .noneMatch(UUID.class::equals);
    }

    @Test
    @DisplayName("재고 movement reference UUID는 실제 전표번호로 해석한다")
    void resolvesMovementReferenceToActualSlipNumber() {
        UUID productId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        ProductSummary product = mock(ProductSummary.class);
        when(product.id()).thenReturn(productId);
        when(product.name()).thenReturn("품목");
        when(productClient.requireExistsByCode("P1")).thenReturn(product);
        StockMovement movement = movement(MovementType.INBOUND, 1, LocalDateTime.of(2026, 8, 2, 9, 0));
        when(movement.getReferenceId()).thenReturn(slipId);
        when(movement.getReferenceType()).thenReturn("INBOUND");
        when(movementRepository.findAllByProductIdOrderByOccurredAtAsc(productId)).thenReturn(List.of(movement));
        when(slipClient.getSlip(slipId)).thenReturn(new SlipDetail(slipId, "2026/08/02-17", "INBOUND", "CONFIRMED", null, "거래처", null, "2026-08-02", List.of()));

        var ledger = service.getLedger("P1", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 3));

        assertThat(ledger.rows().get(0).slipNo()).isEqualTo("2026/08/02-17");
        assertThat(ledger.rows().get(0).slipType()).isEqualTo("INBOUND");
    }

    @Test
    @DisplayName("이동 movement는 적요가 아니라 전표번호 열과 이동 전표 유형을 제공한다")
    void exposesStockTransferNumberAsSlipNumber() {
        UUID productId = UUID.randomUUID();
        ProductSummary product = mock(ProductSummary.class);
        when(product.id()).thenReturn(productId);
        when(product.name()).thenReturn("이동 품목");
        when(productClient.requireExistsByCode("TRANSFER-P1")).thenReturn(product);
        StockMovement movement = movement(MovementType.TRANSFER_IN, 1,
                LocalDateTime.of(2026, 8, 14, 9, 0));
        when(movement.getReferenceType()).thenReturn("STOCK_TRANSFER");
        when(movement.getNote()).thenReturn("2026/08/14-11");
        when(movementRepository.findAllByProductIdOrderByOccurredAtAsc(productId))
                .thenReturn(List.of(movement));

        var ledger = service.getLedger("TRANSFER-P1", LocalDate.of(2026, 8, 14),
                LocalDate.of(2026, 8, 14));

        assertThat(ledger.rows().get(0).slipNo()).isEqualTo("2026/08/14-11");
        assertThat(ledger.rows().get(0).slipType()).isEqualTo("STOCK_TRANSFER");
    }

    @Test
    @DisplayName("실사 조정 movement도 조정번호를 전표번호 열에 제공한다")
    void exposesInventoryAuditNumberAsSlipNumber() {
        UUID productId = UUID.randomUUID();
        ProductSummary product = mock(ProductSummary.class);
        when(product.id()).thenReturn(productId);
        when(product.name()).thenReturn("실사 품목");
        when(productClient.requireExistsByCode("AUDIT-P1")).thenReturn(product);
        StockMovement movement = movement(MovementType.ADJUST, 1,
                LocalDateTime.of(2026, 8, 14, 9, 0));
        when(movement.getReferenceType()).thenReturn("AUDIT");
        when(movement.getReferenceId()).thenReturn(UUID.randomUUID());
        when(movement.getNote()).thenReturn("재고 실사 조정 (2026/08/14-3)");
        when(movementRepository.findAllByProductIdOrderByOccurredAtAsc(productId))
                .thenReturn(List.of(movement));

        var ledger = service.getLedger("AUDIT-P1", LocalDate.of(2026, 8, 14),
                LocalDate.of(2026, 8, 14));

        assertThat(ledger.rows().get(0).slipNo()).isEqualTo("2026/08/14-3");
        assertThat(ledger.rows().get(0).slipType()).isEqualTo("AUDIT");
    }

    private StockMovement movement(MovementType type, int delta, LocalDateTime occurredAt) {
        StockMovement movement = mock(StockMovement.class);
        when(movement.getMovementType()).thenReturn(type);
        when(movement.getQuantityDelta()).thenReturn(delta);
        when(movement.getOccurredAt()).thenReturn(occurredAt);
        when(movement.getWarehouseId()).thenReturn(UUID.randomUUID());
        return movement;
    }
}
