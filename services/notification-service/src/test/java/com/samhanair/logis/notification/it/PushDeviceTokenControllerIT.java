package com.samhanair.logis.notification.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationStatus;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.repository.NotificationLogRepository;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * N3a 네이티브 푸시 디바이스 토큰 API + PUSH 발송 배선 통합 테스트.
 *
 * <p>실 PostgreSQL/Testcontainers 로 Flyway migration, self-scoped 토큰 API, FCM placeholder
 * stub 발송, 토큰별 NotificationLog 기록을 함께 검증한다.
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class PushDeviceTokenControllerIT extends AbstractPostgresIT {

    private static final UUID USER_A = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID USER_B = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private NotificationRequestRepository requestRepository;
    @Autowired private NotificationLogRepository logRepository;

    /** 외부 client 전체 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private UserClient userClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private BlockedPartnerLookupClient blockedPartnerLookupClient;
    @MockBean private AligoCsvSourceClient aligoCsvSourceClient;
    @MockBean private AligoAddressBookClient aligoAddressBookClient;

    @BeforeEach
    void cleanup() {
        lenient().when(userClient.exists(any())).thenReturn(true);
        lenient().when(partnerLookupClient.findPartnerCodeByName(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.verifyPartnerCode(any())).thenReturn(Optional.empty());

        logRepository.deleteAll();
        requestRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM push_device_tokens");
    }

    @Test
    void flyway_creates_push_device_tokens_table_with_active_unique_token() {
        Integer tableCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM information_schema.tables
                 WHERE table_schema = 'public'
                   AND table_name = 'push_device_tokens'
                """, Integer.class);
        Integer uniqueCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM pg_indexes
                 WHERE tablename = 'push_device_tokens'
                   AND indexname = 'ux_push_device_tokens_token_active'
                """, Integer.class);

        assertThat(tableCount).isEqualTo(1);
        assertThat(uniqueCount).isEqualTo(1);
    }

    @Test
    void register_upserts_same_token_to_current_user_and_delete_soft_deletes_it() throws Exception {
        Map<String, String> firstBody = Map.of(
                "token", "native-token-1",
                "platform", "IOS",
                "appClient", "DESKTOP");
        Map<String, String> secondBody = Map.of(
                "token", "native-token-1",
                "platform", "ANDROID",
                "appClient", "MOBILE");

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/push-tokens")
                        .header("X-User-Id", USER_A.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(firstBody)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.userId").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.platform").value("IOS"));

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/push-tokens")
                        .header("X-User-Id", USER_B.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(secondBody)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.userId").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.platform").value("ANDROID"));

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM push_device_tokens
                 WHERE token = 'native-token-1'
                   AND user_id = ?
                   AND platform = 'ANDROID'
                   AND app_client = 'MOBILE'
                   AND is_deleted = FALSE
                """, Integer.class, USER_B);
        assertThat(activeCount).isEqualTo(1);

        mockMvc.perform(MockMvcRequestBuilders.delete("/api/v1/push-tokens/{token}", "native-token-1")
                        .header("X-User-Id", USER_B.toString()))
                .andExpect(MockMvcResultMatchers.status().isNoContent());

        Integer deletedCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM push_device_tokens
                 WHERE token = 'native-token-1'
                   AND is_deleted = TRUE
                """, Integer.class);
        assertThat(deletedCount).isEqualTo(1);
    }

    @Test
    void register_without_authenticated_user_returns_401() throws Exception {
        Map<String, String> body = Map.of(
                "token", "native-token-unauthenticated",
                "platform", "IOS",
                "appClient", "DESKTOP");

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/push-tokens")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(false))
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").doesNotExist());
    }

    @Test
    void register_with_invalid_authenticated_user_returns_domain_401_message() throws Exception {
        Map<String, String> body = Map.of(
                "token", "native-token-invalid-user",
                "platform", "IOS",
                "appClient", "DESKTOP");

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/push-tokens")
                        .header("X-User-Id", "not-a-uuid")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(false))
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.message").value("인증 정보가 올바르지 않습니다"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.message").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("X-User-Id"))))
                .andExpect(MockMvcResultMatchers.jsonPath("$.message").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("UUID"))));
    }

    @Test
    void register_with_invalid_platform_enum_returns_400_invalid_input() throws Exception {
        Map<String, String> body = Map.of(
                "token", "native-token-invalid-platform",
                "platform", "BLACKBERRY",
                "appClient", "DESKTOP");

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/push-tokens")
                        .header("X-User-Id", USER_A.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(MockMvcResultMatchers.status().isBadRequest())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(false))
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").doesNotExist());
    }

    @Test
    void register_reactivates_soft_deleted_same_token_without_creating_orphan_row() throws Exception {
        registerTokenRow(USER_A, "native-token-reactivate", "IOS", "DESKTOP");
        mockMvc.perform(MockMvcRequestBuilders.delete("/api/v1/push-tokens/{token}", "native-token-reactivate")
                        .header("X-User-Id", USER_A.toString()))
                .andExpect(MockMvcResultMatchers.status().isNoContent());

        Map<String, String> body = Map.of(
                "token", "native-token-reactivate",
                "platform", "ANDROID",
                "appClient", "MOBILE");

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/push-tokens")
                        .header("X-User-Id", USER_B.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.platform").value("ANDROID"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.appClient").value("MOBILE"));

        Integer totalCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM push_device_tokens
                 WHERE token = 'native-token-reactivate'
                """, Integer.class);
        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM push_device_tokens
                 WHERE token = 'native-token-reactivate'
                   AND user_id = ?
                   AND platform = 'ANDROID'
                   AND app_client = 'MOBILE'
                   AND is_deleted = FALSE
                """, Integer.class, USER_B);
        assertThat(totalCount).isEqualTo(1);
        assertThat(activeCount).isEqualTo(1);
    }

    @Test
    void concurrent_register_same_token_returns_200_and_keeps_single_active_row() throws Exception {
        Map<String, String> body = Map.of(
                "token", "native-token-concurrent",
                "platform", "IOS",
                "appClient", "DESKTOP");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            CompletableFuture<Integer> first = CompletableFuture.supplyAsync(
                    () -> postRegisterAfterLatch(USER_A, body, ready, start), executor);
            CompletableFuture<Integer> second = CompletableFuture.supplyAsync(
                    () -> postRegisterAfterLatch(USER_A, body, ready, start), executor);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(200);
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        } finally {
            executor.shutdownNow();
        }

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM push_device_tokens
                 WHERE token = 'native-token-concurrent'
                   AND is_deleted = FALSE
                """, Integer.class);
        assertThat(activeCount).isEqualTo(1);
    }

    @Test
    void push_user_send_uses_all_active_tokens_and_records_token_attempts_with_stub_fcm() throws Exception {
        registerTokenRow(USER_A, "native-token-a", "IOS", "DESKTOP");
        registerTokenRow(USER_A, "native-token-b", "ANDROID", "MOBILE");

        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.USER, USER_A, null,
                NotificationChannel.PUSH, null, "배차 알림", "새 배차가 배정되었습니다.", "{\"deeplink\":\"/dispatches\"}");

        mockMvc.perform(MockMvcRequestBuilders.post("/internal/notifications/send")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value(NotificationStatus.SENT.name()));

        var saved = requestRepository.findAll().get(0);
        var logs = logRepository.findAllByRequest_IdOrderBySentAtDesc(saved.getId());
        assertThat(logs).hasSize(2);
        assertThat(logs)
                .extracting(com.samhanair.logis.notification.domain.NotificationLog::getGatewayMessageId)
                .allMatch(messageId -> messageId.toString().startsWith("fcm-stub-"));
        assertThat(logs)
                .extracting(com.samhanair.logis.notification.domain.NotificationLog::getGatewayResponse)
                .allSatisfy(raw -> assertThat(raw).contains("native-token-"));
    }

    private void registerTokenRow(UUID userId, String token, String platform, String appClient) {
        jdbcTemplate.update("""
                INSERT INTO push_device_tokens (
                    id, user_id, token, platform, app_client, last_seen_at,
                    created_at, created_by, is_deleted
                )
                VALUES (gen_random_uuid(), ?, ?, ?, ?, NOW(), NOW(), 'test', FALSE)
                """, userId, token, platform, appClient);
    }

    private int postRegisterAfterLatch(UUID userId, Map<String, String> body,
                                       CountDownLatch ready, CountDownLatch start) {
        try {
            ready.countDown();
            if (!start.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("동시 등록 시작 latch 대기 시간 초과");
            }
            return mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/push-tokens")
                            .header("X-User-Id", userId.toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(body)))
                    .andReturn()
                    .getResponse()
                    .getStatus();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
