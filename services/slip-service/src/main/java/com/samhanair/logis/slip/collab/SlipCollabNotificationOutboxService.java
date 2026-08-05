package com.samhanair.logis.slip.collab;

import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.UserIdResolver;
import java.time.LocalDateTime;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 커밋된 협업 알림을 durable outbox에서 비동기 전달·재시도한다. */
@Slf4j
@Service
public class SlipCollabNotificationOutboxService {
    private static final int MAX_DELIVERY_ATTEMPTS = 5;
    private final SlipCollabNotificationOutboxRepository repository;
    private final UserIdResolver userIdResolver;
    private final NotificationClient notificationClient;

    public SlipCollabNotificationOutboxService(SlipCollabNotificationOutboxRepository repository,
                                               UserIdResolver userIdResolver,
                                               NotificationClient notificationClient) {
        this.repository = repository;
        this.userIdResolver = userIdResolver;
        this.notificationClient = notificationClient;
    }

    @Transactional
    public void enqueue(UUID eventId, List<String> rawRecipients, UUID slipId, UUID editorId,
                        String subject, String body) {
        rawRecipients.stream().distinct().forEach(rawRecipient -> {
            repository.save(SlipCollabNotificationOutbox.create(
                    eventId, slipId, editorId, rawRecipient, subject, body));
        });
    }

    @Scheduled(fixedDelayString = "${app.slip.collab.notification-outbox-delay-ms:1000}")
    public void drainPending() {
        while (true) {
            Optional<SlipCollabNotificationOutbox> claimed = claimOne();
            if (claimed.isEmpty()) return;
            deliver(claimed.get());
        }
    }

    @Transactional
    protected Optional<SlipCollabNotificationOutbox> claimOne() {
        List<SlipCollabNotificationOutbox> rows = repository
                .findTop100ByStatusInAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
                        List.of(SlipCollabNotificationOutbox.Status.PENDING,
                                SlipCollabNotificationOutbox.Status.SENDING), LocalDateTime.now());
        if (rows.isEmpty()) return Optional.empty();
        SlipCollabNotificationOutbox row = rows.get(0);
        LocalDateTime now = LocalDateTime.now();
        if (repository.claim(row.getId(), now, now.plusSeconds(30)) != 1) {
            return Optional.empty();
        }
        return repository.findById(row.getId());
    }

    protected void deliver(SlipCollabNotificationOutbox row) {
        try {
            Optional<UUID> recipient = userIdResolver.resolve(row.getRawRecipient());
            if (recipient.isEmpty()) {
                finishTerminal(row.getId(), "RECIPIENT_UNRESOLVED");
                return;
            }
            if (recipient.get().equals(row.getEditorId())) {
                finishTerminal(row.getId(), "RECIPIENT_IS_EDITOR");
                return;
            }
            boolean sent = notificationClient.sendUserPushWithResult(
                        recipient.get(), row.getSubject(), row.getBody(),
                        stableIdempotencyKey(row.getEventId(), recipient.get()));
            finish(row.getId(), sent);
        } catch (RuntimeException ex) {
            log.warn("[SlipCollab] durable 알림 전달 실패 — outboxId={}", row.getId(), ex);
            finish(row.getId(), false);
        }
    }

    @Transactional
    protected void finish(UUID id, boolean sent) {
        repository.findById(id).ifPresent(row -> {
            if (sent) row.markSent();
            else if (row.getAttempts() + 1 >= MAX_DELIVERY_ATTEMPTS) row.markTerminal("GATEWAY_RETRY_LIMIT");
            else row.markRetry();
            repository.save(row);
        });
    }

    @Transactional
    protected void finishTerminal(UUID id, String reason) {
        repository.findById(id).ifPresent(row -> {
            row.markTerminal(reason);
            repository.save(row);
        });
    }

    /** 동일한 수정 사건과 수신자 조합이 재시도에서도 같은 notification 요청 키를 사용한다. */
    static UUID stableIdempotencyKey(UUID eventId, UUID recipientId) {
        return UUID.nameUUIDFromBytes(("slip-collab:" + eventId + ":" + recipientId)
                .getBytes(StandardCharsets.UTF_8));
    }
}
