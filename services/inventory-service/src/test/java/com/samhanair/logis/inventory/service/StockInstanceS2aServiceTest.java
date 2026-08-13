package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceQuality;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
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

@ExtendWith(MockitoExtension.class)
class StockInstanceS2aServiceTest {

    @Mock private StockInstanceRepository repo;
    @Mock private ProductClient productClient;
    @Mock private SourceOperationJournalWriter sourceJournalWriter;
    @Mock private InventoryAuditLogRecorder auditLogRecorder;
    @Mock private WarehouseRepository warehouseRepository;

    @InjectMocks private StockInstanceService service;

    @Test
    @DisplayName("품목코드 목록은 요청 품목의 인스턴스만 반환한다")
    void listForProductCode_doesNotMixProducts() {
        StockInstance row = inbound("MODEL-A");
        when(repo.findByProductCodeOrderByReceivedAtAsc("MODEL-A")).thenReturn(List.of(row));
        when(warehouseRepository.findById(row.getWarehouseId())).thenReturn(java.util.Optional.empty());

        assertThat(service.listForProductCode("MODEL-A"))
                .hasSize(1)
                .first()
                .extracting("serialKey")
                .isEqualTo(row.getSerialKey());
        verify(repo).findByProductCodeOrderByReceivedAtAsc("MODEL-A");
    }

    @Test
    @DisplayName("AVAILABLE 품질 변경은 저장과 이전값→새값 감사를 남긴다")
    void updateQuality_available_recordsAudit() {
        StockInstance row = inbound("MODEL-A");
        when(repo.findBySerialKey("SI-ABC234")).thenReturn(java.util.Optional.of(row));
        when(repo.save(row)).thenReturn(row);

        service.updateQuality("SI-ABC234", StockInstanceQuality.USED, "user-1", "홍길동");

        assertThat(row.getQuality()).isEqualTo(StockInstanceQuality.USED);
        verify(auditLogRecorder).recordBatch(eq(row.getId()), any(), eq("홍길동"), eq(null), any());
    }

    @Test
    @DisplayName("SHIPPED 품질 변경은 API 서비스 경로에서도 거부한다")
    void updateQuality_shipped_rejectsDirectCall() {
        StockInstance row = inbound("MODEL-A");
        row.ship("PARTNER-1", "SLIP-1", LocalDateTime.now());
        when(repo.findBySerialKey("SI-ABC234")).thenReturn(java.util.Optional.of(row));

        assertThatThrownBy(() -> service.updateQuality(
                "SI-ABC234", StockInstanceQuality.DAMAGED, "user-1", "홍길동"))
                .hasMessageContaining("SHIPPED");
    }

    private StockInstance inbound(String productCode) {
        return StockInstance.inbound(UUID.randomUUID(), productCode, UUID.randomUUID(),
                "구매", LocalDateTime.now(), BigDecimal.ONE, null);
    }
}
