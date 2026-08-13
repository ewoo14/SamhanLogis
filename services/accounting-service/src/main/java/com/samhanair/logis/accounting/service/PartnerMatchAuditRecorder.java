package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.audit.service.AccountingAuditLogService;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.PartnerMatchSource;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.util.List;
import java.util.ArrayList;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 통장 거래 매칭·재매칭·해제의 append-only provenance 감사 기록기. */
@Service
@RequiredArgsConstructor
public class PartnerMatchAuditRecorder {

    private static final UUID SYSTEM_ACTOR = new UUID(0L, 0L);

    private final AccountingAuditLogService auditLogService;

    /**
     * 거래처 old/new partner·source·mapping key와 사유를 한 revision으로 기록한다.
     *
     * @param transaction 변경된 거래
     * @param oldPartnerId 변경 전 거래처 내부 UUID
     * @param oldSource 변경 전 매칭 출처
     * @param oldMappingId 변경 전 매핑 내부 UUID
     * @param oldRawName 변경 전 매핑 원본명
     * @param oldNormalizedName 변경 전 매핑 정규화명
     * @param actorId 실행자 내부 UUID
     * @param actorName 사용자 표시 actor 명칭
     * @param reason MANUAL_MATCH 또는 자동/관리 사유
     */
    public void record(BankTransaction transaction, UUID oldPartnerId, PartnerMatchSource oldSource,
                       UUID oldMappingId, String oldRawName, String oldNormalizedName,
                       UUID actorId, String actorName, String reason) {
        UUID safeActor = actorId == null ? SYSTEM_ACTOR : actorId;
        String safeActorName = safeActor.equals(SYSTEM_ACTOR)
                ? "SYSTEM"
                : ActorDisplayName.resolve(safeActor.toString(), actorName);
        String oldMappingKey = mappingKey(oldRawName, oldNormalizedName);
        String newMappingKey = mappingKey(transaction.getMatchedMappingRawName(),
                transaction.getMatchedMappingNormalizedName());
        List<ChangeEntry> changes = new ArrayList<>();
        addIfChanged(changes, "partnerMatch.partner", value(oldPartnerId),
                value(transaction.getMatchedPartnerId()));
        addIfChanged(changes, "partnerMatch.source", value(oldSource),
                value(transaction.getPartnerMatchSource()));
        if (oldMappingId != null || transaction.getMatchedMappingId() != null) {
            addIfChanged(changes, "partnerMatch.mappingId", value(oldMappingId),
                    value(transaction.getMatchedMappingId()));
        }
        if (oldMappingKey != null || newMappingKey != null) {
            addIfChanged(changes, "partnerMatch.mappingKey", oldMappingKey, newMappingKey);
        }
        changes.add(new ChangeEntry("partnerMatch.reason", null, reason));
        auditLogService.recordBatch(transaction.getId(), safeActor, safeActorName, null, changes);
    }

    /** 기존 값과 새 값 중 하나라도 달라질 때만 audit validator가 허용하는 change를 추가한다. */
    private static void addIfChanged(List<ChangeEntry> changes, String fieldName,
                                     String oldValue, String newValue) {
        if (!java.util.Objects.equals(oldValue, newValue)) {
            changes.add(new ChangeEntry(fieldName, oldValue, newValue));
        }
    }

    private static String value(Object value) {
        return value == null ? null : value.toString();
    }

    private static String mappingKey(String rawName, String normalizedName) {
        if (rawName == null && normalizedName == null) {
            return null;
        }
        return "raw=" + rawName + ";normalized=" + normalizedName;
    }
}
