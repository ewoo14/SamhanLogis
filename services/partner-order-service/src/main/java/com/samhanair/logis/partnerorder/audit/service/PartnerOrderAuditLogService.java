package com.samhanair.logis.partnerorder.audit.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.partnerorder.audit.domain.PartnerOrderAuditLog;
import com.samhanair.logis.partnerorder.audit.repository.PartnerOrderAuditLogRepository;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderRealtimeBroker;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.shared.realtime.audit.AuditEventPayloadBuilder;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 주문 audit overlay 라이프사이클 — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>{@link AuditLogRecorder} interface 를 본 service 가 구현. shared:realtime-abstraction 의
 * {@link AuditEventPayloadBuilder} + {@link ChangeEntry} 사용으로 14 service 간 SSE event payload
 * schema 일관.
 *
 * <p>책임 경계:
 * <ul>
 *   <li>{@link #recordOverlayPatch} — 단일 필드 변경 audit 1행 + SSE broadcast ({@code partner-order:edit}).</li>
 *   <li>{@link #recordBatch} — 다중 필드 같은 revision_no 로 일괄 기록.</li>
 *   <li>{@link #listByOrder} — FE timeline 표시 (최신 revision 우선).</li>
 * </ul>
 *
 * <p><b>SSE event 형식</b> ({@code "partner-order:edit"}):
 * <pre>
 * {
 *   "revisionNo": 5,
 *   "actorId": "uuid",
 *   "actorName": "홍길동",
 *   "actorColor": "#3B82F6",
 *   "changes": [{"fieldName":"...","oldValue":"...","newValue":"..."}, ...]
 * }
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerOrderAuditLogService implements AuditLogRecorder {

    /** SSE event name — 거래처 주문 본문 수정. */
    public static final String EVENT_PARTNER_ORDER_EDIT = "partner-order" + EVENT_SUFFIX_EDIT;

    /** SSE event name — audit revert (과거 값으로 되돌림). */
    public static final String EVENT_PARTNER_ORDER_REVERTED = "partner-order" + EVENT_SUFFIX_REVERTED;

    private final PartnerOrderAuditLogRepository auditLogRepository;
    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerOrderRealtimeBroker broker;

    /**
     * 단일 필드 변경 audit 기록 + SSE broadcast.
     *
     * @param partnerOrderId 대상 주문
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @param actorColor FE 색상 hex (선택)
     * @param fieldName 변경된 필드 식별자
     * @param oldValue 이전 값
     * @param newValue 새 값
     * @throws BusinessException(NOT_FOUND) 주문 미존재
     */
    @Override
    @Transactional
    public void recordOverlayPatch(UUID partnerOrderId, UUID actorId, String actorName,
                                   String actorColor, String fieldName,
                                   String oldValue, String newValue) {
        Objects.requireNonNull(partnerOrderId, "partnerOrderId 는 필수입니다");
        PartnerOrder order = partnerOrderRepository.findById(partnerOrderId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처 주문을 찾을 수 없습니다: " + partnerOrderId));
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = order.incrementRevision();
        auditLogRepository.save(PartnerOrderAuditLog.record(
                partnerOrderId, revisionNo, actorId, safeActorName, actorColor,
                fieldName, oldValue, newValue));
        Map<String, Object> payload = AuditEventPayloadBuilder.build(revisionNo, actorId, safeActorName,
                actorColor, List.of(new ChangeEntry(fieldName, oldValue, newValue)));
        broker.publish(partnerOrderId, EVENT_PARTNER_ORDER_EDIT, payload);
    }

    /**
     * 다중 필드 변경 일괄 audit 기록 + 단일 SSE broadcast. 같은 mutation 의 다중 필드는 같은
     * revision_no 공유 — order.incrementRevision 1회만 호출.
     *
     * @param partnerOrderId 대상 주문
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @param actorColor FE 색상 hex (선택)
     * @param changes 변경된 필드 리스트 (1건 이상)
     * @return 영속화된 audit log 리스트 (입력 순서 유지)
     * @throws BusinessException(NOT_FOUND) 주문 미존재
     * @throws BusinessException(INVALID_INPUT) changes 가 비어있을 때
     */
    @Transactional
    public List<PartnerOrderAuditLog> recordBatch(UUID partnerOrderId, UUID actorId,
                                                  String actorName, String actorColor,
                                                  List<ChangeEntry> changes) {
        Objects.requireNonNull(partnerOrderId, "partnerOrderId 는 필수입니다");
        PartnerOrder order = partnerOrderRepository.findById(partnerOrderId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처 주문을 찾을 수 없습니다: " + partnerOrderId));
        return recordBatch(order, actorId, actorName, actorColor, changes);
    }

    /**
     * 이미 로딩된 주문 entity 로 다중 필드 audit 을 기록한다. 같은 트랜잭션에서 본문을 수정한 호출자는
     * 이 overload 를 사용해 불필요한 재조회 없이 revision 을 증가시킨다.
     *
     * @param order 대상 주문 entity
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @param actorColor FE 색상 hex (선택)
     * @param changes 변경된 필드 리스트 (1건 이상)
     * @return 영속화된 audit log 리스트 (입력 순서 유지)
     */
    @Transactional
    public List<PartnerOrderAuditLog> recordBatch(PartnerOrder order, UUID actorId,
                                                  String actorName, String actorColor,
                                                  List<ChangeEntry> changes) {
        Objects.requireNonNull(order, "order 는 필수입니다");
        if (changes == null || changes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "changes 가 비어있습니다 — audit 기록할 변경이 없습니다");
        }
        UUID partnerOrderId = order.getId();
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = order.incrementRevision();
        List<PartnerOrderAuditLog> saved = new ArrayList<>(changes.size());
        for (ChangeEntry change : changes) {
            saved.add(auditLogRepository.save(PartnerOrderAuditLog.record(
                    partnerOrderId, revisionNo, actorId, safeActorName, actorColor,
                    change.fieldName(), change.oldValue(), change.newValue())));
        }
        Map<String, Object> payload = AuditEventPayloadBuilder.build(revisionNo, actorId, safeActorName,
                actorColor, changes);
        broker.publish(partnerOrderId, EVENT_PARTNER_ORDER_EDIT, payload);
        log.info("[PR-H4b] partner-order {} audit batch — revision={} ({} 필드)",
                partnerOrderId, revisionNo, changes.size());
        return saved;
    }

    /**
     * 주문별 audit log 전체 — FE timeline 표시. 최신 revision 우선.
     *
     * @param partnerOrderId 대상 주문
     * @return 최신순 audit log (soft-deleted 자동 제외)
     */
    @Transactional(readOnly = true)
    public List<PartnerOrderAuditLog> listByOrder(UUID partnerOrderId) {
        Objects.requireNonNull(partnerOrderId, "partnerOrderId 는 필수입니다");
        return auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(partnerOrderId);
    }

    /**
     * 주문번호 또는 UUID 문자열로 audit log 를 조회한다. FE 는 사용자 표시용 주문번호만 보유하므로
     * 내부 UUID 를 화면 상태에 보관하지 않는다.
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @return 최신순 audit log
     */
    @Transactional(readOnly = true)
    public List<PartnerOrderAuditLog> listByOrderIdentifier(String id) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        return listByOrder(order.getId());
    }
}
