package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.AdminWarehouseListResponse;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * WarehouseService.searchAdmin 단위 테스트 — Phase 10 P0-5.
 *
 * <p>q normalize + 페이지네이션 응답 검증.
 */
class WarehouseSearchServiceTest {

    private final WarehouseRepository repo = mock(WarehouseRepository.class);
    private final com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder auditLogRecorder =
            mock(com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder.class);
    private final WarehouseService service = new WarehouseService(repo, auditLogRecorder);

    @Test
    @DisplayName("searchAdmin — q blank → repo 에 null 전달 (필터 미적용)")
    void searchAdmin_normalizes_blank_q_to_null() {
        Pageable pageable = PageRequest.of(0, 10);
        when(repo.searchAdmin(any(), any())).thenReturn(new PageImpl<>(List.of()));

        service.searchAdmin("   ", pageable);

        verify(repo).searchAdmin(eq(null), eq(pageable));
    }

    @Test
    @DisplayName("searchAdmin — items / total / page / size 응답 형태")
    void searchAdmin_returns_paginated_dto() {
        Warehouse w = Warehouse.create("WH-001", "본사창고", WarehouseType.HEADQUARTERS,
                "서울 강남구", 1, "본사 1층 창고");
        Pageable pageable = PageRequest.of(0, 10);
        when(repo.searchAdmin(eq("본사"), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(w), pageable, 1L));

        AdminWarehouseListResponse dto = service.searchAdmin("본사", pageable);

        assertThat(dto.items()).hasSize(1);
        assertThat(dto.items().get(0).code()).isEqualTo("WH-001");
        assertThat(dto.items().get(0).name()).isEqualTo("본사창고");
        assertThat(dto.total()).isEqualTo(1);
        assertThat(dto.page()).isEqualTo(0);
        assertThat(dto.size()).isEqualTo(10);
    }
}
