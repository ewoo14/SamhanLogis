package com.samhanair.logis.groupware.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.groupware.domain.Schedule;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

/** 기존 owner-less 일정도 owner 조회를 유지하고 outsider에게는 노출하지 않는 JPA 계약. */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import(JpaAuditingConfig.class)
class ScheduleRepositoryTest {

    @Autowired
    private ScheduleRepository scheduleRepository;

    @Test
    void owner_can_still_query_legacy_ownerless_schedule_but_outsider_cannot() {
        UUID owner = UUID.randomUUID();
        UUID outsider = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1).withNano(0);
        Schedule legacy = Schedule.create(owner, "기존 owner-less 일정", null,
                starts, starts.plusHours(1), null);
        Schedule saved = scheduleRepository.saveAndFlush(legacy);

        assertThat(scheduleRepository.findVisibleInRange(
                owner, starts.minusHours(1), starts.plusHours(2)))
                .extracting(Schedule::getId)
                .containsExactly(saved.getId());
        assertThat(scheduleRepository.findVisibleInRange(
                outsider, starts.minusHours(1), starts.plusHours(2)))
                .isEmpty();
    }
}
