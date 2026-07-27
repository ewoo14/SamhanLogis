package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.accounting.audit.service.AccountingAuditLogService;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 같은 PostgreSQL을 공유하는 독립 audit service 인스턴스의 revision 채번 동시성 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
class AccountingAuditLogServiceMultiInstanceIT extends AbstractPostgresIT {

    @Autowired private AccountingAuditLogRepository auditLogRepository;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private PlatformTransactionManager transactionManager;
    @MockBean private RealtimeBroker broker;
    @MockBean private com.samhanair.logis.security.permission.DynamicPermissionClient permissionClient;

    @Test
    void twoServiceInstances_assignUniqueConsecutiveRevisionsAndBroadcast() throws Exception {
        UUID entityId = UUID.randomUUID();
        jdbcTemplate.update("DELETE FROM accounting_audit_logs WHERE entity_id = ?", entityId);

        AccountingAuditLogService first = new AccountingAuditLogService(
                auditLogRepository, broker, entityManager);
        AccountingAuditLogService second = new AccountingAuditLogService(
                auditLogRepository, broker, entityManager);
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch firstPublishReached = new CountDownLatch(1);
        CountDownLatch secondPublishReached = new CountDownLatch(1);
        CountDownLatch releaseFirstPublish = new CountDownLatch(1);
        AtomicInteger publishCount = new AtomicInteger();
        doAnswer(invocation -> {
            if (publishCount.getAndIncrement() == 0) {
                firstPublishReached.countDown();
                assertThat(releaseFirstPublish.await(5, TimeUnit.SECONDS)).isTrue();
            } else {
                secondPublishReached.countDown();
            }
            return null;
        }).when(broker).publish(
                eq(entityId), eq(AccountingAuditLogService.EVENT_ACCOUNTING_EDIT), any());
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            var futures = IntStream.range(0, 2)
                    .mapToObj(index -> executor.submit(() -> {
                        ready.countDown();
                        assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                        transaction.executeWithoutResult(status ->
                                (index == 0 ? first : second).recordOverlayPatch(
                                        entityId, UUID.randomUUID(), "테스트", null,
                                        "field" + index, null, "value" + index));
                        return null;
                    }))
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(firstPublishReached.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(secondPublishReached.await(300, TimeUnit.MILLISECONDS)).isFalse();
            releaseFirstPublish.countDown();
            for (var future : futures) {
                future.get(10, TimeUnit.SECONDS);
            }
        } finally {
            executor.shutdownNow();
        }

        List<Integer> revisions = jdbcTemplate.queryForList(
                "SELECT revision_no FROM accounting_audit_logs WHERE entity_id = ? ORDER BY revision_no",
                Integer.class, entityId);
        assertThat(revisions).containsExactly(1, 2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM accounting_audit_logs WHERE entity_id = ? AND is_deleted = FALSE",
                Integer.class, entityId)).isEqualTo(2);
        verify(broker, times(2)).publish(
                eq(entityId), eq(AccountingAuditLogService.EVENT_ACCOUNTING_EDIT), any());
    }

    @Test
    void v67_createsFieldLevelActiveUniqueIndex_andExistingShapeIsCompatible() {
        String indexDefinition = jdbcTemplate.queryForObject(
                "SELECT indexdef FROM pg_indexes "
                        + "WHERE indexname = 'ux_accounting_audit_logs_entity_revision_field_active'",
                String.class);
        assertThat(indexDefinition)
                .contains("(entity_id, revision_no, field_name)")
                .contains("is_deleted = false");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM (
                    SELECT entity_id, revision_no, field_name
                      FROM accounting_audit_logs
                     WHERE is_deleted = FALSE
                     GROUP BY entity_id, revision_no, field_name
                    HAVING COUNT(*) > 1
                  ) duplicate_keys
                """, Integer.class)).isZero();
    }

    @Test
    void activeSameFieldAndRevisionIsRejected_butSoftDeletedRowIsAllowed() {
        UUID entityId = UUID.randomUUID();
        insertAuditRow(UUID.randomUUID(), entityId, 1, "field", false);

        assertThatThrownBy(() -> insertAuditRow(UUID.randomUUID(), entityId, 1, "field", false))
                .isInstanceOf(DataIntegrityViolationException.class);

        insertAuditRow(UUID.randomUUID(), entityId, 1, "field", true);
    }

    private void insertAuditRow(UUID id, UUID entityId, int revisionNo, String fieldName,
                                boolean deleted) {
        jdbcTemplate.update("""
                INSERT INTO accounting_audit_logs
                    (id, entity_id, revision_no, actor_id, actor_name, field_name,
                     changed_at, created_at, created_by, is_deleted)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
                """, id, entityId, revisionNo, UUID.randomUUID(), "테스트", fieldName, "test", deleted);
    }
}
