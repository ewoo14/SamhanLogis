package com.samhanair.logis.groupware.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.MessageStatus;
import com.samhanair.logis.groupware.dto.MessageSendRequest;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationPublisherSupport;
import com.samhanair.logis.notification.publisher.NotificationSeverity;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 메신저 service — 발송 / 수신함 / 미열람 카운트 / 읽음 처리.
 */
@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository repository;
    private final UserClient userClient;
    private final NotificationPublisher notificationPublisher;

    /**
     * 메신저 발송. 송신자는 게이트웨이 주입 {@code X-User-Id} 로만 확정하고
     * 본문 senderId 는 발신자 위조 방지를 위해 신뢰하지 않는다.
     */
    @Transactional
    public Message send(MessageSendRequest req, UUID senderId) {
        if (!userClient.exists(senderId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "송신자 미존재: " + senderId);
        }
        if (!userClient.exists(req.recipientId())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "수신자 미존재: " + req.recipientId());
        }
        try {
            Message msg = Message.send(senderId, req.recipientId(), req.body());
            String senderDisplayName = resolveSenderDisplayName(senderId);
            Message saved = repository.save(msg);
            NotificationPublishRequest notificationRequest = new NotificationPublishRequest(
                    "MESSENGER",
                    NotificationSeverity.INFO,
                    String.format("새 메시지 — %s", senderDisplayName),
                    req.body().length() > 80 ? req.body().substring(0, 80) + "..." : req.body(),
                    null,
                    req.recipientId(),
                    null,
                    saved.getId().toString(),
                    "/messenger"
            );
            NotificationPublisherSupport.publishAfterCommit(notificationPublisher, notificationRequest);
            return saved;
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }

    /** 수신자 inbox — 발송 시각 역순. */
    @Transactional(readOnly = true)
    public Page<Message> inbox(UUID recipientId, Pageable pageable) {
        return repository.findAllByRecipientIdOrderBySentAtDesc(recipientId, pageable);
    }

    /** 미열람 카운트 (Internal API + admin 화면 공용). */
    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return repository.countByRecipientIdAndStatus(userId, MessageStatus.UNREAD);
    }

    /** 읽음 처리 — 수신자 본인만 호출 허용 (도메인 가드). */
    @Transactional
    public Message markRead(UUID messageId, UUID actorUserId) {
        Message msg = repository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "메신저를 찾을 수 없습니다: " + messageId));
        try {
            msg.markRead(actorUserId);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.FORBIDDEN, ex.getMessage());
        }
        return msg;
    }

    private String resolveSenderDisplayName(UUID senderId) {
        try {
            var displayName = userClient.resolveDisplayName(senderId);
            if (displayName == null) {
                return "알 수 없는 발신자";
            }
            return displayName
                    .map(String::trim)
                    .filter(name -> !name.isBlank())
                    .orElse("알 수 없는 발신자");
        } catch (RuntimeException ex) {
            return "알 수 없는 발신자";
        }
    }
}
