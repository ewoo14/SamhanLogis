package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;

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
import com.samhanair.logis.slip.service.CompensationRetentionService;
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
 * 보상 실패 감사 retention service 통합 테스트.
 *
 * <p>실 PostgreSQL/Flyway 스키마에서 {@code resolved=true AND created_at < cutoff}
 * 후보만 soft-delete 되고, 미해소 행은 보존되는지 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class CompensationRetentionServiceIT extends AbstractPostgresIT {

    private static final String CLEANUP_PREFIX = "2026/06/03-COMP-RET-";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private CompensationRetentionService retentionService;

    @MockBean
    private ArologisDispatchClient arologisDispatchClient;

    @MockBean
    private InventoryClient inventoryClient;

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
    void purge_softDeletesOnlyResolvedFailuresOlderThanCutoffInDatabase() {
        LocalDateTime cutoff = LocalDateTime.of(2026, 6, 3, 3, 30);
        UUID oldResolved = insertFailure("001", true,
                LocalDateTime.of(2026, 2, 28, 10, 0),
                LocalDateTime.of(2026, 2, 28, 10, 1));
        // 보존기간 내(cutoff 이후 생성) 해소 행 — 정리 대상 아님. created_at 이 cutoff(06-03 03:30) 이후여야 한다.
        UUID recentResolved = insertFailure("002", true,
                LocalDateTime.of(2026, 6, 3, 10, 0),
                LocalDateTime.of(2026, 6, 3, 10, 1));
        UUID oldUnresolved = insertFailure("003", false,
                LocalDateTime.of(2026, 2, 28, 11, 0),
                LocalDateTime.of(2026, 2, 28, 11, 1));

        int purged = retentionService.purge(cutoff, "system-retention");

        assertThat(purged).isEqualTo(1);
        assertDeleted(oldResolved, true, "system-retention");
        assertDeleted(recentResolved, false, null);
        assertDeleted(oldUnresolved, false, null);
    }

    private UUID insertFailure(String suffix, boolean resolved,
                               LocalDateTime occurredAt, LocalDateTime createdAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO serial_compensation_failures (
                    id,
                    slip_id,
                    slip_no,
                    slip_type,
                    phase,
                    product_code,
                    attempted_operation,
                    failure_reason,
                    original_failure_reason,
                    resolved,
                    occurred_at,
                    created_at,
                    created_by,
                    modified_at,
                    modified_by,
                    deleted_at,
                    deleted_by,
                    is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, false)
                """,
                id,
                UUID.randomUUID(),
                CLEANUP_PREFIX + suffix,
                "OUTBOUND",
                "ACCEPT_RESERVE",
                "AC-COMP-RET-" + suffix,
                "RELEASE_INSTANCES",
                "BusinessException: release 실패",
                "BusinessException: reserve 실패",
                resolved,
                occurredAt,
                createdAt,
                "CompensationRetentionServiceIT");
        return id;
    }

    private void assertDeleted(UUID id, boolean expectedDeleted, String expectedDeletedBy) {
        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT is_deleted, deleted_by, deleted_at
                  FROM serial_compensation_failures
                 WHERE id = ?
                """, id);
        assertThat(row.get("is_deleted")).isEqualTo(expectedDeleted);
        assertThat(row.get("deleted_by")).isEqualTo(expectedDeletedBy);
        if (expectedDeleted) {
            assertThat(row.get("deleted_at")).isNotNull();
        } else {
            assertThat(row.get("deleted_at")).isNull();
        }
    }

    private void cleanup() {
        // 반복 실행 시 잔여물 누적 방지 — purge 가 이미 soft-delete 한 행(is_deleted=true)도 물리 삭제한다(QA P2).
        jdbcTemplate.update("""
                DELETE FROM serial_compensation_failures
                 WHERE slip_no LIKE ?
                """, CLEANUP_PREFIX + "%");
    }
}
