package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
        jdbcTemplate.update("UPDATE slips SET status = 'SAVED' WHERE id = ?::uuid", OpaqueUuidTestDecoder.decode(saved.id()));

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

    /**
     * #758 머지게이트 감사 HIGH — 편집경로 1/3: {@code removeLine}(DELETE /slips/{id}/lines/{lineId}).
     *
     * <p>재현 시나리오: 라인 A(1×1,000)를 {@code removeLine} 으로 개별 편집삭제(T1) → 남은 라인
     * B(1×2,000)만 있는 상태에서 헤더삭제(T2, cascade) → 복원. 수정 전 버그는 {@code slipId} 만으로
     * 삭제 라인을 무차별 복원해 A(T1)까지 부활시켜 수량/금액이 중복 집계됐다. 수정 후에는 T2 로
     * cascade 된 B 만 부활하고 A 는 영구히 삭제 상태로 남아야 한다.
     */
    @Test
    @DisplayName("removeLine 으로 편집삭제된 라인은 헤더 삭제→복원 후에도 오복원되지 않는다 "
            + "(#758 머지게이트 감사 HIGH — 편집경로 1/3: removeLine)")
    void restoreDoesNotResurrectLineRemovedViaRemoveLineEndpoint() throws Exception {
        JsonNode created = createOutboundWithLines("E2-removeLine편집",
                List.of(lineOf("E2-A-remove", 1, 1000), lineOf("E2-B-remove", 1, 2000)));
        String id = created.path("id").asText();
        String lineIdA = created.path("lines").get(0).path("id").asText();

        // 편집 플로우 — 라인 A 만 개별 soft-delete (헤더 삭제와 다른 시각 T1).
        mockMvc.perform(delete("/slips/{id}/lines/{lineId}", id, lineIdA)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isNoContent());

        String updatedAtAfterEdit = fetchUpdatedAt(id);

        // 헤더 삭제 — 이 시점에 남은 라인 B 만 cascade soft-delete(T2).
        mockMvc.perform(delete("/slips/{id}/sales", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", updatedAtAfterEdit))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/slips/{id}/restore", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isDeleted", is(false)))
                .andExpect(jsonPath("$.data.totalQuantity", is(1)))
                .andExpect(jsonPath("$.data.totalAmount", is(2000.0)));

        assertActiveLineCount(id, 1);
        assertLineStillDeleted(lineIdA);
    }

    /**
     * #758 머지게이트 감사 HIGH — 편집경로 2/3: 매출 direct PUT 편집({@code replaceSalesLines}).
     *
     * <p>재현 시나리오: 라인 A(1×10,000) 생성 후 매출 PUT 편집으로 라인 B(1×20,000)로 전체
     * 교체(A 는 T1 개별삭제) → 헤더삭제(T2, cascade 는 B 만) → 복원. 수정 전 버그는 A(T1)까지
     * 부활시켜 합계가 30,000(중복)이 됐다. 수정 후에는 20,000(B 만)이어야 한다.
     */
    @Test
    @DisplayName("매출 direct PUT 편집(replaceSalesLines)으로 교체제거된 라인은 헤더 삭제→복원 후에도 "
            + "오복원되지 않는다 (#758 머지게이트 감사 HIGH — 편집경로 2/3: 매출 PUT)")
    void restoreDoesNotResurrectLineRemovedViaSalesPutEdit() throws Exception {
        JsonNode created = createOutboundWithLines("E2-PUT편집",
                List.of(lineOf("E2-A-put", 1, 10000)));
        String id = created.path("id").asText();
        String lineIdA = created.path("lines").get(0).path("id").asText();

        String updatedAtAfterCreate = fetchUpdatedAt(id);
        Map<String, Object> putBody = new java.util.HashMap<>();
        putBody.put("updatedAt", updatedAtAfterCreate);
        putBody.put("lines", List.of(lineOf("E2-B-put", 1, 20000)));
        putBody.put("lineIdContract", true); // [D-R8-9] 정상 최신 클라이언트 재현

        // 매출 direct PUT 편집 — 기존 라인(A) 전량 soft-delete(T1) 후 신규 라인(B) 생성.
        mockMvc.perform(put("/slips/{id}/sales", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(putBody)))
                .andExpect(status().isOk());

        String updatedAtAfterEdit = fetchUpdatedAt(id);

        // 헤더 삭제 — 이 시점에 활성인 라인 B 만 cascade soft-delete(T2).
        mockMvc.perform(delete("/slips/{id}/sales", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", updatedAtAfterEdit))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/slips/{id}/restore", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isDeleted", is(false)))
                .andExpect(jsonPath("$.data.totalQuantity", is(1)))
                .andExpect(jsonPath("$.data.totalAmount", is(20000.0)));

        assertActiveLineCount(id, 1);
        assertLineStillDeleted(lineIdA);
    }

    /**
     * #758 머지게이트 감사 HIGH — 편집경로 3/3: 리비전 복원({@code restoreFromSnapshot}).
     *
     * <p>재현 시나리오: 라인 A(1×1,000) 생성(rev1) → 라인 B(1×5,000) 추가(rev2, addLine) →
     * rev1 시점으로 리비전 복원({@code POST /revisions/1/restore}) — {@code restoreFromSnapshot} 이
     * 당시 활성 라인 A·B 를 모두 개별삭제(T1, 각자 markDeleted("system"))하고 스냅샷 기준 새 라인
     * A'(1×1,000)를 재생성한다 → 헤더삭제(T2, cascade 는 A' 만) → 복원. 수정 전 버그는 구세대
     * A·B(T1)까지 부활시켜 라인 3건(중복)이 됐다. 수정 후에는 A' 1건(수량1/합계1,000)이어야 한다.
     */
    @Test
    @DisplayName("리비전 복원(restoreFromSnapshot)으로 개별삭제된 구세대 라인은 헤더 삭제→복원 후에도 "
            + "오복원되지 않는다 (#758 머지게이트 감사 HIGH — 편집경로 3/3: revision restore)")
    void restoreDoesNotResurrectLinesOrphanedByRevisionRestore() throws Exception {
        JsonNode created = createOutboundWithLines("E2-리비전편집",
                List.of(lineOf("E2-A-rev", 1, 1000)));
        String id = created.path("id").asText();
        String lineIdA = created.path("lines").get(0).path("id").asText();

        // rev2 — 라인 B 추가 (addLine, EDIT revision 캡처)
        MvcResult addLineResult = mockMvc.perform(post("/slips/{id}/lines", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(lineOf("E2-B-rev", 1, 5000))))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode afterAddLine = objectMapper.readTree(addLineResult.getResponse().getContentAsString()).path("data");
        String lineIdB = afterAddLine.path("lines").get(1).path("id").asText();

        // rev1(라인 A 만) 으로 복원 — 현재 활성 라인(A,B) 을 개별삭제(T1)하고 스냅샷 기준 새 A' 생성.
        mockMvc.perform(post("/slips/{slipId}/revisions/{revisionNo}/restore", id, 1)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk());

        String updatedAtAfterRevisionRestore = fetchUpdatedAt(id);

        // 헤더 삭제 — 이 시점의 유일한 활성 라인(A')만 cascade soft-delete(T2).
        mockMvc.perform(delete("/slips/{id}/sales", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", updatedAtAfterRevisionRestore))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/slips/{id}/restore", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isDeleted", is(false)))
                .andExpect(jsonPath("$.data.totalQuantity", is(1)))
                .andExpect(jsonPath("$.data.totalAmount", is(1000.0)));

        assertActiveLineCount(id, 1);
        assertLineStillDeleted(lineIdA);
        assertLineStillDeleted(lineIdB);
    }

    /**
     * BE 적대검증 BLOCKING fix — 레거시(단일시각 각인 도입 이전) 삭제 전표 fail-loud 회귀가드.
     *
     * <p>{@code slip_db} 실측(2026/06/03-1): 단일시각 각인이 도입되기 전 {@code deleteForSales} 로
     * 삭제된 전표는 헤더와 라인이 각자 다른 {@code deletedAt} 을 가진다. 이 상태에서 시각한정 복원
     * 쿼리는 0-match 로 끝나 헤더만 살아나고 라인은 전부 삭제 상태로 남는 "무음 빈 껍데기" 가
     * 200 OK 로 반환될 위험이 있었다 — native UPDATE 로 라인 {@code deletedAt} 만 헤더와
     * 어긋나게 만들어 이 레거시 상태를 재현하고, 복원 요청이 409 CONFLICT 로 fail-loud 하며
     * 트랜잭션이 롤백되어 헤더·라인 모두 {@code is_deleted=true} 로 남는지(라인 미소실) 단언한다.
     */
    @Test
    @DisplayName("헤더·라인 삭제시각이 어긋난 레거시 삭제 전표는 인라인 복원 시 409 로 fail-loud 한다 "
            + "(BE 적대검증 BLOCKING — 무음 빈 껍데기 차단, slip_db 실측 2026/06/03-1 재현)")
    void restoreFailsLoudlyForLegacyMismatchedDeletedAtRows() throws Exception {
        JsonNode created = createOutboundWithLines("E2-레거시불일치",
                List.of(lineOf("E2-A-legacy", 1, 1000), lineOf("E2-B-legacy", 1, 2000)));
        String id = created.path("id").asText();
        String updatedAtAfterCreate = fetchUpdatedAt(id);

        // 정상(단일시각) 헤더삭제 — 이 시점엔 헤더·라인 deletedAt 이 전부 동일 시각 T.
        mockMvc.perform(delete("/slips/{id}/sales", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_NAME_HEADER, "이운영")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("updatedAt", updatedAtAfterCreate))))
                .andExpect(status().isOk());

        // 레거시 시뮬 — 라인 deletedAt 만 헤더와 어긋나게 만든다(단일시각 도입 이전 상태 재현).
        jdbcTemplate.update(
                "UPDATE slip_lines SET deleted_at = deleted_at + interval '1 second' WHERE slip_id = ?::uuid",
                OpaqueUuidTestDecoder.decode(id));

        mockMvc.perform(post("/slips/{id}/restore", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is("CONFLICT")));

        // 트랜잭션 롤백 확인 — 헤더는 여전히 삭제 상태(목록에서도 삭제행 유지), 라인은 미소실
        // (물리 2건 그대로) + 전부 여전히 삭제 상태(부활 0건).
        Boolean headerStillDeleted = jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM slips WHERE id = ?::uuid", Boolean.class,
                OpaqueUuidTestDecoder.decode(id));
        Integer totalLineRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM slip_lines WHERE slip_id = ?::uuid", Integer.class,
                OpaqueUuidTestDecoder.decode(id));

        assertThat(headerStillDeleted).isTrue();
        assertThat(totalLineRows).isEqualTo(2);
        assertActiveLineCount(id, 0);
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
        slip.updateSalesHeader(null, "동일번호활성행", "E2-DUAL", null, null, null, null, null, null, null);
        slipRepository.saveAndFlush(slip);
    }

    /**
     * 라인 목록을 직접 지정해 OUTBOUND 전표를 생성한다 (편집경로 회귀 IT 전용 — #758 fix).
     *
     * @param partnerName 거래처명 (표시/구분용)
     * @param lines       생성할 라인 목록 ({@link #lineOf} 로 구성)
     * @return 생성 응답의 {@code data} 노드 (id/slipNo/lines[].id 등 포함)
     */
    private JsonNode createOutboundWithLines(String partnerName, List<Map<String, Object>> lines) throws Exception {
        Map<String, Object> body = Map.of(
                "slipType", "OUTBOUND",
                "slipDate", TODAY.toString(),
                "sourceWarehouseId", UUID.randomUUID().toString(),
                "destinationWarehouseId", UUID.randomUUID().toString(),
                "partnerId", UUID.randomUUID().toString(),
                "partnerName", partnerName,
                "memo", "E2 판매전표 편집경로 회귀 IT (#758)",
                "lines", lines);

        MvcResult createResult = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(createResult.getResponse().getContentAsString()).path("data");
    }

    /** {@code AddLineRequest}/생성 요청 공용 라인 항목 — productId 는 매 호출 랜덤 신규 생성. */
    private Map<String, Object> lineOf(String productName, int quantity, int unitPrice) {
        return Map.of(
                "productId", UUID.randomUUID().toString(),
                "productName", productName,
                "modelName", "E2-SLIP",
                "quantity", quantity,
                "unitPrice", unitPrice);
    }

    /** 단건 GET 으로 최신 {@code updatedAt}(낙관적 잠금 토큰)을 조회한다. */
    private String fetchUpdatedAt(String id) throws Exception {
        MvcResult detailResult = mockMvc.perform(get("/slips/{id}", id)
                        .header(USER_ID_HEADER, ACTOR_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(detailResult.getResponse().getContentAsString())
                .path("data").path("updatedAt").asText();
    }

    /** {@code slip_lines} 활성(비삭제) 라인 수를 raw SQL 로 단언한다 (JPA {@code @SQLRestriction} 우회 확인). */
    private void assertActiveLineCount(String slipId, int expectedCount) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM slip_lines WHERE slip_id = ?::uuid AND is_deleted = FALSE",
                Integer.class, OpaqueUuidTestDecoder.decode(slipId));
        assertThat(count).isEqualTo(expectedCount);
    }

    /** 편집으로 개별삭제된 라인이 복원 이후에도 여전히 {@code is_deleted=true} 인지 raw SQL 로 단언한다. */
    private void assertLineStillDeleted(String lineId) {
        Boolean isDeleted = jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM slip_lines WHERE id = ?::uuid",
                Boolean.class, OpaqueUuidTestDecoder.decode(lineId));
        assertThat(isDeleted).isTrue();
    }

    private record CreatedSlip(String id, String slipNo, String updatedAt) {
    }
}
