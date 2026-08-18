package com.samhanair.logis.groupware.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.MessageStatus;
import com.samhanair.logis.groupware.dto.MessageBulkSendRequest;
import com.samhanair.logis.groupware.dto.MessageBulkSendResponse;
import com.samhanair.logis.groupware.dto.MessageResponse;
import com.samhanair.logis.groupware.dto.MessageSendRequest;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationPublisherDispatchExecutor;
import com.samhanair.logis.notification.publisher.NotificationPublisherSupport;
import com.samhanair.logis.notification.publisher.NotificationSeverity;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
    private final NotificationPublisherDispatchExecutor notificationPublisherDispatchExecutor;

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
            NotificationPublisherSupport.publishAfterCommit(notificationPublisher, notificationRequest,
                    notificationPublisherDispatchExecutor);
            return saved;
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }

    /**
     * 메신저 복수 수신 발송. 수신자 검증과 저장을 하나의 트랜잭션에서 수행하여 전원 성공 또는
     * 전원 실패를 보장한다. 수신자별 저장 행은 같은 batchId를 공유한다.
     */
    @Transactional
    public MessageBulkSendResponse sendBulk(MessageBulkSendRequest req, UUID senderId) {
        if (!userClient.exists(senderId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "송신자 미존재: " + senderId);
        }

        List<UUID> requestedIds = req == null || req.recipientIds() == null
                ? List.of()
                : req.recipientIds();
        if (requestedIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "수신자를 1명 이상 선택하십시오");
        }
        if (requestedIds.stream().anyMatch(Objects::isNull)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "수신자 식별자가 유효하지 않습니다");
        }
        List<UUID> recipientIds = requestedIds.stream().distinct().toList();
        if (recipientIds.size() > 50) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "수신자는 최대 50명까지 선택할 수 있습니다");
        }
        if (recipientIds.stream().anyMatch(senderId::equals)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "본인은 수신자로 지정할 수 없습니다");
        }

        Map<UUID, Boolean> existsById = userClient.verifyBulk(recipientIds);
        for (int i = 0; i < recipientIds.size(); i++) {
            UUID recipientId = recipientIds.get(i);
            if (!Boolean.TRUE.equals(existsById.get(recipientId))) {
                // UUID는 사용자 노출 메시지에 포함하지 않는다.
                throw new BusinessException(ErrorCode.NOT_FOUND,
                        "수신자를 찾을 수 없습니다: 수신자 " + (i + 1) + "번");
            }
        }

        Map<UUID, Boolean> activeById = userClient.verifyActiveBulk(recipientIds);
        for (int i = 0; i < recipientIds.size(); i++) {
            UUID recipientId = recipientIds.get(i);
            if (!Boolean.TRUE.equals(activeById.get(recipientId))) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "수신자 " + (i + 1) + "번은 퇴사했거나 재직 상태가 아니어서 발송할 수 없습니다");
            }
        }

        String body = req == null ? null : req.body();
        if (body == null || body.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "본문을 입력하십시오");
        }
        if (body.length() > 2000) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "본문은 2000자 이하로 입력하십시오");
        }

        UUID batchId = UUID.randomUUID();
        String senderDisplayName = resolveSenderDisplayName(senderId);
        List<Message> messages = recipientIds.stream()
                .map(recipientId -> Message.send(senderId, recipientId, body, batchId))
                .toList();
        List<Message> savedMessages = repository.saveAll(messages);
        for (Message saved : savedMessages) {
            NotificationPublishRequest notificationRequest = new NotificationPublishRequest(
                    "MESSENGER",
                    NotificationSeverity.INFO,
                    String.format("새 메시지 — %s", senderDisplayName),
                    body.length() > 80 ? body.substring(0, 80) + "..." : body,
                    null,
                    saved.getRecipientId(),
                    null,
                    saved.getId() == null ? null : saved.getId().toString(),
                    "/messenger"
            );
            NotificationPublisherSupport.publishAfterCommit(notificationPublisher, notificationRequest,
                    notificationPublisherDispatchExecutor);
        }
        return new MessageBulkSendResponse(savedMessages.size(),
                savedMessages.stream().map(MessageResponse::from).toList());
    }

    /**
     * 수신자 inbox — 발송 시각 역순. 발신자 표시명은 페이지 내 고유 UUID 기준으로 1회 배치 해석한다
     * (메시지 건마다 개별 RPC 하지 않는다). UUID는 응답에 포함하되 화면에는 표시명만 노출한다.
     */
    @Transactional(readOnly = true)
    public List<MessageResponse> inboxResponses(UUID recipientId, Pageable pageable) {
        return inboxPageResponses(recipientId, pageable).getContent();
    }

    /** 수신함 페이지와 실제 다음 페이지 존재 여부를 함께 계산한다. */
    @Transactional(readOnly = true)
    public Page<MessageResponse> inboxPageResponses(UUID recipientId, Pageable pageable) {
        Page<Message> page = repository.findAllByRecipientIdOrderBySentAtDesc(recipientId, pageable);
        List<UUID> senderIds = page.getContent().stream()
                .map(Message::getSenderId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, String> displayNames = resolveSenderDisplayNames(senderIds);
        return page.map(m -> MessageResponse.from(m, displayNames.get(m.getSenderId())));
    }

    /** 미열람 카운트 (Internal API + admin 화면 공용). */
    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return repository.countByRecipientIdAndStatus(userId, MessageStatus.UNREAD);
    }

    /** 읽음 처리 — 수신자 본인만 호출 허용 (도메인 가드). */
    @Transactional
    public Message markRead(UUID messageId, UUID actorUserId) {
        // UUID는 사용자 노출 메시지에 포함하지 않는다(bulk 발송 오류 메시지와 동일 정책).
        Message msg = repository.findByIdForUpdate(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "메신저를 찾을 수 없습니다"));
        try {
            msg.markRead(actorUserId);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.FORBIDDEN, ex.getMessage());
        }
        return msg;
    }

    /**
     * 여러 발신자 UUID의 표시명을 1회 배치 호출로 해석한다. 미해석 항목은
     * "알 수 없는 발신자"로 채워 화면에 UUID가 노출되지 않게 한다.
     */
    private Map<UUID, String> resolveSenderDisplayNames(List<UUID> senderIds) {
        if (senderIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, String> resolved;
        try {
            resolved = userClient.resolveDisplayNames(senderIds);
        } catch (RuntimeException ex) {
            resolved = Map.of();
        }
        if (resolved == null) {
            resolved = Map.of();
        }
        Map<UUID, String> result = new java.util.HashMap<>();
        for (UUID id : senderIds) {
            String name = resolved.get(id);
            result.put(id, (name == null || name.isBlank()) ? "알 수 없는 발신자" : name);
        }
        return result;
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
