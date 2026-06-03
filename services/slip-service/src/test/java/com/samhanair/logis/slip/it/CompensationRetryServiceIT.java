package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ReceiptOcrClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.service.CompensationRetryService;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 보상 실패 자동 재시도 통합 테스트. (D-SER-27)
 *
 * <p>실 PostgreSQL/Flyway(V32) 스키마에서 재시도 후보 조회·동작별 디스패치·성공 해소·실패 백오프·
 * max-retries 소진·미래 백오프 스킵이 정확한지 검증한다. inventory 호출은 {@code @MockBean} 으로 격리.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class CompensationRetryServiceIT extends AbstractPostgresIT {

    private static final String PREFIX = "2026/06/03-COMP-RETRY-";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private CompensationRetryService retryService;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ArologisDispatchClient arologisDispatchClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;

    @MockBean
    private PartnerBlockClient partnerBlockClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private ReceiptOcrClient receiptOcrClient;

    @MockBean
    private SmsGateway smsGateway;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUp() {
        cleanup();
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void retry_releaseInstances_success_resolvesAndIncrementsRetryCount() {
        UUID id = insertFailure("001", "RELEASE_INSTANCES", false, 0, null);

        CompensationRetryService.RetryResult result = retryService.retryEligible(5, 10);

        assertThat(result.succeeded()).isEqualTo(1);
        verify(inventoryClient).releaseInstances(eq(PREFIX + "001"), eq("AC-RETRY-001"));
        Map<String, Object> row = row(id);
        assertThat(row.get("resolved")).isEqualTo(true);
        assertThat(row.get("retry_count")).isEqualTo(1);
        assertThat(row.get("last_retry_at")).isNotNull();
        assertThat(row.get("next_retry_at")).isNull();
    }

    @Test
    void retry_unrecallInstances_failure_incrementsRetryCountAndSetsBackoff() {
        UUID id = insertFailure("002", "UNRECALL_INSTANCES", false, 0, null);
        doThrow(new RuntimeException("inventory down"))
                .when(inventoryClient).unrecallInstances(eq(PREFIX + "002"), eq("AC-RETRY-002"));

        CompensationRetryService.RetryResult result = retryService.retryEligible(5, 10);

        assertThat(result.failed()).isEqualTo(1);
        Map<String, Object> row = row(id);
        assertThat(row.get("resolved")).isEqualTo(false);
        assertThat(row.get("retry_count")).isEqualTo(1);
        // 백오프 지수 = 갱신 전 retryCount(0) → next_retry_at = last_retry_at + base(10) * 2^0 = +10분.
        // last↔next 차이로 검증해 타임존 무관(둘 다 service clock 기준). 잘못된 백오프 값 false-green 차단.
        LocalDateTime lastRetryAt = ((java.sql.Timestamp) row.get("last_retry_at")).toLocalDateTime();
        LocalDateTime nextRetryAt = ((java.sql.Timestamp) row.get("next_retry_at")).toLocalDateTime();
        assertThat(java.time.Duration.between(lastRetryAt, nextRetryAt).toMinutes()).isEqualTo(10);
    }

    @Test
    void retry_maxRetriesReached_isNotCandidate() {
        UUID id = insertFailure("003", "RELEASE_INSTANCES", false, 5, null);

        CompensationRetryService.RetryResult result = retryService.retryEligible(5, 10);

        assertThat(result.candidates()).isZero();
        assertThat(row(id).get("retry_count")).isEqualTo(5);
    }

    @Test
    void retry_futureBackoff_isNotCandidate() {
        insertFailure("004", "RELEASE_INSTANCES", false, 1,
                LocalDateTime.now().plusHours(1));

        CompensationRetryService.RetryResult result = retryService.retryEligible(5, 10);

        assertThat(result.candidates()).isZero();
    }

    @Test
    void retry_resolved_isNotCandidate() {
        insertFailure("005", "RELEASE_INSTANCES", true, 0, null);

        CompensationRetryService.RetryResult result = retryService.retryEligible(5, 10);

        assertThat(result.candidates()).isZero();
    }

    @Test
    void retry_retryCountAtMaxMinusOne_isCandidate() {
        // 경계: retry_count = maxRetries - 1(=4) 는 반드시 후보(쿼리 < vs <= 오타 탐지).
        UUID id = insertFailure("006", "RELEASE_INSTANCES", false, 4, null);

        CompensationRetryService.RetryResult result = retryService.retryEligible(5, 10);

        assertThat(result.succeeded()).isEqualTo(1);
        Map<String, Object> row = row(id);
        assertThat(row.get("resolved")).isEqualTo(true);
        assertThat(row.get("retry_count")).isEqualTo(5);
    }

    @Test
    void retry_nextRetryAtEqualToNow_isCandidate() {
        // 경계: next_retry_at <= now 등호 포함 — 과거(확실히 경과) 시각이면 후보.
        insertFailure("007", "RELEASE_INSTANCES", false, 1,
                LocalDateTime.of(2020, 1, 1, 0, 0));

        CompensationRetryService.RetryResult result = retryService.retryEligible(5, 10);

        assertThat(result.succeeded()).isEqualTo(1);
    }

    @Test
    void retry_processesOldestFirst_byOccurredAtAsc() {
        // occurred_at 오름차순 — 오래된 실패부터 inventory 호출(순서 보장).
        insertFailureWithOccurredAt("008B", "RELEASE_INSTANCES", LocalDateTime.of(2026, 6, 3, 12, 0));
        insertFailureWithOccurredAt("008A", "RELEASE_INSTANCES", LocalDateTime.of(2026, 6, 3, 9, 0));

        retryService.retryEligible(5, 10);

        org.mockito.InOrder inOrder = org.mockito.Mockito.inOrder(inventoryClient);
        inOrder.verify(inventoryClient).releaseInstances(eq(PREFIX + "008A"), eq("AC-RETRY-008A"));
        inOrder.verify(inventoryClient).releaseInstances(eq(PREFIX + "008B"), eq("AC-RETRY-008B"));
    }

    /** occurred_at 만 지정해 미해소·재시도 0회 RELEASE_INSTANCES 후보를 삽입한다(순서 검증용). */
    private UUID insertFailureWithOccurredAt(String suffix, String operation, LocalDateTime occurredAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO serial_compensation_failures (
                    id, slip_id, slip_no, slip_type, phase, product_code,
                    attempted_operation, failure_reason, original_failure_reason,
                    resolved, occurred_at, retry_count, last_retry_at, next_retry_at,
                    created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted
                ) VALUES (?, ?, ?, 'OUTBOUND', 'ACCEPT_RESERVE', ?, ?, ?, ?, false, ?, 0, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, false)
                """,
                id, UUID.randomUUID(), PREFIX + suffix, "AC-RETRY-" + suffix, operation,
                "RuntimeException: 보상 실패", "RuntimeException: 원본 실패",
                occurredAt, occurredAt, "CompensationRetryServiceIT");
        return id;
    }

    private UUID insertFailure(String suffix, String operation, boolean resolved,
                               int retryCount, LocalDateTime nextRetryAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO serial_compensation_failures (
                    id, slip_id, slip_no, slip_type, phase, product_code,
                    attempted_operation, failure_reason, original_failure_reason,
                    resolved, occurred_at, retry_count, last_retry_at, next_retry_at,
                    created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted
                ) VALUES (?, ?, ?, 'OUTBOUND', 'ACCEPT_RESERVE', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, false)
                """,
                id,
                UUID.randomUUID(),
                PREFIX + suffix,
                "AC-RETRY-" + suffix,
                operation,
                "RuntimeException: 보상 실패",
                "RuntimeException: 원본 실패",
                resolved,
                LocalDateTime.of(2026, 6, 3, 10, 0),
                retryCount,
                nextRetryAt,
                LocalDateTime.of(2026, 6, 3, 10, 0),
                "CompensationRetryServiceIT");
        return id;
    }

    private Map<String, Object> row(UUID id) {
        return jdbcTemplate.queryForMap(
                "SELECT resolved, retry_count, last_retry_at, next_retry_at FROM serial_compensation_failures WHERE id = ?",
                id);
    }

    private void cleanup() {
        jdbcTemplate.update("DELETE FROM serial_compensation_failures WHERE slip_no LIKE ?", PREFIX + "%");
    }
}
