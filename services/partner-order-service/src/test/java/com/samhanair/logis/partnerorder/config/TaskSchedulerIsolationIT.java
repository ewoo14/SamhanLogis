package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.it.AbstractPostgresIT;
import com.samhanair.logis.partnerorder.scheduler.SlipPublishOutboxScheduler;
import java.lang.reflect.Method;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.config.ScheduledTaskHolder;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** #888 — 기본 형제 풀과 outbox 전용 풀의 실제 애플리케이션 컨텍스트 배선 검증. */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class TaskSchedulerIsolationIT extends AbstractPostgresIT {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private ScheduledTaskHolder scheduledTaskHolder;

    @Test
    void 기본_scheduler와_outbox_scheduler는_서로_다른_풀이고_pool_크기는_5와_1이다() {
        Map<String, TaskScheduler> schedulers = applicationContext.getBeansOfType(TaskScheduler.class);

        assertThat(schedulers).containsKeys(
                PartnerOrderTaskSchedulerConfiguration.TASK_SCHEDULER_BEAN_NAME,
                PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME);
        assertThat(schedulers.get(PartnerOrderTaskSchedulerConfiguration.TASK_SCHEDULER_BEAN_NAME))
                .isInstanceOf(ThreadPoolTaskScheduler.class);
        assertThat(schedulers.get(PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME))
                .isInstanceOf(ThreadPoolTaskScheduler.class);
        assertThat(schedulers.get(PartnerOrderTaskSchedulerConfiguration.TASK_SCHEDULER_BEAN_NAME))
                .isNotSameAs(schedulers.get(PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME));

        assertThat(((ThreadPoolTaskScheduler) schedulers
                .get(PartnerOrderTaskSchedulerConfiguration.TASK_SCHEDULER_BEAN_NAME))
                .getScheduledThreadPoolExecutor().getCorePoolSize()).isEqualTo(5);
        assertThat(((ThreadPoolTaskScheduler) schedulers
                .get(PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME))
                .getScheduledThreadPoolExecutor().getCorePoolSize()).isEqualTo(1);
    }

    @Test
    void outbox_retryPending은_전용_scheduler_이름으로_스케줄된다() throws NoSuchMethodException {
        Method retryPending = SlipPublishOutboxScheduler.class.getMethod("retryPending");
        Scheduled scheduled = retryPending.getAnnotation(Scheduled.class);

        assertThat(scheduled).isNotNull();
        assertThat(scheduled.scheduler())
                .isEqualTo(PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME);
        assertThat(scheduled.cron()).isEqualTo("${samhan.outbox.cron:0 */5 * * * *}");
    }

    @Test
    void AbstractPostgresIT의_CRON_DISABLED는_전용_scheduler에서도_outbox_task를_등록하지_않는다() {
        assertThat(applicationContext.getEnvironment().getProperty("samhan.outbox.cron"))
                .isEqualTo("-");
        assertThat(scheduledTaskHolder.getScheduledTasks())
                .as("cron disabled 상태에서는 outbox를 제외한 형제 5개만 등록돼야 한다")
                .hasSize(5);

        ThreadPoolTaskScheduler outboxScheduler = (ThreadPoolTaskScheduler) applicationContext
                .getBean(PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME);
        assertThat(outboxScheduler.getScheduledThreadPoolExecutor().getQueue())
                .as("CRON_DISABLED는 전용 outbox scheduler에 scheduled task를 우회 등록하지 않아야 한다")
                .isEmpty();
    }
}
