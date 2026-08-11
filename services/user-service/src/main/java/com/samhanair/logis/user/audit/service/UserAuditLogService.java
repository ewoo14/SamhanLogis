package com.samhanair.logis.user.audit.service;

import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.audit.AuditEventPayloadBuilder;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import com.samhanair.logis.user.audit.domain.UserAuditLog;
import com.samhanair.logis.user.audit.repository.UserAuditLogRepository;
import com.samhanair.logis.user.realtime.UserRealtimeBroker;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * user-service audit overlay 기록 service — PR-H4b (Phase 12 Step 4b).
 *
 * <p>Employee / Department mutation 직후 도메인 service 가 본 service 의 {@link #recordOverlayPatch}
 * 또는 {@link #recordBatch} 호출. 1 행 INSERT + SSE broadcast (audit overlay payload schema 일관).
 *
 * <p>{@link AuditLogRecorder} interface 구현 — 단일 필드 기록은 1행 patch + 다중 필드 batch 는
 * {@link #recordBatch} 별도 메서드.
 *
 * <p>SSE event name = {@link UserRealtimeBroker#EVENT_EDIT} ("user:edit").
 *
 * <p><b>UUID 비공개</b>: actorName 만 사용자 화면 노출. actorId 는 FE 색상 hash 결정성.
 *
 * <p><b>회귀 가드</b>: 본 service 는 신규 의존만 — 기존 EmployeeProvisioningService/OrgChartService
 * 미호출 시 영향 0. 호출 통합은 후속 commit 또는 PR-H4c (FE 통합) 시점.
 */
@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class UserAuditLogService implements AuditLogRecorder {

    private final UserAuditLogRepository repository;
    private final UserRealtimeBroker broker;

    @Override
    public void recordOverlayPatch(UUID entityId, UUID actorId, String actorName,
                                   String actorColor, String fieldName,
                                   String oldValue, String newValue) {
        recordBatch(entityId, actorId, actorName, actorColor,
                List.of(new ChangeEntry(fieldName, oldValue, newValue)));
    }

    /**
     * 다중 필드 batch 기록 — 같은 mutation 의 N개 필드 변경은 같은 revisionNo 공유.
     *
     * @param entityId 대상 Employee.id 또는 Department.id
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명 (UUID 비공개 가드)
     * @param actorColor FE 색상 hex (선택)
     * @param changes 변경된 필드 리스트 (1건 이상)
     */
    public void recordBatch(UUID entityId, UUID actorId, String actorName, String actorColor,
                            List<ChangeEntry> changes) {
        if (changes == null || changes.isEmpty()) {
            return;
        }
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int nextRevision = repository.findMaxRevisionByEntityId(entityId) + 1;

        for (ChangeEntry c : changes) {
            UserAuditLog row = UserAuditLog.record(entityId, nextRevision, actorId, safeActorName,
                    actorColor, c.fieldName(), c.oldValue(), c.newValue());
            repository.save(row);
        }

        Map<String, Object> payload = AuditEventPayloadBuilder.build(
                nextRevision, actorId, safeActorName, actorColor, changes);

        try {
            broker.publish(entityId, UserRealtimeBroker.EVENT_EDIT, payload);
        } catch (RuntimeException broadcastFailure) {
            // SSE broadcast 실패는 audit 본 row 보존을 우선 — warn log 만, 비즈니스 진행 보장.
            log.warn("user audit SSE broadcast 실패 — entityId={} cause={}",
                    entityId, broadcastFailure.getMessage());
        }
    }
}
