package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.SafetyStockConfig;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.SafetyStockConfigRepository;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.web.dto.SafetyStockAlertResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockConfigResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockSetRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * SafetyStockService 단위 테스트 (P1-3).
 *
 * <p>외부 의존성({@link ProductClient}, {@link NotificationClient}, Repository)은 모두
 * {@link Mock} 으로 격리. DB 레이어 없이 순수 로직만 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class SafetyStockServiceTest {

    @Mock
    private SafetyStockConfigRepository safetyStockConfigRepository;

    @Mock
    private StockBalanceRepository stockBalanceRepository;

    @Mock
    private ProductClient productClient;

    @Mock
    private NotificationClient notificationClient;

    @InjectMocks
    private SafetyStockService safetyStockService;

    private UUID productId;
    private UUID warehouseId;

    @BeforeEach
    void setUp() {
        productId = UUID.randomUUID();
        warehouseId = UUID.randomUUID();

        // ProductClient.requireExists 는 ProductSummary 반환
        lenient().when(productClient.requireExists(any()))
                .thenReturn(new ProductSummary(productId, "테스트 제품", "TEST-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
    }

    // ------------------------------------------------------------------
    // setSafetyStock — 신규 생성
    // ------------------------------------------------------------------

    @Test
    @DisplayName("setSafetyStock: 신규 설정이 없으면 새로 생성하여 반환")
    void setSafetyStock_newConfig_createsAndReturns() {
        SafetyStockSetRequest req = new SafetyStockSetRequest(warehouseId, 50, "안전재고 메모");

        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, warehouseId))
                .thenReturn(Optional.empty());

        SafetyStockConfig created = SafetyStockConfig.create(productId, warehouseId, 50, "안전재고 메모");
        when(safetyStockConfigRepository.save(any(SafetyStockConfig.class)))
                .thenReturn(created);

        SafetyStockConfigResponse response = safetyStockService.setSafetyStock(productId, req);

        assertThat(response.productId()).isEqualTo(productId);
        assertThat(response.warehouseId()).isEqualTo(warehouseId);
        assertThat(response.threshold()).isEqualTo(50);
        assertThat(response.note()).isEqualTo("안전재고 메모");
        verify(safetyStockConfigRepository).save(any(SafetyStockConfig.class));
    }

    @Test
    @DisplayName("setSafetyStock: 기존 설정이 있으면 임계값을 갱신한다")
    void setSafetyStock_existingConfig_updatesThreshold() {
        SafetyStockConfig existing = SafetyStockConfig.create(productId, warehouseId, 30, "기존 메모");
        SafetyStockSetRequest req = new SafetyStockSetRequest(warehouseId, 80, "갱신 메모");

        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, warehouseId))
                .thenReturn(Optional.of(existing));

        SafetyStockConfigResponse response = safetyStockService.setSafetyStock(productId, req);

        assertThat(response.threshold()).isEqualTo(80);
        assertThat(response.note()).isEqualTo("갱신 메모");
        // 기존 엔티티 재사용 — save 호출 없음
        verify(safetyStockConfigRepository, never()).save(any());
    }

    @Test
    @DisplayName("setSafetyStock: product-service 에 없는 productId 이면 NOT_FOUND 예외")
    void setSafetyStock_unknownProduct_throwsNotFound() {
        when(productClient.requireExists(productId))
                .thenThrow(new BusinessException(
                        com.samhanair.logis.common.exception.ErrorCode.NOT_FOUND, "제품 없음"));

        SafetyStockSetRequest req = new SafetyStockSetRequest(warehouseId, 50, null);

        assertThatThrownBy(() -> safetyStockService.setSafetyStock(productId, req))
                .isInstanceOf(BusinessException.class);
    }

    // ------------------------------------------------------------------
    // findAlerts — 임계 미만 목록
    // ------------------------------------------------------------------

    @Test
    @DisplayName("findAlerts: 가용 재고가 임계값 이하이면 알림 목록에 포함")
    void findAlerts_belowThreshold_returnsAlert() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 100, null);

        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(config));

        // 특정 창고 설정 — availableQty 30 (임계 100 미만)
        StockBalance balance = mockBalance(30);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).hasSize(1);
        SafetyStockAlertResponse alert = alerts.get(0);
        assertThat(alert.productId()).isEqualTo(productId);
        assertThat(alert.currentQty()).isEqualTo(30);
        assertThat(alert.shortage()).isEqualTo(70); // 100 - 30
    }

    @Test
    @DisplayName("findAlerts: 가용 재고가 임계값 초과이면 알림 목록에 미포함")
    void findAlerts_aboveThreshold_returnsEmpty() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 50, null);

        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(config));

        StockBalance balance = mockBalance(200); // 임계 50 초과
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).isEmpty();
    }

    @Test
    @DisplayName("findAlerts: 가용 재고가 임계값과 정확히 같으면 알림 포함 (이하 조건)")
    void findAlerts_equalToThreshold_includesAlert() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 50, null);

        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(config));

        StockBalance balance = mockBalance(50); // 임계값과 동일
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).shortage()).isEqualTo(0);
    }

    @Test
    @DisplayName("findAlerts: warehouseId null 설정은 전체 창고 합산 qty 로 비교")
    void findAlerts_globalConfig_usesTotalQty() {
        // warehouseId null = 전체 합산 기준
        SafetyStockConfig config = SafetyStockConfig.create(productId, null, 100, null);

        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(config));

        // 전체 합산 조회 경로
        StockBalance b1 = mockBalance(40);
        StockBalance b2 = mockBalance(30);
        when(stockBalanceRepository.findAllByProductIdInAndIsDeletedFalse(anyList()))
                .thenReturn(List.of(b1, b2)); // 합산 70, 임계 100 미만

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).currentQty()).isEqualTo(70);
        assertThat(alerts.get(0).shortage()).isEqualTo(30);
    }

    // ------------------------------------------------------------------
    // checkAndNotify
    // ------------------------------------------------------------------

    @Test
    @DisplayName("checkAndNotify: 임계 미만이면 notificationClient 호출")
    void checkAndNotify_belowThreshold_callsNotification() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 100, null);

        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, warehouseId))
                .thenReturn(Optional.of(Objects.requireNonNull(config)));
        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, null))
                .thenReturn(Optional.empty());

        StockBalance balance = mockBalance(10);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));

        safetyStockService.checkAndNotify(productId, warehouseId);

        verify(notificationClient).sendSafetyStockAlert(any(), any());
    }

    @Test
    @DisplayName("checkAndNotify: 임계 초과이면 notificationClient 미호출")
    void checkAndNotify_aboveThreshold_noNotification() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 50, null);

        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, warehouseId))
                .thenReturn(Optional.of(Objects.requireNonNull(config)));
        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, null))
                .thenReturn(Optional.empty());

        StockBalance balance = mockBalance(200);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));

        safetyStockService.checkAndNotify(productId, warehouseId);

        verify(notificationClient, never()).sendSafetyStockAlert(any(), any());
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    /**
     * availableQty 를 가진 StockBalance mock 생성.
     * StockBalance 는 패키지 private 생성자만 있으므로 reflection 대신 실제 create + inbound 로 준비.
     */
    private StockBalance mockBalance(int availableQty) {
        // Warehouse mock
        Warehouse warehouse = org.mockito.Mockito.mock(Warehouse.class);
        StockBalance balance = StockBalance.create(productId, warehouse);
        if (availableQty > 0) {
            balance.addInbound(availableQty);
        }
        return balance;
    }
}
