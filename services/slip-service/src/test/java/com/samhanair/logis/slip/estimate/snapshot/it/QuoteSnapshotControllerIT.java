package com.samhanair.logis.slip.estimate.snapshot.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
 *   <li>저장(POST) 201 + X-Internal-Token 인증(P0-A 하드닝) + meta 반환</li>
 *   <li>불러오기(GET) — 저장한 blob/이미지 그대로 복원(EXACT) + 최신순</li>
 *   <li>사용자별 격리 — 다른 userEmail 은 빈 목록</li>
 *   <li>날짜 범위 필터 (startDate/endDate)</li>
 *   <li>userEmail/data 누락 시 400</li>
 *   <li>P0-A 하드닝 enforcement — 무토큰 403 / 오토큰 401 / 위조 X-User-* 403</li>
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
    @DisplayName("저장 201 → 불러오기 시 JSON 상태와 합계를 복원")
    void save_then_restore_exact() throws Exception {
        String blob = "eyJsaW5lcyI6W3sibW9kZWwiOiJBQzA1MiJ9XX0=";

        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "삼한공조", blob, null, "2026-06-09T12:00:00+09:00"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").isNotEmpty())
                .andExpect(jsonPath("$.data.custName").value("삼한공조"));

        // 불러오기 — 저장한 blob/이미지가 그대로(EXACT) 복원되는지
        mockMvc.perform(get(PATH).header(TOKEN_HEADER, VALID_TOKEN).param("userEmail", USER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$.data[0].custName").value("삼한공조"))
                .andExpect(jsonPath("$.data[0].data.lines[0].model").value("AC052"))
                .andExpect(jsonPath("$.data[0].authorEmail").value(USER_A))
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
    @DisplayName("#31 거래처명 부분검색 — contains + 전체 작성자 조회 + 최신순")
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

        // '삼한' contains — USER_A와 USER_B의 견적을 모두 조회
        mockMvc.perform(get(PATH + "/by-customer").header(TOKEN_HEADER, VALID_TOKEN)
                        .param("custName", "삼한"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.data[0].custName").value("삼한설비"))
                .andExpect(jsonPath("$.data[0].authorEmail").value(USER_B));

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

    @Test
    @DisplayName("RED-1009 저장은 JSON 상태·작성자·계산 합계를 DB 계약으로 보존해야 한다")
    void save_jsonState_author_and_totals_are_persisted() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userEmail", USER_A);
        body.put("createdAt", "2026-08-01T10:00:00+09:00");
        body.put("data", Map.of("form", Map.of("qty", 2), "branch", Map.of("mode", "HOME")));
        body.put("summary", Map.of("custName", "JSON 거래처"));
        body.put("supplyAmount", 100000);
        body.put("vatAmount", 10000);
        body.put("totalAmount", 110000);

        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.authorEmail").value(USER_A))
                .andExpect(jsonPath("$.data.totalAmount").value(110000));
    }

    @Test
    @DisplayName("RED-1009 목록은 작성자와 무관하게 타인 견적도 조회해야 한다")
    void history_includes_other_users_quotes() throws Exception {
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "작성자 견적", "ZGF0YUE=", null, "2026-08-01T10:00:00+09:00"))))
                .andExpect(status().isCreated());
        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_B, "타인 견적", "ZGF0YUI=", null, "2026-08-01T11:00:00+09:00"))))
                .andExpect(status().isCreated());

        mockMvc.perform(get(PATH).header(TOKEN_HEADER, VALID_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.data[?(@.authorEmail == '" + USER_B + "')]").isNotEmpty());
    }

    @Test
    @DisplayName("RED-1009 타인 수정은 거부하고 본인 수정은 허용해야 한다")
    void only_author_can_update() throws Exception {
        String response = mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                saveBody(USER_A, "소유 견적", "ZGF0YUE=", null, "2026-08-01T10:00:00+09:00"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = objectMapper.readTree(response).path("data").path("id").asText();

        Map<String, Object> update = new LinkedHashMap<>();
        update.put("userEmail", USER_B);
        update.put("data", Map.of("form", Map.of("qty", 3)));
        update.put("summary", Map.of("custName", "탈취 시도"));
        update.put("totalAmount", 330000);

        mockMvc.perform(put(PATH + "/" + id).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isForbidden());

        update.put("userEmail", USER_A);
        update.put("totalAmount", 220000);
        mockMvc.perform(put(PATH + "/" + id).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalAmount").value(220000));
    }

    @Test
    @DisplayName("RED-1009 저장 후 재조회해도 저장된 총액 숫자가 동일하다")
    void reopen_preserves_numeric_total() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userEmail", USER_A);
        body.put("data", Map.of("lines", java.util.List.of(Map.of("qty", 2, "unitPrice", 50000))));
        body.put("summary", Map.of("custName", "금액 검증"));
        body.put("supplyAmount", 100000);
        body.put("vatAmount", 10000);
        body.put("totalAmount", 110000);

        mockMvc.perform(post(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        mockMvc.perform(get(PATH).header(TOKEN_HEADER, VALID_TOKEN)
                        .param("userEmail", USER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].totalAmount").value(110000));
    }
}
