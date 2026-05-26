package com.samhanair.logis.product.editrequest.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.editrequest.config.ProductEditRequestProperties;
import com.samhanair.logis.product.editrequest.domain.ProductEditRequest;
import com.samhanair.logis.product.editrequest.repository.ProductEditRequestRepository;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestService;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import com.samhanair.logis.shared.realtime.lock.EditLockPolicy;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 제품 마스터 수정/삭제 요청 워크플로우 — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>{@link EditRequestService} interface ({@code shared:realtime-abstraction}) 구현.
 *
 * <p>사용자 명시 잠금 정책 (개발책임자 결정 — 제품 마스터 도메인):
 * <ul>
 *   <li>ACTIVE — 자유 mutation (본 service 미사용 — admin 직접 가능).</li>
 *   <li>DISCONTINUED (단종 처리 후) — 작성자 직접 차단 → 본 service channel 요청 → MANAGER
 *       수락 시 1회 mutation 가능 (가격/태그/재활성 변경은 회계/감사 추적이 강한 admin 결정).</li>
 * </ul>
 *
 * <p><b>SSE event 형식</b>:
 * <ul>
 *   <li>{@code "product:edit-request:created"} — 요청 생성 시 broadcast</li>
 *   <li>{@code "product:edit-request:decided"} — 수락/거절/만료 시 broadcast</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProductEditRequestService implements EditRequestService {

    /** SSE event name — 요청 생성. */
    public static final String EVENT_REQUEST_CREATED = "product" + EVENT_SUFFIX_CREATED;

    /** SSE event name — 수락/거절/만료. */
    public static final String EVENT_REQUEST_DECIDED = "product" + EVENT_SUFFIX_DECIDED;

    /**
     * 잠금 정책 — 제품 마스터 도메인.
     *
     * <ul>
     *   <li>free = ACTIVE — admin 직접 mutation 허용 (본 service 미사용)</li>
     *   <li>lockedRequiresApproval = DISCONTINUED — APPROVED 1회 소진 후 mutation 가능</li>
     * </ul>
     *
     * <p>제품 도메인은 종결 (terminal) status 가 별도로 없음 — soft-delete 는 status 와 직교.
     */
    public static final EditLockPolicy<ProductStatus> LOCK_POLICY =
            EditLockPolicy.<ProductStatus>builder()
                    .freeStatuses(ProductStatus.ACTIVE)
                    .lockedRequiresApproval(ProductStatus.DISCONTINUED)
                    .build();

    private final ProductEditRequestRepository requestRepository;
    private final ProductRepository productRepository;
    private final ProductRealtimeBroker broker;
    private final ProductEditRequestProperties properties;

    /**
     * 신규 수정/삭제 요청 생성 + SSE broadcast.
     *
     * <p>status 가드:
     * <ul>
     *   <li>ACTIVE — admin 직접 mutation 가능, INVALID_INPUT.</li>
     *   <li>DISCONTINUED — 정상 요청 생성 (target_role=MANAGER).</li>
     * </ul>
     */
    @Transactional
    public ProductEditRequest request(UUID productId, EditRequestType requestType, String reason,
                                      UUID requesterId, String requesterName) {
        Objects.requireNonNull(productId, "productId 는 필수입니다");
        Objects.requireNonNull(requestType, "requestType 은 필수입니다");
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "제품을 찾을 수 없습니다: " + productId));

        guardRequestableStatus(product);

        EditTargetRole targetRole = EditTargetRole.MANAGER;
        LocalDateTime expiresAt = LocalDateTime.now().plusHours(properties.getExpiresHours());

        ProductEditRequest request = ProductEditRequest.create(productId, requesterId,
                requesterName, requestType, reason, targetRole, expiresAt);
        ProductEditRequest saved = requestRepository.save(request);

        broker.publish(productId, EVENT_REQUEST_CREATED, buildPayload(saved));

        log.info("[PR-H4b] product {} 수정 요청 생성 — type={} requester={} targetRole={}",
                productId, requestType, requesterName, targetRole);
        return saved;
    }

    @Transactional
    public ProductEditRequest approve(UUID requestId, UUID approverId, String approverName,
                                      String noteOptional) {
        ProductEditRequest request = loadForDecisionOrThrow(requestId);
        request.approve(approverId, approverName, noteOptional);

        broker.publish(request.getProductId(), EVENT_REQUEST_DECIDED, buildPayload(request));

        log.info("[PR-H4b] 요청 {} 수락 — approver={} product={}",
                requestId, approverName, request.getProductId());
        return request;
    }

    @Transactional
    public ProductEditRequest reject(UUID requestId, UUID approverId, String approverName,
                                     String decisionReason) {
        ProductEditRequest request = loadForDecisionOrThrow(requestId);
        request.reject(approverId, approverName, decisionReason);

        broker.publish(request.getProductId(), EVENT_REQUEST_DECIDED, buildPayload(request));

        log.info("[PR-H4b] 요청 {} 거절 — approver={} reason={}",
                requestId, approverName, decisionReason);
        return request;
    }

    @Transactional(readOnly = true)
    public List<ProductEditRequest> listPendingForRole(EditTargetRole targetRole) {
        Objects.requireNonNull(targetRole, "targetRole 은 필수입니다");
        return requestRepository.findByTargetRoleAndStatusOrderByRequestedAtDesc(
                targetRole, EditRequestStatus.PENDING);
    }

    @Transactional(readOnly = true)
    public List<ProductEditRequest> listByProduct(UUID productId, EditRequestStatus statusFilter) {
        Objects.requireNonNull(productId, "productId 는 필수입니다");
        if (statusFilter == null) {
            return requestRepository.findByEntityIdOrderByRequestedAtDesc(productId);
        }
        return requestRepository.findByEntityIdAndStatusOrderByRequestedAtDesc(productId,
                statusFilter);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UUID> findActiveApproval(UUID productId) {
        return requestRepository.findFirstByEntityIdAndStatus(productId,
                EditRequestStatus.APPROVED).map(ProductEditRequest::getId);
    }

    @Override
    @Transactional
    public void consumeApproval(UUID requestId, String consumerUserId) {
        ProductEditRequest request = loadForDecisionOrThrow(requestId);
        request.consumeApproval(consumerUserId == null ? "system" : consumerUserId);
        log.info("[PR-H4b] 요청 {} APPROVED 소진 — consumer={}", requestId, consumerUserId);
    }

    @Scheduled(fixedRate = 3_600_000L) // 1h
    @Transactional
    public void expirePending() {
        LocalDateTime now = LocalDateTime.now();
        List<ProductEditRequest> expired = requestRepository.findExpired(now);
        if (expired.isEmpty()) {
            return;
        }
        for (ProductEditRequest req : expired) {
            try {
                req.expire();
                broker.publish(req.getProductId(), EVENT_REQUEST_DECIDED, buildPayload(req));
            } catch (BusinessException ex) {
                log.debug("[PR-H4b] 요청 {} 만료 skip (이미 종결): {}", req.getId(), ex.getMessage());
            }
        }
        log.info("[PR-H4b] 자동 만료 처리 — {} 건 EXPIRED 전환", expired.size());
    }

    // ---------- 내부 helper ----------

    private ProductEditRequest loadForDecisionOrThrow(UUID requestId) {
        Objects.requireNonNull(requestId, "requestId 는 필수입니다");
        return requestRepository.findByIdForDecision(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "수정 요청을 찾을 수 없습니다: " + requestId));
    }

    private void guardRequestableStatus(Product product) {
        ProductStatus s = product.getStatus();
        if (LOCK_POLICY.isFree(s)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "현 단계 (" + s + ") 는 admin 이 직접 수정/삭제 가능합니다 — 별도 요청 불필요");
        }
        if (LOCK_POLICY.isFullyLocked(s)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "현 단계 (" + s + ") 는 완전 잠금 — 수정/삭제 요청 자체 불가");
        }
        // DISCONTINUED (LOCKED_REQUIRES_APPROVAL) 만 정상 진행
    }

    private Map<String, Object> buildPayload(ProductEditRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("requestId", request.getId() == null ? null : request.getId().toString());
        payload.put("productId", request.getProductId().toString());
        payload.put("requestType", request.getRequestType().name());
        payload.put("status", request.getStatus().name());
        payload.put("reason", request.getReason());
        payload.put("requesterId", request.getRequesterId().toString());
        payload.put("requesterName", request.getRequesterName());
        payload.put("targetRole", request.getTargetRole().name());
        payload.put("decidedById", request.getDecidedById() == null ? null
                : request.getDecidedById().toString());
        payload.put("decidedByName", request.getDecidedByName());
        payload.put("decisionReason", request.getDecisionReason());
        payload.put("requestedAt", request.getRequestedAt().toString());
        payload.put("decidedAt", request.getDecidedAt() == null ? null
                : request.getDecidedAt().toString());
        payload.put("expiresAt", request.getExpiresAt() == null ? null
                : request.getExpiresAt().toString());
        return payload;
    }
}
