package com.samhanair.logis.notification.publisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class NotificationPublisherDispatchExecutorTest {

    @Test
    void saturatedExecutor_delaysSubmissionInsteadOfDroppingIt() throws Exception {
        NotificationPublisherDispatchExecutor executor =
                new NotificationPublisherDispatchExecutor(1, 1);
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch callerRuns = new CountDownLatch(1);
        try {
            executor.execute(() -> {
                firstStarted.countDown();
                await(releaseFirst);
            });
            assertThat(firstStarted.await(1, TimeUnit.SECONDS)).isTrue();
            executor.execute(() -> { });

            assertDoesNotThrow(() -> executor.execute(callerRuns::countDown));
            assertThat(callerRuns.await(1, TimeUnit.SECONDS)).isTrue();
        } finally {
            releaseFirst.countDown();
            executor.shutdown();
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
