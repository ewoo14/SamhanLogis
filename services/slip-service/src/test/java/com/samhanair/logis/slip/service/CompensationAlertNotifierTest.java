package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * CompensationAlertNotifier 의 config-gating / best-effort 단위 테스트.
 */
@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class CompensationAlertNotifierTest {

    private static final String RECIPIENT = "11111111-1111-1111-1111-111111111111";

    @Mock
    private NotificationClient notificationClient;

    private SimpleMeterRegistry registry;
    private CompensationMetrics metrics;

    @BeforeEach
    void setUpMetrics() {
        registry = new SimpleMeterRegistry();
        metrics = new CompensationMetrics(registry);
    }

    private Slip slip() {
        Slip slip = Slip.createOutbound("2026/06/03-99", LocalDate.of(2026, 6, 3), 99,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "삼한", DeliveryTag.SALE, null, "u");
        ReflectionTestUtils.setField(slip, "id", UUID.randomUUID());
        return slip;
    }

    // 본문에 UUID(예외 메시지에 섞여 들어올 수 있는 내부 식별자)가 절대 노출되지 않는지 검증하는 패턴.
    private static final java.util.regex.Pattern UUID_PATTERN = java.util.regex.Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    private void notify(CompensationAlertNotifier notifier) {
        notifier.notifyFailure(slip(), CompensationPhase.ACCEPT_RESERVE, "AC-ALERT-001",
                CompensationOperation.RELEASE_INSTANCES);
    }

    @Test
    void enabledWithRecipient_sendsPushWithBusinessIdentifiersOnly() {
        CompensationAlertNotifier notifier =
                new CompensationAlertNotifier(notificationClient, true, RECIPIENT, metrics);

        notify(notifier);

        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(notificationClient).sendUserPush(
                eq(UUID.fromString(RECIPIENT)), subject.capture(), body.capture());
        assertThat(subject.getValue()).isEqualTo("[보상실패] 2026/06/03-99");
        assertThat(body.getValue())
                .contains("2026/06/03-99")
                .contains("AC-ALERT-001")
                .contains("RELEASE_INSTANCES");
        // 🚨 UUID 비공개 — 본문/제목 어디에도 UUID 형식 문자열이 없어야 한다. (Codex cross-check P1)
        assertThat(UUID_PATTERN.matcher(body.getValue()).find())
                .as("푸시 본문에 UUID 노출 없음").isFalse();
        assertThat(UUID_PATTERN.matcher(subject.getValue()).find())
                .as("푸시 제목에 UUID 노출 없음").isFalse();
        assertThat(alertSendCount("success")).isEqualTo(1);
    }

    @Test
    void disabled_doesNotSend() {
        CompensationAlertNotifier notifier =
                new CompensationAlertNotifier(notificationClient, false, RECIPIENT, metrics);

        notify(notifier);

        verifyNoInteractions(notificationClient);
        assertThat(alertSendCount("skipped")).isEqualTo(1);
    }

    @Test
    void enabledButBlankRecipient_doesNotSendAndWarns(CapturedOutput output) {
        CompensationAlertNotifier notifier =
                new CompensationAlertNotifier(notificationClient, true, "  ", metrics);

        notify(notifier);

        verify(notificationClient, never()).sendUserPush(org.mockito.ArgumentMatchers.any(),
                anyString(), anyString());
        // 활성화했으나 수신자 미설정은 설정 오류 — WARN 으로 표면화되어야 한다.
        assertThat(output).contains("recipient-user-id 미설정");
        assertThat(alertSendCount("skipped")).isEqualTo(1);
    }

    @Test
    void enabledButMalformedRecipient_doesNotSendAndWarns(CapturedOutput output) {
        CompensationAlertNotifier notifier =
                new CompensationAlertNotifier(notificationClient, true, "not-a-uuid", metrics);

        notify(notifier);

        verify(notificationClient, never()).sendUserPush(org.mockito.ArgumentMatchers.any(),
                anyString(), anyString());
        assertThat(output)
                .contains("recipient-user-id 형식 오류(UUID 아님)")
                .doesNotContain("not-a-uuid")
                .doesNotContain("recipient-user-id 미설정");
        assertThat(alertSendCount("skipped")).isEqualTo(1);
    }

    @Test
    void notificationException_isSwallowed() {
        CompensationAlertNotifier notifier =
                new CompensationAlertNotifier(notificationClient, true, RECIPIENT, metrics);
        doThrow(new RuntimeException("notification down"))
                .when(notificationClient).sendUserPush(org.mockito.ArgumentMatchers.any(),
                        anyString(), anyString());

        // 예외가 전파되지 않아야 한다(보상 흐름 무영향).
        notify(notifier);

        // 정상 인자(고정 제목)로 호출됐고 예외만 삼켜졌음을 함께 확인한다.
        verify(notificationClient).sendUserPush(eq(UUID.fromString(RECIPIENT)),
                eq("[보상실패] 2026/06/03-99"), anyString());
        assertThat(alertSendCount("failure")).isEqualTo(1);
    }

    private double alertSendCount(String result) {
        return registry.get(CompensationMetrics.COMPENSATION_ALERT_SEND_TOTAL)
                .tag("result", result)
                .counter()
                .count();
    }
}
