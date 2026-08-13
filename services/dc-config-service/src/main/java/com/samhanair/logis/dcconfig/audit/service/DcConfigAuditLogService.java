package com.samhanair.logis.dcconfig.audit.service;

import com.samhanair.logis.dcconfig.audit.domain.DcConfigAuditLog;
import com.samhanair.logis.dcconfig.audit.repository.DcConfigAuditLogRepository;
import com.samhanair.logis.dcconfig.realtime.DcConfigRealtimeBroker;
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
 * dc-config-service audit overlay 기록 service — PR-H4b (Phase 12 Step 4b).
 *
 * <p>DcConfig mutation 직후 호출 → 1행 INSERT + SSE broadcast. {@link AuditLogRecorder} 구현.
 *
 * <p>SSE event name = {@link DcConfigRealtimeBroker#EVENT_EDIT} ("dc-config:edit").
 *
 * <p><b>회귀 가드</b>: 신규 의존만 — 기존 DcConfigService/PriceCalculationService 미호출 시 영향 0.
 * 호출 통합은 후속 commit 또는 PR-H4c 시점.
 */
@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class DcConfigAuditLogService implements AuditLogRecorder {

    private final DcConfigAuditLogRepository repository;
    private final DcConfigRealtimeBroker broker;

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
            DcConfigAuditLog row = DcConfigAuditLog.record(entityId, nextRevision, actorId, safeActorName,
                    actorColor, c.fieldName(), c.oldValue(), c.newValue());
            repository.save(row);
        }

        Map<String, Object> payload = AuditEventPayloadBuilder.build(
                nextRevision, actorId, safeActorName, actorColor, changes);

        try {
            broker.publish(entityId, DcConfigRealtimeBroker.EVENT_EDIT, payload);
        } catch (RuntimeException broadcastFailure) {
            log.warn("dc-config audit SSE broadcast 실패 — entityId={} cause={}",
                    entityId, broadcastFailure.getMessage());
        }
    }

    /** 거래처 DC 설정별 audit timeline — 최신 revision 우선. */
    @Transactional(readOnly = true)
    public List<DcConfigAuditLog> listByEntity(UUID entityId) {
        return repository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId);
    }
}
