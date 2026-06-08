package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.service.SlipNumberService;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * 일자별 채번(`SlipNumberSequence`) atomic 동작 검증.
 *
 * <p>BE 도메인 시그니처 (PM 통합 후 정렬):
 * <ul>
 *   <li>{@code SlipNumberSequence.create(slipDate: LocalDate)} — 신규 시퀀스 영속화</li>
 *   <li>{@code SlipNumberSequence.next(): int} — atomic 1씩 증가, 첫 호출 1 반환</li>
 *   <li>{@code SlipNumberService.next(LocalDate): String} — Service facade.
 *       해당 일자 sequence 가 없으면 create + next, 있으면 next.
 *       반환 형식: {@code "yyyy/MM/dd-N"} (예: {@code "2026/05/04-1"}).</li>
 *   <li>{@code SlipNumberService.extractSeqNo(String): int} — 채번 결과 trailing 순번 파싱.</li>
 * </ul>
 *
 * <p>D-LOAD-02 이후 동시 채번 race 도 실제 PostgreSQL row lock 으로 검증한다. 기존 순차 IT 는
 * 같은 스레드에서만 호출해 {@code ux_slips_slip_type_no_active} 중복으로 이어지는 부하 경합을
 * 잡지 못했다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class SlipNumberServiceIT extends AbstractPostgresIT {

    private static final DateTimeFormatter PUBLIC_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    @Autowired
    private SlipNumberService slipNumberService;

    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
    }

    @Test
    void next_sameDate_returnsIncreasingSequence() {
        // 같은 날짜로 3회 호출 → trailing 순번 1, 2, 3 (atomic).
        LocalDate date = uniqueSequenceDate();

        String slipNo1 = slipNumberService.next(date);
        String slipNo2 = slipNumberService.next(date);
        String slipNo3 = slipNumberService.next(date);

        assertThat(slipNumberService.extractSeqNo(slipNo1)).isEqualTo(1);
        assertThat(slipNumberService.extractSeqNo(slipNo2)).isEqualTo(2);
        assertThat(slipNumberService.extractSeqNo(slipNo3)).isEqualTo(3);
        assertThat(slipNo1).startsWith(date.format(PUBLIC_NO_DATE) + "-");
    }

    @Test
    void next_differentDates_eachIndependentFromOne() {
        // 각 날짜는 별도 sequence — 모두 1부터 독립 시작.
        LocalDate dateA = uniqueSequenceDate();
        LocalDate dateB = dateA.plusDays(1);

        String aSlip1 = slipNumberService.next(dateA);
        String bSlip1 = slipNumberService.next(dateB);
        String aSlip2 = slipNumberService.next(dateA);
        String bSlip2 = slipNumberService.next(dateB);

        assertThat(slipNumberService.extractSeqNo(aSlip1)).isEqualTo(1);
        assertThat(slipNumberService.extractSeqNo(bSlip1)).isEqualTo(1);
        assertThat(slipNumberService.extractSeqNo(aSlip2)).isEqualTo(2);
        assertThat(slipNumberService.extractSeqNo(bSlip2)).isEqualTo(2);
        assertThat(aSlip1).startsWith(dateA.format(PUBLIC_NO_DATE) + "-");
        assertThat(bSlip1).startsWith(dateB.format(PUBLIC_NO_DATE) + "-");
    }

    @Test
    void next_sameDateDifferentSlipTypes_eachIndependentFromOne() {
        // 판매/구매는 서로 다른 메뉴/속성이므로 같은 날짜 같은 공개 전표번호가 허용된다.
        LocalDate date = uniqueSequenceDate();
        String prefix = date.format(PUBLIC_NO_DATE);

        String outbound1 = slipNumberService.next(date, SlipType.OUTBOUND);
        String inbound1 = slipNumberService.next(date, SlipType.INBOUND);
        String outbound2 = slipNumberService.next(date, SlipType.OUTBOUND);
        String inbound2 = slipNumberService.next(date, SlipType.INBOUND);

        assertThat(outbound1).isEqualTo(prefix + "-1");
        assertThat(inbound1).isEqualTo(prefix + "-1");
        assertThat(outbound2).isEqualTo(prefix + "-2");
        assertThat(inbound2).isEqualTo(prefix + "-2");
    }

    @Test
    void next_sameDateParallelCreation_returnsUniqueNumbersForEveryCaller() throws Exception {
        // D-LOAD-02: 기존 테스트는 순차 호출만 검증해 같은 날짜 동시 생성 시 같은 lastSeq 를 읽는
        // 경합을 놓쳤다. 실제 부하의 실패 지점은 slip INSERT 이지만 근본 원인은 채번 서비스의
        // 번호 중복 산출이므로, 같은 날짜 OUTBOUND 병렬 N 호출의 전수 성공 + slipNo 유일성을 검증한다.
        LocalDate date = uniqueSequenceDate();
        int workers = 8;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            tasks.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("동시 채번 시작 latch timeout");
                }
                return slipNumberService.next(date, SlipType.OUTBOUND);
            });
        }

        try {
            List<Future<String>> futures = tasks.stream()
                    .map(executor::submit)
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<String> slipNos = new ArrayList<>();
            for (Future<String> future : futures) {
                slipNos.add(future.get(10, TimeUnit.SECONDS));
            }

            assertThat(slipNos).hasSize(workers);
            assertThat(slipNos).doesNotHaveDuplicates();
            assertThat(slipNos.stream().map(slipNumberService::extractSeqNo).sorted().toList())
                    .containsExactly(1, 2, 3, 4, 5, 6, 7, 8);
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    private static LocalDate uniqueSequenceDate() {
        return LocalDate.of(2090, 1, 1)
                .plusDays(Math.floorMod(UUID.randomUUID().getMostSignificantBits(), 30_000));
    }

    private static void shutdownAndAwaitTermination(ExecutorService executor) throws InterruptedException {
        executor.shutdown();
        try {
            if (executor.awaitTermination(10, TimeUnit.SECONDS)) {
                return;
            }
            executor.shutdownNow();
            fail("parallel number worker did not terminate within 10 seconds");
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            throw ex;
        }
    }
}
