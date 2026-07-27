package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 같은 PostgreSQL을 공유하는 독립 audit service 인스턴스의 revision 채번 동시성 IT.
 *
 * <p>🚨 개발책임자 결정(2026-07-27, PR #947 1차 적대검증 fix): V67
 * {@code ux_accounting_audit_logs_entity_revision_field_active} UNIQUE 안전망은 기존
 * {@code DepositMatchAuditRecorder}(actorId 를 entity_id 로 재사용 + revision 하드코딩 1/2 로
 * 직접 save)와 충돌해 fetch-and-match 반복 시 제약 위반을 일으킬 수 있어 폐기했다. 이 UNIQUE
 * 존재/위반/soft-delete 재사용을 검증하던 케이스는 제거했고, advisory lock 만으로 채번 유일성을
 * 보장하는 아래 동시성 테스트만 유지한다.
 */
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
}
