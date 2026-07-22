package com.samhanair.logis.notification.publisher;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class NotificationPublisherSupport {

    private static final Logger log = LoggerFactory.getLogger(NotificationPublisherSupport.class);

    private NotificationPublisherSupport() {
    }

    /**
     * Registers publish for the current transaction's afterCommit callback.
     * This compatibility overload uses direct execution; production callers that need
     * asynchronous dispatch pass the dedicated executor to the three-argument overload.
     * Publishes immediately when no transaction synchronization is active.
     */
    public static void publishAfterCommit(NotificationPublisher publisher,
                                          NotificationPublishRequest request) {
        publishAfterCommit(publisher, request, Runnable::run);
    }

    /**
     * Registers publish for afterCommit and dispatches through the caller-selected executor.
     * A null executor is treated as direct execution for plain unit-test/manual callers.
     */
    public static void publishAfterCommit(NotificationPublisher publisher,
                                          NotificationPublishRequest request,
                                          Executor executor) {
        Executor dispatchExecutor = executor == null ? Runnable::run : executor;
        Runnable publish = () -> publisher.publish(request);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch(dispatchExecutor, publish, request);
                }
            });
            return;
        }

        dispatch(dispatchExecutor, publish, request);
    }

    private static void dispatch(Executor executor, Runnable publish, NotificationPublishRequest request) {
        try {
            executor.execute(publish);
        } catch (RejectedExecutionException ex) {
            log.error("[NotificationPublisherSupport] 알림 dispatch queue 포화로 발행 시도 거부 (fail-soft) — channel={} ref={} error={}",
                    request.channel(), request.sourceRefId(), ex.getMessage(), ex);
        }
    }
}
