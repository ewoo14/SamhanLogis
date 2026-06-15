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
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * S2 입고 연동용 인스턴스 배치 생성 서비스 테스트.
 *
 * <p>DB 없는 단위 테스트로 product serial-managed 가드와 count 기반 deficit 멱등 계약을 고정한다.
 */
@ExtendWith(MockitoExtension.class)
class StockInstanceServiceBatchTest {

    @Mock
    private StockInstanceRepository repo;

    @Mock
    private ProductClient productClient;

    @InjectMocks
    private StockInstanceService service;

    @Test
    @DisplayName("serial_managed=false 품목은 배치 인스턴스 입고를 409로 거부한다")
    void inboundBatch_batchProduct_throwsConflict() {
        UUID productId = UUID.randomUUID();
        when(productClient.requireExists(productId)).thenReturn(product(productId, false));

        assertThatThrownBy(() -> service.inboundBatch(
                        productId, "PIPE-001", UUID.randomUUID(), 3,
                        "구매", "INB-001", new BigDecimal("10000"),
                        LocalDateTime.of(2026, 6, 1, 9, 0)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(repo, never()).saveAll(any());
    }

    @Test
    @DisplayName("goods=false 비상품은 배치 인스턴스 입고를 409로 거부하고 행을 생성하지 않는다")
    void inboundBatch_nonGoodsProduct_throwsConflictAndCreatesNoInstances() {
        UUID productId = UUID.randomUUID();
        when(productClient.requireExists(productId)).thenReturn(nonGoodsProduct(productId));

        assertThatThrownBy(() -> service.inboundBatch(
                        productId, "FEE-001", UUID.randomUUID(), 3,
                        "구매", "INB-FEE-001", new BigDecimal("10000"),
                        LocalDateTime.of(2026, 6, 1, 9, 0)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(repo, never()).saveAll(any());
    }

    @Test
    @DisplayName("goods=false 비상품은 수동 인스턴스 생성을 409로 거부하고 행을 생성하지 않는다")
    void create_nonGoodsProduct_throwsConflictAndCreatesNoInstance() {
        UUID productId = UUID.randomUUID();
        when(productClient.requireExists(productId)).thenReturn(nonGoodsProduct(productId));

        assertThatThrownBy(() -> service.create(
                        productId, "FEE-001", UUID.randomUUID(),
                        "구매", new BigDecimal("10000"), "INB-FEE-002",
                        LocalDateTime.of(2026, 6, 1, 9, 0)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(repo, never()).save(any());
    }

    @Test
    @DisplayName("serial_managed=true 품목은 요청 수량만큼 AVAILABLE 인스턴스를 생성한다")
    void inboundBatch_serialProduct_createsRequestedQuantity() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        LocalDateTime receivedAt = LocalDateTime.of(2026, 6, 1, 9, 0);
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));
        when(repo.countByInboundSlipAndProduct("INB-002", productId)).thenReturn(0L);
        when(repo.findByInboundSlipAndProduct("INB-002", productId)).thenReturn(List.of());
        when(repo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        List<StockInstance> result = service.inboundBatch(
                productId, "AC-001", warehouseId, 3,
                "구매", "INB-002", new BigDecimal("500000"), receivedAt);

        assertThat(result).hasSize(3);
        assertThat(result)
                .allSatisfy(instance -> {
                    assertThat(instance.getProductId()).isEqualTo(productId);
                    assertThat(instance.getProductCode()).isEqualTo("AC-001");
                    assertThat(instance.getWarehouseId()).isEqualTo(warehouseId);
                    assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
                    assertThat(instance.getInboundType()).isEqualTo("구매");
                    assertThat(instance.getInboundSlipNo()).isEqualTo("INB-002");
                    assertThat(instance.getReceivedAt()).isEqualTo(receivedAt);
                });
    }

    @Test
    @DisplayName("동일 전표+품목 재호출은 추가 생성 없이 기존 인스턴스를 반환한다")
    void inboundBatch_sameSlipAndProduct_isNoopWhenEnoughInstancesExist() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        List<StockInstance> existing = List.of(
                instance(productId, "AC-002", warehouseId, "INB-003"),
                instance(productId, "AC-002", warehouseId, "INB-003"),
                instance(productId, "AC-002", warehouseId, "INB-003"));
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));
        when(repo.countByInboundSlipAndProduct("INB-003", productId)).thenReturn(3L);
        when(repo.findByInboundSlipAndProduct("INB-003", productId)).thenReturn(existing);

        List<StockInstance> result = service.inboundBatch(
                productId, "AC-002", warehouseId, 3,
                "구매", "INB-003", new BigDecimal("500000"), LocalDateTime.now());

        assertThat(result).containsExactlyElementsOf(existing);
        verify(repo, never()).saveAll(any());
    }

    @Test
    @DisplayName("기존 count가 부족하면 deficit 수량만 추가해 목표 수량으로 수렴한다")
    void inboundBatch_existingOneAddsOnlyDeficit() {
        UUID productId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        StockInstance existing = instance(productId, "AC-003", warehouseId, "INB-004");
        when(productClient.requireExists(productId)).thenReturn(product(productId, true));
        when(repo.countByInboundSlipAndProduct("INB-004", productId)).thenReturn(1L);
        when(repo.findByInboundSlipAndProduct("INB-004", productId)).thenReturn(List.of(existing));
        when(repo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        List<StockInstance> result = service.inboundBatch(
                productId, "AC-003", warehouseId, 3,
                "구매", "INB-004", new BigDecimal("500000"), LocalDateTime.now());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<StockInstance>> savedCaptor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(savedCaptor.capture());
        assertThat(savedCaptor.getValue()).hasSize(2);
        assertThat(result).hasSize(3);
        assertThat(result.get(0)).isSameAs(existing);
    }

    private ProductSummary product(UUID productId, boolean serialManaged) {
        return new ProductSummary(
                productId, "테스트 품목", "MODEL-001", "AC-001",
                null, new BigDecimal("500000"), "ACTIVE", serialManaged);
    }

    private ProductSummary nonGoodsProduct(UUID productId) {
        return new ProductSummary(
                productId, "설치비", "FEE-001", "FEE-001",
                null, new BigDecimal("10000"), "ACTIVE", false, false);
    }

    private StockInstance instance(UUID productId, String productCode, UUID warehouseId, String slipNo) {
        return StockInstance.inbound(productId, productCode, warehouseId,
                "구매", LocalDateTime.of(2026, 6, 1, 9, 0),
                new BigDecimal("500000"), slipNo);
    }
}
