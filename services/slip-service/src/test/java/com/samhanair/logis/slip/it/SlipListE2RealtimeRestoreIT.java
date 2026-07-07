package com.samhanair.logis.slip.it;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** E2 판매전표 목록 realtime/삭제행/복원 회귀 고정 IT. */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class SlipListE2RealtimeRestoreIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final UUID ACTOR_ID = UUID.fromString("00000000-0000-0000-0000-000000000756");
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private static final UUID SLIP_LIST_CHANNEL_ID = UUID.nameUUIDFromBytes(
            "slip:list:changed".getBytes(StandardCharsets.UTF_8));

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @SpyBean private CollectionRealtimePublisher collectionPublisher;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;
    @MockBean private ArologisDispatchClient arologisDispatchClient;

    @BeforeEach
    void setupLenientMocks() {
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(
                                    id, "판매전표 E2 제품", "E2-SLIP",
                                    UUID.randomUUID(), new BigDecimal("1000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "판매전표 E2 제품", "E2-SLIP",
                        UUID.randomUUID(), new BigDecimal("1000"), "ACTIVE"));
        Mockito.lenient().doNothing()
                .when(notificationClient).sendUserSms(
                        ArgumentMatchers.any(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
        Mockito.lenient().doNothing()
                .when(notificationClient).sendExternalSms(
                        ArgumentMatchers.anyString(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
        Mockito.lenient().doNothing()
                .when(notificationClient).sendUserPush(
                        ArgumentMatchers.any(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
        Mockito.lenient().doNothing()
                .when(inventoryClient).inbound(
                        ArgumentMatchers.any(), ArgumentMatchers.any(), ArgumentMatchers.anyInt(),
                        ArgumentMatchers.anyString(), ArgumentMatchers.any());
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("판매전표담당"));
    }

    @Test
    @DisplayName("판매조회(/slips/query)는 활성전용 — 삭제행이 조회·엑셀에 누출되지 않는다 (#758 CRITICAL 회귀가드)")
    void queryEndpointExcludesDeletedSlip() throws Exception {
        CreatedSlip created = createOutbound("E2-삭제행");

        mockMvc.perform(delete("/slips/{id}/sales", created.id())
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", created.updatedAt()))))
                .andExpect(status().isOk());

        // /slips/query 는 판매/구매조회 화면·엑셀 export 공용 — 삭제행 노출 시 감사자료 오염(#758 CRITICAL).
        mockMvc.perform(get("/slips/query")
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .param("slipType", "OUTBOUND")
                        .param("searchSlipNo", created.slipNo())
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.slipNo=='" + created.slipNo() + "')]").isEmpty());
    }

    @Test
    @DisplayName("판매전표 목록(/slips)은 includeDeleted 미전송 시 활성전용 — 삭제행 기본 제외 (#758 CRITICAL 회귀가드)")
    void slipListDefaultExcludesDeletedSlip() throws Exception {
        CreatedSlip created = createOutbound("E2-기본제외");

        mockMvc.perform(delete("/slips/{id}/sales", created.id())
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", created.updatedAt()))))
                .andExpect(status().isOk());

        // includeDeleted 를 보내지 않으면(자동완성·타 소비처와 동일) 삭제행이 노출되지 않아야 한다.
        mockMvc.perform(get("/slips")
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .param("slipType", "OUTBOUND")
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.slipNo=='" + created.slipNo() + "')]").isEmpty());
    }

    @Test
    @DisplayName("판매전표 목록 화면 경로도 삭제행과 deletedByName 메타를 포함한다")
    void legacySlipListIncludesDeletedSlipMetadata() throws Exception {
        CreatedSlip created = createOutbound("E2-목록삭제행");

        mockMvc.perform(delete("/slips/{id}/sales", created.id())
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", created.updatedAt()))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/slips")
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .param("slipType", "OUTBOUND")
                        .param("includeDeleted", "true")
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.slipNo=='" + created.slipNo() + "')].isDeleted")
                        .value(contains(true)))
                .andExpect(jsonPath("$.data.content[?(@.slipNo=='" + created.slipNo() + "')].deletedByName")
                        .value(contains("이운영")));
    }

    @Test
    @DisplayName("status 필터는 enum name 문자열 기준으로 판매전표를 판별한다")
    void statusFilterUsesEnumName() throws Exception {
        CreatedSlip draft = createOutbound("E2-DRAFT");
        CreatedSlip saved = createOutbound("E2-SAVED");
        jdbcTemplate.update("UPDATE slips SET status = 'SAVED' WHERE id = ?::uuid", saved.id().toString());

        mockMvc.perform(get("/slips/query")
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .param("slipType", "OUTBOUND")
                        .param("status", "SAVED")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.slipNo=='" + saved.slipNo() + "')].status").exists())
                .andExpect(jsonPath("$.data.content[?(@.slipNo=='" + draft.slipNo() + "')]").isEmpty());
    }

    @Test
    @DisplayName("동일 slipType+slipNo 활성행이 있으면 삭제행 복원은 409 로 차단한다")
    void restoreWhenActiveSlipReusesNumberReturns409() throws Exception {
        CreatedSlip deleted = createOutbound("E2-복원409");
        mockMvc.perform(delete("/slips/{id}/sales", deleted.id())
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", deleted.updatedAt()))))
                .andExpect(status().isOk());

        persistActiveOutboundWithSlipNo(deleted.slipNo());

        mockMvc.perform(post("/slips/{id}/restore", deleted.id())
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is("CONFLICT")));
    }

    @Test
    @DisplayName("판매전표 목록 SSE 구독 endpoint 는 slip:list:changed 채널을 연다")
    void listRealtimeSubscribeReturnsSse() throws Exception {
        mockMvc.perform(get("/slips/list-realtime")
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("판매전표 삭제 성공 시 slip:list:changed DELETED 를 발화한다")
    void deletePublishesListChanged() throws Exception {
        CreatedSlip created = createOutbound("E2-삭제발화");

        mockMvc.perform(delete("/slips/{id}/sales", created.id())
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", created.updatedAt()))))
                .andExpect(status().isOk());

        verify(collectionPublisher).publishChange(
                eq(SLIP_LIST_CHANNEL_ID),
                eq("slip:list:changed"),
                argThat(payload -> "DELETED".equals(payload.get("changeType"))));
    }

    @Test
    @DisplayName("판매전표 복원 성공 시 삭제 메타를 비우고 slip:list:changed RESTORED 를 발화한다")
    void restoreClearsMetadataAndPublishesListChanged() throws Exception {
        CreatedSlip created = createOutbound("E2-복원발화");
        mockMvc.perform(delete("/slips/{id}/sales", created.id())
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", created.updatedAt()))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/slips/{id}/restore", created.id())
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo", is(created.slipNo())))
                .andExpect(jsonPath("$.data.isDeleted", is(false)))
                .andExpect(jsonPath("$.data.deletedByName").doesNotExist())
                // 삭제 시 cascade soft-delete 된 라인이 복원되어야 빈 껍데기(totalQuantity=0)가 아님 — STEP4 HIGH 회귀가드.
                .andExpect(jsonPath("$.data.totalQuantity", is(1)));

        verify(collectionPublisher).publishChange(
                eq(SLIP_LIST_CHANNEL_ID),
                eq("slip:list:changed"),
                argThat(payload -> "RESTORED".equals(payload.get("changeType"))));
    }

    private CreatedSlip createOutbound(String partnerName) throws Exception {
        Map<String, Object> line = Map.of(
                "productId", UUID.randomUUID().toString(),
                "productName", "판매전표 E2 제품",
                "modelName", "E2-SLIP",
                "quantity", 1,
                "unitPrice", 1000);
        Map<String, Object> body = Map.of(
                "slipType", "OUTBOUND",
                "slipDate", TODAY.toString(),
                "sourceWarehouseId", UUID.randomUUID().toString(),
                "destinationWarehouseId", UUID.randomUUID().toString(),
                "partnerId", UUID.randomUUID().toString(),
                "partnerName", partnerName,
                "memo", "E2 판매전표 목록 IT",
                "lines", List.of(line));

        MvcResult createResult = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode data = objectMapper.readTree(createResult.getResponse().getContentAsString()).path("data");
        String id = data.path("id").asText();
        String slipNo = data.path("slipNo").asText();

        MvcResult detailResult = mockMvc.perform(get("/slips/{id}", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        String updatedAt = objectMapper.readTree(detailResult.getResponse().getContentAsString())
                .path("data").path("updatedAt").asText();
        return new CreatedSlip(id, slipNo, updatedAt);
    }

    private void persistActiveOutboundWithSlipNo(String slipNo) {
        Slip slip = Slip.createOutbound(
                slipNo,
                TODAY,
                999,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "동일번호활성행",
                null,
                "복원 충돌용",
                "tester");
        slip.updateSalesHeader("동일번호활성행", "E2-DUAL", null, null, null, null, null, null, null);
        slipRepository.saveAndFlush(slip);
    }

    private record CreatedSlip(String id, String slipNo, String updatedAt) {
    }
}
