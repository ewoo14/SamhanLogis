package com.samhanair.logis.notification.publisher;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;
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
            NotificationPublisherSupport.publishAfterCommit(publisher, request);

            verify(publisher, never()).publish(request);
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        verify(publisher).publish(request);
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
