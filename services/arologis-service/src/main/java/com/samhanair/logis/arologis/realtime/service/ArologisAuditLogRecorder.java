package com.samhanair.logis.arologis.realtime.service;

import com.samhanair.logis.arologis.realtime.domain.ArologisAuditLog;
import com.samhanair.logis.arologis.realtime.repository.ArologisAuditLogRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.audit.AuditEventPayloadBuilder;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * arologis 도메인 audit overlay 라이프사이클 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared {@link AuditLogRecorder} interface 구현. service 레이어가 Dispatch / VehicleStop 의
 * mutation 시점에 본 recorder 호출하여 audit overlay 1행 INSERT + SSE broadcast.
 *
 * <p><b>SSE event name</b>:
 * <ul>
 *   <li>{@code "arologis:edit"} — 단일 / 다중 필드 patch</li>
 *   <li>{@code "arologis:reverted"} — 특정 revision 으로 복원</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ArologisAuditLogRecorder implements AuditLogRecorder {

    public static final String EVENT_AROLOGIS_EDIT = "arologis" + EVENT_SUFFIX_EDIT;
    public static final String EVENT_AROLOGIS_REVERTED = "arologis" + EVENT_SUFFIX_REVERTED;

    private final ArologisAuditLogRepository auditLogRepository;
    private final RealtimeBroker broker;

    @Override
    @Transactional
    public void recordOverlayPatch(UUID entityId, UUID actorId, String actorName,
                                   String actorColor, String fieldName,
                                   String oldValue, String newValue) {
        recordBatch(entityId, actorId, actorName, actorColor,
                List.of(new ChangeEntry(fieldName, oldValue, newValue)));
    }

    /**
     * 다중 필드 변경 일괄 audit 기록 + 단일 SSE broadcast.
     */
    @Transactional
    public List<ArologisAuditLog> recordBatch(UUID entityId, UUID actorId, String actorName,
                                              String actorColor, List<ChangeEntry> changes) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        if (changes == null || changes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "changes 가 비어있습니다 — audit 기록할 변경이 없습니다");
        }
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = (int) (auditLogRepository.countByEntityId(entityId) + 1);
        List<ArologisAuditLog> saved = new ArrayList<>(changes.size());
        for (ChangeEntry change : changes) {
            saved.add(auditLogRepository.save(ArologisAuditLog.record(
                    entityId, revisionNo, actorId, safeActorName, actorColor,
                    change.fieldName(), change.oldValue(), change.newValue())));
        }
        broker.publish(entityId, EVENT_AROLOGIS_EDIT,
                AuditEventPayloadBuilder.build(revisionNo, actorId, safeActorName, actorColor, changes));
        log.info("[PR-H4b] arologis entity {} audit 기록 — revision={} fields={}",
                entityId, revisionNo, changes.size());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<ArologisAuditLog> listByEntity(UUID entityId) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        return auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId);
    }
}
