package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

/**
 * S3 출고연동용 인스턴스 배치 서비스 단위 테스트.
 */
@ExtendWith(MockitoExtension.class)
class StockInstanceServiceOutboundTest {

    @Mock
    private StockInstanceRepository repo;

    @Mock
    private ProductClient productClient;

    @InjectMocks
    private StockInstanceService service;

    @Test
    @DisplayName("serial_managed=false 품목은 reserveBatch를 409로 거부한다")
    void reserveBatch_batchProduct_throwsConflict() {
        UUID productId = UUID.randomUUID();
        when(productClient.requireExistsByCode("PIPE-S3")).thenReturn(product(productId, "PIPE-S3", false));

        assertThatThrownBy(() -> service.reserveBatch("PIPE-S3", UUID.randomUUID(), 2, "2026/06/02-1"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(repo, never()).findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                any(), any(), any(), any());
    }

    @Test
    @DisplayName("reserveBatch는 재고부족이면 예약 없이 409를 반환한다")
    void reserveBatch_shortage_throwsConflictWithoutReservation() {
        UUID warehouseId = UUID.randomUUID();
        StockInstance only = instance(UUID.randomUUID(), "AC-S3", warehouseId, LocalDateTime.of(2026, 5, 30, 9, 0));
        when(productClient.requireExistsByCode("AC-S3")).thenReturn(product(only.getProductId(), "AC-S3", true));
        when(repo.countByOutboundSlipNoAndProductCodeAndStatus("2026/06/02-2", "AC-S3", StockInstanceStatus.RESERVED))
                .thenReturn(0L);
        // 가용 후보가 1개뿐 → 필요 2개 미만이므로 후보 목록 크기로 사전차단(동시성 TOCTOU 대비)
        when(repo.findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                "AC-S3", warehouseId, StockInstanceStatus.AVAILABLE, PageRequest.of(0, 2)))
                .thenReturn(List.of(only));

        assertThatThrownBy(() -> service.reserveBatch("AC-S3", warehouseId, 2, "2026/06/02-2"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("재고 부족");

        // 아무것도 예약하지 않음
        assertThat(only.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        verify(repo).findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                "AC-S3", warehouseId, StockInstanceStatus.AVAILABLE, PageRequest.of(0, 2));
    }

    @Test
    @DisplayName("reserveBatch는 FIFO 순으로 부족분만 RESERVED 처리하고 outboundSlipNo를 기록한다")
    void reserveBatch_reservesDeficitByFifo() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        StockInstance already = instance(productId, "AC-S3", warehouseId, LocalDateTime.of(2026, 5, 29, 9, 0));
        already.reserve("2026/06/02-3");
        StockInstance early = instance(productId, "AC-S3", warehouseId, LocalDateTime.of(2026, 5, 30, 9, 0));
        StockInstance late = instance(productId, "AC-S3", warehouseId, LocalDateTime.of(2026, 5, 31, 9, 0));
        when(productClient.requireExistsByCode("AC-S3")).thenReturn(product(productId, "AC-S3", true));
        when(repo.countByOutboundSlipNoAndProductCodeAndStatus("2026/06/02-3", "AC-S3", StockInstanceStatus.RESERVED))
                .thenReturn(1L);
        when(repo.findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                "AC-S3", warehouseId, StockInstanceStatus.AVAILABLE, PageRequest.of(0, 2)))
                .thenReturn(List.of(early, late));
        when(repo.findByOutboundSlipNoAndProductCodeAndStatus(
                "2026/06/02-3", "AC-S3", StockInstanceStatus.RESERVED))
                .thenReturn(List.of(already, early, late));

        List<StockInstance> result = service.reserveBatch("AC-S3", warehouseId, 3, "2026/06/02-3");

        assertThat(result).containsExactly(already, early, late);
        assertThat(early.getStatus()).isEqualTo(StockInstanceStatus.RESERVED);
        assertThat(late.getStatus()).isEqualTo(StockInstanceStatus.RESERVED);
        assertThat(early.getOutboundSlipNo()).isEqualTo("2026/06/02-3");
        assertThat(late.getOutboundSlipNo()).isEqualTo("2026/06/02-3");
        verify(repo).findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                "AC-S3", warehouseId, StockInstanceStatus.AVAILABLE, PageRequest.of(0, 2));
    }

    @Test
    @DisplayName("reserveBatch는 노출 모델명과 다른 legacy 저장 키를 productId로 예약한다")
    void reserveBatch_usesProductIdWhenExposedCodeDiffersFromStoredLegacyCode() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        StockInstance legacyKeyInstance = instance(productId, "010001", warehouseId,
                LocalDateTime.of(2026, 5, 30, 9, 0));
        ProductSummary summary = new ProductSummary(productId, "에어컨", "AR05TXEAAWKNEU-01",
                "AR05TXEAAWKNEU-01", UUID.randomUUID(), BigDecimal.ONE, "ACTIVE", true);
        when(productClient.requireExistsByCode("AR05TXEAAWKNEU-01")).thenReturn(summary);
        when(repo.countByOutboundSlipNoAndProductIdAndStatus(
                "2026/06/23-1", productId, StockInstanceStatus.RESERVED)).thenReturn(0L);
        when(repo.findByProductIdAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                productId, warehouseId, StockInstanceStatus.AVAILABLE, PageRequest.of(0, 1)))
                .thenReturn(List.of(legacyKeyInstance));
        when(repo.findByOutboundSlipNoAndProductIdAndStatus(
                "2026/06/23-1", productId, StockInstanceStatus.RESERVED))
                .thenReturn(List.of(legacyKeyInstance));

        List<StockInstance> result = service.reserveBatch(
                "AR05TXEAAWKNEU-01", warehouseId, 1, "2026/06/23-1");

        assertThat(result).containsExactly(legacyKeyInstance);
        assertThat(legacyKeyInstance.getStatus()).isEqualTo(StockInstanceStatus.RESERVED);
    }

    @Test
    @DisplayName("reserveBatch는 이미 목표 수량 이상 예약된 경우 추가 예약하지 않는다")
    void reserveBatch_isIdempotentWhenAlreadyReserved() {
        UUID warehouseId = UUID.randomUUID();
        StockInstance reserved = instance(UUID.randomUUID(), "AC-S3", warehouseId,
                LocalDateTime.of(2026, 5, 30, 9, 0));
        reserved.reserve("2026/06/02-4");
        when(productClient.requireExistsByCode("AC-S3")).thenReturn(product(reserved.getProductId(), "AC-S3", true));
        when(repo.countByOutboundSlipNoAndProductCodeAndStatus("2026/06/02-4", "AC-S3", StockInstanceStatus.RESERVED))
                .thenReturn(2L);
        when(repo.findByOutboundSlipNoAndProductCodeAndStatus(
                "2026/06/02-4", "AC-S3", StockInstanceStatus.RESERVED))
                .thenReturn(List.of(reserved));

        List<StockInstance> result = service.reserveBatch("AC-S3", warehouseId, 2, "2026/06/02-4");

        assertThat(result).containsExactly(reserved);
        // 이미 목표 수량 이상 예약됨 → 후보 조회 자체를 하지 않음
        verify(repo, never()).findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
                any(), any(), any(), any());
    }

    @Test
    @DisplayName("shipBatch는 RESERVED 인스턴스를 SHIPPED로 전이하고 출고처를 기록한다")
    void shipBatch_shipsReservedInstances() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        LocalDateTime outboundAt = LocalDateTime.of(2026, 6, 2, 11, 0);
        StockInstance reserved = instance(productId, "AC-S3", warehouseId,
                LocalDateTime.of(2026, 5, 30, 9, 0));
        reserved.reserve("2026/06/02-5");
        when(repo.findByOutboundSlipNoAndProductCodeAndStatus(
                "2026/06/02-5", "AC-S3", StockInstanceStatus.RESERVED))
                .thenReturn(List.of(reserved));
        when(repo.findByOutboundSlipNoAndProductCodeAndStatus(
                "2026/06/02-5", "AC-S3", StockInstanceStatus.SHIPPED))
                .thenReturn(List.of(reserved));

        List<StockInstance> result = service.shipBatch("2026/06/02-5", "AC-S3", "P-2026-0001", outboundAt);

        assertThat(result).containsExactly(reserved);
        assertThat(reserved.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        assertThat(reserved.getOutboundPartnerCode()).isEqualTo("P-2026-0001");
        assertThat(reserved.getOutboundAt()).isEqualTo(outboundAt);
    }

    @Test
    @DisplayName("releaseBatch는 RESERVED 인스턴스를 AVAILABLE로 돌리고 전표 마커를 지운다")
    void releaseBatch_releasesReservedInstances() {
        UUID warehouseId = UUID.randomUUID();
        StockInstance reserved = instance(UUID.randomUUID(), "AC-S3", warehouseId,
                LocalDateTime.of(2026, 5, 30, 9, 0));
        reserved.reserve("2026/06/02-6");
        when(repo.findByOutboundSlipNoAndProductCodeAndStatus(
                "2026/06/02-6", "AC-S3", StockInstanceStatus.RESERVED))
                .thenReturn(List.of(reserved));

        List<StockInstance> result = service.releaseBatch("2026/06/02-6", "AC-S3");

        assertThat(result).containsExactly(reserved);
        assertThat(reserved.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        assertThat(reserved.getOutboundSlipNo()).isNull();
    }

    @Test
    @DisplayName("recallBatch는 batch 품목을 409로 거부한다")
    void recallBatch_batchProduct_throwsConflict() {
        when(productClient.requireExistsByCode("PIPE-S4")).thenReturn(product(UUID.randomUUID(), "PIPE-S4", false));

        assertThatThrownBy(() -> service.recallBatch("P-S4-001", "PIPE-S4", 1, "2026/06/03-1"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(repo, never()).findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
                any(), any(), any(), any());
    }

    @Test
    @DisplayName("recallBatch는 회수 대상 부족이면 409를 반환하고 상태를 바꾸지 않는다")
    void recallBatch_shortage_throwsConflictWithoutRecall() {
        UUID warehouseId = UUID.randomUUID();
        StockInstance only = shipped(UUID.randomUUID(), "AC-S4", warehouseId,
                LocalDateTime.of(2026, 6, 2, 12, 0), "P-S4-002");
        when(productClient.requireExistsByCode("AC-S4")).thenReturn(product(only.getProductId(), "AC-S4", true));
        when(repo.countByRecallSlipNoAndProductCodeAndStatus("2026/06/03-2", "AC-S4", StockInstanceStatus.RECALLED))
                .thenReturn(0L);
        when(repo.findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
                "P-S4-002", "AC-S4", StockInstanceStatus.SHIPPED, PageRequest.of(0, 2)))
                .thenReturn(List.of(only));

        assertThatThrownBy(() -> service.recallBatch("P-S4-002", "AC-S4", 2, "2026/06/03-2"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("회수 대상 부족");

        assertThat(only.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        verify(repo).findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
                "P-S4-002", "AC-S4", StockInstanceStatus.SHIPPED, PageRequest.of(0, 2));
    }

    @Test
    @DisplayName("recallBatch는 outbound_at DESC 역-FIFO로 부족분만 RECALLED 처리한다")
    void recallBatch_recallsDeficitByReverseFifo() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        StockInstance already = shipped(productId, "AC-S4", warehouseId,
                LocalDateTime.of(2026, 6, 2, 12, 0), "P-S4-003");
        already.recall("2026/06/03-3");
        StockInstance latest = shipped(productId, "AC-S4", warehouseId,
                LocalDateTime.of(2026, 6, 2, 15, 0), "P-S4-003");
        StockInstance older = shipped(productId, "AC-S4", warehouseId,
                LocalDateTime.of(2026, 6, 2, 14, 0), "P-S4-003");
        when(productClient.requireExistsByCode("AC-S4")).thenReturn(product(productId, "AC-S4", true));
        when(repo.countByRecallSlipNoAndProductCodeAndStatus("2026/06/03-3", "AC-S4", StockInstanceStatus.RECALLED))
                .thenReturn(1L);
        when(repo.findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
                "P-S4-003", "AC-S4", StockInstanceStatus.SHIPPED, PageRequest.of(0, 1)))
                .thenReturn(List.of(latest));
        when(repo.findByRecallSlipNoAndProductCodeAndStatus(
                "2026/06/03-3", "AC-S4", StockInstanceStatus.RECALLED))
                .thenReturn(List.of(already, latest));

        List<StockInstance> result = service.recallBatch("P-S4-003", "AC-S4", 2, "2026/06/03-3");

        assertThat(result).containsExactly(already, latest);
        assertThat(latest.getStatus()).isEqualTo(StockInstanceStatus.RECALLED);
        assertThat(latest.getRecallSlipNo()).isEqualTo("2026/06/03-3");
        assertThat(older.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        verify(repo).findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
                "P-S4-003", "AC-S4", StockInstanceStatus.SHIPPED, PageRequest.of(0, 1));
    }

    @Test
    @DisplayName("recallBatch는 이미 목표 수량 이상 회수된 경우 추가 회수하지 않는다")
    void recallBatch_isIdempotentWhenAlreadyRecalled() {
        UUID warehouseId = UUID.randomUUID();
        StockInstance recalled = shipped(UUID.randomUUID(), "AC-S4", warehouseId,
                LocalDateTime.of(2026, 6, 2, 12, 0), "P-S4-004");
        recalled.recall("2026/06/03-4");
        when(productClient.requireExistsByCode("AC-S4")).thenReturn(product(recalled.getProductId(), "AC-S4", true));
        when(repo.countByRecallSlipNoAndProductCodeAndStatus("2026/06/03-4", "AC-S4", StockInstanceStatus.RECALLED))
                .thenReturn(2L);
        when(repo.findByRecallSlipNoAndProductCodeAndStatus(
                "2026/06/03-4", "AC-S4", StockInstanceStatus.RECALLED))
                .thenReturn(List.of(recalled));

        List<StockInstance> result = service.recallBatch("P-S4-004", "AC-S4", 2, "2026/06/03-4");

        assertThat(result).containsExactly(recalled);
        verify(repo, never()).findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
                any(), any(), any(), any());
    }

    @Test
    @DisplayName("unrecallBatch는 RECALLED 인스턴스를 SHIPPED로 되돌리고 회수전표 마커만 지운다")
    void unrecallBatch_restoresShippedAndKeepsOutboundMarkers() {
        UUID warehouseId = UUID.randomUUID();
        LocalDateTime outboundAt = LocalDateTime.of(2026, 6, 2, 12, 0);
        StockInstance recalled = shipped(UUID.randomUUID(), "AC-S4", warehouseId, outboundAt, "P-S4-005");
        recalled.recall("2026/06/03-5");
        when(repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                "2026/06/03-5", "AC-S4", StockInstanceStatus.RECALLED))
                .thenReturn(List.of(recalled));

        List<StockInstance> result = service.unrecallBatch("2026/06/03-5", "AC-S4");

        assertThat(result).containsExactly(recalled);
        assertThat(recalled.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        assertThat(recalled.getRecallSlipNo()).isNull();
        assertThat(recalled.getOutboundPartnerCode()).isEqualTo("P-S4-005");
        assertThat(recalled.getOutboundSlipNo()).isEqualTo("S3-OUT-12");
        assertThat(recalled.getOutboundAt()).isEqualTo(outboundAt);
    }

    @Test
    @DisplayName("resellBatch는 회수 대상 부족이면 409를 반환하고 상태를 바꾸지 않는다")
    void resellBatch_shortage_throwsConflictWithoutResell() {
        UUID warehouseId = UUID.randomUUID();
        StockInstance only = shipped(UUID.randomUUID(), "AC-S4", warehouseId,
                LocalDateTime.of(2026, 6, 2, 12, 0), "P-S4-006");
        only.recall("2026/06/03-6");
        when(productClient.requireExistsByCode("AC-S4")).thenReturn(product(only.getProductId(), "AC-S4", true));
        when(repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                "2026/06/03-6", "AC-S4", StockInstanceStatus.RECALLED, PageRequest.of(0, 2)))
                .thenReturn(List.of(only));

        assertThatThrownBy(() -> service.resellBatch("2026/06/03-6", "AC-S4", 2, "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("재판매 대상 부족");

        assertThat(only.getStatus()).isEqualTo(StockInstanceStatus.RECALLED);
        assertThat(only.getRecallSlipNo()).isEqualTo("2026/06/03-6");
        assertThat(only.getOutboundPartnerCode()).isEqualTo("P-S4-006");
        verify(repo).findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                "2026/06/03-6", "AC-S4", StockInstanceStatus.RECALLED, PageRequest.of(0, 2));
    }

    @Test
    @DisplayName("resellBatch는 RECALLED 후보만 AVAILABLE로 복귀하고 회수/출고 마커를 지운다")
    void resellBatch_resellsRecalledInstancesAndClearsMarkers() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        StockInstance first = shipped(productId, "AC-S4", warehouseId,
                LocalDateTime.of(2026, 6, 2, 12, 0), "P-S4-007");
        StockInstance second = shipped(productId, "AC-S4", warehouseId,
                LocalDateTime.of(2026, 6, 2, 13, 0), "P-S4-007");
        first.recall("2026/06/03-7");
        second.recall("2026/06/03-7");
        LocalDateTime before = LocalDateTime.now().minusSeconds(1);
        when(productClient.requireExistsByCode("AC-S4")).thenReturn(product(productId, "AC-S4", true));
        when(repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                "2026/06/03-7", "AC-S4", StockInstanceStatus.RECALLED, PageRequest.of(0, 2)))
                .thenReturn(List.of(first, second));

        List<StockInstance> result = service.resellBatch("2026/06/03-7", "AC-S4", 2, "tester");

        LocalDateTime after = LocalDateTime.now().plusSeconds(1);
        assertThat(result).containsExactly(first, second);
        assertThat(result).allSatisfy(instance -> {
            assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
            assertThat(instance.getRecallSlipNo()).isNull();
            assertThat(instance.getOutboundPartnerCode()).isNull();
            assertThat(instance.getOutboundSlipNo()).isNull();
            assertThat(instance.getOutboundAt()).isNull();
            assertThat(instance.getReceivedAt()).isBetween(before, after);
        });
    }

    @Test
    @DisplayName("resellBatch 재호출은 이미 AVAILABLE로 바뀐 분을 제외해 부족 409로 수렴한다")
    void resellBatch_retryAfterAlreadyResold_throwsConflict() {
        when(productClient.requireExistsByCode("AC-S4")).thenReturn(product(UUID.randomUUID(), "AC-S4", true));
        when(repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
                "2026/06/03-8", "AC-S4", StockInstanceStatus.RECALLED, PageRequest.of(0, 1)))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.resellBatch("2026/06/03-8", "AC-S4", 1, "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("재판매 대상 부족");
    }

    private ProductSummary product(UUID productId, String productCode, boolean serialManaged) {
        return new ProductSummary(productId, "테스트 품목", "MODEL-S3", productCode,
                null, new BigDecimal("500000"), "ACTIVE", serialManaged);
    }

    private StockInstance instance(UUID productId, String productCode, UUID warehouseId, LocalDateTime receivedAt) {
        return StockInstance.inbound(productId, productCode, warehouseId,
                "구매", receivedAt, new BigDecimal("500000"), "S2-IN-001");
    }

    private StockInstance shipped(UUID productId, String productCode, UUID warehouseId,
                                  LocalDateTime outboundAt, String partnerCode) {
        StockInstance instance = instance(productId, productCode, warehouseId,
                outboundAt.minusDays(1));
        instance.ship(partnerCode, "S3-OUT-" + outboundAt.getHour(), outboundAt);
        return instance;
    }
}
