package com.samhanair.logis.notification.publisher;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 알림 fan-out 전용 bounded executor.
 *
 * <p>블로킹 HTTP publisher를 공용 ForkJoinPool에서 실행하지 않고, 제한된 worker/queue로 격리한다.
 * queue가 가득 차면 호출 스레드가 작업을 직접 수행해 발행 시도를 지연으로 흡수한다.
 * executor가 종료된 경우처럼 실제 거부가 발생하면 support가 관측 가능한 fail-soft 로그를 남긴다.
 */
public final class NotificationPublisherDispatchExecutor implements Executor {

    private static final int WORKER_COUNT = 4;
    private static final int QUEUE_CAPACITY = 256;

    private final ExecutorService delegate;

    public NotificationPublisherDispatchExecutor() {
        this(WORKER_COUNT, QUEUE_CAPACITY);
    }

    NotificationPublisherDispatchExecutor(int workerCount, int queueCapacity) {
        AtomicInteger sequence = new AtomicInteger();
        ThreadFactory factory = task -> {
            Thread thread = new Thread(task, "notification-publisher-" + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
        this.delegate = new ThreadPoolExecutor(
                workerCount,
                workerCount,
                0L,
                TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(queueCapacity),
                factory,
                new ThreadPoolExecutor.CallerRunsPolicy());
    }

    @Override
    public void execute(Runnable command) {
        delegate.execute(command);
    }

    /** Spring context 종료 시 대기 중인 fan-out 작업을 정리한다. */
    public void shutdown() {
        delegate.shutdown();
    }
}
