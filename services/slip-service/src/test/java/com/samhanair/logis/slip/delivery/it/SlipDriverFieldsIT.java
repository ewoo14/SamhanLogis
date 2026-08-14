package com.samhanair.logis.slip.delivery.it;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
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
 * Slice B (notification-slice-B) — Slip.editHeader 6 args 확장 + driver 필드 round-trip.
 *
 * <p>memory {@code feedback_it_mockbean_external_clients.md}: SmsGateway / InventoryClient /
 * ProductClient 모두 @MockBean lenient stub.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipDriverFieldsIT extends AbstractPostgresIT {

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
    void createSlip_withDriverContact_persistsAndReturnsFields() throws Exception {
        Map<String, Object> body = baseBody();
        body.put("driverName", "김기사");
        body.put("driverPhone", "010-1234-5678");

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.driverName").value("김기사"))
                .andExpect(jsonPath("$.data.driverPhone").value("010-1234-5678"))
                .andExpect(jsonPath("$.data.deliveryBatchId").doesNotExist());
    }

    @Test
    void editHeader_setsDriverContact_inDraftStatus() throws Exception {
        Map<String, Object> body = baseBody();

        MvcResult created = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String slipId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        Map<String, Object> patchBody = Map.of(
                "driverName", "박기사",
                "driverPhone", "010-9999-8888");

        mockMvc.perform(patch("/slips/" + slipId + "/header")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.driverName").value("박기사"))
                .andExpect(jsonPath("$.data.driverPhone").value("010-9999-8888"));
    }

    @Test
    void editHeader_partialUpdate_preservesOtherDriverField() throws Exception {
        Map<String, Object> body = baseBody();
        body.put("driverName", "원본기사");
        body.put("driverPhone", "010-0000-0000");

        MvcResult created = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String slipId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // driverName 만 변경 — driverPhone 보존
        Map<String, Object> patchBody = new HashMap<>();
        patchBody.put("driverName", "신규기사");

        mockMvc.perform(patch("/slips/" + slipId + "/header")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.driverName").value("신규기사"))
                .andExpect(jsonPath("$.data.driverPhone").value("010-0000-0000"));
    }

    @Test
    void slipDetail_includesNullDriverFields_whenNotProvided() throws Exception {
        Map<String, Object> body = baseBody();

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(notNullValue()))
                // driverName/driverPhone 미입력 시 null — 기존 슬립 호환
                .andExpect(jsonPath("$.data.driverName").doesNotExist())
                .andExpect(jsonPath("$.data.driverPhone").doesNotExist());
    }

    private Map<String, Object> baseBody() {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "에어컨");
        line.put("modelName", "MOD-001");
        line.put("quantity", 5);
        line.put("unitPrice", 100000);
        line.put("note", null);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-05");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "거래처");
        body.put("deliveryTag", "SALE");
        body.put("memo", "메모");
        body.put("lines", List.of(line));
        return body;
    }
}
