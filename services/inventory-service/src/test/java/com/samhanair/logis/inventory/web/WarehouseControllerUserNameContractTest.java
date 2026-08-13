package com.samhanair.logis.inventory.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.inventory.service.WarehouseService;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;

import java.util.stream.Stream;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 중앙 헤더 필터 이후 WarehouseController 가 표시명을 다시 decode하지 않는 계약을 고정한다. */
@ExtendWith(MockitoExtension.class)
class WarehouseControllerUserNameContractTest {

    private static final UUID WAREHOUSE_ID = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    private static final String CALLER_ID = "11111111-1111-4111-8111-111111111111";

    @Mock
    private WarehouseService warehouseService;
    @Mock
    private RealtimeBroker realtimeBroker;
    @Mock
    private InventoryPermissionGuard inventoryPermissionGuard;
    @InjectMocks
    private WarehouseController controller;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .addFilters(new com.samhanair.logis.security.UserHeaderDecodingFilter())
                .build();
    }

    static Stream<String> displayNames() {
        return Stream.of(
                "김%감사",
                "김감사",
                "김%20감사",
                "%EA%B9%80",
                "김+감사",
                "\u200B",
                "\u200B123e4567-e89b-12d3-a456-426614174000");
    }

    @ParameterizedTest(name = "표시명 {0} 은 네 쓰기 경계에서 그대로 전달된다")
    @MethodSource("displayNames")
    void filteredDisplayName_isPassedUnchangedToAllFourWritePaths(String displayName) throws Exception {
        String encodedDisplayName = URLEncoder.encode(displayName, StandardCharsets.UTF_8);

        mockMvc.perform(patch("/inventory/warehouses/{id}", WAREHOUSE_ID)
                        .header("X-User-Id", CALLER_ID)
                        .header("X-User-Name", encodedDisplayName)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"변경 창고\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/inventory/warehouses/{id}/audit/revert/{revisionNo}", WAREHOUSE_ID, 1)
                        .header("X-User-Id", CALLER_ID)
                        .header("X-User-Name", encodedDisplayName))
                .andExpect(status().isOk());
        mockMvc.perform(delete("/inventory/warehouses/{id}", WAREHOUSE_ID)
                        .header("X-User-Id", CALLER_ID)
                        .header("X-User-Name", encodedDisplayName))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/inventory/warehouses/{id}/restore", WAREHOUSE_ID)
                        .header("X-User-Id", CALLER_ID)
                        .header("X-User-Name", encodedDisplayName))
                .andExpect(status().isOk());

        verify(warehouseService).update(eq(WAREHOUSE_ID), any(), eq(CALLER_ID), eq(displayName));
        verify(warehouseService).revertToRevision(eq(WAREHOUSE_ID), eq(1), eq(CALLER_ID), eq(displayName));
        verify(warehouseService).delete(eq(WAREHOUSE_ID), eq(CALLER_ID), eq(displayName));
        verify(warehouseService).restore(eq(WAREHOUSE_ID), eq(CALLER_ID), eq(displayName));
    }
}
