package com.samhanair.logis.notification.service;

import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Optional;

/** 외부 gateway 호출 전후의 notification 행 영속 경계를 담당한다. */
@Service
public class NotificationDispatchPersistence {
    private final NotificationRequestRepository requestRepository;

    public NotificationDispatchPersistence(NotificationRequestRepository requestRepository) {
        this.requestRepository = requestRepository;
    }

    /** gateway 호출 전에 요청 행을 커밋하여 호출 중 프로세스 종료에도 재처리 좌표를 남긴다. */
    @Transactional
    public NotificationRequest prepare(NotificationSendRequest req) {
        String idempotencyKey = normalizeIdempotencyKey(req.idempotencyKey());
        if (idempotencyKey != null) {
            var existing = requestRepository.findByIdempotencyKeyForUpdate(idempotencyKey);
            if (existing.isPresent()) {
                return existing.get();
            }
        }
        return requestRepository.save(NotificationRequest.open(
                req.recipientType(), req.recipientId(), req.recipientAddress(),
                req.channel(), req.templateCode(), req.subject(), req.body(),
                req.payload(), idempotencyKey));
    }

    private static String normalizeIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null) {
            return null;
        }
        String trimmed = idempotencyKey.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** gateway 결과를 별도 transaction으로 확정한다. */
    @Transactional
    public NotificationRequest complete(NotificationRequest request) {
        request.clearDispatchLease();
        return requestRepository.save(request);
    }

    /** 외부 호출 직전 DB lease를 원자적으로 획득한다. */
    @Transactional
    public Optional<NotificationRequest> claim(NotificationRequest request) {
        if (request.getId() == null) {
            return Optional.of(request);
        }
        LocalDateTime now = LocalDateTime.now();
        int claimed = requestRepository.claimDispatch(request.getId(), now, now.plusSeconds(30));
        return claimed == 1 ? Optional.of(request) : Optional.empty();
    }
}
