package com.samhanair.logis.accounting.audit.service;

import com.samhanair.logis.accounting.audit.domain.AccountingAuditLog;
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.shared.realtime.audit.AuditEventPayloadBuilder;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회계 도메인 audit overlay 라이프사이클 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared:realtime-abstraction 의 {@link AuditLogRecorder} interface 구현. accounting-service
 * 의 모든 도메인 mutation (TaxInvoice / Journal / AccountingPeriod) 시 1행 INSERT + SSE broadcast.
 *
 * <p><b>SSE event name 표준</b> — {@code "accounting:edit"} (shared
 * {@link AuditLogRecorder#EVENT_SUFFIX_EDIT} 의 도메인 prefix).
 *
 * <p><b>revision 채번 정책</b> — accounting-service 의 도메인 entity 는 slip 의 revision_count
 * 컬럼 같은 별도 컬럼이 없으므로 audit log 자체의 max(revision_no) + 1 로 채번. in-memory cache
 * (entityId → AtomicInteger) 로 동시성 가드.
 *
 * <p><b>UUID 비공개</b>: payload 에 actorId 포함은 FE 색상 hash 결정성용. 사용자 화면 표시는
 * actorName 만 사용.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountingAuditLogService implements AuditLogRecorder {

    /** SSE event name — 회계 entity 본문 수정. */
    public static final String EVENT_ACCOUNTING_EDIT = "accounting" + EVENT_SUFFIX_EDIT;

    private final AccountingAuditLogRepository auditLogRepository;
    private final RealtimeBroker broker;

    /** entity 별 revision 채번 cache — DB max(revision_no) lookup 의 동시성 가드. */
    private final Map<UUID, AtomicInteger> revisionCounters = new ConcurrentHashMap<>();

    /**
     * shared {@link AuditLogRecorder#recordOverlayPatch} 구현 — 단일 필드 변경.
     *
     * <p>entity_id 별 revision_no 자동 채번 + 1행 INSERT + SSE broadcast.
     */
    @Override
    @Transactional
    public void recordOverlayPatch(UUID entityId, UUID actorId, String actorName,
                                   String actorColor, String fieldName,
                                   String oldValue, String newValue) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        int revisionNo = nextRevisionNo(entityId);
        auditLogRepository.save(AccountingAuditLog.record(
                entityId, revisionNo, actorId, actorName, actorColor,
                fieldName, oldValue, newValue));
        broker.publish(entityId, EVENT_ACCOUNTING_EDIT,
                AuditEventPayloadBuilder.build(revisionNo, actorId, actorName, actorColor,
                        List.of(new ChangeEntry(fieldName, oldValue, newValue))));
        log.debug("[PR-H4b] accounting audit overlay 기록 — entityId={} revisionNo={} field={}",
                entityId, revisionNo, fieldName);
    }

    /**
     * 다중 필드 변경 일괄 audit 기록 — 같은 mutation 의 다중 필드는 같은 revision_no 공유.
     *
     * <p>#810 R3-CODEX (S4-M2) — 같은 작업의 행들이 행마다 {@code LocalDateTime.now()} 를 다시
     * 호출하면 changed_at 이 갈라져 회차 그룹핑/정렬이 부정확해진다. 작업당 <b>단일 timestamp</b>
     * 를 계산해 전 행에 동일 주입한다 (revision_no 공유와 대칭).
     *
     * @param entityId 대상 entity (TaxInvoice / Journal / AccountingPeriod) UUID
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @param actorColor FE 색상 hex (선택)
     * @param changes 변경 리스트 (1건 이상)
     * @return 영속화된 audit log 리스트 (입력 순서 유지)
     */
    @Transactional
    public List<AccountingAuditLog> recordBatch(UUID entityId, UUID actorId, String actorName,
                                                String actorColor, List<ChangeEntry> changes) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        if (changes == null || changes.isEmpty()) {
            throw new IllegalArgumentException("changes 가 비어있습니다 — audit 기록할 변경이 없습니다");
        }
        int revisionNo = nextRevisionNo(entityId);
        java.time.LocalDateTime operationChangedAt = java.time.LocalDateTime.now();
        List<AccountingAuditLog> saved = new ArrayList<>(changes.size());
        for (ChangeEntry change : changes) {
            saved.add(auditLogRepository.save(AccountingAuditLog.record(
                    entityId, revisionNo, actorId, actorName, actorColor,
                    change.fieldName(), change.oldValue(), change.newValue(), operationChangedAt)));
        }
        broker.publish(entityId, EVENT_ACCOUNTING_EDIT,
                AuditEventPayloadBuilder.build(revisionNo, actorId, actorName, actorColor, changes));
        log.debug("[PR-H4b] accounting audit batch 기록 — entityId={} revisionNo={} {}건",
                entityId, revisionNo, changes.size());
        return saved;
    }

    /** entity 별 audit log 전체 — FE timeline 표시. 최신 revision 우선. */
    @Transactional(readOnly = true)
    public List<AccountingAuditLog> listByEntity(UUID entityId) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        return auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId);
    }

    /**
     * entity 별 다음 revision_no 채번. cache miss 시 DB max(revision_no) lookup, hit 시
     * AtomicInteger.incrementAndGet.
     */
    private int nextRevisionNo(UUID entityId) {
        AtomicInteger counter = revisionCounters.computeIfAbsent(entityId, id -> {
            int currentMax = auditLogRepository
                    .findByEntityIdOrderByRevisionNoDescChangedAtDesc(id)
                    .stream()
                    .mapToInt(AccountingAuditLog::getRevisionNo)
                    .max()
                    .orElse(0);
            return new AtomicInteger(currentMax);
        });
        return counter.incrementAndGet();
    }
}
