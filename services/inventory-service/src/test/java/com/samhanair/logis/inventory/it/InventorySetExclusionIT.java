package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.service.StockService;
import com.samhanair.logis.inventory.web.dto.DeductRequest;
import com.samhanair.logis.inventory.web.dto.DeductionResponse;
import com.samhanair.logis.inventory.web.dto.InboundRequest;
import com.samhanair.logis.inventory.web.dto.SourceOperationContext;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * 재고 게이트 통합 테스트 — 단일 GOODS 만 재고 대상이고 BUNDLE/NON_GOODS 는 no-op skip 한다.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@Transactional
class InventorySetExclusionIT extends AbstractPostgresIT {

    @Autowired
    private StockService stockService;

    @Autowired
    private StockBalanceRepository stockBalanceRepository;

    @Autowired
    private StockLotRepository stockLotRepository;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @MockBean
    private ProductClient productClient;

    private Warehouse hq;
    private UUID warehouseId;

    @BeforeEach
    void setUp() {
        hq = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException(
                        "HQ-001 시드 누락 — V2__seed_inventory_warehouses.sql 확인"));
        warehouseId = hq.getId();
    }

    @Test
    void singleGoodsInboundCreatesInventory_bundleGoodsAndNonGoodsSkip_deductBundleReturnsZero() {
        UUID singleProductId = UUID.randomUUID();
        UUID bundleProductId = UUID.randomUUID();
        UUID nonGoodsProductId = UUID.randomUUID();

        when(productClient.requireExists(singleProductId)).thenReturn(
                product(singleProductId, "단일 상품", "AC-SINGLE-001", true, "SINGLE"));
        when(productClient.requireExists(bundleProductId)).thenReturn(
                product(bundleProductId, "세트 상품", "SET-BUNDLE-001", true, "BUNDLE"));
        when(productClient.requireExists(nonGoodsProductId)).thenReturn(
                product(nonGoodsProductId, "설치비", "FEE-INSTALL-001", false, "SINGLE"));

        var singleInbound = stockService.inbound(inbound(singleProductId, "SINGLE-LOT", 4), "it-user");
        var bundleInbound = stockService.inbound(inbound(bundleProductId, "BUNDLE-LOT", 4), "it-user");
        var nonGoodsInbound = stockService.inbound(inbound(nonGoodsProductId, "FEE-LOT", 4), "it-user");
        DeductionResponse bundleDeduct = stockService.deduct(
                new DeductRequest(bundleProductId, warehouseId, 2, false, null, null, "세트 차감 시도",
                        new SourceOperationContext(UUID.randomUUID(), bundleProductId, 1L)),
                "it-user");

        assertThat(singleInbound).isNotNull();
        StockBalance singleBalance = stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(singleProductId, warehouseId)
                .orElseThrow();
        assertThat(singleBalance.getAvailableQty()).isEqualTo(4);
        assertThat(stockLotRepository.findAvailableLotsForFifo(singleProductId, warehouseId)).hasSize(1);

        assertThat(bundleInbound).isNull();
        assertThat(nonGoodsInbound).isNull();
        assertThat(stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(bundleProductId, warehouseId)).isEmpty();
        assertThat(stockLotRepository.findAvailableLotsForFifo(bundleProductId, warehouseId)).isEmpty();
        assertThat(stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(nonGoodsProductId, warehouseId)).isEmpty();
        assertThat(stockLotRepository.findAvailableLotsForFifo(nonGoodsProductId, warehouseId)).isEmpty();

        assertThat(bundleDeduct.requestedQuantity()).isZero();
        assertThat(bundleDeduct.deductedQuantity()).isZero();
        assertThat(bundleDeduct.availableQty()).isZero();
        assertThat(bundleDeduct.totalQty()).isZero();
        assertThat(bundleDeduct.affectedLots()).isEmpty();
    }

    private InboundRequest inbound(UUID productId, String lotNo, int quantity) {
        return new InboundRequest(
                productId, warehouseId, lotNo, null, quantity,
                LocalDateTime.of(2026, 6, 19, 9, 0),
                new BigDecimal("10000.00"), "재고 게이트 IT",
                new SourceOperationContext(UUID.randomUUID(), productId, 1L));
    }

    private ProductSummary product(UUID productId, String name, String productCode,
                                   boolean goods, String productType) {
        return new ProductSummary(
                productId, name, productCode, productCode,
                UUID.randomUUID(), new BigDecimal("10000.00"), "ACTIVE",
                false, goods, productType);
    }
}
