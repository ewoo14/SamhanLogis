package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import com.samhanair.logis.inventory.repository.DpsSaveHistoryRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * DPS 저장내역 통합 테스트.
 *
 * <p>Testcontainers PostgreSQL + Flyway schema 로 POST → 목록 → 상세 → latest 흐름과
 * 사용자 격리, AUTO_LATEST soft-delete 교체 정책을 검증한다.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DpsSaveHistoryIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/warehouse/audit/dps-history";
    private static final String USER_A = "10000000-0000-0000-0000-000000000211";
    private static final String USER_B = "10000000-0000-0000-0000-000000000212";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DpsSaveHistoryRepository repository;
    @Autowired private JdbcTemplate jdbcTemplate;

    /** 외부 client 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private ProductClient productClient;
    @MockBean private AccountingClient accountingClient;
    @MockBean private SlipClient slipClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private NotificationClient notificationClient;

    @BeforeEach
    void cleanHistory() {
        jdbcTemplate.update("DELETE FROM dps_save_history");
    }

    @Test
    @DisplayName("POST → 목록 → 상세 → latest 전체 흐름")
    void postListDetailLatestFlow() throws Exception {
        LocalDate now = LocalDate.now();
        String fromDate = now.minusDays(1).toString();
        String toDate = now.plusDays(1).toString();
        String manualBody = """
                {
                  "programType": "DPS_COMPARE",
                  "saveMode": "MANUAL_NAMED",
                  "topic": "오전 마감 점검",
                  "requestParams": {"from":"2026-05-01","to":"2026-05-16","mismatchCount":2},
                  "responsePayload": {"mismatchCount":2,"mismatches":[{"slipNo":"2026/05/16-1"}]}
                }
                """;

        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.savedAt").exists())
                .andReturn();

        MvcResult listed = mockMvc.perform(get(BASE_URL)
                        .param("programType", "DPS_COMPARE")
                        .param("mode", "MANUAL_NAMED")
                        .param("from", fromDate)
                        .param("to", toDate)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].topic").value("오전 마감 점검"))
                .andExpect(jsonPath("$.data.content[0].mismatchCount").value(2))
                .andReturn();

        String historyId = objectMapper.readTree(listed.getResponse().getContentAsString())
                .path("data").path("content").path(0).path("id").asText();

        mockMvc.perform(get(BASE_URL + "/" + historyId)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.topic").value("오전 마감 점검"))
                .andExpect(jsonPath("$.data.responsePayload.mismatchCount").value(2));

        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody(3))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "DPS_COMPARE")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saveMode").value("AUTO_LATEST"))
                .andExpect(jsonPath("$.data.topic").value("자동저장"))
                .andExpect(jsonPath("$.data.responsePayload.mismatchCount").value(3));
    }

    @Test
    @DisplayName("AUTO_LATEST 는 사용자+프로그램별 활성 1건만 유지한다")
    void autoLatestKeepsOneActiveRowPerUserAndProgram() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody(1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody(4))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());

        assertThat(repository.countActiveAutoLatest(USER_A,
                com.samhanair.logis.inventory.domain.DpsProgramType.DPS_COMPARE)).isEqualTo(1);

        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "DPS_COMPARE")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.responsePayload.mismatchCount").value(4));
    }

    @Test
    @DisplayName("다른 사용자의 저장내역 UUID 직접 접근은 403")
    void otherUserDetailAccessForbidden() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody(1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();
        UUID id = repository.findAll().stream().findFirst().orElseThrow().getId();

        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.eq("inventory.dps"), Mockito.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get(BASE_URL + "/" + id)
                        .header("X-User-Id", USER_B)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("latest 미존재 시 404")
    void latestNotFoundReturns404() throws Exception {
        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "DPS_BY_PRODUCT")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("payload 100KB 초과 시 422")
    void oversizedPayloadReturns422() throws Exception {
        JsonNode payload = objectMapper.createObjectNode().put("body", "x".repeat(101 * 1024));
        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "programType", "DPS_COMPARE",
                "saveMode", "MANUAL_NAMED",
                "topic", "큰 결과",
                "requestParams", java.util.Map.of("mismatchCount", 1),
                "responsePayload", payload));

        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isUnprocessableEntity());
    }

    private String autoBody(int mismatchCount) {
        return """
                {
                  "programType": "DPS_COMPARE",
                  "saveMode": "AUTO_LATEST",
                  "requestParams": {"from":"2026-05-01","to":"2026-05-16","mismatchCount": %d},
                  "responsePayload": {"mismatchCount": %d}
                }
                """.formatted(mismatchCount, mismatchCount);
    }
}
