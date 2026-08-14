package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.service.SalesAccountingSlipNumberGenerator;
import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * #850 HIGH-1 출고전표 배분 동시성 실 IT (실 PostgreSQL Testcontainers).
 *
 * <p>단일스레드 Mockito {@code InOrder} + lock mock 이 잡지 못하는 <b>실 경합</b>을 검증한다.
 * {@code createDraftAttempt} 는 {@code REQUIRES_NEW} 트랜잭션에서 {@code pg_advisory_xact_lock}
 * 을 획득하므로, 본 IT 는 {@code @Transactional} 을 붙이지 않고(각 attempt 가 실제 commit/rollback
 * 하도록) {@code ExecutorService}+{@code CountDownLatch} 로 두 요청을 동시에 발사한다.
 *
 * <ul>
 *   <li>동일 원천 동시 2요청 → advisory 락 직렬화로 정확히 하나만 성공, 하나는 과할당 거부(성공분만 영속).</li>
 *   <li>서로 다른 원천을 역순 배분하는 동시 2요청 → lockKey 정렬 선잠금으로 deadlock 없이 둘 다 완료.
 *       (XOR 충돌쌍 + 제3 key 로 dedup·정렬 경로까지 실경합에서 관통.)</li>
 * </ul>
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
class SalesAccountingSlipConcurrencyIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000823");

    @Autowired SalesAccountingSlipService service;
    @Autowired SalesAccountingSlipRepository slipRepository;
    @Autowired SalesAccountingSlipAllocationRepository allocationRepository;
    @Autowired DailyClosingRepository dailyClosingRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired DataSource dataSource;

    @MockBean SlipServiceClient slipServiceClient;
    @MockBean ETaxClient eTaxClient;
    @MockBean KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;
    @MockBean SalesAccountingSlipNumberGenerator numberGenerator;

    @BeforeEach
    void resetSlipsAndNumberGenerator() {
        wipeSlips();
        seedLockedClosing();
        AtomicInteger seq = new AtomicInteger();
        when(numberGenerator.next(any())).thenAnswer(inv -> "2099/12/31-" + seq.incrementAndGet());
    }

    @AfterEach
    void cleanupLeakedSlips() {
        wipeSlips();
        removeLockedClosing();
    }

    private void seedLockedClosing() {
        DailyClosing closing = DailyClosing.createV2(
                LocalDate.of(2099, 12, 31), PARTNER_ID, DailyClosingKind.SALES,
                DailyClosingSourceKind.SALES_SLIP, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, 0);
        closing.lock("test-accountant");
        dailyClosingRepository.saveAndFlush(closing);
    }

    private void removeLockedClosing() {
        dailyClosingRepository.findByClosingDateAndPartnerIdAndClosingKindAndSourceKind(
                        LocalDate.of(2099, 12, 31), PARTNER_ID, DailyClosingKind.SALES,
                        DailyClosingSourceKind.SALES_SLIP)
                .ifPresent(closing -> {
                    closing.markDeleted("test-cleanup");
                    dailyClosingRepository.saveAndFlush(closing);
                });
    }

    /**
     * 동일 원천 동시 2요청 — 원천 잔여(금액 100·수량 10)에 각 60/6 을 배분하면 개별로는 통과하나 합계
     * 120/12 는 초과다. advisory 락 직렬화로 정확히 하나만 성공하고 하나는 {@code SAS_OVER_ALLOCATION},
     * 성공분(60/6)만 실 DB 에 영속되어야 한다.
     */
    @Test
    void 동일원천_동시_2요청은_advisory락_직렬화로_하나만_성공하고_하나는_과할당_거부된다() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-CC", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
                new BigDecimal("10"), new BigDecimal("100"), "CONFIRMED", "OUTBOUND"));

        List<Callable<Outcome>> tasks = List.of(
                () -> attempt(() -> service.createDraft(sixtyRequest(sourceSlipId, sourceLineId), "actor-1")),
                () -> attempt(() -> service.createDraft(sixtyRequest(sourceSlipId, sourceLineId), "actor-2")));
        List<Outcome> outcomes = runTasks(tasks);

        long success = outcomes.stream().filter(Outcome::success).count();
        long overAllocated = outcomes.stream()
                .filter(o -> !o.success() && o.errorCode() == ErrorCode.SAS_OVER_ALLOCATION).count();
        assertThat(success).isEqualTo(1);
        assertThat(overAllocated).isEqualTo(1);
        // 성공분만 DB 영속
        assertThat(slipRepository.count()).isEqualTo(1);
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).isEqualByComparingTo("60");
        assertThat(allocationRepository.sumAllocatedQtyBySourceLineId(sourceLineId)).isEqualByComparingTo("6");
    }

    /**
     * 외부 독립 connection 이 같은 advisory key 를 선점하면 서비스 attempt 가 실제로 block 되고,
     * 외부 transaction 을 해제한 뒤에만 완료되어야 한다. 락 호출을 제거하면 이 테스트가 즉시 RED 된다.
     */
    @Test
    void 외부_트랜잭션이_원천_advisory락을_선점하면_createDraft가_block되고_해제후_완료된다() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-LOCK", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
                new BigDecimal("10"), new BigDecimal("100"), "CONFIRMED", "OUTBOUND"));

        ExecutorService executor = Executors.newSingleThreadExecutor();
        try (Connection blocker = dataSource.getConnection()) {
            holdAdvisoryLock(blocker, lockKey(sourceLineId));
            Future<?> blocked = executor.submit(() -> service.createDraft(
                    sixtyRequest(sourceSlipId, sourceLineId), "actor-lock"));

            assertThatThrownBy(() -> blocked.get(2, TimeUnit.SECONDS))
                    .isInstanceOf(TimeoutException.class);
            assertThat(blocked).isNotDone();

            blocker.rollback();
            assertThat(blocked.get(10, TimeUnit.SECONDS)).isNotNull();
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    /**
     * 다중 원천 역순 배분 동시 2요청 — 잔여가 넉넉한 원천 A·B 를 요청1 은 {@code A→B}, 요청2 는 {@code B→A}
     * 로 배분한다. payload 순서 선잠금이라면 교착이 가능하나, lockKey numeric 정렬 선잠금이라 15초 내 둘 다
     * 정상 완료한다. A 를 XOR 충돌쌍(같은 lockKey)으로 구성해 dedup·정렬 경로까지 실경합에서 관통한다.
     */
    @Test
    void 다중원천_역순_배분_동시요청은_lockKey_정렬_선잠금으로_deadlock_없이_완료된다() throws Exception {
        // XOR 충돌쌍(collisionA·collisionB): 서로 다른 UUID 이지만 msb^lsb 동일 → 같은 lockKey.
        UUID collisionA = new UUID(0x1111111111111111L, 0x2222222222222222L);
        long k = 0x0100000000000001L;
        UUID collisionB = new UUID(collisionA.getMostSignificantBits() ^ k,
                collisionA.getLeastSignificantBits() ^ k);
        UUID other = new UUID(0L, 1L);
        // 사전조건: 충돌쌍 lockKey 동일·UUID 상이, 제3 key 상이
        assertThat(lockKey(collisionA)).isEqualTo(lockKey(collisionB));
        assertThat(collisionA).isNotEqualTo(collisionB);
        assertThat(lockKey(other)).isNotEqualTo(lockKey(collisionA));

        stubSource(collisionA, "OUT-CA");
        stubSource(collisionB, "OUT-CB");
        stubSource(other, "OUT-OTHER");

        // 요청1: [collisionA, other],  요청2: [other, collisionB] — 원천 배분 역순
        List<Callable<Outcome>> tasks = List.of(
                () -> attempt(() -> service.createDraft(
                        twoAllocRequest(collisionA, "OUT-CA", other, "OUT-OTHER"), "actor-1")),
                () -> attempt(() -> service.createDraft(
                        twoAllocRequest(other, "OUT-OTHER", collisionB, "OUT-CB"), "actor-2")));

        // 두 서비스 transaction 이 실제 첫 advisory lock 에서 대기한 뒤 낮은 key를 먼저 해제한다.
        List<Outcome> outcomes = runTasksAtAdvisoryLockBoundary(tasks, lockKey(other), lockKey(collisionA));

        assertThat(outcomes).allMatch(Outcome::success);
        assertThat(slipRepository.count()).isEqualTo(2);
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(other)).isEqualByComparingTo("200");
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(collisionA)).isEqualByComparingTo("100");
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(collisionB)).isEqualByComparingTo("100");
    }

    // ===== fixtures / helpers =====

    private void wipeSlips() {
        jdbcTemplate.update("DELETE FROM sales_accounting_slip_allocations");
        jdbcTemplate.update("DELETE FROM sales_accounting_slip_lines");
        jdbcTemplate.update("DELETE FROM sales_accounting_slips");
    }

    /** 원천 line: 금액 1000·수량 100 (역순 deadlock 테스트용, 두 요청 배분에 넉넉). */
    private void stubSource(UUID lineId, String slipNo) {
        when(slipServiceClient.getSlipLine(lineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), slipNo, lineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 100,
                new BigDecimal("10"), new BigDecimal("1000"), "CONFIRMED", "OUTBOUND"));
    }

    /** 단일 원천에 금액 60·수량 6 을 배분하는 요청(line lineTotal=60). */
    private static CreateSalesAccountingSlipRequest sixtyRequest(UUID sourceSlipId, UUID sourceLineId) {
        return new CreateSalesAccountingSlipRequest(
                LocalDate.of(2099, 12, 31), PARTNER_ID, "P-SOURCE-823", "원천 거래처",
                SalesTaxType.TAXABLE, "concurrency",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("6"), new BigDecimal("10"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-CC", sourceLineId, 1,
                                new BigDecimal("6"), new BigDecimal("60"))))));
    }

    /** 두 원천에 각 금액 100·수량 10 을 순서대로 배분하는 요청(line lineTotal=200). */
    private static CreateSalesAccountingSlipRequest twoAllocRequest(
            UUID firstLineId, String firstSlipNo, UUID secondLineId, String secondSlipNo) {
        return new CreateSalesAccountingSlipRequest(
                LocalDate.of(2099, 12, 31), PARTNER_ID, "P-SOURCE-823", "원천 거래처",
                SalesTaxType.TAXABLE, "concurrency",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("2"), new BigDecimal("100"), List.of(
                        new CreateSalesAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), firstSlipNo, firstLineId, 1,
                                new BigDecimal("10"), new BigDecimal("100")),
                        new CreateSalesAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), secondSlipNo, secondLineId, 1,
                                new BigDecimal("10"), new BigDecimal("100"))))));
    }

    private static long lockKey(UUID id) {
        return id.getMostSignificantBits() ^ id.getLeastSignificantBits();
    }

    private void holdAdvisoryLock(Connection connection, long key) throws Exception {
        connection.setAutoCommit(false);
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT pg_advisory_xact_lock(?)")) {
            statement.setLong(1, key);
            statement.execute();
        }
    }

    /** 외부 blocker 두 개와 pg_locks 관측으로 두 worker를 첫 lock 경계까지 결정적으로 이동한다. */
    private List<Outcome> runTasksAtAdvisoryLockBoundary(
            List<Callable<Outcome>> tasks, long lowKey, long highKey) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(tasks.size());
        try (Connection lowBlocker = dataSource.getConnection();
                Connection highBlocker = dataSource.getConnection()) {
            int lowBlockerPid = backendPidAndHold(lowBlocker, lowKey);
            int highBlockerPid = backendPidAndHold(highBlocker, highKey);
            List<Future<Outcome>> futures = tasks.stream().map(executor::submit).toList();

            awaitWaitingAdvisoryLocks(lowBlockerPid, highBlockerPid, tasks.size());
            lowBlocker.rollback();
            awaitGrantedAdvisoryLock(lowKey, lowBlockerPid, highBlockerPid);
            highBlocker.rollback();

            return futures.stream().map(future -> getOutcome(future, 15)).toList();
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    private int backendPidAndHold(Connection connection, long key) throws Exception {
        connection.setAutoCommit(false);
        int pid;
        try (PreparedStatement statement = connection.prepareStatement("SELECT pg_backend_pid()")) {
            try (var result = statement.executeQuery()) {
                result.next();
                pid = result.getInt(1);
            }
        }
        holdAdvisoryLock(connection, key);
        return pid;
    }

    private void awaitWaitingAdvisoryLocks(int firstExcludedPid, int secondExcludedPid, int expected)
            throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        int observed = 0;
        while (System.nanoTime() < deadline) {
            observed = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM pg_locks "
                            + "WHERE locktype = 'advisory' AND NOT granted "
                            + "AND pid NOT IN (?, ?)",
                    Integer.class, firstExcludedPid, secondExcludedPid);
            if (observed >= expected) {
                return;
            }
            Thread.sleep(25);
        }
        fail("두 worker가 advisory 첫 lock에서 대기하지 않음: observed=" + observed);
    }

    private void awaitGrantedAdvisoryLock(long key, int firstExcludedPid, int secondExcludedPid)
            throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            boolean granted = jdbcTemplate.queryForList(
                    "SELECT pid, classid, objid FROM pg_locks "
                            + "WHERE locktype = 'advisory' AND granted")
                    .stream()
                    .anyMatch(row -> {
                        int pid = ((Number) row.get("pid")).intValue();
                        long classId = ((Number) row.get("classid")).longValue();
                        long objectId = ((Number) row.get("objid")).longValue();
                        long observedKey = (classId << 32) | (objectId & 0xffffffffL);
                        return pid != firstExcludedPid && pid != secondExcludedPid
                                && observedKey == key;
                    });
            if (granted) {
                return;
            }
            Thread.sleep(25);
        }
        fail("낮은 advisory key를 worker가 선점하지 않음: key=" + key);
    }

    private static Outcome getOutcome(Future<Outcome> future, int timeoutSeconds) {
        try {
            return future.get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new AssertionError("동시 배분 worker 완료 실패", ex);
        }
    }

    private static Outcome attempt(Supplier<Object> action) {
        try {
            action.get();
            return new Outcome(true, null);
        } catch (BusinessException ex) {
            return new Outcome(false, ex.getErrorCode());
        }
    }

    /** 제공된 task 들을 동일 순간에 발사(ready+start latch), 15초 내 수거. 미완료는 deadlock 으로 간주해 fail. */
    private static List<Outcome> runTasks(List<Callable<Outcome>> tasks) throws Exception {
        int n = tasks.size();
        ExecutorService executor = Executors.newFixedThreadPool(n);
        CountDownLatch ready = new CountDownLatch(n);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<Outcome>> wrapped = new ArrayList<>();
        for (Callable<Outcome> task : tasks) {
            wrapped.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("동시 배분 시작 latch timeout");
                }
                return task.call();
            });
        }
        try {
            List<Future<Outcome>> futures = wrapped.stream().map(executor::submit).toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<Outcome> outcomes = new ArrayList<>();
            for (Future<Outcome> future : futures) {
                outcomes.add(future.get(15, TimeUnit.SECONDS));
            }
            return outcomes;
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    private static void shutdownAndAwaitTermination(ExecutorService executor) throws InterruptedException {
        executor.shutdown();
        try {
            if (executor.awaitTermination(10, TimeUnit.SECONDS)) {
                return;
            }
            executor.shutdownNow();
            fail("동시 배분 worker 가 10초 내 종료하지 않음(deadlock 의심)");
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            throw ex;
        }
    }

    /** 동시 요청 1건의 결과 — 성공 여부와(실패 시) ErrorCode. */
    private record Outcome(boolean success, ErrorCode errorCode) {}
}
