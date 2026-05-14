package com.samhanair.logis.slip.domain.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * {@link DispatchTask} 상태 머신 단위 검증.
 */
class DispatchTaskTest {

    @Test
    void create_starts_in_DRAFT() {
        DispatchTask t = DispatchTask.create("DT-20260514-001", LocalDate.of(2026, 5, 14));
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.DRAFT);
        assertThat(t.getTaskCode()).isEqualTo("DT-20260514-001");
        assertThat(t.getArologisDispatchId()).isNull();
        assertThat(t.getFailureReason()).isNull();
    }

    @Test
    void markDispatching_from_DRAFT_ok() {
        DispatchTask t = DispatchTask.create("DT-x", LocalDate.now());
        t.markDispatching();
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHING);
    }

    @Test
    void markDispatched_from_DISPATCHING_ok() {
        DispatchTask t = DispatchTask.create("DT-x", LocalDate.now());
        t.markDispatching();
        UUID arologisId = UUID.randomUUID();
        t.markDispatched(arologisId);
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHED);
        assertThat(t.getArologisDispatchId()).isEqualTo(arologisId);
    }

    @Test
    void markFailed_from_DISPATCHING_ok() {
        DispatchTask t = DispatchTask.create("DT-x", LocalDate.now());
        t.markDispatching();
        t.markFailed("1톤 차량 가용 기사 0명");
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.FAILED);
        assertThat(t.getFailureReason()).isEqualTo("1톤 차량 가용 기사 0명");
    }

    @Test
    void markDispatched_from_DRAFT_throws() {
        DispatchTask t = DispatchTask.create("DT-x", LocalDate.now());
        assertThatThrownBy(() -> t.markDispatched(UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void markFailed_from_DRAFT_throws() {
        DispatchTask t = DispatchTask.create("DT-x", LocalDate.now());
        assertThatThrownBy(() -> t.markFailed("reason"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void taskCode_blank_throws() {
        assertThatThrownBy(() -> DispatchTask.create("", LocalDate.now()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
