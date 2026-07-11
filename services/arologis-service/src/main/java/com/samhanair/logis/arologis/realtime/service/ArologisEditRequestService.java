package com.samhanair.logis.arologis.realtime.service;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.realtime.domain.ArologisEditRequest;
import com.samhanair.logis.arologis.realtime.repository.ArologisEditRequestRepository;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
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
 * arologis 도메인 수정/삭제 요청 워크플로우 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>Dispatch DISPATCHED/DELIVERED derived status 단계에서 본 service 통한 요청 → MANAGER 수락 1회
 * 소진 후 mutation 가능.
 *
 * <p><b>SSE event 형식</b>:
 * <ul>
 *   <li>{@code "arologis:edit-request:created"} — 요청 생성</li>
 *   <li>{@code "arologis:edit-request:decided"} — 수락/거절/만료</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ArologisEditRequestService {

    public static final String EVENT_REQUEST_CREATED = "arologis:edit-request:created";
    public static final String EVENT_REQUEST_DECIDED = "arologis:edit-request:decided";
    public static final long DEFAULT_EXPIRES_HOURS = 24L;

    private final ArologisEditRequestRepository requestRepository;
    private final DispatchRepository dispatchRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleStopRepository stopRepository;
    private final RealtimeBroker broker;
    private final EditLockGuard editLockGuard;

    /**
     * 신규 수정/삭제 요청 생성 + SSE broadcast.
     *
     * <p>Dispatch derived status 가드: 잠금 정책 ({@link ArologisLockPolicies#DISPATCH_POLICY}) 의
     * {@code lockedRequiresApproval} 단계만 정상.
     */
    @Transactional
    public ArologisEditRequest request(UUID dispatchId, EditRequestType requestType, String reason,
                                       UUID requesterId, String requesterName) {
        Objects.requireNonNull(dispatchId, "dispatchId 는 필수입니다");
        Objects.requireNonNull(requestType, "requestType 은 필수입니다");
        Dispatch dispatch = dispatchRepository.findById(dispatchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "배차를 찾을 수 없습니다: " + dispatchId));

        DispatchDerivedStatus derived = derivedStatus(dispatch.getId());
        if (derived == DispatchDerivedStatus.PLANNED) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "현 단계 (" + derived.getDisplayName()
                            + ") 는 작성자가 직접 수정/삭제 가능합니다 — 별도 요청 불필요");
        }

        LocalDateTime expiresAt = LocalDateTime.now().plusHours(DEFAULT_EXPIRES_HOURS);
        ArologisEditRequest request = ArologisEditRequest.create(dispatchId, requesterId,
                requesterName, requestType, reason, EditTargetRole.MANAGER, expiresAt);
        ArologisEditRequest saved = requestRepository.save(request);

        broker.publish(dispatchId, EVENT_REQUEST_CREATED, buildPayload(saved));
        log.info("[PR-H4b] arologis dispatch {} 수정 요청 — type={} requester={} derived={}",
                dispatchId, requestType, requesterName, derived);
        return saved;
    }

    @Transactional
    public ArologisEditRequest approve(UUID requestId, UUID approverId, String approverName,
                                       String noteOptional) {
        ArologisEditRequest request = loadForDecisionOrThrow(requestId);
        request.approve(approverId, approverName, noteOptional);
        broker.publish(request.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        log.info("[PR-H4b] 요청 {} 수락 — approver={} entity={}",
                requestId, approverName, request.getEntityId());
        return request;
    }

    @Transactional
    public ArologisEditRequest reject(UUID requestId, UUID approverId, String approverName,
                                      String decisionReason) {
        ArologisEditRequest request = loadForDecisionOrThrow(requestId);
        request.reject(approverId, approverName, decisionReason);
        broker.publish(request.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        log.info("[PR-H4b] 요청 {} 거절 — approver={} reason={}",
                requestId, approverName, decisionReason);
        return request;
    }

    @Transactional(readOnly = true)
    public List<ArologisEditRequest> listPendingForRole(EditTargetRole targetRole) {
        Objects.requireNonNull(targetRole, "targetRole 은 필수입니다");
        return requestRepository.findByTargetRoleAndStatusOrderByRequestedAtDesc(
                targetRole, EditRequestStatus.PENDING);
    }

    @Transactional(readOnly = true)
    public List<ArologisEditRequest> listByEntity(UUID entityId) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        return requestRepository.findByEntityIdOrderByRequestedAtDesc(entityId);
    }

    @Transactional(readOnly = true)
    public Optional<ArologisEditRequest> findActiveApproval(UUID entityId) {
        return requestRepository.findFirstByEntityIdAndStatus(entityId, EditRequestStatus.APPROVED);
    }

    @Transactional
    public void consumeApproval(UUID requestId, String consumerUserId) {
        ArologisEditRequest request = loadForDecisionOrThrow(requestId);
        request.consumeApproval(consumerUserId == null ? "system" : consumerUserId);
        log.info("[PR-H4b] 요청 {} APPROVED 소진 — consumer={}", requestId, consumerUserId);
    }

    /**
     * Dispatch 잠금 정책 가드 — service 레이어가 mutation 직전 호출.
     *
     * @param dispatch 대상 Dispatch
     * @throws com.samhanair.logis.shared.realtime.lock.LockedException 잠금 정책 위반
     */
    @Transactional(readOnly = true)
    public void guardCanEdit(Dispatch dispatch) {
        DispatchDerivedStatus derived = derivedStatus(dispatch.getId());
        boolean hasApproval = findActiveApproval(dispatch.getId()).isPresent();
        editLockGuard.guardCanEdit(derived, ArologisLockPolicies.DISPATCH_POLICY, hasApproval);
    }

    /**
     * Dispatch 의 derived status 산출 — vehicles 의 stops 합 기반.
     */
    @Transactional(readOnly = true)
    public DispatchDerivedStatus derivedStatus(UUID dispatchId) {
        return DispatchDerivedStatus.from(
                vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId).stream()
                        .flatMap(v -> stopRepository.findAllByVehicleIdOrderBySequenceAsc(v.getId())
                                .stream())
                        .toList());
    }

    @Scheduled(fixedRate = 3_600_000L)
    @Transactional
    public void expirePending() {
        LocalDateTime now = LocalDateTime.now();
        List<ArologisEditRequest> expired = requestRepository.findExpired(now);
        if (expired.isEmpty()) {
            return;
        }
        for (ArologisEditRequest req : expired) {
            try {
                req.expire();
                broker.publish(req.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(req));
            } catch (BusinessException ex) {
                log.debug("[PR-H4b] 요청 {} 만료 skip (이미 종결): {}", req.getId(), ex.getMessage());
            }
        }
        log.info("[PR-H4b] 자동 만료 처리 — {} 건 EXPIRED 전환", expired.size());
    }

    private ArologisEditRequest loadForDecisionOrThrow(UUID requestId) {
        Objects.requireNonNull(requestId, "requestId 는 필수입니다");
        return requestRepository.findByIdForDecision(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "수정 요청을 찾을 수 없습니다: " + requestId));
    }

    private Map<String, Object> buildPayload(ArologisEditRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("requestId", request.getId() == null ? null : request.getId().toString());
        payload.put("entityId", request.getEntityId().toString());
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
