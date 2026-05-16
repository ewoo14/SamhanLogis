package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipDispatchTaskClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.DispatchProgramType;
import com.samhanair.logis.arologis.repository.DispatchSaveHistoryRepository;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 배차 저장내역 통합 테스트.
 *
 * <p>Testcontainers PostgreSQL + Flyway schema 로 저장/조회/복원과 권한, 사용자 격리,
 * 날짜 경계를 검증한다.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class DispatchSaveHistoryIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/admin/arologis/dispatches/history";
    private static final String USER_A = "dispatch-user-a";
    private static final String USER_B = "dispatch-user-b";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DispatchSaveHistoryRepository repository;
    @Autowired private JdbcTemplate jdbcTemplate;

    /** 외부 client 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private PartnerClient partnerClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private SlipClient slipClient;
    @MockBean private SlipDispatchTaskClient slipDispatchTaskClient;
    @MockBean private SlipServiceClient slipServiceClient;

    @BeforeEach
    @AfterEach
    void cleanHistory() {
        jdbcTemplate.update("DELETE FROM dispatch_save_history");
    }

    @Test
    @DisplayName("MANUAL_NAMED 는 append 저장되고 목록/상세로 복원된다")
    void manualNamedAppendListDetailFlow() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("PRE_CLASSIFY", "오전 마감 점검", 2))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").exists())
                .andExpect(jsonPath("$.data.savedAt").exists())
                .andReturn();

        String historyId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asText();

        mockMvc.perform(get(BASE_URL)
                        .param("programType", "PRE_CLASSIFY")
                        .param("mode", "MANUAL_NAMED")
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].topic").value("오전 마감 점검"))
                .andExpect(jsonPath("$.data.content[0].rowCount").value(2));

        mockMvc.perform(get(BASE_URL + "/" + historyId)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.topic").value("오전 마감 점검"))
                .andExpect(jsonPath("$.data.responsePayload.rowCount").value(2));
    }

    @Test
    @DisplayName("AUTO_LATEST 는 사용자+프로그램별 활성 1건만 유지한다")
    void autoLatestKeepsOneActiveRowPerUserAndProgram() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody("PRE_CLASSIFY", 1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody("PRE_CLASSIFY", 4))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());

        assertThat(repository.countActiveAutoLatest(USER_A, DispatchProgramType.PRE_CLASSIFY)).isEqualTo(1);

        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "PRE_CLASSIFY")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saveMode").value("AUTO_LATEST"))
                .andExpect(jsonPath("$.data.topic").value("자동저장"))
                .andExpect(jsonPath("$.data.responsePayload.rowCount").value(4));
    }

    @Test
    @DisplayName("AUTO_LATEST 동시 저장은 partial unique 충돌 후 재시도되어 활성 1건만 남는다")
    void concurrentAutoLatestRaceKeepsOneActiveRow() throws Exception {
        int threadCount = 3;
        var executor = Executors.newFixedThreadPool(threadCount);
        var barrier = new CyclicBarrier(threadCount);
        try {
            var results = IntStream.rangeClosed(11, 13)
                    .mapToObj(rowCount -> CompletableFuture.supplyAsync(
                            () -> postAutoAfterBarrier(barrier, rowCount), executor))
                    .toList();

            for (CompletableFuture<Integer> result : results) {
                assertThat(result.get()).isEqualTo(200);
            }
        } finally {
            executor.shutdownNow();
        }

        assertThat(repository.countActiveAutoLatest(USER_A, DispatchProgramType.PRE_CLASSIFY)).isEqualTo(1);

        Integer totalRows = jdbcTemplate.queryForObject("""
                SELECT count(*)
                  FROM dispatch_save_history
                 WHERE created_by = ?
                   AND program_type = 'PRE_CLASSIFY'
                   AND save_mode = 'AUTO_LATEST'
                """, Integer.class, USER_A);
        Integer supersededRows = jdbcTemplate.queryForObject("""
                SELECT count(*)
                  FROM dispatch_save_history
                 WHERE created_by = ?
                   AND program_type = 'PRE_CLASSIFY'
                   AND save_mode = 'AUTO_LATEST'
                   AND is_deleted = TRUE
                """, Integer.class, USER_A);
        Integer latestRowCount = jdbcTemplate.queryForObject("""
                SELECT (response_payload ->> 'rowCount')::int
                  FROM dispatch_save_history
                 WHERE created_by = ?
                   AND program_type = 'PRE_CLASSIFY'
                   AND save_mode = 'AUTO_LATEST'
                 ORDER BY created_at DESC
                 LIMIT 1
                """, Integer.class, USER_A);

        assertThat(totalRows).isEqualTo(3);
        assertThat(supersededRows).isEqualTo(2);

        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "PRE_CLASSIFY")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.responsePayload.rowCount").value(latestRowCount));
    }

    @Test
    @DisplayName("latest 미존재 시 404")
    void latestNotFoundReturns404() throws Exception {
        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "REGIONAL")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("다른 사용자의 저장내역 UUID 직접 접근은 403")
    void otherUserDetailAccessForbidden() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody("UNASSIGNED", 1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andReturn();
        UUID id = UUID.fromString(objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asText());

        mockMvc.perform(get(BASE_URL + "/" + id)
                        .header("X-User-Id", USER_B)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    @DisplayName("MANUAL_NAMED topic blank 는 400 INVALID_INPUT")
    void manualNamedBlankTopicReturns400() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("PRE_CLASSIFY", "  ", 1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("저장주제")));
    }

    @Test
    @DisplayName("soft-delete 된 저장내역 상세 복원은 404")
    void restoreDeletedHistoryReturns404() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("UNASSIGNED", "삭제 row", 1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andReturn();
        UUID id = UUID.fromString(objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asText());
        jdbcTemplate.update("""
                UPDATE dispatch_save_history
                   SET is_deleted = TRUE, deleted_by = ?, deleted_at = now()
                 WHERE id = ?
                """, USER_A, id);

        mockMvc.perform(get(BASE_URL + "/" + id)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    @DisplayName("payload 100KB 초과 시 422")
    void oversizedPayloadReturns422() throws Exception {
        JsonNode payload = objectMapper.createObjectNode().put("body", "x".repeat(101 * 1024));
        String body = objectMapper.writeValueAsString(Map.of(
                "programType", "RECONCILE",
                "saveMode", "MANUAL_NAMED",
                "topic", "큰 결과",
                "requestParams", Map.of("rowCount", 1),
                "responsePayload", payload));

        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("DISPATCH_HISTORY_PAYLOAD_TOO_LARGE"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("너무 큽니다")));
    }

    @Test
    @DisplayName("권한 미달 role 은 403")
    void insufficientRoleReturns403() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody("PRE_CLASSIFY", 1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DRIVER"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("동일일 from=to 목록 조회는 당일 row 를 포함한다")
    void sameDayFromToIncludesRows() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("UNASSIGNED", "동일일 점검", 3))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk());

        String today = java.time.LocalDate.now().toString();
        mockMvc.perform(get(BASE_URL)
                        .param("programType", "UNASSIGNED")
                        .param("mode", "MANUAL_NAMED")
                        .param("from", today)
                        .param("to", today)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1));
    }

    @Test
    @DisplayName("from/to null 목록 조회는 전체 활성 row 를 반환한다")
    void nullFromToReturnsAllActiveRows() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("RECONCILE", "전체 기간 점검", 5))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk());

        mockMvc.perform(get(BASE_URL)
                        .param("programType", "RECONCILE")
                        .param("mode", "MANUAL_NAMED")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1));
    }

    private String manualBody(String programType, String topic, int rowCount) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "programType", programType,
                "saveMode", "MANUAL_NAMED",
                "topic", topic,
                "requestParams", Map.of("from", "2026-05-01", "to", "2026-05-16", "rowCount", rowCount),
                "responsePayload", Map.of("rowCount", rowCount, "rows", java.util.List.of(Map.of("slipNo", "2026/05/16-1")))));
    }

    private String autoBody(String programType, int rowCount) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "programType", programType,
                "saveMode", "AUTO_LATEST",
                "requestParams", Map.of("from", "2026-05-01", "to", "2026-05-16", "rowCount", rowCount),
                "responsePayload", Map.of("rowCount", rowCount)));
    }

    private int postAutoAfterBarrier(CyclicBarrier barrier, int rowCount) {
        try {
            barrier.await();
            return mockMvc.perform(post(BASE_URL)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(autoBody("PRE_CLASSIFY", rowCount))
                            .header("X-User-Id", USER_A)
                            .header("X-User-Role", "MANAGER"))
                    .andReturn()
                    .getResponse()
                    .getStatus();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
