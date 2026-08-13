package com.samhanair.logis.inventory.realtime.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.inventory.realtime.domain.InventoryAuditLog;
import com.samhanair.logis.inventory.realtime.repository.InventoryAuditLogRepository;
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
 * inventory 도메인 audit overlay 라이프사이클 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared {@link AuditLogRecorder} interface 구현. service 레이어가 InventoryAudit / Stock 등의
 * mutation 시점에 본 recorder 호출하여 audit overlay 1행 INSERT + SSE broadcast.
 *
 * <p><b>SSE event name</b>:
 * <ul>
 *   <li>{@code "inventory:edit"} — 단일 / 다중 필드 patch (mutation 직후)</li>
 *   <li>{@code "inventory:reverted"} — 특정 revision 으로 복원 시 별도 분기 event</li>
 * </ul>
 *
 * <p><b>revision_no 채번</b>: entity 가 별도 {@code revisionCount} 컬럼을 보유하지 않으므로
 * {@link InventoryAuditLogRepository#countByEntityId} +1 로 단조 채번.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryAuditLogRecorder implements AuditLogRecorder {

    /** SSE event name — 도메인 prefix "inventory" 일관. */
    public static final String EVENT_INVENTORY_EDIT = "inventory" + EVENT_SUFFIX_EDIT;

    /** SSE event name — revert (별도 분기). */
    public static final String EVENT_INVENTORY_REVERTED = "inventory" + EVENT_SUFFIX_REVERTED;

    private final InventoryAuditLogRepository auditLogRepository;
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
     *
     * @param entityId 변경 대상 entity UUID
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @param actorColor FE 색상 hex (선택)
     * @param changes 변경된 필드 리스트 (1건 이상)
     * @return 영속화된 audit log 리스트 (입력 순서 유지)
     */
    @Transactional
    public List<InventoryAuditLog> recordBatch(UUID entityId, UUID actorId, String actorName,
                                               String actorColor, List<ChangeEntry> changes) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        if (changes == null || changes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "changes 가 비어있습니다 — audit 기록할 변경이 없습니다");
        }
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = (int) (auditLogRepository.countByEntityId(entityId) + 1);
        List<InventoryAuditLog> saved = new ArrayList<>(changes.size());
        for (ChangeEntry change : changes) {
            saved.add(auditLogRepository.save(InventoryAuditLog.record(
                    entityId, revisionNo, actorId, safeActorName, actorColor,
                    change.fieldName(), change.oldValue(), change.newValue())));
        }
        broker.publish(entityId, EVENT_INVENTORY_EDIT,
                AuditEventPayloadBuilder.build(revisionNo, actorId, safeActorName, actorColor, changes));
        log.info("[PR-H4b] inventory entity {} audit 기록 — revision={} fields={}",
                entityId, revisionNo, changes.size());
        return saved;
    }

    /**
     * entity 별 audit log 전체 — FE timeline 표시. 최신 revision 우선.
     *
     * @param entityId 대상 entity UUID
     * @return 최신순 audit log (soft-deleted 자동 제외)
     */
    @Transactional(readOnly = true)
    public List<InventoryAuditLog> listByEntity(UUID entityId) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        return auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId);
    }
}
