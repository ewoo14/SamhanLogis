package com.samhanair.logis.notification.service;

import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
        if (req.idempotencyKey() != null && !req.idempotencyKey().isBlank()) {
            var existing = requestRepository.findByIdempotencyKeyForUpdate(req.idempotencyKey());
            if (existing.isPresent()) {
                return existing.get();
            }
        }
        return requestRepository.save(NotificationRequest.open(
                req.recipientType(), req.recipientId(), req.recipientAddress(),
                req.channel(), req.templateCode(), req.subject(), req.body(),
                req.payload(), req.idempotencyKey()));
    }

    /** gateway 결과를 별도 transaction으로 확정한다. */
    @Transactional
    public NotificationRequest complete(NotificationRequest request) {
        return requestRepository.save(request);
    }
}
