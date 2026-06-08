package com.samhanair.logis.slip.it.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskService;
import java.time.LocalDate;
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
 * 배차 작업 taskCode 동시 채번 회귀 테스트.
 *
 * <p>D-LOAD-04 fix5: {@code DispatchTaskService.generateTaskCode()} 는 first-missing probe 방식이라
 * 병렬 DRAFT 생성 시 같은 빈 번호를 고를 수 있다. {@code createTask()} 트랜잭션 안에서 번호 선택과
 * INSERT 가 prefix lock 으로 직렬화되는지 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class DispatchTaskNumberServiceIT extends AbstractPostgresIT {

    @Autowired private DispatchTaskService dispatchTaskService;

    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
    }

    @Test
    void createTask_sameDateParallelCreation_returnsUniqueTaskCodesForEveryCaller() throws Exception {
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
                    throw new IllegalStateException("동시 배차 작업 생성 시작 latch timeout");
                }
                return dispatchTaskService.createTask(date).getTaskCode();
            });
        }

        try {
            List<Future<String>> futures = tasks.stream()
                    .map(executor::submit)
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<String> taskCodes = new ArrayList<>();
            for (Future<String> future : futures) {
                taskCodes.add(future.get(10, TimeUnit.SECONDS));
            }

            assertThat(taskCodes).hasSize(workers);
            assertThat(taskCodes).doesNotHaveDuplicates();
            assertThat(taskCodes.stream().map(DispatchTaskNumberServiceIT::extractSeqNo).sorted().toList())
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

    private static int extractSeqNo(String number) {
        int dashIdx = number.lastIndexOf('-');
        return Integer.parseInt(number.substring(dashIdx + 1));
    }
}
