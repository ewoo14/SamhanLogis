package com.samhanair.logis.partner.audit.service;

import com.samhanair.logis.partner.audit.domain.PartnerAuditLog;
import com.samhanair.logis.partner.audit.repository.PartnerAuditLogRepository;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.audit.AuditEventPayloadBuilder;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 도메인 audit overlay 라이프사이클 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared:realtime-abstraction 의 {@link AuditLogRecorder} interface 구현. partner-service 의
 * 모든 도메인 mutation (Partner / BlockedPartner) 시 1행 INSERT + SSE broadcast.
 *
 * <p><b>SSE event name 표준</b> — {@code "partner:edit"}.
 *
 * <p><b>revision 채번 정책</b> — entity 별 audit log max(revision_no) + 1, in-memory cache 가드.
 *
 * <p><b>UUID 비공개</b>: payload 의 actorId 는 FE 색상 hash 결정성용. 사용자 화면 표시는
 * actorName 만 사용.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerAuditLogService implements AuditLogRecorder {

    /** SSE event name — 거래처 entity 본문 수정. */
    public static final String EVENT_PARTNER_EDIT = "partner" + EVENT_SUFFIX_EDIT;

    private final PartnerAuditLogRepository auditLogRepository;
    private final RealtimeBroker broker;

    private final Map<UUID, AtomicInteger> revisionCounters = new ConcurrentHashMap<>();

    @Override
    @Transactional
    public void recordOverlayPatch(UUID entityId, UUID actorId, String actorName,
                                   String actorColor, String fieldName,
                                   String oldValue, String newValue) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = nextRevisionNo(entityId);
        auditLogRepository.save(PartnerAuditLog.record(
                entityId, revisionNo, actorId, safeActorName, actorColor,
                fieldName, oldValue, newValue));
        broker.publish(entityId, EVENT_PARTNER_EDIT,
                AuditEventPayloadBuilder.build(revisionNo, actorId, safeActorName, actorColor,
                        List.of(new ChangeEntry(fieldName, oldValue, newValue))));
        log.debug("[PR-H4b] partner audit overlay 기록 — entityId={} revisionNo={} field={}",
                entityId, revisionNo, fieldName);
    }

    /**
     * 다중 필드 변경 일괄 audit 기록 — 같은 mutation 의 다중 필드는 같은 revision_no 공유.
     */
    @Transactional
    public List<PartnerAuditLog> recordBatch(UUID entityId, UUID actorId, String actorName,
                                             String actorColor, List<ChangeEntry> changes) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        if (changes == null || changes.isEmpty()) {
            throw new IllegalArgumentException("changes 가 비어있습니다 — audit 기록할 변경이 없습니다");
        }
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = nextRevisionNo(entityId);
        List<PartnerAuditLog> saved = new ArrayList<>(changes.size());
        for (ChangeEntry change : changes) {
            saved.add(auditLogRepository.save(PartnerAuditLog.record(
                    entityId, revisionNo, actorId, safeActorName, actorColor,
                    change.fieldName(), change.oldValue(), change.newValue())));
        }
        broker.publish(entityId, EVENT_PARTNER_EDIT,
                AuditEventPayloadBuilder.build(revisionNo, actorId, safeActorName, actorColor, changes));
        log.debug("[PR-H4b] partner audit batch 기록 — entityId={} revisionNo={} {}건",
                entityId, revisionNo, changes.size());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<PartnerAuditLog> listByEntity(UUID entityId) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        return auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId);
    }

    private int nextRevisionNo(UUID entityId) {
        AtomicInteger counter = revisionCounters.computeIfAbsent(entityId, id -> {
            int currentMax = auditLogRepository
                    .findByEntityIdOrderByRevisionNoDescChangedAtDesc(id)
                    .stream()
                    .mapToInt(PartnerAuditLog::getRevisionNo)
                    .max()
                    .orElse(0);
            return new AtomicInteger(currentMax);
        });
        return counter.incrementAndGet();
    }
}
