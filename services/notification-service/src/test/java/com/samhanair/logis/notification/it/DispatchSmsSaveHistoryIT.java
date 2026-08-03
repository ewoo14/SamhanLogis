package com.samhanair.logis.notification.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.domain.DispatchSmsProgramType;
import com.samhanair.logis.notification.repository.DispatchSmsSaveHistoryRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
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
 * 배차문자 저장내역 통합 테스트.
 *
 * <p>Testcontainers PostgreSQL + Flyway schema 로 미리보기 저장, 명시 저장 append,
 * 사용자 격리, 날짜 경계, partial unique race guard 를 검증한다.
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class DispatchSmsSaveHistoryIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/admin/notifications/dispatch-sms/history";
    private static final String USER_A = "10000000-0000-0000-0000-000000000201";
    private static final String USER_B = "10000000-0000-0000-0000-000000000202";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DispatchSmsSaveHistoryRepository repository;
    @Autowired private JdbcTemplate jdbcTemplate;

    /** 외부 client 전체 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private UserClient userClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private BlockedPartnerLookupClient blockedPartnerLookupClient;
    @MockBean private AligoCsvSourceClient aligoCsvSourceClient;
    @MockBean private AligoAddressBookClient aligoAddressBookClient;
    /**
     * SP-D3 동적 권한 client 격리.
     * lenient stub 기본값: canView/canEdit 모두 true (기존 IT 회귀 0건 보장).
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    @AfterEach
    void cleanHistory() {
        jdbcTemplate.update("DELETE FROM dispatch_sms_save_history");
        // SP-D3 lenient stub — canView=true, canEdit=true 기본값 (기존 IT 회귀 0건 보장)
        org.mockito.Mockito.lenient()
                .when(dynamicPermissionClient.canView(org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString())).thenReturn(true);
        org.mockito.Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString())).thenReturn(true);
        org.mockito.Mockito.lenient()
                .when(dynamicPermissionClient.check(org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class))).thenReturn(true);
    }

    @Test
    @DisplayName("MANUAL_NAMED 는 2건 이상 append 저장되고 edited 본문까지 목록/상세로 복원된다")
    void manualNamedAppendListDetailFlow() throws Exception {
        LocalDate now = LocalDate.now();
        String fromDate = now.minusDays(1).toString();
        String toDate = now.plusDays(1).toString();

        MvcResult createdFirst = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("오전 미리보기 점검", 2, "P-001", "편집 본문 A"))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").exists())
                .andExpect(jsonPath("$.data.savedAt").exists())
                .andReturn();
        MvcResult createdSecond = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("오후 미리보기 점검", 3, "P-002", "편집 본문 B"))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").exists())
                .andExpect(jsonPath("$.data.savedAt").exists())
                .andReturn();

        String firstHistoryId = objectMapper.readTree(createdFirst.getResponse().getContentAsString())
                .path("data").path("id").asText();
        String secondHistoryId = objectMapper.readTree(createdSecond.getResponse().getContentAsString())
                .path("data").path("id").asText();

        mockMvc.perform(get(BASE_URL)
                        .param("programType", "DISPATCH_SMS")
                        .param("mode", "MANUAL_NAMED")
                        .param("from", fromDate)
                        .param("to", toDate)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].topic").value("오후 미리보기 점검"))
                .andExpect(jsonPath("$.data.content[0].rowCount").value(3))
                .andExpect(jsonPath("$.data.content[1].topic").value("오전 미리보기 점검"))
                .andExpect(jsonPath("$.data.content[1].rowCount").value(2));

        mockMvc.perform(get(BASE_URL + "/" + firstHistoryId)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.topic").value("오전 미리보기 점검"))
                .andExpect(jsonPath("$.data.responsePayload.preview.totalMessages").value(2))
                .andExpect(jsonPath("$['data']['responsePayload']['edited']['P-001']").value("편집 본문 A"));
        mockMvc.perform(get(BASE_URL + "/" + secondHistoryId)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.topic").value("오후 미리보기 점검"))
                .andExpect(jsonPath("$.data.responsePayload.preview.totalMessages").value(3))
                .andExpect(jsonPath("$['data']['responsePayload']['edited']['P-002']").value("편집 본문 B"));
    }

    @Test
    @DisplayName("AUTO_LATEST 는 사용자+프로그램별 활성 1건만 유지하고 latest 대상이 된다")
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

        assertThat(repository.countActiveAutoLatest(USER_A, DispatchSmsProgramType.DISPATCH_SMS)).isEqualTo(1);

        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "DISPATCH_SMS")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saveMode").value("AUTO_LATEST"))
                .andExpect(jsonPath("$.data.topic").value("자동저장"))
                .andExpect(jsonPath("$.data.responsePayload.preview.totalMessages").value(4))
                .andExpect(jsonPath("$['data']['responsePayload']['edited']['P-001']").value("자동 편집 4"));
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

        assertThat(repository.countActiveAutoLatest(USER_A, DispatchSmsProgramType.DISPATCH_SMS)).isEqualTo(1);
    }

    @Test
    @DisplayName("latest 미존재 시 404")
    void latestNotFoundReturns404() throws Exception {
        mockMvc.perform(get(BASE_URL + "/latest")
                        .param("programType", "DISPATCH_SMS")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DISPATCH_SMS_HISTORY_NOT_FOUND"));
    }

    @Test
    @DisplayName("다른 사용자의 저장내역 UUID 직접 접근은 404")
    void otherUserDetailAccessHidden() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody(1))
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
                .andExpect(jsonPath("$.code").value("DISPATCH_SMS_HISTORY_NOT_FOUND"));
    }

    @Test
    @DisplayName("MANUAL_NAMED topic blank 는 400 INVALID_INPUT")
    void manualNamedBlankTopicReturns400() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("  ", 1))
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
                        .content(manualBody("삭제 row", 1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andReturn();
        UUID id = UUID.fromString(objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asText());
        jdbcTemplate.update("""
                UPDATE dispatch_sms_save_history
                   SET is_deleted = TRUE, deleted_by = ?, deleted_at = now()
                 WHERE id = ?
                """, USER_A, id);

        mockMvc.perform(get(BASE_URL + "/" + id)
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DISPATCH_SMS_HISTORY_NOT_FOUND"));
    }

    @Test
    @DisplayName("payload 100KB 초과 시 422")
    void oversizedPayloadReturns422() throws Exception {
        JsonNode payload = objectMapper.createObjectNode().put("body", "x".repeat(101 * 1024));
        String body = objectMapper.writeValueAsString(Map.of(
                "programType", "DISPATCH_SMS",
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
                .andExpect(jsonPath("$.code").value("DISPATCH_SMS_HISTORY_PAYLOAD_TOO_LARGE"));
    }

    @Test
    @DisplayName("기존 dispatch-batch 권한과 동일하게 DISPATCH/MANAGER/MASTER 만 허용한다")
    void roleGuardMatchesDispatchBatchEndpoint() throws Exception {
        for (String role : java.util.List.of("DISPATCH", "MANAGER", "MASTER")) {
            mockMvc.perform(post(BASE_URL)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(autoBody(1))
                            .header("X-User-Id", accountIdForRole(role))
                            .header("X-User-Role", role))
                    .andExpect(status().isOk());
        }
        org.mockito.Mockito.when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.eq("notification.dispatch-sms.display"),
                        org.mockito.ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(false);
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(autoBody(1))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("동일일 from=to 목록 조회는 당일 row 를 포함한다")
    void sameDayFromToIncludesRows() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(manualBody("동일일 저장", 3))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk());

        String today = java.time.LocalDate.now().toString();
        mockMvc.perform(get(BASE_URL)
                        .param("programType", "DISPATCH_SMS")
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
                        .content(manualBody("전체 기간 저장", 5))
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk());

        mockMvc.perform(get(BASE_URL)
                        .param("programType", "DISPATCH_SMS")
                        .param("mode", "MANUAL_NAMED")
                        .header("X-User-Id", USER_A)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1));
    }

    private String manualBody(String topic, int rowCount) throws Exception {
        return manualBody(topic, rowCount, "P-001", "편집 본문");
    }

    private String manualBody(String topic, int rowCount, String partnerCode, String editedMessage) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "programType", "DISPATCH_SMS",
                "saveMode", "MANUAL_NAMED",
                "topic", topic,
                "requestParams", Map.of("date", "2026-05-17", "rowCount", rowCount),
                "responsePayload", Map.of(
                        "preview", Map.of("totalMessages", rowCount, "groups",
                                java.util.List.of(Map.of("chatRoom", "발주방 A"))),
                        "edited", Map.of(partnerCode, editedMessage))));
    }

    private String autoBody(int rowCount) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "programType", "DISPATCH_SMS",
                "saveMode", "AUTO_LATEST",
                "requestParams", Map.of("date", "2026-05-17", "rowCount", rowCount),
                "responsePayload", Map.of(
                        "preview", Map.of("totalMessages", rowCount),
                        "edited", Map.of("P-001", "자동 편집 " + rowCount))));
    }

    private String accountIdForRole(String role) {
        return switch (role) {
            case "DISPATCH" -> "10000000-0000-0000-0000-000000000203";
            case "MANAGER" -> "10000000-0000-0000-0000-000000000204";
            case "MASTER" -> "10000000-0000-0000-0000-000000000205";
            default -> USER_A;
        };
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
