package com.samhanair.logis.slip.collab;

import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.UserIdResolver;
import java.time.LocalDateTime;
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
    public void enqueue(List<String> rawRecipients, UUID slipId, UUID editorId,
                        String subject, String body) {
        rawRecipients.stream().distinct().forEach(rawRecipient -> {
            String fingerprint = SlipCollabNotificationOutbox.fingerprint(
                    slipId, editorId, rawRecipient, subject, body);
            if (repository.findByFingerprint(fingerprint).isEmpty()) {
                repository.save(SlipCollabNotificationOutbox.create(
                        slipId, editorId, rawRecipient, subject, body));
            }
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
        row.markSending();
        return Optional.of(repository.save(row));
    }

    protected void deliver(SlipCollabNotificationOutbox row) {
        try {
            Optional<UUID> recipient = userIdResolver.resolve(row.getRawRecipient());
            boolean sent = false;
            if (recipient.isPresent() && !recipient.get().equals(row.getEditorId())) {
                sent = notificationClient.sendUserPushWithResult(
                        recipient.get(), row.getSubject(), row.getBody());
            }
            finish(row.getId(), sent);
        } catch (RuntimeException ex) {
            log.warn("[SlipCollab] durable 알림 전달 실패 — outboxId={}", row.getId(), ex);
            finish(row.getId(), false);
        }
    }

    @Transactional
    protected void finish(UUID id, boolean sent) {
        repository.findById(id).ifPresent(row -> {
            if (sent) row.markSent(); else row.markRetry();
            repository.save(row);
        });
    }
}
