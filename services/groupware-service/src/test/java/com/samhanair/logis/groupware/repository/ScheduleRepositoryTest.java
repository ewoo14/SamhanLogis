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

/** 활성 대상자 집합만 일정 접근을 허용하는 JPA 계약. */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import(JpaAuditingConfig.class)
class ScheduleRepositoryTest {

    @Autowired
    private ScheduleRepository scheduleRepository;

    @Test
    void owner_cannot_query_legacy_ownerless_schedule_without_participant_row() {
        UUID owner = UUID.randomUUID();
        UUID outsider = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1).withNano(0);
        Schedule legacy = Schedule.create(owner, "기존 owner-less 일정", null,
                starts, starts.plusHours(1), null);
        Schedule saved = scheduleRepository.saveAndFlush(legacy);

        assertThat(scheduleRepository.findVisibleInRange(
                owner, starts.minusHours(1), starts.plusHours(2)))
                .extracting(Schedule::getId)
                .doesNotContain(saved.getId());
        assertThat(scheduleRepository.findVisibleInRange(
                outsider, starts.minusHours(1), starts.plusHours(2)))
                .isEmpty();
    }
}
