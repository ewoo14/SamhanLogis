package com.samhanair.logis.slip.estimate.snapshot.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 종합견적서 견적 저장/불러오기 Controller 통합 테스트 — P0-A (Notion 견적 DB → 우리 DB).
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>저장(POST) 201 + 무인증 통과(permitAll) + meta 반환</li>
 *   <li>불러오기(GET) — 저장한 blob/이미지 그대로 복원(EXACT) + 최신순</li>
 *   <li>사용자별 격리 — 다른 userEmail 은 빈 목록</li>
 *   <li>날짜 범위 필터 (startDate/endDate)</li>
 *   <li>userEmail/data 누락 시 400</li>
 * </ol>
 *
 * <p>외부 client 전체 {@code @MockBean} 격리(EstimateControllerIT 와 동일 세트 — 컨텍스트 캐시 재사용).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class QuoteSnapshotControllerIT extends AbstractPostgresIT {

    private static final String PATH = "/internal/estimates/snapshots";
    private static final String TOKEN_HEADER = "X-Internal-Token";
    // AbstractPostgresIT @DynamicPropertySource 고정 주입값
    private static final String VALID_TOKEN = "test-internal-token";
    private static final String USER_A = "alice@samhan-air.com";
    private static final String USER_B = "bob@samhan-air.com";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;
    @MockBean private ArologisDispatchClient arologisDispatchClient;

    private Map<String, Object> saveBody(String userEmail, String custName, String data,
            String image, String createdAt) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("custName", custName);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userEmail", userEmail);
        body.put("createdAt", createdAt);
        body.put("data", data);
        body.put("summary", summary);
        body.put("image", image);
        return body;
    }

    @Test
    @DisplayName("저장 201(무인증 permitAll) → 불러오기 시 blob/이미지 그대로 복원(EXACT)")
    void save_then_restore_exact() throws Exception {
        String blob = "eyJsaW5lcyI6W3sibW9kZWwiOiJBQzA1MiJ9XX0=";  // base64 작업상태 blob
        String image = "data:image/png;base64,AAAABBBBCCCC";

        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "삼한공조", blob, image, "2026-06-09T12:00:00+09:00"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").isNotEmpty())
                .andExpect(jsonPath("$.data.custName").value("삼한공조"));

        // 불러오기 — 저장한 blob/이미지가 그대로(EXACT) 복원되는지
        mockMvc.perform(get(PATH).header(TOKEN_HEADER, VALID_TOKEN).param("userEmail", USER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$.data[0].custName").value("삼한공조"))
                .andExpect(jsonPath("$.data[0].data").value(blob))
                .andExpect(jsonPath("$.data[0].image").value(image))
                .andExpect(jsonPath("$.data[0].created").isNotEmpty());
    }

    @Test
    @DisplayName("사용자별 격리 — 다른 userEmail 은 빈 목록")
    void userIsolation() throws Exception {
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "거래처A", "ZGF0YUE=", null, "2026-06-09T10:00:00+09:00"))))
                .andExpect(status().isCreated());

        mockMvc.perform(get(PATH).header(TOKEN_HEADER, VALID_TOKEN).param("userEmail", USER_B))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(0)));
    }

    @Test
    @DisplayName("#31 거래처명 부분검색 — contains + 사용자 격리 + 최신순")
    void historyByCustomer() throws Exception {
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "삼한공조(주)", "ZGF0YTE=", null, "2026-06-08T10:00:00+09:00"))))
                .andExpect(status().isCreated());
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "영에어시스템", "ZGF0YTI=", null, "2026-06-09T10:00:00+09:00"))))
                .andExpect(status().isCreated());
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_B, "삼한설비", "ZGF0YTM=", null, "2026-06-09T11:00:00+09:00"))))
                .andExpect(status().isCreated());

        // '삼한' contains — USER_A 의 삼한공조(주) 만 (USER_B 의 삼한설비는 격리)
        mockMvc.perform(get(PATH + "/by-customer").header(TOKEN_HEADER, VALID_TOKEN)
                        .param("userEmail", USER_A)
                        .param("custName", "삼한"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$.data[0].custName").value("삼한공조(주)"))
                .andExpect(jsonPath("$.data[0].data").value("ZGF0YTE="));

        // 미매칭 키워드 → 빈 목록
        mockMvc.perform(get(PATH + "/by-customer").header(TOKEN_HEADER, VALID_TOKEN)
                        .param("userEmail", USER_A)
                        .param("custName", "없는거래처"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(0)));
    }

    @Test
    @DisplayName("최신순 정렬 + 날짜 범위 필터")
    void historyOrderingAndDateFilter() throws Exception {
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "예전", "b2xk", null, "2026-05-01T09:00:00+09:00"))))
                .andExpect(status().isCreated());
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "최근", "bmV3", null, "2026-06-08T09:00:00+09:00"))))
                .andExpect(status().isCreated());

        // 최신순 — 최근 먼저
        mockMvc.perform(get(PATH).header(TOKEN_HEADER, VALID_TOKEN).param("userEmail", USER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.data[0].custName").value("최근"))
                .andExpect(jsonPath("$.data[1].custName").value("예전"));

        // 6월 범위만 — 최근 1건
        mockMvc.perform(get(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .param("userEmail", USER_A)
                        .param("startDate", "2026-06-01")
                        .param("endDate", "2026-06-30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$.data[0].custName").value("최근"));
    }

    @Test
    @DisplayName("data 누락 시 400")
    void missingData_badRequest() throws Exception {
        Map<String, Object> body = saveBody(USER_A, "삼한", null, null, "2026-06-09T12:00:00+09:00");
        body.remove("data");
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("P0-A 하드닝 — X-Internal-Token 미제시 저장 → 403")
    void noToken_forbidden() throws Exception {
        mockMvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "무토큰", "ZGF0YQ==", null, "2026-06-10T10:00:00+09:00"))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("P0-A 하드닝 — 토큰 불일치 조회 → 401")
    void wrongToken_unauthorized() throws Exception {
        mockMvc.perform(get(PATH).header(TOKEN_HEADER, "wrong-token").param("userEmail", USER_A))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("P0-A 하드닝 — 위조 X-User-* 헤더로 /internal 우회 불가 → 403")
    void forgedUserHeader_forbidden() throws Exception {
        mockMvc.perform(get(PATH)
                        .header("X-User-Id", java.util.UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .param("userEmail", USER_A))
                .andExpect(status().isForbidden());
    }
}
