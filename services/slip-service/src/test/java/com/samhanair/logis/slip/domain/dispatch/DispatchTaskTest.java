package com.samhanair.logis.slip.domain.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * {@link DispatchTask} 상태 머신 단위 검증.
 */
class DispatchTaskTest {

    @Test
    void create_starts_in_DRAFT() {
        DispatchTask t = DispatchTask.create("2026/05/14-1", LocalDate.of(2026, 5, 14));
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.DRAFT);
        assertThat(t.getTaskCode()).isEqualTo("2026/05/14-1");
        assertThat(t.getArologisDispatchId()).isNull();
        assertThat(t.getFailureReason()).isNull();
    }

    @Test
    void markDispatching_from_DRAFT_ok() {
        DispatchTask t = DispatchTask.create("2026/05/14-1", LocalDate.now());
        t.markDispatching();
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHING);
    }

    @Test
    void markDispatched_from_DISPATCHING_ok() {
        DispatchTask t = DispatchTask.create("2026/05/14-1", LocalDate.now());
        t.markDispatching();
        UUID arologisId = UUID.randomUUID();
        t.markDispatched(arologisId);
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHED);
        assertThat(t.getArologisDispatchId()).isEqualTo(arologisId);
    }

    @Test
    void markFailed_from_DISPATCHING_ok() {
        DispatchTask t = DispatchTask.create("2026/05/14-1", LocalDate.now());
        t.markDispatching();
        t.markFailed("1톤 차량 가용 기사 0명");
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.FAILED);
        assertThat(t.getFailureReason()).isEqualTo("1톤 차량 가용 기사 0명");
    }

    @Test
    void markDispatched_from_DRAFT_throws() {
        // #725 — 과거 IllegalStateException(500 마스킹) → BusinessException(CONFLICT, 409) 승격.
        DispatchTask t = DispatchTask.create("2026/05/14-1", LocalDate.now());
        assertThatThrownBy(() -> t.markDispatched(UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT))
                .hasMessageContaining("발송 완료, 매칭 대기")
                .hasMessageNotContaining("DISPATCHING")
                .hasMessageNotContaining("DRAFT");
    }

    @Test
    void markFailed_from_DRAFT_throws() {
        // #725 — 과거 IllegalStateException(500 마스킹) → BusinessException(CONFLICT, 409) 승격.
        DispatchTask t = DispatchTask.create("2026/05/14-1", LocalDate.now());
        assertThatThrownBy(() -> t.markFailed("reason"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT))
                .hasMessageContaining("발송 완료, 매칭 대기")
                .hasMessageNotContaining("DISPATCHING")
                .hasMessageNotContaining("DRAFT");
    }

    @Test
    void taskCode_blank_throws() {
        assertThatThrownBy(() -> DispatchTask.create("", LocalDate.now()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
