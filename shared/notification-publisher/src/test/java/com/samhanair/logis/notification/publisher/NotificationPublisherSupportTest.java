package com.samhanair.logis.notification.publisher;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class NotificationPublisherSupportTest {

    @Test
    void publishAfterCommit_publishesImmediatelyWithoutActiveSynchronization() {
        NotificationPublisher publisher = mock(NotificationPublisher.class);
        NotificationPublishRequest request = request();

        NotificationPublisherSupport.publishAfterCommit(publisher, request);

        verify(publisher).publish(request);
    }

    @Test
    void publishAfterCommit_defersPublishUntilAfterCommitWhenSynchronizationIsActive() {
        NotificationPublisher publisher = mock(NotificationPublisher.class);
        NotificationPublishRequest request = request();

        TransactionSynchronizationManager.initSynchronization();
        try {
            NotificationPublisherSupport.publishAfterCommit(publisher, request, Runnable::run);

            verify(publisher, never()).publish(request);
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        verify(publisher, org.mockito.Mockito.timeout(1000)).publish(request);
    }

    @Test
    void publishAfterCommit_doesNotBlockAfterCommitCallbackOnPublisherHttpCall() throws Exception {
        NotificationPublisher publisher = mock(NotificationPublisher.class);
        NotificationPublishRequest request = request();
        CountDownLatch publishEntered = new CountDownLatch(1);
        CountDownLatch releasePublisher = new CountDownLatch(1);
        doAnswer(invocation -> {
            publishEntered.countDown();
            releasePublisher.await(2, TimeUnit.SECONDS);
            return null;
        }).when(publisher).publish(request);

        TransactionSynchronizationManager.initSynchronization();
        ExecutorService callbackExecutor = Executors.newSingleThreadExecutor();
        ExecutorService dispatchExecutor = Executors.newSingleThreadExecutor();
        try {
            NotificationPublisherSupport.publishAfterCommit(publisher, request, dispatchExecutor);
            TransactionSynchronization synchronization = TransactionSynchronizationManager
                    .getSynchronizations().get(0);

            CountDownLatch callbackReturned = new CountDownLatch(1);
            var callback = callbackExecutor.submit(() -> {
                synchronization.afterCommit();
                callbackReturned.countDown();
            });

            assertTrue(callbackReturned.await(500, TimeUnit.MILLISECONDS),
                    "afterCommit callback must not wait for notification HTTP");
            assertTrue(publishEntered.await(1, TimeUnit.SECONDS));
            releasePublisher.countDown();
            callback.get(1, TimeUnit.SECONDS);
        } finally {
            releasePublisher.countDown();
            callbackExecutor.shutdownNow();
            dispatchExecutor.shutdownNow();
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private NotificationPublishRequest request() {
        return new NotificationPublishRequest(
                "SAFETY_STOCK",
                NotificationSeverity.WARNING,
                "Safety stock alert",
                "Current 20 / threshold 50",
                List.of("MASTER", "MANAGER"),
                null,
                null,
                "product+warehouse",
                "/inventory/safety-stock-alerts");
    }
}
