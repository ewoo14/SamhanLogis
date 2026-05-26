package com.samhanair.logis.inventory.it;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 재고 실사 라이프사이클 IT — PLANNED → IN_PROGRESS → COMPLETED + 차이 분개 + 권한.
 *
 * <p>외부 client (ProductClient/AccountingClient) 는 @MockBean 격리 (memory feedback_it_mockbean_external_clients).
 * Eureka 비활성 + AccountingClient mock 이라 내부 token / 호출 검증만.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class InventoryAuditControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private AccountingClient accountingClient;

    private UUID hqId;

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);

        hqId = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException("HQ-001 시드 누락"))
                .getId();

        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenAnswer(invocation -> {
                    List<UUID> ids = invocation.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "TEST-001",
                                    UUID.randomUUID(), new BigDecimal("100000.00"), "ACTIVE"))
                            .toList();
                });
    }

    @Test
    void auditLifecycle_plannedToCompleted_succeeds() throws Exception {
        // 1) 실사 등록 — PLANNED
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqId.toString());
        body.put("auditDate", "2026-12-31");

        MvcResult created = mockMvc.perform(post("/inventory/audits")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(notNullValue()))
                .andExpect(jsonPath("$.data.status").value("PLANNED"))
                .andExpect(jsonPath("$.data.auditNo").value(notNullValue()))
                .andExpect(jsonPath("$.data.warehouseCode").value("HQ-001"))
                .andReturn();

        String auditId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 2) start — PLANNED → IN_PROGRESS
        mockMvc.perform(post("/inventory/audits/" + auditId + "/start")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("IN_PROGRESS"));

        // 3) complete — IN_PROGRESS → COMPLETED (차이 0 — 라인 없음 → 분개 미발행)
        mockMvc.perform(post("/inventory/audits/" + auditId + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"));

        // accountingClient 호출 검증 — 차이 0 이므로 호출 없음
        Mockito.verify(accountingClient, Mockito.never())
                .createAuditAdjustmentJournal(Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
    }

    @Test
    void auditCancel_fromPlanned_succeeds() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqId.toString());
        body.put("auditDate", "2026-12-31");

        MvcResult created = mockMvc.perform(post("/inventory/audits")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String auditId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/inventory/audits/" + auditId + "/cancel")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"));
    }

    @Test
    void auditComplete_fromPlanned_returns409() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqId.toString());
        body.put("auditDate", "2026-12-31");

        MvcResult created = mockMvc.perform(post("/inventory/audits")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String auditId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // start 안 한 PLANNED 상태에서 complete → 409
        mockMvc.perform(post("/inventory/audits/" + auditId + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isConflict());
    }

    @Test
    void auditCreate_warehouseRole_returns403() throws Exception {
        // POST /inventory/audits — MASTER/MANAGER/INVENTORY 만. WAREHOUSE 권한은 403.
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqId.toString());
        body.put("auditDate", "2026-12-31");

        Mockito.when(dynamicPermissionClient.canView(Mockito.eq("WAREHOUSE"), Mockito.anyString()))
                .thenReturn(false);
        Mockito.when(dynamicPermissionClient.canEdit(Mockito.eq("WAREHOUSE"), Mockito.anyString()))
                .thenReturn(false);

        mockMvc.perform(post("/inventory/audits")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    void auditList_byYear_returnsPage() throws Exception {
        // create 1건 후 list 호출
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqId.toString());
        body.put("auditDate", "2026-12-31");
        mockMvc.perform(post("/inventory/audits")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/inventory/audits")
                        .param("year", "2026")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value(notNullValue()));
    }

}
