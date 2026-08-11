package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.realtime.domain.InventoryAuditLog;
import com.samhanair.logis.inventory.realtime.repository.InventoryAuditLogRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.service.WarehouseService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import com.samhanair.logis.inventory.web.dto.UpdateWarehouseRequest;

/** 창고 변경은 actor 표시명 이상과 무관하게 commit 되어야 한다. */
@SpringBootTest(classes = InventoryServiceApplication.class)
class WarehouseActorStorageIT extends AbstractPostgresIT {

    @Autowired
    private WarehouseRepository warehouseRepository;

    @Autowired
    private InventoryAuditLogRepository auditLogRepository;

    @Autowired
    private WarehouseService warehouseService;

    @Test
    void update_withInvisibleOnlyActor_commitsWarehouseAndRawAuditName() {
        Warehouse warehouse = createWarehouse("재현 전 창고");
        UUID callerId = UUID.randomUUID();

        warehouseService.update(warehouse.getId(),
                new UpdateWarehouseRequest("재현 후 창고", null, null, null, null),
                callerId.toString(), "\u200B");

        assertWarehouseAndAudit(warehouse.getId(), "재현 후 창고", callerId, "\u200B");
    }

    @Test
    void delete_withInvisibleOnlyActor_commitsSoftDeleteAndRawAuditName() {
        Warehouse warehouse = createWarehouse("삭제 전 창고");
        UUID callerId = UUID.randomUUID();

        warehouseService.delete(warehouse.getId(), callerId.toString(), "\u200B");

        assertThat(warehouseRepository.findDeletedById(warehouse.getId())).isPresent();
        assertLatestAudit(warehouse.getId(), callerId, "\u200B");
    }

    @Test
    void restore_withInvisibleOnlyActor_commitsRestoreAndRawAuditName() {
        Warehouse warehouse = createWarehouse("복구 창고");
        warehouseService.delete(warehouse.getId(), UUID.randomUUID().toString(), "삭제자");
        UUID callerId = UUID.randomUUID();

        warehouseService.restore(warehouse.getId(), callerId.toString(), "\u200B");

        assertThat(warehouseRepository.findById(warehouse.getId())).isPresent();
        assertThat(warehouseRepository.findDeletedById(warehouse.getId())).isEmpty();
        assertLatestAudit(warehouse.getId(), callerId, "\u200B");
    }

    @Test
    void revert_withInvisibleOnlyActor_commitsRevertAndRawAuditName() {
        Warehouse warehouse = createWarehouse("되돌리기 전 창고");
        UUID initialCallerId = UUID.randomUUID();
        warehouseService.update(warehouse.getId(),
                new UpdateWarehouseRequest("되돌리기 후 창고", null, null, null, null),
                initialCallerId.toString(), "초기 변경자");
        UUID callerId = UUID.randomUUID();

        warehouseService.revertToRevision(warehouse.getId(), 1, callerId.toString(), "\u200B");

        assertWarehouseAndAudit(warehouse.getId(), "되돌리기 전 창고", callerId, "\u200B");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   "})
    void update_withMissingActorName_commitsWithAuditFallback(String callerName) {
        Warehouse warehouse = createWarehouse("이름 부재 전 창고");
        UUID callerId = UUID.randomUUID();

        warehouseService.update(warehouse.getId(),
                new UpdateWarehouseRequest("이름 부재 후 창고", null, null, null, null),
                callerId.toString(), callerName);

        assertWarehouseAndAudit(warehouse.getId(), "이름 부재 후 창고", callerId, "변경자 미상");
    }

    private Warehouse createWarehouse(String name) {
        return warehouseRepository.save(Warehouse.create(
                "LUNA-ACTOR-" + UUID.randomUUID().toString().substring(0, 8),
                name, WarehouseType.HEADQUARTERS, null, 0, null));
    }

    private void assertWarehouseAndAudit(UUID warehouseId, String expectedName,
                                         UUID expectedActorId, String expectedActorName) {
        assertThat(warehouseRepository.findById(warehouseId).orElseThrow().getName())
                .isEqualTo(expectedName);
        assertLatestAudit(warehouseId, expectedActorId, expectedActorName);
    }

    private void assertLatestAudit(UUID warehouseId, UUID expectedActorId, String expectedActorName) {
        List<InventoryAuditLog> auditRows = auditLogRepository
                .findByEntityIdOrderByRevisionNoDescChangedAtDesc(warehouseId);
        assertThat(auditRows).isNotEmpty();
        assertThat(auditRows.get(0).getActorId()).isEqualTo(expectedActorId);
        assertThat(auditRows.get(0).getActorName()).isEqualTo(expectedActorName);
    }
}
