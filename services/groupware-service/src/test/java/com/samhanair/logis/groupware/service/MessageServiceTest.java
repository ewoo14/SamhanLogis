package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.MessageStatus;
import com.samhanair.logis.groupware.dto.MessageSendRequest;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationSeverity;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 메신저 도메인 단위 테스트 — 4 case:
 * <ol>
 *   <li>send 정상 흐름 (status=UNREAD, sentAt 적재)</li>
 *   <li>self-send 거부</li>
 *   <li>markRead 흐름 (UNREAD → READ + readAt 적재)</li>
 *   <li>수신자 외 markRead 호출 거부</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class MessageServiceTest {

    @Mock
    private MessageRepository repository;

    @Mock
    private UserClient userClient;

    @Mock
    private NotificationPublisher notificationPublisher;

    @InjectMocks
    private MessageService messageService;

    @Test
    void send_initialises_unread_with_sentAt_now() {
        UUID sender = UUID.randomUUID();
        UUID recipient = UUID.randomUUID();

        Message m = Message.send(sender, recipient, "안녕하세요");

        assertThat(m.getStatus()).isEqualTo(MessageStatus.UNREAD);
        assertThat(m.getSentAt()).isNotNull();
        assertThat(m.getReadAt()).isNull();
        assertThat(m.getBody()).isEqualTo("안녕하세요");
    }

    @Test
    void send_blocks_self_send() {
        UUID self = UUID.randomUUID();

        assertThatThrownBy(() -> Message.send(self, self, "test"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("자기 자신");
    }

    @Test
    void send_publishes_notification_center_event_to_recipient() {
        UUID sender = UUID.randomUUID();
        UUID recipient = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        when(userClient.exists(sender)).thenReturn(true);
        when(userClient.exists(recipient)).thenReturn(true);
        when(userClient.resolveDisplayName(sender)).thenReturn(Optional.of("오병승"));
        when(repository.save(any(Message.class))).thenAnswer(invocation -> {
            Message saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", messageId);
            return saved;
        });

        TransactionSynchronizationManager.initSynchronization();
        Message saved;
        try {
            saved = messageService.send(new MessageSendRequest(UUID.randomUUID(), recipient, "안녕하세요"), sender);

            verify(notificationPublisher, never()).publish(any());
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        assertThat(saved.getId()).isEqualTo(messageId);
        ArgumentCaptor<NotificationPublishRequest> captor = ArgumentCaptor.forClass(NotificationPublishRequest.class);
        verify(notificationPublisher, timeout(1000)).publish(captor.capture());
        NotificationPublishRequest req = captor.getValue();
        assertThat(req.channel()).isEqualTo("MESSENGER");
        assertThat(req.severity()).isEqualTo(NotificationSeverity.INFO);
        assertThat(req.title()).isEqualTo("새 메시지 — 오병승");
        assertThat(req.title()).doesNotContain(sender.toString(), recipient.toString());
        assertThat(req.body()).isEqualTo("안녕하세요");
        assertThat(req.targetRole()).isNull();
        assertThat(req.targetUserId()).isEqualTo(recipient);
        assertThat(req.sourceService()).isNull();
        assertThat(req.sourceRefId()).isEqualTo(messageId.toString());
        assertThat(req.deeplink()).isEqualTo("/messenger");
    }

    @Test
    void markRead_by_recipient_transitions_unread_to_read() {
        UUID sender = UUID.randomUUID();
        UUID recipient = UUID.randomUUID();
        Message m = Message.send(sender, recipient, "본문");

        m.markRead(recipient);

        assertThat(m.getStatus()).isEqualTo(MessageStatus.READ);
        assertThat(m.getReadAt()).isNotNull();
    }

    @Test
    void markRead_by_non_recipient_is_rejected() {
        UUID sender = UUID.randomUUID();
        UUID recipient = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        Message m = Message.send(sender, recipient, "본문");

        assertThatThrownBy(() -> m.markRead(other))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("수신자 본인만");
    }
}
