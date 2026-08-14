package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.StockScanEventRepository;
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

/** QR 시리얼 스캔 입출고의 원자성·오스캔 방지·사용자 오류 계약을 고정한다. */
@ExtendWith(MockitoExtension.class)
class StockInstanceScanServiceTest {

    @Mock private StockInstanceRepository instanceRepository;
    @Mock private StockMovementRepository movementRepository;
    @Mock private StockScanEventRepository scanEventRepository;
    @Mock private SlipScanReferenceResolver slipResolver;
    @Mock private ProductClient productClient;

    @InjectMocks private StockInstanceScanService service;

    @Test
    @DisplayName("품목코드가 전표 라인과 다르면 전체 스캔을 거부하고 movement를 남기지 않는다")
    void rejectsProductMismatchWithoutMovement() {
        var slip = SlipScanReference.outbound(UUID.randomUUID(), "2026/08/14-3", "PARTNER-1", "AC-001");
        var instance = instance("AC-002", StockInstanceStatus.AVAILABLE);
        when(slipResolver.resolve("2026/08/14-3", StockScanDirection.OUTBOUND)).thenReturn(slip);

        assertThatThrownBy(() -> service.scan(new StockScanRequest(
                "2026/08/14-3", StockScanDirection.OUTBOUND,
                List.of(new StockScanItem("SI-00012", "AC-002")))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("품목코드가 전표와 일치하지 않습니다");

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        verify(movementRepository, never()).saveAll(any());
        verify(scanEventRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("출고 스캔은 상태 전이와 DEDUCT movement와 scan event를 함께 기록한다")
    void outboundScanTransitionsAndRecordsCanonicalMovement() {
        UUID slipId = UUID.randomUUID();
        var slip = SlipScanReference.outbound(slipId, "2026/08/14-3", "PARTNER-1", "AC-001");
        var instance = instance("AC-001", StockInstanceStatus.AVAILABLE);
        when(slipResolver.resolve("2026/08/14-3", StockScanDirection.OUTBOUND)).thenReturn(slip);
        when(instanceRepository.findBySerialKeyForUpdate("SI-00012")).thenReturn(java.util.Optional.of(instance));
        when(productClient.requireExistsByCode("AC-001")).thenReturn(product("AC-001", true));
        when(instanceRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.scan(new StockScanRequest(
                "2026/08/14-3", StockScanDirection.OUTBOUND,
                List.of(new StockScanItem("SI-00012", "AC-001"))));

        assertThat(response.slipNo()).isEqualTo("2026/08/14-3");
        assertThat(response.items()).hasSize(1);
        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        ArgumentCaptor<List<com.samhanair.logis.inventory.domain.StockMovement>> movements =
                ArgumentCaptor.forClass(List.class);
        verify(movementRepository).saveAll(movements.capture());
        assertThat(movements.getValue()).singleElement()
                .extracting("movementType", "quantityDelta", "referenceType", "referenceId")
                .containsExactly(MovementType.DEDUCT, -1, "SLIP", slipId);
        verify(scanEventRepository).saveAll(any());
    }

    @Test
    @DisplayName("입고 스캔은 미귀속 AVAILABLE 개체를 전표에 귀속하고 INBOUND movement를 남긴다")
    void inboundScanAssignsSlipAndRecordsCanonicalMovement() {
        UUID slipId = UUID.randomUUID();
        var slip = SlipScanReference.inbound(slipId, "2026/08/14-7", "AC-001");
        var instance = instance("AC-001", StockInstanceStatus.AVAILABLE);
        when(slipResolver.resolve("2026/08/14-7", StockScanDirection.INBOUND)).thenReturn(slip);
        when(productClient.requireExistsByCode("AC-001")).thenReturn(product("AC-001", true));
        when(instanceRepository.findBySerialKeyForUpdate("SI-00013")).thenReturn(java.util.Optional.of(instance));
        when(instanceRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.scan(new StockScanRequest(
                "2026/08/14-7", StockScanDirection.INBOUND,
                List.of(new StockScanItem("SI-00013", "AC-001"))));

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        assertThat(instance.getInboundSlipNo()).isEqualTo("2026/08/14-7");
        ArgumentCaptor<List<com.samhanair.logis.inventory.domain.StockMovement>> movements =
                ArgumentCaptor.forClass(List.class);
        verify(movementRepository).saveAll(movements.capture());
        assertThat(movements.getValue()).singleElement()
                .extracting("movementType", "quantityDelta", "referenceType", "referenceId")
                .containsExactly(MovementType.INBOUND, 1, "INBOUND", slipId);
    }

    @Test
    @DisplayName("중복 스캔은 사용자에게 중복 사유를 반환하고 상태를 바꾸지 않는다")
    void rejectsDuplicateScan() {
        var slip = SlipScanReference.outbound(UUID.randomUUID(), "2026/08/14-3", "PARTNER-1", "AC-001");
        var instance = instance("AC-001", StockInstanceStatus.AVAILABLE);
        when(slipResolver.resolve("2026/08/14-3", StockScanDirection.OUTBOUND)).thenReturn(slip);
        when(instanceRepository.findBySerialKeyForUpdate("SI-00012")).thenReturn(java.util.Optional.of(instance));
        when(productClient.requireExistsByCode("AC-001")).thenReturn(product("AC-001", true));

        assertThatThrownBy(() -> service.scan(new StockScanRequest(
                "2026/08/14-3", StockScanDirection.OUTBOUND,
                List.of(new StockScanItem("SI-00012", "AC-001"),
                        new StockScanItem("SI-00012", "AC-001")))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("중복 스캔");
        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
    }

    @Test
    @DisplayName("이미 출고된 개체는 사용자에게 이미 출고된 사유를 반환한다")
    void rejectsAlreadyShippedInstance() {
        var slip = SlipScanReference.outbound(UUID.randomUUID(), "2026/08/14-3", "PARTNER-1", "AC-001");
        var instance = instance("AC-001", StockInstanceStatus.AVAILABLE);
        instance.ship("PARTNER-1", "OLD-SLIP", LocalDateTime.now());
        when(slipResolver.resolve("2026/08/14-3", StockScanDirection.OUTBOUND)).thenReturn(slip);
        when(instanceRepository.findBySerialKeyForUpdate("SI-00012")).thenReturn(java.util.Optional.of(instance));
        when(productClient.requireExistsByCode("AC-001")).thenReturn(product("AC-001", true));

        assertThatThrownBy(() -> service.scan(new StockScanRequest(
                "2026/08/14-3", StockScanDirection.OUTBOUND,
                List.of(new StockScanItem("SI-00012", "AC-001")))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 출고된 개체입니다");
    }

    @Test
    @DisplayName("serialManaged=false 부자재는 QR 스캔 대상이 아니라고 사용자에게 알리고 거부한다")
    void rejectsBatchProductAsNotScanTarget() {
        var slip = SlipScanReference.outbound(UUID.randomUUID(), "2026/08/14-3", "PARTNER-1", "PIPE-001");
        var instance = instance("PIPE-001", StockInstanceStatus.AVAILABLE);
        when(slipResolver.resolve("2026/08/14-3", StockScanDirection.OUTBOUND)).thenReturn(slip);
        when(productClient.requireExistsByCode("PIPE-001")).thenReturn(product("PIPE-001", false));

        assertThatThrownBy(() -> service.scan(new StockScanRequest(
                "2026/08/14-3", StockScanDirection.OUTBOUND,
                List.of(new StockScanItem("SI-00012", "PIPE-001")))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("개별시리얼 관리 대상이 아닌 품목");
        verify(instanceRepository, never()).findBySerialKeyForUpdate(any());
        verify(movementRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("없는 시리얼키는 사용자에게 찾을 수 없다고 알리고 아무 것도 저장하지 않는다")
    void rejectsUnknownSerialKey() {
        var slip = SlipScanReference.outbound(UUID.randomUUID(), "2026/08/14-3", "PARTNER-1", "AC-001");
        when(slipResolver.resolve("2026/08/14-3", StockScanDirection.OUTBOUND)).thenReturn(slip);
        when(productClient.requireExistsByCode("AC-001")).thenReturn(product("AC-001", true));
        when(instanceRepository.findBySerialKeyForUpdate("SI-NOTFOUND")).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> service.scan(new StockScanRequest(
                "2026/08/14-3", StockScanDirection.OUTBOUND,
                List.of(new StockScanItem("SI-NOTFOUND", "AC-001")))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("시리얼키를 찾을 수 없습니다");
        verify(movementRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("목록 중 하나가 실패하면 앞선 개체도 상태·movement를 남기지 않는다")
    void rejectsWholeBatchAtomically() {
        var slip = SlipScanReference.outbound(UUID.randomUUID(), "2026/08/14-3", "PARTNER-1", "AC-001");
        var first = instance("AC-001", StockInstanceStatus.AVAILABLE);
        when(slipResolver.resolve("2026/08/14-3", StockScanDirection.OUTBOUND)).thenReturn(slip);
        when(productClient.requireExistsByCode("AC-001")).thenReturn(product("AC-001", true));
        when(instanceRepository.findBySerialKeyForUpdate("SI-00012")).thenReturn(java.util.Optional.of(first));
        when(instanceRepository.findBySerialKeyForUpdate("SI-NOTFOUND")).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> service.scan(new StockScanRequest(
                "2026/08/14-3", StockScanDirection.OUTBOUND,
                List.of(new StockScanItem("SI-00012", "AC-001"),
                        new StockScanItem("SI-NOTFOUND", "AC-001")))))
                .isInstanceOf(BusinessException.class);
        assertThat(first.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        verify(movementRepository, never()).saveAll(any());
        verify(scanEventRepository, never()).saveAll(any());
    }

    private StockInstance instance(String productCode, StockInstanceStatus expected) {
        return StockInstance.inbound(UUID.randomUUID(), productCode, UUID.randomUUID(),
                "구매", LocalDateTime.now(), null, null);
    }

    private ProductSummary product(String productCode, boolean serialManaged) {
        return new ProductSummary(UUID.randomUUID(), "테스트 품목", productCode, productCode,
                null, null, "ACTIVE", serialManaged);
    }
}
