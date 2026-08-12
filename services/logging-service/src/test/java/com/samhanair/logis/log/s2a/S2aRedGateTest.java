package com.samhanair.logis.log.s2a;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.List;
import org.mockito.Mockito;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import com.samhanair.logis.log.web.ActivityLogSearchCondition;
import com.samhanair.logis.log.web.ActivityLogService;

import org.junit.jupiter.api.Test;

import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.web.ActivityLogResponse;

/** S2a 구현 전 RED gate: publisher 부재, fail-soft wiring 부재, UUID 표시 노출. */
class S2aRedGateTest {

    @Test
    void samhanAuditPublisher_isPresentAndReadyToPublish() throws ClassNotFoundException {
        Class<?> publisher = Class.forName("com.samhanair.logis.shared.audit.publisher.AuditPublisher");
        assertThat(publisher).isNotNull();
    }

    @Test
    void pilotWiring_exposesFailSoftPublisher() throws ClassNotFoundException {
        Class<?> publisher = Class.forName("com.samhanair.logis.shared.audit.publisher.AuditPublisher");
        assertThat(publisher.getDeclaredMethods())
                .anyMatch(method -> method.getName().equals("publish") || method.getName().equals("enqueue"));
    }

    @Test
    void activityResponse_neverExposesUuidAsDisplayedResourceOrDescription() {
        String uuid = UUID.randomUUID().toString();
        AuditLog row = AuditLog.builder()
                .id("event-id")
                .userId(uuid)
                .resourceId(uuid)
                .description("변경 대상 " + uuid)
                .build();

        var repository = Mockito.mock(com.samhanair.logis.log.repository.AuditLogRepository.class);
        Mockito.when(repository.searchActivity(Mockito.any(ActivityLogSearchCondition.class), Mockito.any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(row)));
        ActivityLogResponse response = new ActivityLogService(repository)
                .search(new ActivityLogSearchCondition(null, null, null, null, null, null, null), 0, 20)
                .items().get(0);

        assertThat(response.resourceId()).doesNotContain(uuid).doesNotContain(uuid.substring(0, 8));
        assertThat(response.description()).doesNotContain(uuid).doesNotContain(uuid.substring(0, 8));
    }
}
