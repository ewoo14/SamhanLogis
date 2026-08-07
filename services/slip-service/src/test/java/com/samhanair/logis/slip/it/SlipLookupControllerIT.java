package com.samhanair.logis.slip.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * SlipLookupController 권한 + 200/404 매핑 검증.
 *
 * <p>본 IT 는 BE 의 다음 산출물을 가정:
 * <ul>
 *   <li>{@code GET /slips/lookup-product?modelName=...} — SALES/MANAGER/MASTER + WAREHOUSE/INVENTORY/ACCOUNTANT 만 허용</li>
 *   <li>{@link ProductClient#lookupByModel(String)} 위임</li>
 * </ul>
 * ProductClient 는 mock — product-service 실제 호출 차단.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipLookupControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ProductClient productClient;

    /** SlipService 가 다른 테스트에서 InventoryClient 를 의존하므로 mock 으로 격리. */
    @MockBean
    private InventoryClient inventoryClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @org.junit.jupiter.api.BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
    }

    @Test
    void lookupProduct_authenticated_returns200() throws Exception {
        UUID productId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        Mockito.when(productClient.lookupByModel("AJ040RXH4BC1")).thenReturn(
                new ProductSummary(productId, "벽걸이 무풍에어컨", "AJ040RXH4BC1",
                        "AJ040RXH4BC1", categoryId, new BigDecimal("1500000.00"), "ACTIVE",
                        false, "AJ040RXH4BC1", "SINGLE", "home", null,
                        "220V / 4HP"));

        mockMvc.perform(get("/slips/lookup-product")
                        .param("modelName", "AJ040RXH4BC1")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.modelName").value("AJ040RXH4BC1"))
                .andExpect(jsonPath("$.data.name").value("벽걸이 무풍에어컨"))
                .andExpect(jsonPath("$.data.specification").value("220V / 4HP"));
    }

    @Test
    void lookupProduct_unauthenticated_returns403() throws Exception {
        // 헤더 없음 — HeaderAuthenticationFilter 가 인증 미설정 → 403
        mockMvc.perform(get("/slips/lookup-product")
                        .param("modelName", "AJ040RXH4BC1"))
                .andExpect(status().isForbidden());
    }

    @Test
    void lookupProduct_missing_returns404() throws Exception {
        Mockito.when(productClient.lookupByModel("UNKNOWN"))
                .thenThrow(new BusinessException(ErrorCode.NOT_FOUND, "모델명에 해당하는 제품이 없습니다"));

        mockMvc.perform(get("/slips/lookup-product")
                        .param("modelName", "UNKNOWN")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isNotFound());
    }
}
