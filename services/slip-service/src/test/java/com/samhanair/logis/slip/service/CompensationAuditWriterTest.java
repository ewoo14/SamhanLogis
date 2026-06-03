package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * CompensationAuditWriter 의 로그/저장 포맷 단위 테스트.
 */
@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class CompensationAuditWriterTest {

    @Mock
    private SerialCompensationFailureRepository repository;

    @Mock
    private CompensationAlertNotifier alertNotifier;

    @Test
    void record_savesOneRowTruncatesReasonAndWritesWarn(CapturedOutput output) {
        Clock fixedClock = Clock.fixed(Instant.parse("2026-06-03T01:02:03Z"), ZoneId.of("Asia/Seoul"));
        CompensationAuditWriter writer = new CompensationAuditWriter(repository, alertNotifier, fixedClock);
        when(repository.save(any(SerialCompensationFailure.class))).thenAnswer(inv -> inv.getArgument(0));
        Slip slip = Slip.createOutbound("2026/06/03-77", LocalDate.of(2026, 6, 3), 77,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "삼한", DeliveryTag.DAY, null, "u");
        ReflectionTestUtils.setField(slip, "id", UUID.randomUUID());
        RuntimeException compensationFailure = new RuntimeException("x".repeat(1100));
        BusinessException original = new BusinessException(ErrorCode.CONFLICT, "원본 실패");

        writer.record(slip, CompensationPhase.ACCEPT_RESERVE, "AC-WARN-001",
                CompensationOperation.RELEASE_INSTANCES, compensationFailure, original);

        ArgumentCaptor<SerialCompensationFailure> captor =
                ArgumentCaptor.forClass(SerialCompensationFailure.class);
        verify(repository).save(captor.capture());
        SerialCompensationFailure saved = captor.getValue();
        assertThat(saved.getSlipId()).isEqualTo(slip.getId());
        assertThat(saved.getSlipNo()).isEqualTo("2026/06/03-77");
        assertThat(saved.getSlipType()).isEqualTo(SlipType.OUTBOUND);
        assertThat(saved.getPhase()).isEqualTo(CompensationPhase.ACCEPT_RESERVE);
        assertThat(saved.getProductCode()).isEqualTo("AC-WARN-001");
        assertThat(saved.getAttemptedOperation()).isEqualTo(CompensationOperation.RELEASE_INSTANCES);
        assertThat(saved.getFailureReason()).hasSize(1000).startsWith("RuntimeException: ");
        assertThat(saved.getOriginalFailureReason()).isEqualTo("BusinessException: 원본 실패");
        assertThat(saved.isResolved()).isFalse();
        assertThat(saved.getOccurredAt()).isEqualTo(LocalDateTime.of(2026, 6, 3, 10, 2, 3));
        assertThat(output).contains("[COMPENSATION_FAILURE]")
                .contains("slipNo=2026/06/03-77")
                .contains("product=AC-WARN-001")
                .contains("op=RELEASE_INSTANCES");
        // 감사 행 저장 성공 후 운영 알림 seam 이 비즈니스 식별자(slip/단계/품목/동작)로 호출된다. (D-SER-26)
        // 원인 요약은 UUID 포함 가능성 때문에 notifier 에 전달하지 않는다(Codex P1).
        verify(alertNotifier).notifyFailure(eq(slip), eq(CompensationPhase.ACCEPT_RESERVE),
                eq("AC-WARN-001"), eq(CompensationOperation.RELEASE_INSTANCES));
    }
}
