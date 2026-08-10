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
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.SafetyStockAlertResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockConfigResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockSetRequest;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationSeverity;
import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
    private WarehouseRepository warehouseRepository;

    @Mock
    private ProductClient productClient;

    @Mock
    private NotificationClient notificationClient;

    @Mock
    private NotificationPublisher notificationPublisher;

    @InjectMocks
    private SafetyStockService safetyStockService;

    private UUID productId;
    private UUID warehouseId;

    @BeforeEach
    void setUp() {
        productId = UUID.randomUUID();
        warehouseId = UUID.randomUUID();

        // ProductClient.requireExists 는 ProductSummary 반환 (backward-compat 6-arg)
        lenient().when(productClient.requireExists(any()))
                .thenReturn(new ProductSummary(productId, "테스트 제품", "TEST-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));

        // Sprint 4 — findAlerts() 의 batch lookup 기본 stub. 개별 test 가 override.
        lenient().when(productClient.lookup(anyList())).thenReturn(List.of());
        lenient().when(productClient.lookupForSeedIntegrity(anyList())).thenReturn(List.of());
        lenient().when(productClient.lookupAllowMissing(anyList())).thenReturn(List.of());
        lenient().when(warehouseRepository.findAllById(any())).thenReturn(List.of());
    }

    // ------------------------------------------------------------------
    // setSafetyStock — 신규 생성
    // ------------------------------------------------------------------

    @Test
    @DisplayName("setSafetyStock: 신규 설정이 없으면 새로 생성하여 반환")
    void setSafetyStock_newConfig_createsAndReturns() {
        SafetyStockSetRequest req = new SafetyStockSetRequest(warehouseId, 50, "안전재고 메모", "SELECTED");

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
        SafetyStockSetRequest req = new SafetyStockSetRequest(warehouseId, 80, "갱신 메모", "SELECTED");

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

        SafetyStockSetRequest req = new SafetyStockSetRequest(warehouseId, 50, null, "SELECTED");

        assertThatThrownBy(() -> safetyStockService.setSafetyStock(productId, req))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("서비스 이중 가드 — ALL 창고에 warehouseId가 있으면 제품 조회 전에 차단")
    void setSafetyStock_allWithWarehouse_rejectedBeforeProductLookup() {
        SafetyStockSetRequest req = new SafetyStockSetRequest(warehouseId, 50, null, "ALL");

        assertThatThrownBy(() -> safetyStockService.setSafetyStock(productId, req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("scopeMode");
        verify(productClient, never()).requireExists(productId);
    }

    @Test
    @DisplayName("서비스 이중 가드 — SELECTED 창고 미지정이면 제품 조회 전에 차단")
    void setSafetyStock_selectedWithoutWarehouse_rejectedBeforeProductLookup() {
        SafetyStockSetRequest req = new SafetyStockSetRequest(null, 50, null, "SELECTED");

        assertThatThrownBy(() -> safetyStockService.setSafetyStock(productId, req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("scopeMode");
        verify(productClient, never()).requireExists(productId);
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
    // Sprint 4 — findAlerts 의 enrich (productCode / productName / warehouseName)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("findAlerts: ProductClient.lookup 성공 시 productCode/productName 채움")
    void findAlerts_populatesProductCodeAndProductName() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 100, null);
        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(config));

        StockBalance balance = mockBalance(30);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));

        // ProductClient.lookup 응답 (productCode 채움, 7-arg)
        when(productClient.lookupAllowMissing(anyList()))
                .thenReturn(List.of(new ProductSummary(productId, "테스트 제품", "AJ040RXH4BC1",
                        "AJ040-CODE", UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE")));

        Warehouse warehouse = org.mockito.Mockito.mock(Warehouse.class);
        org.mockito.Mockito.when(warehouse.getId()).thenReturn(warehouseId);
        org.mockito.Mockito.when(warehouse.getName()).thenReturn("HQ 본사 창고");
        when(warehouseRepository.findAllById(any())).thenReturn(List.of(warehouse));

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).hasSize(1);
        SafetyStockAlertResponse alert = alerts.get(0);
        assertThat(alert.productCode()).isEqualTo("AJ040-CODE");
        assertThat(alert.productName()).isEqualTo("AJ040RXH4BC1"); // modelName 매핑
        assertThat(alert.warehouseName()).isEqualTo("HQ 본사 창고");
    }

    @Test
    @DisplayName("findAlerts: productId 101건이면 ProductClient.lookup 을 100건 단위로 분할 호출")
    void findAlerts_with101Products_chunksLookupCorrectly() {
        List<UUID> productIds = java.util.stream.IntStream.range(0, 101)
                .mapToObj(i -> UUID.randomUUID())
                .toList();
        List<SafetyStockConfig> configs = productIds.stream()
                .map(id -> SafetyStockConfig.create(id, warehouseId, 100, null))
                .toList();
        when(safetyStockConfigRepository.findAll()).thenReturn(configs);

        StockBalance balance = mockBalance(30);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(any(), any()))
                .thenReturn(Optional.of(balance));

        when(productClient.lookupAllowMissing(anyList())).thenAnswer(invocation -> {
            List<UUID> ids = invocation.getArgument(0);
            if (ids.size() > 100) {
                throw new BusinessException(
                        com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT,
                        "한 번에 조회할 수 있는 최대 제품 수는 100건입니다");
            }
            return ids.stream()
                    .map(id -> new ProductSummary(id, "테스트 제품", "MODEL-" + id.toString().substring(0, 8),
                            "CODE-" + id.toString().substring(0, 8),
                            UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                    .toList();
        });

        Warehouse warehouse = org.mockito.Mockito.mock(Warehouse.class);
        org.mockito.Mockito.when(warehouse.getId()).thenReturn(warehouseId);
        org.mockito.Mockito.when(warehouse.getName()).thenReturn("HQ 본사 창고");
        when(warehouseRepository.findAllById(any())).thenReturn(List.of(warehouse));

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).hasSize(101);
        assertThat(alerts)
                .allSatisfy(alert -> {
                    assertThat(alert.productCode()).isNotBlank();
                    assertThat(alert.productName()).isNotBlank();
                });

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<UUID>> lookupCaptor = ArgumentCaptor.forClass(List.class);
        verify(productClient, org.mockito.Mockito.times(2)).lookupAllowMissing(lookupCaptor.capture());
        assertThat(lookupCaptor.getAllValues())
                .extracting(List::size)
                .containsExactly(100, 1);
    }

    @Test
    @DisplayName("findAlerts: stale 품목 하나가 같은 batch 정상 품목 식별자를 지우지 않는다")
    void findAlerts_partialLookup_keepsHealthyProductIdentity() {
        UUID healthyId = UUID.randomUUID();
        UUID staleId = UUID.randomUUID();
        SafetyStockConfig healthy = SafetyStockConfig.create(healthyId, warehouseId, 100, null);
        SafetyStockConfig stale = SafetyStockConfig.create(staleId, warehouseId, 100, null);
        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(healthy, stale));
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(any(), any()))
                .thenReturn(Optional.of(mockBalance(30)));
        when(productClient.lookupAllowMissing(anyList())).thenReturn(List.of(
                new ProductSummary(healthyId, "정상 품목", "ACTIVE-MODEL", "ACTIVE-CODE",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE")));

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).hasSize(2);
        assertThat(alerts.get(0).productCode()).isEqualTo("ACTIVE-CODE");
        assertThat(alerts.get(0).productName()).isEqualTo("ACTIVE-MODEL");
        assertThat(alerts.get(1).productCode()).isNull();
        assertThat(alerts.get(1).productName()).isNull();
    }

    @Test
    @DisplayName("findAlerts: product-service 다운 시 productCode/productName null fallback")
    void findAlerts_productServiceDown_returnsAlertsWithNullCodeName() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 100, null);
        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(config));

        StockBalance balance = mockBalance(30);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));

        // ProductClient 다운 (RuntimeException) — fail-soft
        when(productClient.lookupAllowMissing(anyList()))
                .thenThrow(new RuntimeException("product-service connection refused"));

        Warehouse warehouse = org.mockito.Mockito.mock(Warehouse.class);
        org.mockito.Mockito.when(warehouse.getId()).thenReturn(warehouseId);
        org.mockito.Mockito.when(warehouse.getName()).thenReturn("HQ 본사 창고");
        when(warehouseRepository.findAllById(any())).thenReturn(List.of(warehouse));

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        // 알림 자체는 노출 — 운영자가 부족 사실 인지 가능
        assertThat(alerts).hasSize(1);
        SafetyStockAlertResponse alert = alerts.get(0);
        assertThat(alert.productCode()).isNull();
        assertThat(alert.productName()).isNull();
        // warehouseName 은 정상 (별도 repository 호출)
        assertThat(alert.warehouseName()).isEqualTo("HQ 본사 창고");
    }

    @Test
    @DisplayName("findAlerts: warehouseId null 설정은 warehouseName='전체' 반환")
    void findAlerts_globalWarehouse_returnsWarehouseNameJeonche() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, null, 100, null);
        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(config));

        StockBalance b1 = mockBalance(40);
        when(stockBalanceRepository.findAllByProductIdInAndIsDeletedFalse(anyList()))
                .thenReturn(List.of(b1));

        when(productClient.lookupAllowMissing(anyList()))
                .thenReturn(List.of(new ProductSummary(productId, "테스트 제품", "AJ040",
                        "AJ040-CODE", UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE")));

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).warehouseName()).isEqualTo("전체");
    }

    @Test
    @DisplayName("findAlerts: warehouseRepository miss 시 warehouseName null fallback")
    void findAlerts_warehouseDeleted_returnsNullWarehouseName() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 100, null);
        when(safetyStockConfigRepository.findAll()).thenReturn(List.of(config));

        StockBalance balance = mockBalance(30);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));

        when(productClient.lookupAllowMissing(anyList()))
                .thenReturn(List.of(new ProductSummary(productId, "테스트 제품", "AJ040",
                        "AJ040-CODE", UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE")));

        // warehouseRepository 가 빈 리스트 반환 (warehouseId 가 삭제됨)
        when(warehouseRepository.findAllById(any())).thenReturn(List.of());

        List<SafetyStockAlertResponse> alerts = safetyStockService.findAlerts();

        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).warehouseName()).isNull();
        // productCode/Name 은 정상 채움
        assertThat(alerts.get(0).productCode()).isEqualTo("AJ040-CODE");
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
    @DisplayName("checkAndNotify: 임계 미만이면 NotificationPublisher.publish 호출")
    void checkAndNotify_belowThreshold_publishesNotificationCenterEvent() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 50, null);

        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, warehouseId))
                .thenReturn(Optional.of(Objects.requireNonNull(config)));
        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, null))
                .thenReturn(Optional.empty());

        StockBalance balance = mockBalance(20);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));
        when(productClient.lookup(anyList()))
                .thenReturn(List.of(new ProductSummary(productId, "테스트 제품", "AJ040RXH4BC1",
                        "AJ040-CODE", UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE")));
        Warehouse warehouse = org.mockito.Mockito.mock(Warehouse.class);
        org.mockito.Mockito.when(warehouse.getName()).thenReturn("HQ 본사 창고");
        when(warehouseRepository.findById(warehouseId)).thenReturn(Optional.of(warehouse));

        safetyStockService.checkAndNotify(productId, warehouseId);

        ArgumentCaptor<String> subjectCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> legacyBodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationClient).sendSafetyStockAlert(subjectCaptor.capture(), legacyBodyCaptor.capture());
        assertThat(subjectCaptor.getValue()).contains("AJ040-CODE", "AJ040RXH4BC1", "HQ 본사 창고");
        assertThat(legacyBodyCaptor.getValue()).contains("AJ040-CODE", "AJ040RXH4BC1", "HQ 본사 창고");
        assertThat(subjectCaptor.getValue()).doesNotContain(productId.toString(), warehouseId.toString());
        assertThat(legacyBodyCaptor.getValue()).doesNotContain(productId.toString(), warehouseId.toString());

        ArgumentCaptor<NotificationPublishRequest> captor = ArgumentCaptor.forClass(NotificationPublishRequest.class);
        verify(notificationPublisher).publish(captor.capture());
        NotificationPublishRequest req = captor.getValue();
        assertThat(req.channel()).isEqualTo("SAFETY_STOCK");
        assertThat(req.severity()).isEqualTo(NotificationSeverity.WARNING);
        assertThat(req.title()).isEqualTo("안전재고 부족 — AJ040-CODE (AJ040RXH4BC1)");
        assertThat(req.body()).isEqualTo("HQ 본사 창고 — 현재 20 / 임계 50 (부족 30)");
        assertThat(req.title()).doesNotContain(productId.toString(), warehouseId.toString());
        assertThat(req.body()).doesNotContain(productId.toString(), warehouseId.toString());
        assertThat(req.targetRole()).containsExactly("MASTER", "MANAGER", "INVENTORY", "WAREHOUSE");
        assertThat(req.targetUserId()).isNull();
        assertThat(req.sourceService()).isNull();
        assertThat(req.sourceRefId()).isEqualTo(productId + "+" + warehouseId);
        assertThat(req.deeplink()).isEqualTo("/inventory/safety-stock-alerts");
    }

    @Test
    void checkAndNotify_belowThreshold_defersNotificationCenterPublishUntilAfterCommit() {
        SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 50, null);

        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, warehouseId))
                .thenReturn(Optional.of(Objects.requireNonNull(config)));
        when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, null))
                .thenReturn(Optional.empty());

        StockBalance balance = mockBalance(20);
        when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
                productId, warehouseId))
                .thenReturn(Optional.of(balance));
        when(productClient.lookup(anyList()))
                .thenReturn(List.of(new ProductSummary(productId, "Test Product", "MODEL-001",
                        "CODE-001", UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE")));
        Warehouse warehouse = org.mockito.Mockito.mock(Warehouse.class);
        org.mockito.Mockito.when(warehouse.getName()).thenReturn("HQ Warehouse");
        when(warehouseRepository.findById(warehouseId)).thenReturn(Optional.of(warehouse));

        TransactionSynchronizationManager.initSynchronization();
        try {
            safetyStockService.checkAndNotify(productId, warehouseId);

            verify(notificationPublisher, never()).publish(any());
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        verify(notificationPublisher).publish(any(NotificationPublishRequest.class));
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
