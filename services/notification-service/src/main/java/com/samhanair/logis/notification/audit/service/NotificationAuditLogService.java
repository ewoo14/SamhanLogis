package com.samhanair.logis.notification.audit.service;

import com.samhanair.logis.notification.audit.domain.NotificationAuditLog;
import com.samhanair.logis.notification.audit.repository.NotificationAuditLogRepository;
import com.samhanair.logis.notification.realtime.NotificationRealtimeBroker;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.audit.AuditEventPayloadBuilder;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * notification-service audit overlay 기록 service — PR-H4b (Phase 12 Step 4b).
 *
 * <p>PartnerChatRoomMapping/BlockedPartner 변경 + NotificationLog 발송 결과 기록 → 1행 INSERT
 * + SSE broadcast. {@link AuditLogRecorder} 구현.
 *
 * <p>SSE event name = {@link NotificationRealtimeBroker#EVENT_EDIT} ("notification:edit").
 *
 * <p><b>append-only — lock 불필요</b>: 사용자 task 명시.
 *
 * <p><b>회귀 가드</b>: 신규 의존만 — 기존 NotificationService/ChatRoomMappingService 미호출 시
 * 영향 0. 호출 통합은 후속 commit 또는 PR-H4c 시점.
 */
@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class NotificationAuditLogService implements AuditLogRecorder {

    private final NotificationAuditLogRepository repository;
    private final NotificationRealtimeBroker broker;

    @Override
    public void recordOverlayPatch(UUID entityId, UUID actorId, String actorName,
                                   String actorColor, String fieldName,
                                   String oldValue, String newValue) {
        recordBatch(entityId, actorId, actorName, actorColor,
                List.of(new ChangeEntry(fieldName, oldValue, newValue)));
    }

    /** 다중 필드 batch 기록 — 같은 mutation 의 N개 필드 변경은 같은 revisionNo 공유. */
    public void recordBatch(UUID entityId, UUID actorId, String actorName, String actorColor,
                            List<ChangeEntry> changes) {
        if (changes == null || changes.isEmpty()) {
            return;
        }
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int nextRevision = repository.findMaxRevisionByEntityId(entityId) + 1;

        for (ChangeEntry c : changes) {
            NotificationAuditLog row = NotificationAuditLog.record(entityId, nextRevision, actorId,
                    safeActorName, actorColor, c.fieldName(), c.oldValue(), c.newValue());
            repository.save(row);
        }

        Map<String, Object> payload = AuditEventPayloadBuilder.build(
                nextRevision, actorId, safeActorName, actorColor, changes);

        try {
            broker.publish(entityId, NotificationRealtimeBroker.EVENT_EDIT, payload);
        } catch (RuntimeException broadcastFailure) {
            log.warn("notification audit SSE broadcast 실패 — entityId={} cause={}",
                    entityId, broadcastFailure.getMessage());
        }
    }
}
