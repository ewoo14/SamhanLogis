package com.samhanair.logis.product.audit.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.product.audit.domain.ProductAuditLog;
import com.samhanair.logis.product.audit.repository.ProductAuditLogRepository;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.repository.ProductRepository;
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
 * 제품 마스터 audit overlay 라이프사이클 — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>{@link AuditLogRecorder} interface 를 본 service 가 구현. shared:realtime-abstraction 의
 * {@link AuditEventPayloadBuilder} + {@link ChangeEntry} 사용으로 14 service 간 SSE event payload
 * schema 일관.
 *
 * <p><b>SSE event 형식</b> ({@code "product:edit"}):
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
public class ProductAuditLogService implements AuditLogRecorder {

    /** SSE event name — 제품 마스터 수정. */
    public static final String EVENT_PRODUCT_EDIT = "product" + EVENT_SUFFIX_EDIT;

    /** SSE event name — audit revert. */
    public static final String EVENT_PRODUCT_REVERTED = "product" + EVENT_SUFFIX_REVERTED;

    private final ProductAuditLogRepository auditLogRepository;
    private final ProductRepository productRepository;
    private final ProductRealtimeBroker broker;

    /**
     * 단일 필드 변경 audit 기록 + SSE broadcast.
     *
     * @throws BusinessException(NOT_FOUND) 제품 미존재
     */
    @Override
    @Transactional
    public void recordOverlayPatch(UUID productId, UUID actorId, String actorName,
                                   String actorColor, String fieldName,
                                   String oldValue, String newValue) {
        Objects.requireNonNull(productId, "productId 는 필수입니다");
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "제품을 찾을 수 없습니다: " + productId));
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = product.incrementRevision();
        auditLogRepository.save(ProductAuditLog.record(
                productId, revisionNo, actorId, safeActorName, actorColor,
                fieldName, oldValue, newValue));
        Map<String, Object> payload = AuditEventPayloadBuilder.build(revisionNo, actorId, safeActorName,
                actorColor, List.of(new ChangeEntry(fieldName, oldValue, newValue)));
        broker.publish(productId, EVENT_PRODUCT_EDIT, payload);
    }

    /**
     * 다중 필드 변경 일괄 audit 기록 + 단일 SSE broadcast.
     *
     * @throws BusinessException(NOT_FOUND) 제품 미존재
     * @throws BusinessException(INVALID_INPUT) changes 비어있음
     */
    @Transactional
    public List<ProductAuditLog> recordBatch(UUID productId, UUID actorId, String actorName,
                                             String actorColor, List<ChangeEntry> changes) {
        Objects.requireNonNull(productId, "productId 는 필수입니다");
        if (changes == null || changes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "changes 가 비어있습니다 — audit 기록할 변경이 없습니다");
        }
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "제품을 찾을 수 없습니다: " + productId));
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = product.incrementRevision();
        List<ProductAuditLog> saved = new ArrayList<>(changes.size());
        for (ChangeEntry change : changes) {
            saved.add(auditLogRepository.save(ProductAuditLog.record(
                    productId, revisionNo, actorId, safeActorName, actorColor,
                    change.fieldName(), change.oldValue(), change.newValue())));
        }
        Map<String, Object> payload = AuditEventPayloadBuilder.build(revisionNo, actorId, safeActorName,
                actorColor, changes);
        broker.publish(productId, EVENT_PRODUCT_EDIT, payload);
        log.info("[PR-H4b] product {} audit batch — revision={} ({} 필드)",
                productId, revisionNo, changes.size());
        return saved;
    }

    /**
     * 제품별 audit log 전체 — FE timeline 표시. 최신 revision 우선.
     */
    @Transactional(readOnly = true)
    public List<ProductAuditLog> listByProduct(UUID productId) {
        Objects.requireNonNull(productId, "productId 는 필수입니다");
        return auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(productId);
    }
}
