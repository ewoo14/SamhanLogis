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
        assertThat(row.get("next_retry_at")).isNotNull();
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
