package com.samhanair.logis.slip.delivery.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import com.samhanair.logis.slip.service.WarehouseCodeSnapshotService;
import com.samhanair.logis.slip.delivery.domain.DeliveryBatch;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.delivery.sms.SmsResult;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공개 모바일 endpoint IT — Plan §4.2.
 *
 * <ul>
 *   <li>유효 토큰 — 200 + 슬립 N건 (UUID 미노출)</li>
 *   <li>미발견 토큰 — 404</li>
 *   <li>만료 토큰 — 410 GONE</li>
 *   <li>인증 헤더 없이 진입 가능 (no auth) — Plan §8</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class PublicSlipControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DeliveryBatchRepository batchRepository;
    @Autowired private SlipRepository slipRepository;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;
    @MockBean private WarehouseCodeSnapshotService warehouseCodeSnapshotService;

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
    void getBatch_validToken_returns200_noAuth_andHidesUuids() throws Exception {
        // 시간 의존 회귀 회피 — 항상 오늘 날짜 사용 (PR #94 fix, 2026-05-05 하드코딩 → batch token 만료)
        String today = LocalDate.now().toString();
        // 1. driver 정보 채워 슬립 생성 + 그룹화
        createSlipWithDriver("김기사", "010-1111-2222");
        MvcResult grouped = mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", today)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        String token = objectMapper.readTree(grouped.getResponse().getContentAsString())
                .get("data").get(0).get("batchToken").asText();

        // 2. no auth 헤더로 공개 페이지 호출
        mockMvc.perform(get("/public/batches/" + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.driverName").value("김기사"))
                .andExpect(jsonPath("$.data.batchDate").value(today))
                .andExpect(jsonPath("$.data.slips").isArray())
                .andExpect(jsonPath("$.data.slips[0].slipNo").exists())
                // UUID 비공개 가드 — slip.id / batch.id 응답 본문에 없음
                .andExpect(jsonPath("$.data.slips[0].id").doesNotExist())
                .andExpect(jsonPath("$.data.id").doesNotExist());
    }

    @Test
    void createOutbound_withWarehouseCode_preservesSourceWarehouseCode() throws Exception {
        UUID sourceWarehouseId = UUID.randomUUID();
        String slipDate = LocalDate.now().toString();
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", slipDate);
        body.put("sourceWarehouseId", sourceWarehouseId.toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "거래처");
        body.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        Mockito.verify(warehouseCodeSnapshotService).scheduleAfterCommit(
                ArgumentMatchers.any(), ArgumentMatchers.eq(sourceWarehouseId));
    }

    @Test
    void getBatch_unknownToken_returns404() throws Exception {
        mockMvc.perform(get("/public/batches/non-existent-token"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getBatch_expiredToken_returns410Gone() throws Exception {
        // 직접 batch 1건 영속 — 어제 batchDate 로 생성하여 만료
        DeliveryBatch expired = DeliveryBatch.create(
                "만료기사", "010-9999-1111", LocalDate.now().minusDays(3), List.of());
        // tokenExpiresAt 을 강제로 과거로 설정 (방어적)
        ReflectionTestUtils.setField(expired, "tokenExpiresAt",
                LocalDateTime.now().minusHours(1));
        DeliveryBatch saved = batchRepository.save(expired);

        mockMvc.perform(get("/public/batches/" + saved.getBatchToken()))
                .andExpect(status().isGone());
    }

    @Test
    void getBatch_noAuthHeader_stillAccessible() throws Exception {
        // /public/** 는 인증 우회 — 헤더 없어도 진입은 가능 (404/410 등 도메인 응답)
        mockMvc.perform(get("/public/batches/anything"))
                .andExpect(status().isNotFound());  // 토큰 미발견 → 404 (403 아님)
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
        // 시간 의존 회귀 회피 — 오늘 날짜 사용 (PR #94 fix)
        body.put("slipDate", LocalDate.now().toString());
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "거래처");
        body.put("deliveryTag", "DAY");
        body.put("driverName", driverName);
        body.put("driverPhone", driverPhone);
        body.put("lines", List.of(line));

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }
}
