package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
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
import com.samhanair.logis.slip.domain.SlipCleanupProgramType;
import com.samhanair.logis.slip.repository.SlipCleanupSaveHistoryRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 전표정리 저장내역 통합 테스트.
 *
 * <p>Testcontainers PostgreSQL + Flyway schema 로 저장/조회/복원과 권한, 사용자 격리,
 * 날짜 경계, partial unique race guard 를 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class SlipCleanupSaveHistoryIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/slips/cleanup/history";
    private static final String USER_A = "00000000-0000-0000-0000-000000000071";
    private static final String USER_B = "00000000-0000-0000-0000-000000000072";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipCleanupSaveHistoryRepository repository;
    @Autowired private JdbcTemplate jdbcTemplate;

    /** 외부 client 전체 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ArologisDispatchClient arologisDispatchClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private ProductClient productClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpUserInternalClient() {
        org.mockito.Mockito.lenient().when(userInternalClient.resolveFullName(org.mockito.ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
    }

    @BeforeEach
    @AfterEach
    void cleanHistory() {
        jdbcTemplate.update("DELETE FROM slip_cleanup_save_history");
    }

    @Test
    @DisplayName("MANUAL_NAMED 는 append 저장되고 목록/상세로 복원된다")
    void manualNamedAppendListDetailFlow() throws Exception {
        LocalDate now = LocalDate.now();
        String fromDate = now.minusDays(1).toString();
        String toDate = now.plusDays(1).toString();
        MvcResult firstCreated = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("오전 마감 점검", 2))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.savedAt").exists())
                .andReturn();

        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("cycle1-second", 4))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.savedAt").exists());

        MvcResult listed = mockMvc.perform(get(BASE_URL)
                        .param("programType", "SLIP_CLEANUP")
                        .param("mode", "MANUAL_NAMED")
                        .param("from", fromDate)
                        .param("to", toDate)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].topic").value("cycle1-second"))
                .andExpect(jsonPath("$.data.content[0].rowCount").value(4))
                .andExpect(jsonPath("$.data.content[1].topic").value("오전 마감 점검"))
                .andExpect(jsonPath("$.data.content[1].rowCount").value(2))
                .andReturn();

        String historyId = objectMapper.readTree(listed.getResponse().getContentAsString())
                .path("data").path("content").path(1).path("id").asText();

        mockMvc.perform(get(BASE_URL + "/" + historyId)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.topic").value("오전 마감 점검"))
                .andExpect(jsonPath("$.data.responsePayload.totalSlips").value(2));
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

        assertThat(repository.countActiveAutoLatest(USER_A, SlipCleanupProgramType.SLIP_CLEANUP))
                .isEqualTo(1);

        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "SLIP_CLEANUP")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saveMode").value("AUTO_LATEST"))
                .andExpect(jsonPath("$.data.topic").value("자동저장"))
                .andExpect(jsonPath("$.data.responsePayload.totalSlips").value(4));
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

        assertThat(repository.countActiveAutoLatest(USER_A, SlipCleanupProgramType.SLIP_CLEANUP))
                .isEqualTo(1);
        Integer activeRows = jdbcTemplate.queryForObject("""
                SELECT count(*)
                  FROM slip_cleanup_save_history
                 WHERE created_by = ?
                   AND program_type = 'SLIP_CLEANUP'
                   AND save_mode = 'AUTO_LATEST'
                   AND is_deleted = FALSE
                """, Integer.class, USER_A);
        assertThat(activeRows).isEqualTo(1);
    }

    @Test
    @DisplayName("latest 미존재 시 404")
    void latestNotFoundReturns404() throws Exception {
        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "SLIP_CLEANUP")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SLIP_CLEANUP_HISTORY_NOT_FOUND"));
    }

    @Test
    @DisplayName("다른 사용자의 저장내역 UUID 직접 접근은 404")
    void otherUserDetailAccessHidden() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody(1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andReturn();
        UUID id = repository.findAll().stream().findFirst().orElseThrow().getId();

        mockMvc.perform(get(BASE_URL + "/" + id)
                        .header("X-User-Id", USER_B)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SLIP_CLEANUP_HISTORY_NOT_FOUND"));
    }

    @Test
    @DisplayName("MANUAL_NAMED topic blank 는 400 INVALID_INPUT")
    void manualNamedBlankTopicReturns400() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("  ", 1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("저장주제")));
    }

    @Test
    @DisplayName("soft-delete 된 저장내역 상세 복원은 404")
    void restoreDeletedHistoryReturns404() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("삭제 row", 1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andReturn();
        UUID id = repository.findAll().stream().findFirst().orElseThrow().getId();
        jdbcTemplate.update("""
                UPDATE slip_cleanup_save_history
                   SET is_deleted = TRUE, deleted_by = ?, deleted_at = now()
                 WHERE id = ?
                """, USER_A, id);

        mockMvc.perform(get(BASE_URL + "/" + id)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SLIP_CLEANUP_HISTORY_NOT_FOUND"));
    }

    @Test
    @DisplayName("payload 100KB 초과 시 422")
    void oversizedPayloadReturns422() throws Exception {
        JsonNode payload = objectMapper.createObjectNode().put("body", "x".repeat(101 * 1024));
        String body = objectMapper.writeValueAsString(Map.of(
                "programType", "SLIP_CLEANUP",
                "saveMode", "MANUAL_NAMED",
                "topic", "큰 결과",
                "requestParams", Map.of("rowCount", 1),
                "responsePayload", payload));

        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SLIP_CLEANUP_HISTORY_PAYLOAD_TOO_LARGE"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("너무 큽니다")));
    }

    @Test
    @DisplayName("기존 /slips/cleanup 권한과 동일하게 SALES/MANAGER/MASTER 만 허용한다")
    void roleGuardMatchesSlipCleanupEndpoint() throws Exception {
        for (String role : java.util.List.of("SALES", "MANAGER", "MASTER")) {
            mockMvc.perform(post(BASE_URL)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(autoBody(1))
                            .header("X-User-Id", USER_A)
                            .header("X-User-Role", role))
                    .andExpect(status().isOk());
        }
        org.mockito.Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq("slip.cleanup-history"),
                        ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody(1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("동일일 from=to 목록 조회는 당일 row 를 포함한다")
    void sameDayFromToIncludesRows() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("동일일 점검", 3))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());

        String today = java.time.LocalDate.now().toString();
        mockMvc.perform(get(BASE_URL)
                        .param("programType", "SLIP_CLEANUP")
                        .param("mode", "MANUAL_NAMED")
                        .param("from", today)
                        .param("to", today)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1));
    }

    @Test
    @DisplayName("from/to null 목록 조회는 전체 활성 row 를 반환한다")
    void nullFromToReturnsAllActiveRows() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("전체 기간 점검", 5))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());

        mockMvc.perform(get(BASE_URL)
                        .param("programType", "SLIP_CLEANUP")
                        .param("mode", "MANUAL_NAMED")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1));
    }

    private String manualBody(String topic, int rowCount) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "programType", "SLIP_CLEANUP",
                "saveMode", "MANUAL_NAMED",
                "topic", topic,
                "requestParams", Map.of("from", "2026-05-01", "to", "2026-05-16", "rowCount", rowCount),
                "responsePayload", Map.of("totalSlips", rowCount, "entries",
                        java.util.List.of(Map.of("slipNo", "2026/05/16-1")))));
    }

    private String autoBody(int rowCount) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "programType", "SLIP_CLEANUP",
                "saveMode", "AUTO_LATEST",
                "requestParams", Map.of("from", "2026-05-01", "to", "2026-05-16", "rowCount", rowCount),
                "responsePayload", Map.of("totalSlips", rowCount)));
    }

    private int postAutoAfterBarrier(CyclicBarrier barrier, int rowCount) {
        try {
            barrier.await();
            return mockMvc.perform(post(BASE_URL)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(autoBody(rowCount))
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
