package com.samhanair.logis.notification.publisher;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class NotificationPublisherSupport {

    private NotificationPublisherSupport() {
    }

    /**
     * Registers publish for the current transaction's afterCommit callback.
     * Publishes immediately when no transaction synchronization is active.
     */
    public static void publishAfterCommit(NotificationPublisher publisher,
                                          NotificationPublishRequest request) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publisher.publish(request);
                }
            });
            return;
        }

        publisher.publish(request);
    }
}
