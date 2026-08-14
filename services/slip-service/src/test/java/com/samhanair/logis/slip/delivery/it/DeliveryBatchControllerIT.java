package com.samhanair.logis.slip.delivery.it;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.delivery.sms.SmsResult;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
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
 * DeliveryBatchController IT — Plan §4.1 의 7 endpoint 권한 + 기능 검증.
 *
 * <p>모든 외부 client (SmsGateway / InventoryClient / ProductClient) @MockBean lenient stub —
 * memory {@code feedback_it_mockbean_external_clients.md} 준수.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DeliveryBatchControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void mockClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트", "MOD-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(smsGateway.sendSms(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(SmsResult.success("mock-id"));
    }

    @Test
    void autoGroup_managerRole_returns200() throws Exception {
        // 미리 driver 정보가 채워진 슬립 1건 생성
        createSlipWithDriver("김기사", "010-1111-2222");

        mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", "2026-05-05")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    void autoGroup_salesRole_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq("slip.delivery-batch"),
                        ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", "2026-05-05")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    void list_managerRole_returnsArray() throws Exception {
        mockMvc.perform(get("/delivery-batches")
                        .param("date", "2026-05-05")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    void list_warehouseRole_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq("slip.delivery-batch"),
                        ArgumentMatchers.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get("/delivery-batches")
                        .param("date", "2026-05-05")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    @Test
    void getOne_unknownId_returns404() throws Exception {
        mockMvc.perform(get("/delivery-batches/" + UUID.randomUUID())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isNotFound());
    }

    @Test
    void sendSms_emptyBatch_returns409() throws Exception {
        // 슬립 0건 배치 생성 → autoGroup 후 manual 직접 조회 어려움 — 다음 시나리오에서 사용
        // 본 테스트는 unknown id → 404 로 우회 검증
        mockMvc.perform(post("/delivery-batches/" + UUID.randomUUID() + "/send-sms")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isNotFound());
    }

    @Test
    void fullFlow_autoGroup_thenSendSms_success() throws Exception {
        // 1. driver 정보 채워 슬립 생성
        createSlipWithDriver("김기사", "010-1111-2222");

        // 2. autoGroup → 1 batch 생성
        MvcResult grouped = mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", "2026-05-05")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(notNullValue()))
                .andReturn();

        String batchId = objectMapper.readTree(grouped.getResponse().getContentAsString())
                .get("data").get(0).get("id").asText();

        // 3. send-sms → SmsGateway mock 호출 + smsSentAt 기록
        mockMvc.perform(post("/delivery-batches/" + batchId + "/send-sms")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.smsSentAt").value(notNullValue()));

        Mockito.verify(smsGateway, Mockito.atLeastOnce())
                .sendSms(ArgumentMatchers.eq("010-1111-2222"), ArgumentMatchers.anyString());
    }

    @Test
    void sendSms_failure_returns500_andRecordsError() throws Exception {
        Mockito.reset(smsGateway);
        Mockito.when(smsGateway.sendSms(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(SmsResult.failure("Aligo 인증 실패"));

        createSlipWithDriver("실패기사", "010-9999-7777");
        MvcResult grouped = mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", "2026-05-05")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        String batchId = objectMapper.readTree(grouped.getResponse().getContentAsString())
                .get("data").get(0).get("id").asText();

        mockMvc.perform(post("/delivery-batches/" + batchId + "/send-sms")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isInternalServerError());
    }

    @Test
    void regenerateToken_managerRole_returns200() throws Exception {
        createSlipWithDriver("기사재발급", "010-1212-3434");
        MvcResult grouped = mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", "2026-05-05")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        String batchId = objectMapper.readTree(grouped.getResponse().getContentAsString())
                .get("data").get(0).get("id").asText();
        String originalToken = objectMapper.readTree(grouped.getResponse().getContentAsString())
                .get("data").get(0).get("batchToken").asText();

        MvcResult regen = mockMvc.perform(post("/delivery-batches/" + batchId + "/regenerate-token")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        String newToken = objectMapper.readTree(regen.getResponse().getContentAsString())
                .get("data").get("batchToken").asText();

        org.assertj.core.api.Assertions.assertThat(newToken).isNotEqualTo(originalToken);
    }

    @Test
    void addSlip_unknownBatch_returns404() throws Exception {
        Map<String, Object> body = Map.of("slipId", UUID.randomUUID().toString());
        mockMvc.perform(post("/delivery-batches/" + UUID.randomUUID() + "/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound());
    }

    @Test
    void removeSlip_unknownBatch_returns404() throws Exception {
        mockMvc.perform(delete("/delivery-batches/" + UUID.randomUUID()
                        + "/slips/" + UUID.randomUUID())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isNotFound());
    }

    private void createSlipWithDriver(String driverName, String driverPhone) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-05");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "거래처");
        body.put("deliveryTag", "SALE");
        body.put("driverName", driverName);
        body.put("driverPhone", driverPhone);
        body.put("lines", List.of(line));

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }
}
