package com.samhanair.logis.accounting.editrequest.service;

import com.samhanair.logis.accounting.editrequest.domain.AccountingEditRequest;
import com.samhanair.logis.accounting.editrequest.repository.AccountingEditRequestRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationPublisherDispatchExecutor;
import com.samhanair.logis.notification.publisher.NotificationPublisherSupport;
import com.samhanair.logis.notification.publisher.NotificationSeverity;
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
 * 회계 도메인 수정/삭제 요청 워크플로우 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared:realtime-abstraction 의 {@link EditRequestService} interface 구현. accounting-service
 * 의 잠금 entity (TaxInvoice ISSUED / Journal POSTED / AccountingPeriod CLOSED) mutation 잠금
 * 해제 채널.
 *
 * <p><b>SSE event 형식</b>:
 * <ul>
 *   <li>{@code "accounting:edit-request:created"} — 요청 생성 시 broadcast</li>
 *   <li>{@code "accounting:edit-request:decided"} — 수락/거절/만료 시 broadcast</li>
 * </ul>
 *
 * <p><b>잠금 정책 — accounting 도메인은 MANAGER 우선</b> (창고 직원 권한 X).
 *
 * <p><b>UUID 비공개</b>: SSE payload 의 actorId 는 FE 색상 hash 결정성 용도. 사용자 화면 표시는
 * actorName 만 사용.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountingEditRequestService implements EditRequestService {

    /** SSE event name — 요청 생성 시 broadcast. */
    public static final String EVENT_REQUEST_CREATED = "accounting" + EVENT_SUFFIX_CREATED;

    /** SSE event name — 수락/거절/만료 시 broadcast. */
    public static final String EVENT_REQUEST_DECIDED = "accounting" + EVENT_SUFFIX_DECIDED;

    /** 자동 만료 시간 (시간 단위, 회계 도메인 default 24h). */
    public static final int DEFAULT_EXPIRES_HOURS = 24;

    private final AccountingEditRequestRepository requestRepository;
    private final RealtimeBroker broker;
    private final NotificationPublisher notificationPublisher;
    private final NotificationPublisherDispatchExecutor notificationPublisherDispatchExecutor;

    /**
     * 신규 수정/삭제 요청 생성 + SSE broadcast.
     *
     * @param entityId 대상 entity (TaxInvoice / Journal / AccountingPeriod) UUID
     * @param requestType EDIT / DELETE
     * @param reason 요청 사유 (선택, ≤500자)
     * @param requesterId 요청자 UUID
     * @param requesterName 요청자 표시명 (UUID 비공개 가드)
     * @return 영속화된 AccountingEditRequest (status=PENDING)
     */
    @Transactional
    public AccountingEditRequest request(UUID entityId, EditRequestType requestType, String reason,
                                         UUID requesterId, String requesterName) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        Objects.requireNonNull(requestType, "requestType 은 필수입니다");

        // accounting 도메인 — MANAGER 권한자 그룹이 수락 주체.
        EditTargetRole targetRole = EditTargetRole.MANAGER;
        LocalDateTime expiresAt = LocalDateTime.now().plusHours(DEFAULT_EXPIRES_HOURS);

        AccountingEditRequest request = AccountingEditRequest.create(
                entityId, requesterId, requesterName, requestType, reason, targetRole, expiresAt);
        AccountingEditRequest saved = requestRepository.save(request);

        broker.publish(entityId, EVENT_REQUEST_CREATED, buildPayload(saved));
        NotificationPublisherSupport.publishAfterCommit(notificationPublisher, new NotificationPublishRequest(
                "APPROVAL",
                NotificationSeverity.INFO,
                String.format("회계 수정 요청 — %s", requesterName),
                String.format("%s 요청: %s", typeLabel(requestType), truncateTo80(reason)),
                List.of("MASTER", "MANAGER"),
                null,
                null,
                saved.getId().toString(),
                "/admin/accounting-edit-requests"
        ), notificationPublisherDispatchExecutor);

        log.info("[PR-H4b] accounting 수정 요청 생성 — entityId={} type={} requester={} targetRole={}",
                entityId, requestType, requesterName, targetRole);
        return saved;
    }

    /**
     * 요청 수락 (PENDING → APPROVED) + SSE broadcast.
     */
    @Transactional
    public AccountingEditRequest approve(UUID requestId, UUID approverId, String approverName,
                                         String noteOptional) {
        AccountingEditRequest request = loadForDecisionOrThrow(requestId);
        request.approve(approverId, approverName, noteOptional);
        broker.publish(request.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        NotificationPublisherSupport.publishAfterCommit(notificationPublisher, new NotificationPublishRequest(
                "APPROVAL",
                NotificationSeverity.INFO,
                String.format("회계 수정 요청 수락 — %s", approverName),
                String.format("%s 요청이 수락되었습니다.", typeLabel(request.getRequestType())),
                null,
                request.getRequesterId(),
                null,
                request.getId().toString(),
                "/admin/accounting-edit-requests"
        ), notificationPublisherDispatchExecutor);
        log.info("[PR-H4b] accounting 요청 {} 수락 — approver={} entityId={}",
                requestId, approverName, request.getEntityId());
        return request;
    }

    /**
     * 요청 거절 (PENDING → REJECTED) + SSE broadcast. 거절 사유 필수.
     */
    @Transactional
    public AccountingEditRequest reject(UUID requestId, UUID approverId, String approverName,
                                        String decisionReason) {
        AccountingEditRequest request = loadForDecisionOrThrow(requestId);
        request.reject(approverId, approverName, decisionReason);
        broker.publish(request.getEntityId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        NotificationPublisherSupport.publishAfterCommit(notificationPublisher, new NotificationPublishRequest(
                "APPROVAL",
                NotificationSeverity.WARNING,
                String.format("회계 수정 요청 거절 — %s", approverName),
                String.format("%s 요청이 거절되었습니다: %s",
                        typeLabel(request.getRequestType()), truncateTo80(decisionReason)),
                null,
                request.getRequesterId(),
                null,
                request.getId().toString(),
                "/admin/accounting-edit-requests"
        ), notificationPublisherDispatchExecutor);
        log.info("[PR-H4b] accounting 요청 {} 거절 — approver={} reason={}",
                requestId, approverName, decisionReason);
        return request;
    }

    /** 권한자 (MANAGER) 대시보드 — PENDING 요청 목록. */
    @Transactional(readOnly = true)
    public List<AccountingEditRequest> listPendingForRole(EditTargetRole targetRole) {
        Objects.requireNonNull(targetRole, "targetRole 은 필수입니다");
        return requestRepository.findByTargetRoleAndStatusOrderByRequestedAtDesc(
                targetRole, EditRequestStatus.PENDING);
    }

    /** entity 별 요청 이력 — 화면 표시용. */
    @Transactional(readOnly = true)
    public List<AccountingEditRequest> listByEntity(UUID entityId) {
        Objects.requireNonNull(entityId, "entityId 는 필수입니다");
        return requestRepository.findByEntityIdOrderByRequestedAtDesc(entityId);
    }

    /**
     * shared {@link EditRequestService#findActiveApproval} 구현 — entity mutation 가드용.
     * 0건 → mutation 차단, 1건 → mutation 진행 후 즉시 {@link #consumeApproval}.
     */
    @Override
    @Transactional(readOnly = true)
    public Optional<UUID> findActiveApproval(UUID entityId) {
        return requestRepository.findFirstByEntityIdAndStatus(entityId, EditRequestStatus.APPROVED)
                .map(AccountingEditRequest::getId);
    }

    /**
     * shared {@link EditRequestService#consumeApproval} 구현 — APPROVED 요청 1회 소진 (soft-delete).
     */
    @Override
    @Transactional
    public void consumeApproval(UUID requestId, String consumerUserId) {
        AccountingEditRequest request = loadForDecisionOrThrow(requestId);
        request.consumeApproval(consumerUserId == null ? "system" : consumerUserId);
        log.info("[PR-H4b] accounting 요청 {} APPROVED 소진 — consumer={}", requestId, consumerUserId);
    }

    /**
     * approve/reject/consumeApproval 전용 — PESSIMISTIC_WRITE 잠금 조회로 동시 결정/소진 race 차단.
     * 두 번째 트랜잭션은 첫 commit 후 최신 상태를 보고 {@code requirePending()} 가 CONFLICT 던짐.
     */
    private AccountingEditRequest loadForDecisionOrThrow(UUID requestId) {
        Objects.requireNonNull(requestId, "requestId 는 필수입니다");
        return requestRepository.findByIdForDecision(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "회계 수정 요청을 찾을 수 없습니다: " + requestId));
    }

    private static String typeLabel(EditRequestType type) {
        return switch (type) {
            case EDIT -> "수정";
            case DELETE -> "삭제";
        };
    }

    private static String truncateTo80(String value) {
        if (value == null) {
            return "";
        }
        return value.length() > 80 ? value.substring(0, 80) : value;
    }

    private Map<String, Object> buildPayload(AccountingEditRequest request) {
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
