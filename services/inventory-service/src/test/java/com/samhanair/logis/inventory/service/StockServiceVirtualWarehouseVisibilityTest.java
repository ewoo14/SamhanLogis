package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.StockBalanceResponse;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class StockServiceVirtualWarehouseVisibilityTest {

    @Mock private StockLotRepository stockLotRepository;
    @Mock private StockBalanceRepository stockBalanceRepository;
    @Mock private StockMovementRepository stockMovementRepository;
    @Mock private StockInstanceRepository stockInstanceRepository;
    @Mock private WarehouseRepository warehouseRepository;
    @Mock private ProductClient productClient;

    @InjectMocks
    private StockService service;

    private List<StockBalance> existingBalances;
    private List<UUID> productIds;
    private Warehouse virtualWarehouse;
    private UUID virtualWarehouseId;

    @BeforeEach
    void setUp() {
        Warehouse headquarters = warehouse("HQ-001", "본사창고", WarehouseType.HEADQUARTERS, 1);
        Warehouse vehicle = warehouse("VH-001", "1호차 차량재고", WarehouseType.VEHICLE, 2);
        virtualWarehouse = warehouse("VR-001", "가상창고", WarehouseType.VIRTUAL, 3);
        virtualWarehouseId = virtualWarehouse.getId();
        Warehouse emptyHeadquarters = warehouse("00001", "재고 없는 본사창고", WarehouseType.HEADQUARTERS, 4);
        Warehouse emptyConsignment = warehouse("CS-001", "거래처 위탁창고", WarehouseType.CONSIGNMENT, 5);

        existingBalances = new ArrayList<>();
        productIds = new ArrayList<>();
        for (int index = 0; index < 103; index++) {
            UUID productId = UUID.randomUUID();
            productIds.add(productId);
            existingBalances.add(balance(productId, headquarters, 10));
            existingBalances.add(balance(productId, vehicle, 20));
        }

        when(productClient.lookupAllowMissing(any())).thenAnswer(invocation ->
                ((List<?>) invocation.getArgument(0)).stream()
                        .map(UUID.class::cast)
                        .map(productId -> new ProductSummary(productId, "테스트 품목", "MODEL-TEST",
                                "PRODUCT-TEST", UUID.randomUUID(), new BigDecimal("1000"), "ACTIVE"))
                        .toList());

        when(stockBalanceRepository.findBalancePage(any(), any(), any(Pageable.class)))
                .thenAnswer(invocation -> {
                    UUID productFilter = invocation.getArgument(0);
                    UUID warehouseFilter = invocation.getArgument(1);
                    return new PageImpl<>(existingBalances.stream()
                            .filter(balance -> productFilter == null
                                    || productFilter.equals(balance.getProductId()))
                            .filter(balance -> warehouseFilter == null
                                    || warehouseFilter.equals(balance.getWarehouse().getId()))
                            .toList());
                });
        when(warehouseRepository.findAllByIsDeletedFalseOrderByDisplayOrderAsc())
                .thenReturn(List.of(headquarters, vehicle, virtualWarehouse,
                        emptyHeadquarters, emptyConsignment));
        when(stockInstanceRepository.findActiveBalanceGroups(any(), any()))
                .thenReturn(List.of());
    }

    @Test
    void redA_virtualWarehouseIsIncludedInWholeInventoryResult() {
        var result = service.findBalancePage(null, null, PageRequest.of(0, 1_000));

        assertThat(result.getContent())
                .anySatisfy(row -> assertThat(row.warehouseType()).isEqualTo(WarehouseType.VIRTUAL));
    }

    @Test
    void redB_onlyVirtualZeroRowsAreAdded_notEveryZeroStockWarehouse() {
        var result = service.findBalancePage(null, null, PageRequest.of(0, 1_000));

        assertThat(result.getTotalElements()).isEqualTo(309);
        assertThat(result.getContent()).hasSize(309);
        assertThat(result.getContent())
                .extracting(StockBalanceResponse::warehouseCode)
                .doesNotContain("CS-001", "00001");
        assertThat(result.getContent()).filteredOn(
                        row -> row.warehouseType() == WarehouseType.VIRTUAL)
                .hasSize(103);
        assertThat(result.getContent()).filteredOn(row -> row.warehouseCode().equals("HQ-001"))
                .allSatisfy(row -> {
                    assertThat(row.availableQty()).isEqualTo(10);
                    assertThat(row.reservedQty()).isZero();
                    assertThat(row.totalQty()).isEqualTo(10);
                });
        assertThat(result.getContent()).filteredOn(row -> row.warehouseCode().equals("VH-001"))
                .allSatisfy(row -> {
                    assertThat(row.availableQty()).isEqualTo(20);
                    assertThat(row.reservedQty()).isZero();
                    assertThat(row.totalQty()).isEqualTo(20);
                });
        assertThat(result.getContent()).filteredOn(
                        row -> row.warehouseType() == WarehouseType.VIRTUAL)
                .allSatisfy(row -> {
                    assertThat(row.availableQty()).isZero();
                    assertThat(row.reservedQty()).isZero();
                    assertThat(row.totalQty()).isZero();
                    assertThat(row.version()).isNull();
                });
        assertThat(result.getContent().stream()
                .filter(row -> row.warehouseType() == WarehouseType.VIRTUAL)
                .mapToInt(StockBalanceResponse::totalQty)
                .sum()).isZero();
    }

    @Test
    void productFilter_keepsOneExistingRowPerWarehouseAndAddsItsVirtualRow() {
        var result = service.findBalancePage(
                productIds.get(0), null, PageRequest.of(0, 100));

        assertThat(result.getTotalElements()).isEqualTo(3);
        assertThat(result.getContent())
                .extracting(StockBalanceResponse::warehouseCode)
                .containsExactly("HQ-001", "VH-001", "VR-001");
    }

    @Test
    void virtualWarehouseFilter_returnsOnlyVirtualRows() {
        var result = service.findBalancePage(
                null, virtualWarehouseId, PageRequest.of(0, 200));

        assertThat(result.getTotalElements()).isEqualTo(103);
        assertThat(result.getContent()).hasSize(103)
                .allSatisfy(row -> assertThat(row.warehouseType()).isEqualTo(WarehouseType.VIRTUAL));
    }

    @Test
    void existingVirtualBalance_doesNotDuplicateSyntheticVirtualRow() {
        existingBalances.add(StockBalance.create(productIds.get(0), virtualWarehouse));

        var result = service.findBalancePage(null, null, PageRequest.of(0, 1_000));

        assertThat(result.getTotalElements()).isEqualTo(309);
        assertThat(result.getContent()).filteredOn(
                        row -> row.warehouseType() == WarehouseType.VIRTUAL)
                .hasSize(103);
    }

    private Warehouse warehouse(String code, String name, WarehouseType type, int displayOrder) {
        Warehouse warehouse = Warehouse.create(code, name, type, null, displayOrder, null);
        ReflectionTestUtils.setField(warehouse, "id", UUID.randomUUID());
        return warehouse;
    }

    private StockBalance balance(UUID productId, Warehouse warehouse, int quantity) {
        StockBalance balance = StockBalance.create(productId, warehouse);
        balance.addInbound(quantity);
        return balance;
    }
}
