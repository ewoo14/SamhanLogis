package com.samhanair.logis.partner.editrequest.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.editrequest.domain.PartnerEditRequest;
import com.samhanair.logis.partner.editrequest.repository.PartnerEditRequestRepository;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestService;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 도메인 수정/삭제 요청 워크플로우 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared:realtime-abstraction 의 {@link EditRequestService} interface 구현. partner-service 의
 * 잠금 entity (BlockedPartner) mutation 잠금 해제 채널.
 *
 * <p><b>SSE event 형식</b>:
 * <ul>
 *   <li>{@code "partner:edit-request:created"}</li>
 *   <li>{@code "partner:edit-request:decided"}</li>
 * </ul>
 *
 * <p><b>잠금 정책 — partner 도메인은 MANAGER 권한자 우선</b>.
 *
 * <p><b>UUID 비공개</b>: SSE payload 의 actorId 는 FE 색상 hash 결정성용. 사용자 화면 표시는
 * actorName 만 사용.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerEditRequestService implements EditRequestService {

    public static final String EVENT_REQUEST_CREATED = "partner" + EVENT_SUFFIX_CREATED;
    public static final String EVENT_REQUEST_DECIDED = "partner" + EVENT_SUFFIX_DECIDED;

    public static final int DEFAULT_EXPIRES_HOURS = 24;

    private final PartnerEditRequestRepository requestRepository;
    private final RealtimeBroker broker;

    @Transactional
    public PartnerEditRequest request(UUID entityId, EditRequestType requestType, String reason,
                                      UUID requesterId, String requesterName) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        Objects.requireNonNull(requestType, "requestType 은 필수입니다");

        EditTargetRole targetRole = EditTargetRole.MANAGER;
        LocalDateTime expiresAt = LocalDateTime.now().plusHours(DEFAULT_EXPIRES_HOURS);

        PartnerEditRequest request = PartnerEditRequest.create(
                entityId, requesterId, requesterName, requestType, reason, targetRole, expiresAt);
        PartnerEditRequest saved = requestRepository.save(request);

        broker.publish(entityId, EVENT_REQUEST_CREATED, buildPayload(saved));

        log.info("[PR-H4b] partner 수정 요청 생성 — entityId={} type={} requester={} targetRole={}",
                entityId, requestType, requesterName, targetRole);
        return saved;
    }

    @Transactional
    public PartnerEditRequest approve(UUID requestId, UUID approverId, String approverName,
                                      String noteOptional) {
        PartnerEditRequest request = loadForDecisionOrThrow(requestId);
        request.approve(approverId, approverName, noteOptional);
        broker.publish(request.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        log.info("[PR-H4b] partner 요청 {} 수락 — approver={} entityId={}",
                requestId, approverName, request.getEntityId());
        return request;
    }

    @Transactional
    public PartnerEditRequest reject(UUID requestId, UUID approverId, String approverName,
                                     String decisionReason) {
        PartnerEditRequest request = loadForDecisionOrThrow(requestId);
        request.reject(approverId, approverName, decisionReason);
        broker.publish(request.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        log.info("[PR-H4b] partner 요청 {} 거절 — approver={} reason={}",
                requestId, approverName, decisionReason);
        return request;
    }

    @Transactional(readOnly = true)
    public List<PartnerEditRequest> listPendingForRole(EditTargetRole targetRole) {
        Objects.requireNonNull(targetRole, "targetRole 은 필수입니다");
        return requestRepository.findByTargetRoleAndStatusOrderByRequestedAtDesc(
                targetRole, EditRequestStatus.PENDING);
    }

    @Transactional(readOnly = true)
    public List<PartnerEditRequest> listByEntity(UUID entityId) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        return requestRepository.findByEntityIdOrderByRequestedAtDesc(entityId);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UUID> findActiveApproval(UUID entityId) {
        return requestRepository.findFirstByEntityIdAndStatus(entityId, EditRequestStatus.APPROVED)
                .map(PartnerEditRequest::getId);
    }

    @Override
    @Transactional
    public void consumeApproval(UUID requestId, String consumerUserId) {
        PartnerEditRequest request = loadForDecisionOrThrow(requestId);
        request.consumeApproval(consumerUserId == null ? "system" : consumerUserId);
        log.info("[PR-H4b] partner 요청 {} APPROVED 소진 — consumer={}", requestId, consumerUserId);
    }

    private PartnerEditRequest loadForDecisionOrThrow(UUID requestId) {
        Objects.requireNonNull(requestId, "requestId 는 필수입니다");
        return requestRepository.findByIdForDecision(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처 수정 요청을 찾을 수 없습니다: " + requestId));
    }

    private Map<String, Object> buildPayload(PartnerEditRequest request) {
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
