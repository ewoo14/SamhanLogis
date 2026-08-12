package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
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
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/** S2d-1 저장 revision 기반 셀 레드라인 통합 테스트. */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipRedlineIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String SLIPS_PATH = "/slips";
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private static final UUID TEST_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000677");

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private SlipRepository slipRepository;
    @Autowired
    private SlipRevisionService slipRevisionService;

    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private ProductClient productClient;
    @MockBean
    private NotificationClient notificationClient;
    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean
    private PartnerInternalClient partnerInternalClient;
    @MockBean
    private PartnerBlockClient partnerBlockClient;
    @MockBean
    private UserInternalClient userInternalClient;
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupLenientMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(
                                    id, "레드라인 IT 제품", "RED-IT",
                                    UUID.randomUUID(), new BigDecimal("10000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "레드라인 IT 제품", "RED-IT",
                        UUID.randomUUID(), new BigDecimal("10000"), "ACTIVE"));
        Mockito.lenient().doNothing()
                .when(notificationClient).sendUserSms(any(), anyString(), anyString());
        Mockito.lenient().doNothing()
                .when(notificationClient).sendExternalSms(anyString(), anyString(), anyString());
        Mockito.lenient().doNothing()
                .when(notificationClient).sendUserPush(any(), anyString(), anyString());
    }

    @Test
    @DisplayName("S2d-1: SENT anchor 이후 overlay 2회 편집은 GET redline 에 base+2 layers 로 노출된다")
    void getRedlineReturnsLayersAfterSentAnchor() throws Exception {
        String id = createInboundSlip("S2d 원본");

        mockMvc.perform(post(SLIPS_PATH + "/{id}/save", id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk());
        mockMvc.perform(post(SLIPS_PATH + "/{id}/send", id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk());

        Slip anchored = slipRepository.findById(OpaqueUuidTestDecoder.decode(id)).orElseThrow();
        assertThat(anchored.getRedlineAnchorRevisionNo()).isEqualTo(1);

        patchMemo(id, "S2d 1차", "김영업");
        patchMemo(id, "S2d 2차", "박관리");

        MvcResult result = mockMvc.perform(get(SLIPS_PATH + "/{id}/redline", id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.anchored", is(true)))
                .andReturn();

        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsByteArray()).path("data");
        JsonNode memo = findField(data.path("fields"), "header.memo");
        assertThat(memo).isNotNull();
        assertThat(memo.path("layers")).hasSize(3);
        assertThat(memo.path("layers").get(0).path("value").asText()).isEqualTo("S2d 원본");
        assertThat(memo.path("layers").get(1).path("value").asText()).isEqualTo("S2d 1차");
        assertThat(memo.path("layers").get(1).path("actorName").asText()).isEqualTo("김영업");
        assertThat(memo.path("layers").get(2).path("value").asText()).isEqualTo("S2d 2차");
        assertThat(memo.path("layers").get(2).path("actorName").asText()).isEqualTo("박관리");
        assertThat(data.toString()).doesNotContain(TEST_USER_ID.toString());
    }

    @Test
    @DisplayName("S2d-1: 임계 전 DRAFT 전표는 저장 revision 이 있어도 anchored=false 다")
    void getRedlineReturnsUnanchoredBeforeThreshold() throws Exception {
        String id = createInboundSlip("S2d 드래프트");
        patchMemo(id, "S2d 드래프트 수정", "작성자");

        mockMvc.perform(get(SLIPS_PATH + "/{id}/redline", id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.anchored", is(false)))
                .andExpect(jsonPath("$.data.fields.length()", is(0)));
    }

    @Test
    @DisplayName("S2d-1b: OUTBOUND inspect anchor 이후 라인 단가/수량 redline 을 반환하고 productId UUID 는 노출하지 않는다")
    void outboundInspectThenLineEditRendersLineRedlineWithoutUuid() throws Exception {
        UUID productId = UUID.randomUUID();
        String id = createOutboundSlip("S2d 라인 원본", productId);

        transition(id, "save");
        transition(id, "send");
        transition(id, "accept");
        transition(id, "process");
        transition(id, "complete");
        transition(id, "inspect");

        Slip anchored = slipRepository.findById(OpaqueUuidTestDecoder.decode(id)).orElseThrow();
        assertThat(anchored.getRedlineAnchorRevisionNo()).isNotNull();

        captureLineEdit(OpaqueUuidTestDecoder.decode(id), 2, new BigDecimal("12000"), "김영업");
        captureLineEdit(OpaqueUuidTestDecoder.decode(id), 3, new BigDecimal("13000"), "박관리");

        String body = mockMvc.perform(get(SLIPS_PATH + "/{id}/redline", id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        // 라인 셀 redline 이 구조적으로 누적되는지(존재 + layers≥2 + actor 체인) 단언 — QA NB-2 강화
        // 응답은 ApiResponse.ok 래핑이므로 data.fields 경로(Codex 라운드 BLOCKING 수정)
        JsonNode fields = objectMapper.readTree(body).path("data").path("fields");
        JsonNode price = findField(fields, "lines[0].unitPrice");
        assertThat(price).as("라인 단가 redline 필드").isNotNull();
        assertThat(price.path("layers").size()).as("단가 누적 layer ≥2").isGreaterThanOrEqualTo(2);
        assertThat(findField(fields, "lines[0].quantity")).as("라인 수량 redline 필드").isNotNull();
        // 변경 actor 체인이 실제 노출(누적 layer 가 actor 를 담음)
        assertThat(body).contains("김영업").contains("박관리");
        // productId UUID 는 비노출
        assertThat(body).doesNotContain(productId.toString());
    }

    private String createInboundSlip(String memo) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "레드라인 IT 제품");
        line.put("modelName", "RED-IT");
        line.put("quantity", 1);
        line.put("unitPrice", 10000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "INBOUND");
        body.put("slipDate", TODAY.toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "레드라인 거래처");
        body.put("memo", memo);
        body.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(post(SLIPS_PATH)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "작성자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        String slipNo = objectMapper.readTree(result.getResponse().getContentAsByteArray())
                .path("data").path("slipNo").asText();
        return slipRepository.findBySlipTypeAndSlipNoAndIsDeletedFalse(SlipType.INBOUND, slipNo)
                .orElseThrow()
                .getId()
                .toString();
    }

    private String createOutboundSlip(String memo, UUID productId) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", productId.toString());
        line.put("productName", "레드라인 IT 제품");
        line.put("modelName", "RED-IT");
        line.put("quantity", 1);
        line.put("unitPrice", 11000);
        line.put("priceVatInclusive", true);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", TODAY.toString());
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "레드라인 거래처");
        body.put("deliveryTag", "DAY");
        body.put("memo", memo);
        body.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(post(SLIPS_PATH)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "작성자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readTree(result.getResponse().getContentAsByteArray())
                .path("data").path("id").asText();
    }

    private void transition(String id, String action) throws Exception {
        mockMvc.perform(post(SLIPS_PATH + "/{id}/" + action, id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk());
    }

    private void captureLineEdit(UUID slipId, int quantity, BigDecimal unitPrice, String actorName) {
        Slip slip = slipRepository.findById(slipId).orElseThrow();
        slip.getLines().get(0).changeQuantity(quantity);
        slip.getLines().get(0).changeUnitPrice(unitPrice);
        Slip saved = slipRepository.saveAndFlush(slip);
        slipRevisionService.capture(saved, SlipRevisionType.EDIT, null, TEST_USER_ID, actorName, null);
    }

    private void patchMemo(String id, String value, String actorName) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("fieldName", "memo");
        body.put("newValue", value);
        mockMvc.perform(patch(SLIPS_PATH + "/{id}/audit/overlay", id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, actorName)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    private JsonNode findField(JsonNode fields, String fieldPath) {
        for (JsonNode field : fields) {
            if (fieldPath.equals(field.path("fieldPath").asText())) {
                return field;
            }
        }
        return null;
    }
}
