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
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.service.CompensationPurgeService;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 보상 실패 감사 물리 purge service 통합 테스트.
 *
 * <p>실 PostgreSQL/Flyway 스키마에서 {@code is_deleted=true AND deleted_at < cutoff}
 * 대상만 hard-delete 되고, grace 미경과·활성·미해소 행은 남는지 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class CompensationPurgeServiceIT extends AbstractPostgresIT {

    private static final String CLEANUP_PREFIX = "2026/06/07-COMP-PURGE-";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private CompensationPurgeService purgeService;

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
    void purgePhysically_deletesOnlySoftDeletedRowsPastGraceCutoff() {
        LocalDateTime cutoff = LocalDateTime.of(2026, 6, 7, 4, 0);
        UUID expiredSoftDeleted = insertFailure("001", true, true,
                LocalDateTime.of(2026, 5, 1, 3, 59));
        // deleted_at == cutoff 경계 동치 케이스: deleted_at < cutoff 조건 미충족으로 생존해야 한다.
        UUID withinGraceSoftDeleted = insertFailure("002", true, true,
                LocalDateTime.of(2026, 6, 7, 4, 0));
        UUID activeResolved = insertFailure("003", true, false, null);
        UUID unresolvedActive = insertFailure("004", false, false, null);

        int purged = purgeService.purgePhysically(cutoff, 500);

        assertThat(purged).isEqualTo(1);
        assertThat(exists(expiredSoftDeleted)).isFalse();
        assertThat(exists(withinGraceSoftDeleted)).isTrue();
        assertThat(exists(activeResolved)).isTrue();
        assertThat(exists(unresolvedActive)).isTrue();
    }

    @Test
    void purgePhysically_deletesOnlySingleBatchWhenCandidatesExceedBatchSize() {
        LocalDateTime cutoff = LocalDateTime.of(2026, 6, 7, 4, 0);
        UUID first = insertFailure("BATCH-001", true, true,
                LocalDateTime.of(2026, 5, 1, 3, 57));
        UUID second = insertFailure("BATCH-002", true, true,
                LocalDateTime.of(2026, 5, 1, 3, 58));
        UUID third = insertFailure("BATCH-003", true, true,
                LocalDateTime.of(2026, 5, 1, 3, 59));

        int purged = purgeService.purgePhysically(cutoff, 2);

        assertThat(purged).isEqualTo(2);
        assertThat(exists(first)).isFalse();
        assertThat(exists(second)).isFalse();
        assertThat(exists(third)).isTrue();
    }

    private UUID insertFailure(String suffix, boolean resolved, boolean deleted, LocalDateTime deletedAt) {
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
                    retry_count,
                    last_retry_at,
                    next_retry_at,
                    created_at,
                    created_by,
                    modified_at,
                    modified_by,
                    deleted_at,
                    deleted_by,
                    is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, NULL, NULL, ?, ?, ?)
                """,
                id,
                UUID.randomUUID(),
                CLEANUP_PREFIX + suffix,
                "OUTBOUND",
                "ACCEPT_RESERVE",
                "AC-COMP-PURGE-" + suffix,
                "RELEASE_INSTANCES",
                "BusinessException: release 실패",
                "BusinessException: reserve 실패",
                resolved,
                LocalDateTime.of(2026, 4, 1, 10, 0),
                LocalDateTime.of(2026, 4, 1, 10, 1),
                "CompensationPurgeServiceIT",
                deletedAt,
                deleted ? "system-retention" : null,
                deleted);
        return id;
    }

    private boolean exists(UUID id) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM serial_compensation_failures WHERE id = ?",
                Integer.class,
                id);
        return count != null && count == 1;
    }

    private void cleanup() {
        jdbcTemplate.update("""
                DELETE FROM serial_compensation_failures
                 WHERE slip_no LIKE ?
                """, CLEANUP_PREFIX + "%");
    }
}
