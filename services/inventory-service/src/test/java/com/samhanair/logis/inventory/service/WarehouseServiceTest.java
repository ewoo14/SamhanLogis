package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder;
import com.samhanair.logis.inventory.web.dto.CreateWarehouseRequest;
import com.samhanair.logis.inventory.web.dto.UpdateWarehouseRequest;
import com.samhanair.logis.inventory.web.dto.WarehouseResponse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class WarehouseServiceTest {

    @Mock
    private WarehouseRepository warehouseRepository;

    @Mock
    private InventoryAuditLogRecorder auditLogRecorder;

    @InjectMocks
    private WarehouseService service;

    private Warehouse mainWarehouse;
    private UUID mainId;

    @BeforeEach
    void setUp() {
        mainWarehouse = Warehouse.create("WH-MAIN", "본사 자체창고",
                WarehouseType.HEADQUARTERS, "서울시 강남구", 1, "메인 창고");
        mainId = UUID.randomUUID();
        ReflectionTestUtils.setField(mainWarehouse, "id", mainId);
    }

    @Test
    void create_succeeds_withFreshCode() {
        when(warehouseRepository.existsByCodeAndIsDeletedFalse("WH-NEW")).thenReturn(false);
        when(warehouseRepository.save(any(Warehouse.class))).thenAnswer(inv -> {
            Warehouse w = inv.getArgument(0);
            ReflectionTestUtils.setField(w, "id", UUID.randomUUID());
            return w;
        });

        WarehouseResponse response = service.create(new CreateWarehouseRequest(
                "WH-NEW", "신설창고", WarehouseType.VEHICLE, "address", 5, "desc"));

        assertThat(response.code()).isEqualTo("WH-NEW");
        assertThat(response.type()).isEqualTo(WarehouseType.VEHICLE);
        assertThat(response.displayOrder()).isEqualTo(5);
    }

    @Test
    void create_duplicateCode_throwsConflict() {
        when(warehouseRepository.existsByCodeAndIsDeletedFalse("WH-MAIN")).thenReturn(true);

        assertThatThrownBy(() -> service.create(new CreateWarehouseRequest(
                "WH-MAIN", "중복", WarehouseType.HEADQUARTERS, null, 0, null)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void create_nullDisplayOrder_defaultsToZero() {
        when(warehouseRepository.existsByCodeAndIsDeletedFalse("WH-X")).thenReturn(false);
        when(warehouseRepository.save(any(Warehouse.class))).thenAnswer(inv -> inv.getArgument(0));

        WarehouseResponse response = service.create(new CreateWarehouseRequest(
                "WH-X", "X", WarehouseType.VIRTUAL, null, null, null));

        assertThat(response.displayOrder()).isZero();
    }

    @Test
    void update_changesNameAndType() {
        when(warehouseRepository.findById(mainId)).thenReturn(Optional.of(mainWarehouse));

        WarehouseResponse response = service.update(mainId,
                new UpdateWarehouseRequest("새이름", WarehouseType.VEHICLE, null, null, null));

        assertThat(response.name()).isEqualTo("새이름");
        assertThat(response.type()).isEqualTo(WarehouseType.VEHICLE);
        assertThat(response.address()).isEqualTo("서울시 강남구");
    }

    @Test
    void update_notFound_throwsNotFound() {
        UUID missing = UUID.randomUUID();
        when(warehouseRepository.findById(missing)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.update(missing,
                new UpdateWarehouseRequest("X", null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void update_uuidCaller_doesNotPersistUuidAsActorName() {
        when(warehouseRepository.findById(mainId)).thenReturn(Optional.of(mainWarehouse));
        UUID callerId = UUID.randomUUID();

        service.update(mainId,
                new UpdateWarehouseRequest("감사 창고", null, null, null, null),
                callerId.toString());

        verify(auditLogRecorder).recordBatch(
                eq(mainId), eq(callerId), isNull(), isNull(), anyList());
    }

    @Test
    void delete_softDeletesWithCallerId() {
        when(warehouseRepository.findById(mainId)).thenReturn(Optional.of(mainWarehouse));

        service.delete(mainId, "user-7");

        assertThat(mainWarehouse.getIsDeleted()).isTrue();
        assertThat(mainWarehouse.getDeletedBy()).isEqualTo("user-7");
    }

    @Test
    void delete_nullCaller_falls_backToSystem() {
        when(warehouseRepository.findById(mainId)).thenReturn(Optional.of(mainWarehouse));

        service.delete(mainId, null);

        assertThat(mainWarehouse.getDeletedBy()).isEqualTo("system");
    }

    @Test
    void listAll_returnsOrderedByDisplayOrder() {
        Warehouse w2 = Warehouse.create("WH-A", "A", WarehouseType.HEADQUARTERS, null, 0, null);
        ReflectionTestUtils.setField(w2, "id", UUID.randomUUID());
        when(warehouseRepository.findAllByIsDeletedFalseOrderByDisplayOrderAsc())
                .thenReturn(List.of(w2, mainWarehouse));

        List<WarehouseResponse> result = service.listAll();

        assertThat(result).hasSize(2);
        assertThat(result.get(0).code()).isEqualTo("WH-A");
        assertThat(result.get(1).code()).isEqualTo("WH-MAIN");
    }
}
