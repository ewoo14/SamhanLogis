package com.samhanair.logis.partnerorder.editrequest.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.editrequest.config.PartnerOrderEditRequestProperties;
import com.samhanair.logis.partnerorder.editrequest.domain.PartnerOrderEditRequest;
import com.samhanair.logis.partnerorder.editrequest.repository.PartnerOrderEditRequestRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderRealtimeBroker;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.service.PartnerSelfScopeGuard;
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
 * 거래처 주문 수정/삭제 요청 워크플로우 — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>{@link EditRequestService} interface ({@code shared:realtime-abstraction}) 구현.
 *
 * <p>사용자 명시 잠금 정책 (개발책임자 결정 — 거래처 주문 도메인):
 * <ul>
 *   <li>DRAFT/CONFIRMING — 작성자 자유 mutation (본 service 사용 X — 직접 mutation).</li>
 *   <li>CONFIRMED (slip 발행 후) — 작성자 직접 차단 → 본 service channel 요청 → MANAGER 수락 시 1회 가능.</li>
 *   <li>CANCELED — 종결됨, 요청 의미 없음.</li>
 * </ul>
 *
 * <p><b>SSE event 형식</b>:
 * <ul>
 *   <li>{@code "partner-order:edit-request:created"} — 요청 생성 시 broadcast</li>
 *   <li>{@code "partner-order:edit-request:decided"} — 수락/거절/만료 시 broadcast</li>
 * </ul>
 *
 * <p><b>UUID 비공개</b>: SSE payload 의 actorId 는 FE 색상 hash 결정성 용도. 사용자 화면 표시는
 * actorName 만 사용.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerOrderEditRequestService implements EditRequestService {

    /** SSE event name — 요청 생성 시 broadcast. */
    public static final String EVENT_REQUEST_CREATED = "partner-order" + EVENT_SUFFIX_CREATED;

    /** SSE event name — 수락/거절/만료 시 broadcast. */
    public static final String EVENT_REQUEST_DECIDED = "partner-order" + EVENT_SUFFIX_DECIDED;

    /**
     * 잠금 정책 — 거래처 주문 도메인.
     *
     * <ul>
     *   <li>free = DRAFT, CONFIRMING — 작성자 직접 mutation 허용 (본 service 미사용)</li>
     *   <li>lockedRequiresApproval = CONFIRMED — APPROVED 1회 소진 후 mutation 가능</li>
     *   <li>terminal = CANCELED — mutation 의미 없음</li>
     * </ul>
     */
    public static final EditLockPolicy<PartnerOrderStatus> LOCK_POLICY =
            EditLockPolicy.<PartnerOrderStatus>builder()
                    .freeStatuses(PartnerOrderStatus.DRAFT, PartnerOrderStatus.CONFIRMING)
                    .lockedRequiresApproval(PartnerOrderStatus.CONFIRMED)
                    .terminalStatuses(PartnerOrderStatus.CANCELED)
                    .build();

    private final PartnerOrderEditRequestRepository requestRepository;
    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerOrderRealtimeBroker broker;
    private final PartnerOrderEditRequestProperties properties;
    private final PartnerSelfScopeGuard partnerSelfScopeGuard;

    /**
     * 신규 수정/삭제 요청 생성 + SSE broadcast.
     *
     * <p>status 가드:
     * <ul>
     *   <li>DRAFT/CONFIRMING — 작성자 직접 mutation 가능, INVALID_INPUT.</li>
     *   <li>CONFIRMED — 정상 요청 생성 (target_role=MANAGER).</li>
     *   <li>CANCELED — 종결됨, INVALID_INPUT.</li>
     * </ul>
     *
     * @param partnerOrderId 대상 주문
     * @param requestType EDIT / DELETE
     * @param reason 요청 사유 (선택, ≤500자)
     * @param requesterId 요청자 UUID
     * @param requesterName 요청자 표시명 (UUID 비공개 가드)
     * @return 영속화된 PartnerOrderEditRequest (status=PENDING)
     * @throws BusinessException(NOT_FOUND) 주문 미존재
     * @throws BusinessException(INVALID_INPUT) DRAFT/CONFIRMING/CANCELED 단계
     */
    @Transactional
    public PartnerOrderEditRequest request(UUID partnerOrderId, EditRequestType requestType,
                                           String reason, UUID requesterId, String requesterName) {
        return request(partnerOrderId, requestType, reason, requesterId, requesterName, null);
    }

    /**
     * 신규 수정/삭제 요청 생성 + SSE broadcast. PARTNER 호출이면 대상 주문의 partnerCode 와
     * {@code X-Partner-Code} 를 대조한다.
     *
     * @param partnerOrderId 대상 주문
     * @param requestType EDIT / DELETE
     * @param reason 요청 사유
     * @param requesterId 요청자 UUID
     * @param requesterName 요청자 표시명
     * @param callerPartnerCode {@code X-Partner-Code}
     * @return 영속화된 PartnerOrderEditRequest
     */
    @Transactional
    public PartnerOrderEditRequest request(UUID partnerOrderId, EditRequestType requestType,
                                           String reason, UUID requesterId, String requesterName,
                                           String callerPartnerCode) {
        Objects.requireNonNull(partnerOrderId, "partnerOrderId 는 필수입니다");
        Objects.requireNonNull(requestType, "requestType 은 필수입니다");
        PartnerOrder order = partnerOrderRepository.findById(partnerOrderId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처 주문을 찾을 수 없습니다: " + partnerOrderId));
        partnerSelfScopeGuard.assertOwnPartner(
                order.getPartnerCode(), callerPartnerCode, "본인 거래처 주문만 수정 요청할 수 있습니다.");

        guardRequestableStatus(order);

        // CONFIRMED 단계는 MANAGER 그룹이 수락 주체 (거래처 주문 admin 결정 권한).
        EditTargetRole targetRole = EditTargetRole.MANAGER;

        LocalDateTime expiresAt = LocalDateTime.now().plusHours(properties.getExpiresHours());
        PartnerOrderEditRequest request = PartnerOrderEditRequest.create(partnerOrderId, requesterId,
                requesterName, requestType, reason, targetRole, expiresAt);
        PartnerOrderEditRequest saved = requestRepository.save(request);

        broker.publish(partnerOrderId, EVENT_REQUEST_CREATED, buildPayload(saved));

        log.info("[PR-H4b] partner-order {} 수정 요청 생성 — type={} requester={} targetRole={}",
                partnerOrderId, requestType, requesterName, targetRole);
        return saved;
    }

    /**
     * 요청 수락 (PENDING → APPROVED) + SSE broadcast.
     */
    @Transactional
    public PartnerOrderEditRequest approve(UUID requestId, UUID approverId, String approverName,
                                           String noteOptional) {
        PartnerOrderEditRequest request = loadForDecisionOrThrow(requestId);
        request.approve(approverId, approverName, noteOptional);

        broker.publish(request.getPartnerOrderId(), EVENT_REQUEST_DECIDED, buildPayload(request));

        log.info("[PR-H4b] 요청 {} 수락 — approver={} partnerOrder={}",
                requestId, approverName, request.getPartnerOrderId());
        return request;
    }

    /**
     * 요청 거절 (PENDING → REJECTED) + SSE broadcast.
     */
    @Transactional
    public PartnerOrderEditRequest reject(UUID requestId, UUID approverId, String approverName,
                                          String decisionReason) {
        PartnerOrderEditRequest request = loadForDecisionOrThrow(requestId);
        request.reject(approverId, approverName, decisionReason);

        broker.publish(request.getPartnerOrderId(), EVENT_REQUEST_DECIDED, buildPayload(request));

        log.info("[PR-H4b] 요청 {} 거절 — approver={} reason={}",
                requestId, approverName, decisionReason);
        return request;
    }

    /**
     * 권한자 그룹 PENDING 요청 목록 — 대시보드용.
     */
    @Transactional(readOnly = true)
    public List<PartnerOrderEditRequest> listPendingForRole(EditTargetRole targetRole) {
        Objects.requireNonNull(targetRole, "targetRole 은 필수입니다");
        return requestRepository.findByTargetRoleAndStatusOrderByRequestedAtDesc(
                targetRole, EditRequestStatus.PENDING);
    }

    /**
     * 주문별 요청 이력 — 주문 화면 표시용. status null 이면 전체.
     */
    @Transactional(readOnly = true)
    public List<PartnerOrderEditRequest> listByOrder(UUID partnerOrderId,
                                                     EditRequestStatus statusFilter) {
        return listByOrder(partnerOrderId, statusFilter, null);
    }

    /**
     * 주문별 요청 이력 — PARTNER 호출이면 대상 주문의 partnerCode 와 {@code X-Partner-Code} 를 대조한다.
     *
     * @param partnerOrderId 대상 주문
     * @param statusFilter 상태 필터
     * @param callerPartnerCode {@code X-Partner-Code}
     * @return 요청 이력
     */
    @Transactional(readOnly = true)
    public List<PartnerOrderEditRequest> listByOrder(UUID partnerOrderId,
                                                     EditRequestStatus statusFilter,
                                                     String callerPartnerCode) {
        Objects.requireNonNull(partnerOrderId, "partnerOrderId 는 필수입니다");
        if (partnerSelfScopeGuard.isPartnerAuthority()) {
            PartnerOrder order = partnerOrderRepository.findById(partnerOrderId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "거래처 주문을 찾을 수 없습니다: " + partnerOrderId));
            partnerSelfScopeGuard.assertOwnPartner(
                    order.getPartnerCode(), callerPartnerCode, "본인 거래처 주문 요청 이력만 조회할 수 있습니다.");
        }
        if (statusFilter == null) {
            return requestRepository.findByEntityIdOrderByRequestedAtDesc(partnerOrderId);
        }
        return requestRepository.findByEntityIdAndStatusOrderByRequestedAtDesc(partnerOrderId,
                statusFilter);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UUID> findActiveApproval(UUID partnerOrderId) {
        return requestRepository.findFirstByEntityIdAndStatus(partnerOrderId,
                EditRequestStatus.APPROVED).map(PartnerOrderEditRequest::getId);
    }

    @Override
    @Transactional
    public void consumeApproval(UUID requestId, String consumerUserId) {
        PartnerOrderEditRequest request = loadForDecisionOrThrow(requestId);
        request.consumeApproval(consumerUserId == null ? "system" : consumerUserId);
        log.info("[PR-H4b] 요청 {} APPROVED 소진 — consumer={}", requestId, consumerUserId);
    }

    /**
     * 스케줄러 자동 만료 — PENDING + expires_at &lt; now 인 row 일괄 EXPIRED.
     * 1시간 주기 (운영). expires_at default 24h.
     */
    @Scheduled(fixedRate = 3_600_000L) // 1h
    @Transactional
    public void expirePending() {
        LocalDateTime now = LocalDateTime.now();
        List<PartnerOrderEditRequest> expired = requestRepository.findExpired(now);
        if (expired.isEmpty()) {
            return;
        }
        for (PartnerOrderEditRequest req : expired) {
            try {
                req.expire();
                broker.publish(req.getPartnerOrderId(), EVENT_REQUEST_DECIDED, buildPayload(req));
            } catch (BusinessException ex) {
                log.debug("[PR-H4b] 요청 {} 만료 skip (이미 종결): {}", req.getId(), ex.getMessage());
            }
        }
        log.info("[PR-H4b] 자동 만료 처리 — {} 건 EXPIRED 전환", expired.size());
    }

    // ---------- 내부 helper ----------

    private PartnerOrderEditRequest loadForDecisionOrThrow(UUID requestId) {
        Objects.requireNonNull(requestId, "requestId 는 필수입니다");
        return requestRepository.findByIdForDecision(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "수정 요청을 찾을 수 없습니다: " + requestId));
    }

    private void guardRequestableStatus(PartnerOrder order) {
        PartnerOrderStatus s = order.getStatus();
        if (LOCK_POLICY.isFree(s)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "현 단계 (" + s.getDisplayName() + ") 는 작성자가 직접 수정/삭제 가능합니다 — 별도 요청 불필요");
        }
        if (LOCK_POLICY.isTerminal(s)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "현 단계 (" + s.getDisplayName() + ") 는 종결됨 — 수정/삭제 요청 의미 없음");
        }
        if (LOCK_POLICY.isFullyLocked(s)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "현 단계 (" + s.getDisplayName() + ") 는 완전 잠금 — 수정/삭제 요청 자체 불가");
        }
        // CONFIRMED (LOCKED_REQUIRES_APPROVAL) 만 정상 진행
    }

    private Map<String, Object> buildPayload(PartnerOrderEditRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("requestId", request.getId() == null ? null : request.getId().toString());
        payload.put("partnerOrderId", request.getPartnerOrderId().toString());
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
