package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.scheduler.SlipPublishOutboxScheduler;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.test.context.ActiveProfiles;

/** #888 I-3 — local 프로파일도 scheduler 구성과 함께 정상 기동해야 한다. */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@ActiveProfiles("local")
class TaskSchedulerLocalProfileIT {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void local_프로파일은_컨텍스트가_뜨고_outbox_scheduler는_비활성화된다() {
        assertThat(applicationContext.getEnvironment().getActiveProfiles()).contains("local");
        assertThat(applicationContext.getBeansOfType(SlipPublishOutboxScheduler.class)).isEmpty();
        assertThat(applicationContext.getBeansOfType(TaskScheduler.class)).containsKeys(
                PartnerOrderTaskSchedulerConfiguration.TASK_SCHEDULER_BEAN_NAME,
                PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME);

        Map<String, TaskScheduler> schedulers = applicationContext.getBeansOfType(TaskScheduler.class);
        assertThat(schedulers.get(PartnerOrderTaskSchedulerConfiguration.TASK_SCHEDULER_BEAN_NAME))
                .isNotSameAs(schedulers.get(PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME));
    }
}
