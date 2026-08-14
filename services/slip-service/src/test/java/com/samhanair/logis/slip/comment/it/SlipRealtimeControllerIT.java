package com.samhanair.logis.slip.comment.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.it.OpaqueUuidTestDecoder;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
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
 * PR-H1 BE — SlipRealtimeController + SlipCommentController 통합 IT.
 *
 * <p>BE endpoint:
 * <ul>
 *   <li>{@code GET    /slips/{id}/realtime}        — SSE stream (text/event-stream, 200)</li>
 *   <li>{@code POST   /slips/{id}/comments}        — SALES/WAREHOUSE/MANAGER/MASTER (201)</li>
 *   <li>{@code GET    /slips/{id}/comments?limit=N} — 모든 인증 사용자 (200)</li>
 * </ul>
 *
 * <p>Test case:
 * <ol>
 *   <li>SSE GET — text/event-stream 200 + initial connected event 포함</li>
 *   <li>POST comment — SALES 권한 201 + ApiResponse wrapper 정합 ({@code $.data.body})</li>
 *   <li>POST comment — broker 가 publish 호출 (subscriberCount 증가 후 publish)</li>
 *   <li>GET comments — 백필 200 + ApiResponse wrapper ({@code $.data[0].body})</li>
 *   <li>POST comment — INVENTORY 권한 (등록 권한 외) → 403</li>
 * </ol>
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipRealtimeControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRealtimeBroker broker;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void mockProductClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "MOD-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
    }

    /** SALES 권한으로 출고전표 1건 생성. */
    private String createOutboundSlipAsSales() throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 5);
        line.put("unitPrice", 100000);
        line.put("note", "라인 메모");

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-04");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("deliveryTag", "SALE");
        body.put("memo", "테스트");
        body.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText();
    }

    @Test
    void sseSubscribe_returnsEventStreamWithConnectedEvent() throws Exception {
        String slipId = createOutboundSlipAsSales();

        MvcResult mvcResult = mockMvc.perform(get("/slips/" + slipId + "/realtime")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andReturn();

        // SseEmitter 의 초기 connected event 가 응답 buffer 에 작성될 때까지 dispatch
        String responseBody = mvcResult.getResponse().getContentAsString();
        assertThat(responseBody).contains("event:connected");
        assertThat(responseBody).contains("\"entityId\":\""
                + OpaqueUuidTestDecoder.decode(slipId) + "\"");
    }

    @Test
    void postComment_salesRole_returns201_apiResponseWrapper() throws Exception {
        String slipId = createOutboundSlipAsSales();

        Map<String, Object> body = Map.of("body", "검수 시작합니다");

        mockMvc.perform(post("/slips/" + slipId + "/comments")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Name", "홍길동")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                // ApiResponse wrapper 정합
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.code").value("OK"))
                .andExpect(jsonPath("$.data.body").value("검수 시작합니다"))
                .andExpect(jsonPath("$.data.authorName").value("홍길동"));
    }

    @Test
    void postComment_triggersBrokerPublish() throws Exception {
        String slipId = createOutboundSlipAsSales();

        long before = broker.publishCount();

        mockMvc.perform(post("/slips/" + slipId + "/comments")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Name", "홍길동")
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "픽업 완료"))))
                .andExpect(status().isCreated());

        assertThat(broker.publishCount()).isGreaterThan(before);
    }

    @Test
    void getComments_returnsBackfillWithApiResponseWrapper() throws Exception {
        String slipId = createOutboundSlipAsSales();

        // 사전 댓글 1건 등록
        mockMvc.perform(post("/slips/" + slipId + "/comments")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Name", "김검수")
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "백필 댓글"))))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/slips/" + slipId + "/comments?limit=20")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].body").value("백필 댓글"))
                .andExpect(jsonPath("$.data[0].authorName").value("김검수"));
    }

    @Test
    void postComment_inventoryRole_returns403() throws Exception {
        String slipId = createOutboundSlipAsSales();
        UUID inventoryUserId = UUID.randomUUID();

        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.eq(inventoryUserId),
                        ArgumentMatchers.eq("slip.comments"),
                        ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        // 등록 권한 = account x page x action. INVENTORY 테스트 계정은 slip.comments CREATE deny.
        mockMvc.perform(post("/slips/" + slipId + "/comments")
                        .header("X-User-Id", inventoryUserId.toString())
                        .header("X-User-Name", "재고원")
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "권한 없음"))))
                .andExpect(status().isForbidden());
    }
}
