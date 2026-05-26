package com.samhanair.logis.inventory.realtime.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.domain.InventoryAudit;
import com.samhanair.logis.inventory.realtime.domain.InventoryEditRequest;
import com.samhanair.logis.inventory.realtime.repository.InventoryEditRequestRepository;
import com.samhanair.logis.inventory.repository.InventoryAuditRepository;
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
 * inventory 도메인 수정/삭제 요청 워크플로우 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>InventoryAudit COMPLETED 단계에서 본 service 통한 요청 → MANAGER 수락 1회 소진 후 mutation 가능.
 * shared {@link com.samhanair.logis.shared.realtime.editrequest.EditRequestRecord} +
 * {@link EditLockGuard} 활용.
 *
 * <p><b>SSE event 형식</b>:
 * <ul>
 *   <li>{@code "inventory:edit-request:created"} — 요청 생성 시 broadcast (관리자 대시보드)</li>
 *   <li>{@code "inventory:edit-request:decided"} — 수락/거절/만료 시 broadcast (요청자 화면)</li>
 * </ul>
 *
 * <p>외부 알림 client 미사용 — inventory 도메인 audit 정정은 회계 감사 직원 대시보드 polling/SSE 만.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryEditRequestService {

    /** SSE event name — 요청 생성 시 broadcast. */
    public static final String EVENT_REQUEST_CREATED = "inventory:edit-request:created";

    /** SSE event name — 수락/거절/만료 시 broadcast. */
    public static final String EVENT_REQUEST_DECIDED = "inventory:edit-request:decided";

    /** 자동 만료 default — 24h. */
    public static final long DEFAULT_EXPIRES_HOURS = 24L;

    private final InventoryEditRequestRepository requestRepository;
    private final InventoryAuditRepository auditRepository;
    private final RealtimeBroker broker;
    private final EditLockGuard editLockGuard;

    /**
     * 신규 수정/삭제 요청 생성 + SSE broadcast.
     *
     * <p>InventoryAudit status 가드: 잠금 정책 ({@link InventoryLockPolicies#AUDIT_POLICY}) 의
     * {@code lockedRequiresApproval} 단계만 정상 — 그 외는 INVALID_INPUT/CONFLICT.
     *
     * @param auditId 대상 InventoryAudit
     * @param requestType EDIT / DELETE
     * @param reason 요청 사유 (선택, ≤500자)
     * @param requesterId 요청자 UUID
     * @param requesterName 요청자 표시명
     * @return 영속화된 InventoryEditRequest (status=PENDING)
     */
    @Transactional
    public InventoryEditRequest request(UUID auditId, EditRequestType requestType, String reason,
                                        UUID requesterId, String requesterName) {
        Objects.requireNonNull(auditId, "auditId 는 필수입니다");
        Objects.requireNonNull(requestType, "requestType 은 필수입니다");
        InventoryAudit audit = auditRepository.findById(auditId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "재고 실사를 찾을 수 없습니다: " + auditId));

        AuditStatus s = audit.getStatus();
        if (s == AuditStatus.PLANNED || s == AuditStatus.IN_PROGRESS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "현 단계 (" + s + ") 는 작성자가 직접 수정/삭제 가능합니다 — 별도 요청 불필요");
        }
        if (s == AuditStatus.CANCELLED) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "현 단계 (" + s + ") 는 종결됨 — 수정/삭제 요청 의미 없음");
        }

        LocalDateTime expiresAt = LocalDateTime.now().plusHours(DEFAULT_EXPIRES_HOURS);
        InventoryEditRequest request = InventoryEditRequest.create(auditId, requesterId,
                requesterName, requestType, reason, EditTargetRole.MANAGER, expiresAt);
        InventoryEditRequest saved = requestRepository.save(request);

        broker.publish(auditId, EVENT_REQUEST_CREATED, buildPayload(saved));
        log.info("[PR-H4b] inventory audit {} 수정 요청 — type={} requester={}",
                auditId, requestType, requesterName);
        return saved;
    }

    /** 수락 (PENDING → APPROVED) + SSE broadcast. */
    @Transactional
    public InventoryEditRequest approve(UUID requestId, UUID approverId, String approverName,
                                        String noteOptional) {
        InventoryEditRequest request = loadForDecisionOrThrow(requestId);
        request.approve(approverId, approverName, noteOptional);
        broker.publish(request.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        log.info("[PR-H4b] 요청 {} 수락 — approver={} entity={}",
                requestId, approverName, request.getEntityId());
        return request;
    }

    /** 거절 (PENDING → REJECTED) + SSE broadcast. */
    @Transactional
    public InventoryEditRequest reject(UUID requestId, UUID approverId, String approverName,
                                       String decisionReason) {
        InventoryEditRequest request = loadForDecisionOrThrow(requestId);
        request.reject(approverId, approverName, decisionReason);
        broker.publish(request.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        log.info("[PR-H4b] 요청 {} 거절 — approver={} reason={}",
                requestId, approverName, decisionReason);
        return request;
    }

    /** 권한자 그룹 PENDING 대시보드. */
    @Transactional(readOnly = true)
    public List<InventoryEditRequest> listPendingForRole(EditTargetRole targetRole) {
        Objects.requireNonNull(targetRole, "targetRole 은 필수입니다");
        return requestRepository.findByTargetRoleAndStatusOrderByRequestedAtDesc(
                targetRole, EditRequestStatus.PENDING);
    }

    /** entity 별 요청 이력 (최신순). */
    @Transactional(readOnly = true)
    public List<InventoryEditRequest> listByEntity(UUID entityId) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        return requestRepository.findByEntityIdOrderByRequestedAtDesc(entityId);
    }

    /**
     * mutation 가드 — APPROVED 활성 요청 lookup. service 레이어가 status 잠금 체크 시 호출.
     */
    @Transactional(readOnly = true)
    public Optional<InventoryEditRequest> findActiveApproval(UUID entityId) {
        return requestRepository.findFirstByEntityIdAndStatus(entityId, EditRequestStatus.APPROVED);
    }

    /** APPROVED 1회 소진 — mutation 직후 호출. soft-delete 라 다음 lookup 부터 0건. */
    @Transactional
    public void consumeApproval(UUID requestId, String consumerUserId) {
        InventoryEditRequest request = loadForDecisionOrThrow(requestId);
        request.consumeApproval(consumerUserId == null ? "system" : consumerUserId);
        log.info("[PR-H4b] 요청 {} APPROVED 소진 — consumer={}", requestId, consumerUserId);
    }

    /**
     * 잠금 정책 가드 + 활성 APPROVED lookup 조합 — service 레이어가 mutation 직전 호출.
     *
     * @param audit 대상 InventoryAudit
     * @throws com.samhanair.logis.shared.realtime.lock.LockedException 잠금 정책 위반
     */
    @Transactional(readOnly = true)
    public void guardCanEdit(InventoryAudit audit) {
        boolean hasApproval = findActiveApproval(audit.getId()).isPresent();
        editLockGuard.guardCanEdit(audit.getStatus(), InventoryLockPolicies.AUDIT_POLICY, hasApproval);
    }

    /** 자동 만료 — 1시간 주기. */
    @Scheduled(fixedRate = 3_600_000L)
    @Transactional
    public void expirePending() {
        LocalDateTime now = LocalDateTime.now();
        List<InventoryEditRequest> expired = requestRepository.findExpired(now);
        if (expired.isEmpty()) {
            return;
        }
        for (InventoryEditRequest req : expired) {
            try {
                req.expire();
                broker.publish(req.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(req));
            } catch (BusinessException ex) {
                log.debug("[PR-H4b] 요청 {} 만료 skip (이미 종결): {}", req.getId(), ex.getMessage());
            }
        }
        log.info("[PR-H4b] 자동 만료 처리 — {} 건 EXPIRED 전환", expired.size());
    }

    private InventoryEditRequest loadForDecisionOrThrow(UUID requestId) {
        Objects.requireNonNull(requestId, "requestId 는 필수입니다");
        return requestRepository.findByIdForDecision(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "수정 요청을 찾을 수 없습니다: " + requestId));
    }

    private Map<String, Object> buildPayload(InventoryEditRequest request) {
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
