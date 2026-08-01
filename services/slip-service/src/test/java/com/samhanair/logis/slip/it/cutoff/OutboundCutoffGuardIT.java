package com.samhanair.logis.slip.it.cutoff;

import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 출고전표 마감 게이트(OutboundCutoffGuard) 통합 테스트.
 *
 * <p>고정 {@link Clock}({@code @MockBean}) 을 사용해 마감 전/후 시각을 제어한다.
 * V51 기본 시드(REGION 12:00 / STACK 14:00 / GYEONGDONG_PARCEL 15:00) 를 전제한다.
 *
 * <p>테스트 시나리오:
 * <ol>
 *   <li>마감 전 REGION 수동 생성 → 200</li>
 *   <li>마감 후 REGION 수동 생성 → 409</li>
 *   <li>미설정 태그(DAY, 시드 없음) 생성 → 통과</li>
 *   <li>slipDate=내일 REGION 생성 → 통과(미래 전표)</li>
 *   <li>발행 경로(태그 null) 마감 후 생성 → 통과(태그 확정 전)</li>
 *   <li>DRAFT 생성 후 마감 후 editHeader REGION 태그 설정 → 409</li>
 *   <li>마감 후 editHeader 태그 미변경(memo만) → 통과</li>
 *   <li>마감 전 editHeader REGION 태그 설정 → 200</li>
 *   <li>게이트⑧ 배치수정(v20) 마감 후 REGION 태그 설정 → 409</li>
 *   <li>게이트⑧ 배치수정(v20) 마감 후 태그 미변경 → 통과</li>
 * </ol>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
class OutboundCutoffGuardIT extends com.samhanair.logis.slip.it.AbstractPostgresIT {

    private static final String USER_ID = "10000000-0000-0000-0000-000000000010";
    private static final String USER_ROLE = "MASTER";
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    /** V51 기본 시드: REGION 12:00:00 KST. */
    private static final String REGION_CUTOFF = "12:00";

    @Autowired private MockMvc mvc;

    /**
     * Clock을 @MockBean으로 교체 — OutboundCutoffGuard 가 주입받아 시각 판정.
     * 기본값은 마감 전(11:00 KST). 각 테스트에서 필요한 시각으로 override.
     */
    @MockBean private Clock clock;

