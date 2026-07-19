package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.service.PurchaseAccountingSlipNumberGenerator;
import com.samhanair.logis.accounting.service.PurchaseAccountingSlipService;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * #850 HIGH-1 매입전표 배분 동시성 실 IT (실 PostgreSQL Testcontainers) — 매출 대칭.
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
class PurchaseAccountingSlipConcurrencyIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000823");

    @Autowired PurchaseAccountingSlipService service;
    @Autowired PurchaseAccountingSlipRepository slipRepository;
    @Autowired PurchaseAccountingSlipAllocationRepository allocationRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @MockBean SlipServiceClient slipServiceClient;
    @MockBean ETaxClient eTaxClient;
    @MockBean KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;
    @MockBean PurchaseAccountingSlipNumberGenerator numberGenerator;

    @BeforeEach
    void resetSlipsAndNumberGenerator() {
        wipeSlips();
        AtomicInteger seq = new AtomicInteger();
        when(numberGenerator.next(any())).thenAnswer(inv -> "2099/12/31-" + seq.incrementAndGet());
    }

    @AfterEach
    void cleanupLeakedSlips() {
        wipeSlips();
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
                sourceSlipId, "IN-CC", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
                new BigDecimal("10"), new BigDecimal("100"), "CONFIRMED", "INBOUND"));

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

        stubSource(collisionA, "IN-CA");
        stubSource(collisionB, "IN-CB");
        stubSource(other, "IN-OTHER");

        // 요청1: [collisionA, other],  요청2: [other, collisionB] — 원천 배분 역순
        List<Callable<Outcome>> tasks = List.of(
                () -> attempt(() -> service.createDraft(
                        twoAllocRequest(collisionA, "IN-CA", other, "IN-OTHER"), "actor-1")),
                () -> attempt(() -> service.createDraft(
                        twoAllocRequest(other, "IN-OTHER", collisionB, "IN-CB"), "actor-2")));

        // 15s 타임아웃 내 완료 = deadlock 부재 실증
        List<Outcome> outcomes = runTasks(tasks);

        assertThat(outcomes).allMatch(Outcome::success);
        assertThat(slipRepository.count()).isEqualTo(2);
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(other)).isEqualByComparingTo("200");
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(collisionA)).isEqualByComparingTo("100");
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(collisionB)).isEqualByComparingTo("100");
    }

    // ===== fixtures / helpers =====

    private void wipeSlips() {
        jdbcTemplate.update("DELETE FROM purchase_accounting_slip_allocations");
        jdbcTemplate.update("DELETE FROM purchase_accounting_slip_lines");
        jdbcTemplate.update("DELETE FROM purchase_accounting_slips");
    }

    /** 원천 line: 금액 1000·수량 100 (역순 deadlock 테스트용, 두 요청 배분에 넉넉). */
    private void stubSource(UUID lineId, String slipNo) {
        when(slipServiceClient.getSlipLine(lineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), slipNo, lineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 100,
                new BigDecimal("10"), new BigDecimal("1000"), "CONFIRMED", "INBOUND"));
    }

    /** 단일 원천에 금액 60·수량 6 을 배분하는 요청(line lineTotal=60). */
    private static CreatePurchaseAccountingSlipRequest sixtyRequest(UUID sourceSlipId, UUID sourceLineId) {
        return new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2099, 12, 31), PARTNER_ID, "P-SOURCE-823", "원천 거래처",
                SalesTaxType.TAXABLE, "concurrency",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("6"), new BigDecimal("10"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-CC", sourceLineId, 1,
                                new BigDecimal("6"), new BigDecimal("60"))))));
    }

    /** 두 원천에 각 금액 100·수량 10 을 순서대로 배분하는 요청(line lineTotal=200). */
    private static CreatePurchaseAccountingSlipRequest twoAllocRequest(
            UUID firstLineId, String firstSlipNo, UUID secondLineId, String secondSlipNo) {
        return new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2099, 12, 31), PARTNER_ID, "P-SOURCE-823", "원천 거래처",
                SalesTaxType.TAXABLE, "concurrency",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("2"), new BigDecimal("100"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), firstSlipNo, firstLineId, 1,
                                new BigDecimal("10"), new BigDecimal("100")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), secondSlipNo, secondLineId, 1,
                                new BigDecimal("10"), new BigDecimal("100"))))));
    }

    private static long lockKey(UUID id) {
        return id.getMostSignificantBits() ^ id.getLeastSignificantBits();
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
