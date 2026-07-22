package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.dto.MessageBulkSendRequest;
import com.samhanair.logis.groupware.dto.MessageBulkSendResponse;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

/** 메신저 bulk service RED-first 테스트 — 검증/RPC 호출량과 원자성 계약을 고정한다. */
@ExtendWith(MockitoExtension.class)
class MessageBulkServiceTest {

    @Mock private MessageRepository repository;
    @Mock private UserClient userClient;
    @Mock private NotificationPublisher notificationPublisher;
    @InjectMocks private MessageService messageService;

    @Test
    void R3_검증실패는_저장과_알림을_모두_하지_않는다() {
        UUID sender = UUID.randomUUID();
        List<UUID> recipients = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        Map<UUID, Boolean> exists = new LinkedHashMap<>();
        exists.put(recipients.get(0), true);
        exists.put(recipients.get(1), false);
        exists.put(recipients.get(2), true);
        when(userClient.exists(sender)).thenReturn(true);
        when(userClient.verifyBulk(recipients)).thenReturn(exists);

        assertThatThrownBy(() -> messageService.sendBulk(
                new MessageBulkSendRequest(recipients, "원자성"), sender))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수신자를 찾을 수 없습니다");

        verify(repository, never()).saveAll(anyList());
        verify(notificationPublisher, never()).publish(any());
    }

    @Test
    void R6_송신자_표시명은_요청당_한번만_해석하고_R7_존재검증도_bulk_한번만_호출한다() {
        UUID sender = UUID.randomUUID();
        List<UUID> recipients = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        Map<UUID, Boolean> exists = new LinkedHashMap<>();
        recipients.forEach(id -> exists.put(id, true));
        when(userClient.exists(sender)).thenReturn(true);
        when(userClient.verifyBulk(recipients)).thenReturn(exists);
        when(userClient.resolveDisplayName(sender)).thenReturn(Optional.of("발신자"));
        when(repository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        MessageBulkSendResponse response = messageService.sendBulk(
                new MessageBulkSendRequest(recipients, "다건"), sender);

        assertThat(response.sentCount()).isEqualTo(5);
        assertThat(response.messages()).hasSize(5);
        verify(userClient, times(1)).verifyBulk(recipients);
        verify(userClient, times(1)).resolveDisplayName(sender);
    }

    @Test
    void 중복_수신자는_dedup하고_실제_생성건수를_반환한다() {
        UUID sender = UUID.randomUUID();
        UUID recipient = UUID.randomUUID();
        List<UUID> requested = List.of(recipient, recipient, UUID.randomUUID());
        Map<UUID, Boolean> exists = new LinkedHashMap<>();
        requested.forEach(id -> exists.put(id, true));
        when(userClient.exists(sender)).thenReturn(true);
        when(userClient.verifyBulk(anyList())).thenReturn(exists);
        when(userClient.resolveDisplayName(sender)).thenReturn(Optional.of("발신자"));
        when(repository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        MessageBulkSendResponse response = messageService.sendBulk(
                new MessageBulkSendRequest(requested, "dedup"), sender);

        assertThat(response.sentCount()).isEqualTo(2);
        assertThat(response.messages()).hasSize(2);
    }
}
