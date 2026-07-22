package com.samhanair.logis.notification.publisher;

import java.util.concurrent.CompletableFuture;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class NotificationPublisherSupport {

    private NotificationPublisherSupport() {
    }

    /**
     * Registers publish for the current transaction's afterCommit callback.
     * The HTTP fan-out is dispatched asynchronously after commit so a slow notification
     * service cannot extend the user request. Publishes immediately when no transaction
     * synchronization is active.
     */
    public static void publishAfterCommit(NotificationPublisher publisher,
                                          NotificationPublishRequest request) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    CompletableFuture.runAsync(() -> publisher.publish(request));
                }
            });
            return;
        }

        publisher.publish(request);
    }
}
