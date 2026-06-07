package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.SlipNumberSequence;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipNumberSequenceRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** SlipNumberService — 날짜별 채번 + 시퀀스 자동 생성 + 동일 날짜 다중 호출 시 순번 증가. */
@ExtendWith(MockitoExtension.class)
class SlipNumberServiceTest {

    @Mock private SlipNumberSequenceRepository sequenceRepository;

    @InjectMocks private SlipNumberService service;

    private LocalDate today;

    @BeforeEach
    void setUp() {
        today = LocalDate.of(2026, 5, 4);
    }

    @Test
    void next_firstCall_createsSequence_andReturns1WithoutPadding() {
        when(sequenceRepository.findLockedBySlipDateAndSlipType(today, SlipType.OUTBOUND))
                .thenReturn(Optional.of(SlipNumberSequence.create(today, SlipType.OUTBOUND)));

        String slipNo = service.next(today);

        assertThat(slipNo).isEqualTo("2026/05/04-1");
    }

    @Test
    void next_existingSequence_incrementsLastSeq() {
        SlipNumberSequence existing = SlipNumberSequence.create(today, SlipType.OUTBOUND);
        existing.next(); // lastSeq=1
        existing.next(); // lastSeq=2
        when(sequenceRepository.findLockedBySlipDateAndSlipType(today, SlipType.OUTBOUND))
                .thenReturn(Optional.of(existing));

        String slipNo = service.next(today);

        assertThat(slipNo).isEqualTo("2026/05/04-3");
    }

    @Test
    void next_twoCallsSameDay_returnSequentialNos() {
        SlipNumberSequence seq = SlipNumberSequence.create(today, SlipType.OUTBOUND);
        when(sequenceRepository.findLockedBySlipDateAndSlipType(today, SlipType.OUTBOUND))
                .thenReturn(Optional.of(seq));

        String first = service.next(today);
        String second = service.next(today);

        assertThat(first).isEqualTo("2026/05/04-1");
        assertThat(second).isEqualTo("2026/05/04-2");
    }

    @Test
    void extractSeqNo_parsesTrailingNumber() {
        assertThat(service.extractSeqNo("2026/05/04-5")).isEqualTo(5);
        assertThat(service.extractSeqNo("2026/05/04-123")).isEqualTo(123);
    }

    @Test
    void next_differentDates_independentSequences() {
        LocalDate yesterday = today.minusDays(1);
        SlipNumberSequence todaySeq = SlipNumberSequence.create(today, SlipType.OUTBOUND);
        SlipNumberSequence yesterdaySeq = SlipNumberSequence.create(yesterday, SlipType.OUTBOUND);
        yesterdaySeq.next();
        yesterdaySeq.next();
        when(sequenceRepository.findLockedBySlipDateAndSlipType(today, SlipType.OUTBOUND))
                .thenReturn(Optional.of(todaySeq));
        when(sequenceRepository.findLockedBySlipDateAndSlipType(yesterday, SlipType.OUTBOUND))
                .thenReturn(Optional.of(yesterdaySeq));

        assertThat(service.next(today)).isEqualTo("2026/05/04-1");
        assertThat(service.next(yesterday)).isEqualTo("2026/05/03-3");
    }

    @Test
    void next_sameDateDifferentSlipTypes_allowSamePublicNumber() {
        SlipNumberSequence outboundSeq = SlipNumberSequence.create(today, SlipType.OUTBOUND);
        SlipNumberSequence inboundSeq = SlipNumberSequence.create(today, SlipType.INBOUND);
        when(sequenceRepository.findLockedBySlipDateAndSlipType(today, SlipType.OUTBOUND))
                .thenReturn(Optional.of(outboundSeq));
        when(sequenceRepository.findLockedBySlipDateAndSlipType(today, SlipType.INBOUND))
                .thenReturn(Optional.of(inboundSeq));

        assertThat(service.next(today, SlipType.OUTBOUND)).isEqualTo("2026/05/04-1");
        assertThat(service.next(today, SlipType.INBOUND)).isEqualTo("2026/05/04-1");
    }
}
