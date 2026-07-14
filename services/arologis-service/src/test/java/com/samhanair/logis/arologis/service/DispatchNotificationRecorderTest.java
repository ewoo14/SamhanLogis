package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.domain.ArologisNotifyChannel;
import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
import com.samhanair.logis.arologis.domain.DispatchNotification;
import com.samhanair.logis.arologis.repository.DispatchNotificationRepository;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * DispatchNotificationRecorder 단위 테스트.
 *
 * <p>배차 매칭 본 트랜잭션을 오염시키지 않도록 독립 트랜잭션(REQUIRES_NEW) 선언을 검증하고,
 * 저장 실패는 이 recorder 가 삼키지 않고 호출자에게 그대로 전파함을 검증한다
 * (fail-soft 처리는 호출자 책임 — {@code DispatchService} 참고).
 */
class DispatchNotificationRecorderTest {

    private final DispatchNotificationRepository repository = mock(DispatchNotificationRepository.class);
    private final DispatchNotificationRecorder recorder = new DispatchNotificationRecorder(repository);

    @Test
    @DisplayName("record는 REQUIRES_NEW 트랜잭션으로 알림 이력을 저장한다")
    void record_saves_with_requires_new_transaction() throws Exception {
        Transactional transactional = DispatchNotificationRecorder.class
                .getMethod("record", UUID.class, UUID.class, ArologisNotifyChannel.class,
                        ArologisNotifyStatus.class, LocalDateTime.class, String.class, String.class)
                .getAnnotation(Transactional.class);

        recorder.record(
                UUID.randomUUID(),
                UUID.randomUUID(),
                ArologisNotifyChannel.ALIGO,
                ArologisNotifyStatus.SUCCESS,
                LocalDateTime.of(2026, 7, 14, 12, 0),
                "010-1111-2222",
                null);

        org.mockito.ArgumentCaptor<DispatchNotification> captor =
                org.mockito.ArgumentCaptor.forClass(DispatchNotification.class);
        verify(repository).save(captor.capture());
        org.assertj.core.api.Assertions.assertThat(transactional.propagation())
                .isEqualTo(Propagation.REQUIRES_NEW);
        org.assertj.core.api.Assertions.assertThat(captor.getValue().getChannel())
                .isEqualTo(ArologisNotifyChannel.ALIGO);
        org.assertj.core.api.Assertions.assertThat(captor.getValue().getStatus())
                .isEqualTo(ArologisNotifyStatus.SUCCESS);
    }

    @Test
    @DisplayName("알림 이력 저장 실패는 삼키지 않고 호출자에게 전파한다")
    void record_propagates_repository_failure_to_caller() {
        when(repository.save(any(DispatchNotification.class))).thenThrow(new IllegalStateException("db down"));

        assertThatThrownBy(() -> recorder.record(
                UUID.randomUUID(),
                UUID.randomUUID(),
                ArologisNotifyChannel.ALIGO,
                ArologisNotifyStatus.FAILED,
                LocalDateTime.of(2026, 7, 14, 12, 0),
                "010-1111-2222",
                "HTTP_500"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("db down");
    }
}
