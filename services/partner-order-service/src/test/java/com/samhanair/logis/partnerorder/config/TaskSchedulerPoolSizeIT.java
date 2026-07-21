package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.it.AbstractPostgresIT;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * #863 N-3 — {@code spring.task.scheduling.pool.size} 스레드 굶주림(starvation) 재현.
 *
 * <p>{@link PartnerOrderServiceApplication} 은 {@code @EnableScheduling} 만 선언하고 별도
 * {@link TaskScheduler} bean 을 정의하지 않는다. 이 서비스의 {@code @Scheduled} 는 실제로 6개다
 * — {@code SlipPublishOutboxScheduler}(5분 주기, 이 PR 이 추가한
 * {@code outbox_scheduler_heartbeat_seconds} 관측 대상)·{@code BootstrapCacheRefreshScheduler}
 * (10분)·{@code DraftCleanupScheduler}(매일 03시)·{@code PartnerOrderEditRequestService} 의 만료
 * 스케줄러(1시간) 4개에 더해, {@code shared:realtime-abstraction} 의
 * {@code RealtimeAutoConfiguration}(SseEmitter 클래스패스 조건만으로 자동 활성화 — 이 서비스가
 * PR-H4b SSE/presence 기능에 이 모듈을 쓰기 때문에 등록됨)이
 * {@code InMemoryRealtimeBroker.heartbeat}(30초)·{@code PresenceService.scheduledPruneExpired}
 * (30초) 2개를 더 등록한다. {@code spring.task.scheduling.pool.size} 를 명시하지 않으면 Spring
 * Boot {@code TaskSchedulingAutoConfiguration} 기본값(1)인 단일 스레드
 * {@code ThreadPoolTaskScheduler} 를 이 6개 스케줄러가 전부 공유하게 된다. 형제 스케줄러(예:
 * bootstrap 캐시 갱신의 product-service/Google Sheets 원격 호출)가 오래 걸리면 outbox tick 이
 * 그 뒤로 밀려 대기하고, DB 장애가 전혀 없는데도 {@code outbox_scheduler_heartbeat_seconds} 가
 * 600초 임계값을 넘어 {@code PartnerOrderOutboxSchedulerStalled} 알람이 오탐할 수 있다.
 *
 * <p>이 IT 는 실제 애플리케이션 컨텍스트가 만든 {@link TaskScheduler} bean(={@code application.yml}
 * 의 {@code spring.task.scheduling.pool.size} 설정이 실제로 반영된 것)을 그대로 사용해, <b>형제
 * 1개</b>가 스레드를 점유하는 동안 outbox tick 을 흉내낸 즉시 작업이 지연 없이 실행되는지 검증한다.
 * 형제 스케줄러의 실제 구현(외부 원격 호출)을 직접 호출하지 않고 점유 시간만 재현하는 이유는 테스트
 * 안정성 때문이며, 검증 대상은 "동일 스레드풀을 공유하는 스케줄링 설정" 자체다 — 실제
 * {@code TaskScheduler} bean 을 쓰므로 yml 설정 변경이 이 테스트 결과에 그대로 반영된다.
 *
 * <p><b>이 IT 가 증명하지 않는 것</b>: outbox 를 제외한 형제는 6-1=5개로 {@code pool.size}(5)와
 * 정확히 같다 — 형제 5개가 동시에 점유하는 최악의 경우까지는 재현하지 않는다(본 IT 는 형제 1개만
 * 점유시키고, 나머지 4개 슬롯은 항상 여유가 있는 상태로 측정한다). 즉 이 GREEN 은 "형제 1개가
 * 점유해도 tick 이 {@code SIBLING_HOLD_MILLIS}/2(750ms) 이내 실행된다"를 증명할 뿐, "형제 점유
 * 상황과 무관하게 tick 이 굶지 않는다"는 증명하지 않는다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class TaskSchedulerPoolSizeIT extends AbstractPostgresIT {

    @Autowired
    private TaskScheduler taskScheduler;

    /** 형제 스케줄러 1개가 스레드를 점유하는 시간(ms). */
    private static final long SIBLING_HOLD_MILLIS = 1500;

    @Test
    void 형제_스케줄러_1개가_스레드를_점유해도_outbox_tick은_750ms_이내_실행돼야_한다() throws InterruptedException {
        assertThat(taskScheduler)
                .as("실제 TaskScheduler bean이 application.yml의 pool.size를 반영해야 한다")
                .isInstanceOf(ThreadPoolTaskScheduler.class);
        ThreadPoolTaskScheduler threadPoolTaskScheduler = (ThreadPoolTaskScheduler) taskScheduler;
        assertThat(threadPoolTaskScheduler.getScheduledThreadPoolExecutor().getCorePoolSize())
                .as("#863는 pool.size=5 값을 유지해야 한다")
                .isEqualTo(5);

        CountDownLatch siblingStarted = new CountDownLatch(1);
        CountDownLatch tickDone = new CountDownLatch(1);
        AtomicLong tickDelayMillis = new AtomicLong(-1);

        // 형제 스케줄러(BootstrapCacheRefreshScheduler 류)가 오래 걸리는 작업을 실행 중이라고 가정.
        taskScheduler.schedule(() -> {
            siblingStarted.countDown();
            try {
                Thread.sleep(SIBLING_HOLD_MILLIS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, Instant.now());

        assertThat(siblingStarted.await(2, TimeUnit.SECONDS))
                .as("형제 작업이 시간 내에 시작하지 못했다 — 테스트 인프라 문제")
                .isTrue();

        // 형제가 실제로 스레드를 점유하기 시작한 직후 outbox tick 을 등록한다 —
        // SlipPublishOutboxScheduler.retryPending() 의 markSchedulerTick() 처럼 즉시 완료되는 작업.
        long tickScheduledAtMillis = System.currentTimeMillis();
        taskScheduler.schedule(() -> {
            tickDelayMillis.set(System.currentTimeMillis() - tickScheduledAtMillis);
            tickDone.countDown();
        }, Instant.now());

        assertThat(tickDone.await(SIBLING_HOLD_MILLIS + 3000, TimeUnit.MILLISECONDS))
                .as("outbox tick 을 흉내낸 작업이 시간 내에 전혀 실행되지 않았다")
                .isTrue();

        // pool size 가 형제 스케줄러 수보다 부족하면(기본값 1) 이 지연이 SIBLING_HOLD_MILLIS 에
        // 근접한다(직렬 대기 — 결함 재현). spring.task.scheduling.pool.size 를 충분히 설정하면
        // 지연은 형제 점유 시간과 무관하게 수십 ms 이내여야 한다.
        assertThat(tickDelayMillis.get())
                .as("outbox tick 이 형제 스케줄러 1개 점유로 굶었다 — spring.task.scheduling.pool.size 확인 필요")
                .isLessThan(SIBLING_HOLD_MILLIS / 2);
    }
}