    // 외부 RestClient 격리
    @MockBean private ArologisDispatchClient arologisDispatchClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpClockAndClients() {
        // 기본 시각: 마감 전 11:00 KST 오늘
        setClockKst(11, 0);

        // 외부 클라이언트 lenient stub
        lenient().when(partnerInternalClient.verifyPartnerCode(Mockito.anyString()))
                .thenReturn(com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult.skipped(Optional.empty()));
        lenient().when(partnerInternalClient.resolvePartnerCode(Mockito.any(UUID.class)))
                .thenReturn(Optional.empty());
        lenient().when(userInternalClient.resolveFullName(Mockito.any()))
                .thenReturn(Optional.empty());
        lenient().when(warehouseInternalClient.findWarehouseName(Mockito.any(UUID.class)))
                .thenReturn(Optional.empty());
        lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        UUID.fromString("00000000-0000-0000-0001-000000000001"),
                        "테스트상품", "TEST-MODEL",
                        "TEST-CODE",
                        null, null, "ACTIVE", false, "TEST-MODEL", "REGULAR")));
    }

    // ── 생성 경로 ──────────────────────────────────────────────────────────

    /**
     * [시나리오 1] 마감 전(11:00) 당일 REGION 출고전표 수동 생성 → 201.
     */
    @Test
    void create_regionTag_beforeCutoff_returns200() throws Exception {
        setClockKst(11, 0); // 11:00 KST — 마감 12:00 전
        String today = LocalDate.now(KST).toString();

        mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest("REGION", today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.deliveryTag").value("REGION"));
    }

    /**
     * [시나리오 2] 마감 후(13:00) 당일 REGION 출고전표 수동 생성 → 409.
     */
    @Test
    void create_regionTag_afterCutoff_returns409() throws Exception {
        setClockKst(13, 0); // 13:00 KST — 마감 12:00 초과
        String today = LocalDate.now(KST).toString();

        mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest("REGION", today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("당일 마감")));
    }

    /**
     * [시나리오 3] 미설정 태그(DAY, V51 기본 시드 없음) → 마감 후에도 통과(opt-in).
     */
    @Test
    void create_dayTag_noCutoffSeed_returnsOk() throws Exception {
        setClockKst(23, 0); // 깊은 밤이어도 통과
        String today = LocalDate.now(KST).toString();

        mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest("DAY", today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated());
    }

    /**
     * [시나리오 4] slipDate=내일 REGION 출고전표 → 마감 후에도 통과(미래 전표).
     */
    @Test
    void create_regionTag_tomorrowDate_returnsOk() throws Exception {
        setClockKst(13, 0); // 마감 후
        String tomorrow = LocalDate.now(KST).plusDays(1).toString();

        mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest("REGION", tomorrow))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated());
    }

    /**
     * [시나리오 5] 발행/견적변환/모바일 경로 시뮬레이션 — 태그 null DRAFT 를 마감 후(13:00) 생성 → 통과.
     * 생성 시 태그 null 이라 마감 게이트를 통과하고, 태그 확정(editHeader/v20) 시점에 게이트가 적용된다(D8 R2).
     */
    @Test
    void create_nullTag_afterCutoff_returnsOk() throws Exception {
        setClockKst(13, 0); // 마감 후이지만 태그 null → 통과
        String today = LocalDate.now(KST).toString();

        mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest(null, today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated());
    }

    // ── 태그확정(editHeader) 경로 ────────────────────────────────────────

    /**
     * [시나리오 6] 마감 전 DRAFT 생성(태그 null) → 마감 후 editHeader REGION 태그 설정 → 409.
     * D8 핵심 — 태그 붙는 순간 마감 적용.
     */
    @Test
    void editHeader_addRegionTagAfterCutoff_returns409() throws Exception {
        // 1. 마감 전 DRAFT 생성 (태그 null — 발행 경로 시뮬레이션)
        setClockKst(11, 0);
        String today = LocalDate.now(KST).toString();
        String createResp = mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest(null, today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        String slipId = extractId(createResp);

        // 2. 마감 후 editHeader — REGION 태그 설정 → 409
        setClockKst(13, 0);
        mvc.perform(patch("/slips/{id}/header", slipId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deliveryTag": "REGION"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("당일 마감")));
    }

    /**
     * [시나리오 7] 마감 후 editHeader 태그 미변경(memo만 수정) → 통과.
     * 기존 당일 전표 일반 수정 비차단 확인.
     */
    @Test
    void editHeader_memoOnly_afterCutoff_returnsOk() throws Exception {
        // 1. 마감 전 REGION 전표 생성
        setClockKst(11, 0);
        String today = LocalDate.now(KST).toString();
        String createResp = mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest("REGION", today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        String slipId = extractId(createResp);

        // 2. 마감 후 memo만 수정 (태그 미변경) → 200
        setClockKst(13, 0);
        mvc.perform(patch("/slips/{id}/header", slipId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"memo": "변경된 메모"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk());
    }

    /**
     * [시나리오 8] 마감 전 editHeader REGION 태그 설정 → 200.
     */
    @Test
    void editHeader_addRegionTagBeforeCutoff_returns200() throws Exception {
        // 1. 마감 전 태그 null DRAFT 생성
        setClockKst(10, 0);
        String today = LocalDate.now(KST).toString();
        String createResp = mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest(null, today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        String slipId = extractId(createResp);

        // 2. 마감 전 editHeader REGION 태그 설정 → 200
        setClockKst(11, 0); // 여전히 마감 전
        mvc.perform(patch("/slips/{id}/header", slipId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deliveryTag": "REGION"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.deliveryTag").value("REGION"));
    }

    // ── 태그확정(배치수정 v20 = 게이트⑧) 경로 ─────────────────────────────

    /**
     * [시나리오 9] 게이트⑧ — 배치 헤더수정(PATCH /slips/{id}/v20) 으로 마감 후 REGION 태그 설정 → 409.
     */
    @Test
    void updateV20_addRegionTagAfterCutoff_returns409() throws Exception {
        // 1. 마감 전 태그 null DRAFT 생성
        setClockKst(11, 0);
        String today = LocalDate.now(KST).toString();
        String createResp = mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest(null, today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String slipId = extractId(createResp);

        // 2. 마감 후 v20 으로 REGION 태그 설정 → 409
        setClockKst(13, 0);
        mvc.perform(patch("/slips/{id}/v20", slipId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deliveryTag": "REGION"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("당일 마감")));
    }

    /**
     * [시나리오 10] 게이트⑧ — 배치 헤더수정 마감 후 태그 미변경(현장명만 수정) → 통과.
     */
    @Test
    void updateV20_noTagChange_afterCutoff_returnsOk() throws Exception {
        // 1. 마감 전 REGION 전표 생성
        setClockKst(11, 0);
        String today = LocalDate.now(KST).toString();
        String createResp = mvc.perform(post("/slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(buildCreateRequest("REGION", today))
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String slipId = extractId(createResp);

        // 2. 마감 후 v20 으로 태그 외 필드(현장명)만 수정 → 통과(태그 미변경)
        setClockKst(13, 0);
        mvc.perform(patch("/slips/{id}/v20", slipId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"projectName": "변경된 현장명"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk());
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────

    /**
     * 고정 시각을 KST 기준 hour:minute 으로 설정한다.
     * Clock.getZone() = Asia/Seoul, LocalDate.now(clock.getZone()) = 오늘(KST).
     */
    private void setClockKst(int hour, int minute) {
        LocalDate today = LocalDate.now(KST);
        Instant fixedInstant = today.atTime(hour, minute)
                .atZone(KST)
                .toInstant();
        Mockito.lenient().when(clock.instant()).thenReturn(fixedInstant);
        Mockito.lenient().when(clock.getZone()).thenReturn(KST);
    }

    /** 출고전표 생성 요청 JSON 을 빌드한다. deliveryTag null 이면 필드 생략. */
    private String buildCreateRequest(String deliveryTag, String slipDate) {
        String tagField = deliveryTag != null
                ? "\"deliveryTag\": \"" + deliveryTag + "\","
                : "";
        // productId = product-service seeder 결정적 UUID (slip-service IT 관행)
        return """
                {
                  "slipType": "OUTBOUND",
                  "slipDate": "%s",
                  %s
                  "sourceWarehouseId": "11111111-1111-1111-1111-000000000001",
                  "lines": [
                    {
                      "productId": "00000000-0000-0001-0000-000000000001",
                      "productName": "테스트상품",
                      "modelName": "TEST-MODEL",
                      "quantity": 1,
                      "unitPrice": 100000
                    }
                  ]
                }
                """.formatted(slipDate, tagField);
    }

    private static String extractId(String json) {
        String marker = "\"id\":\"";
        int start = json.indexOf(marker);
        if (start < 0) {
            throw new IllegalStateException("id 필드를 찾을 수 없습니다");
        }
        int valueStart = start + marker.length();
        int valueEnd = json.indexOf('"', valueStart);
        return json.substring(valueStart, valueEnd);
    }
}
