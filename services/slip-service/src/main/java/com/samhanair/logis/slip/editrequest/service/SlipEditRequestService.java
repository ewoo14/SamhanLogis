package com.samhanair.logis.slip.editrequest.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.editrequest.config.SlipEditRequestProperties;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequest;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestStatus;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestType;
import com.samhanair.logis.slip.editrequest.domain.SlipEditTargetRole;
import com.samhanair.logis.slip.editrequest.repository.SlipEditRequestRepository;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 슬립 수정/삭제 요청 워크플로우 — PR-H3 (Phase 12 Step 3).
 *
 * <p>사용자 명시 잠금 정책 (개발책임자 결정):
 * <ul>
 *   <li>DRAFT/SAVED — 작성자 자유 수정/삭제 (본 service 사용 X — 직접 mutation).</li>
 *   <li>SENT — 작성자 자유 (전송 후 협력사 검토 단계, 창고 인계 전).</li>
 *   <li>CONFIRMED/ACCEPTED/PROCESSING (창고 인계 후 ~ 검수 전) — 작성자 직접 차단 → 본 service
 *       통한 요청 → 창고 (ROLE_WAREHOUSE) 또는 관리자 (ROLE_MANAGER) 수락 시 1회 mutation 가능.</li>
 *   <li>INSPECTING/SHIPPING — 완전 잠금 (요청 자체 reject — picking/배송 중 위험, 창고도 수락 불가).</li>
 *   <li>DELIVERED — 영구 잠금 (회계 마감 직전, MANAGER 정책 검토 후 별도 채널).</li>
 * </ul>
 *
 * <p><b>SSE event 형식</b>:
 * <ul>
 *   <li>{@code "slip:edit-request:created"} — 요청 생성 시 broadcast (창고/관리자 대시보드 실시간)</li>
 *   <li>{@code "slip:edit-request:decided"} — 수락/거절 시 broadcast (요청자 화면 실시간)</li>
 * </ul>
 *
 * <p><b>UUID 비공개</b>: SSE payload 의 actorId 는 FE 색상 hash 결정성 용도. 사용자 화면 표시는
 * actorName 만 사용.
 *
 * <p><b>외부 의존</b> = {@link NotificationClient} (notification-service Aligo SMS / FCM push).
 * 실패 시 graceful fallback (slip 비즈니스 로직 진행, warning log 만).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SlipEditRequestService {

    /** SSE event name — 요청 생성 시 broadcast. */
    public static final String EVENT_REQUEST_CREATED = "slip:edit-request:created";

    /** SSE event name — 수락/거절/만료 시 broadcast. */
    public static final String EVENT_REQUEST_DECIDED = "slip:edit-request:decided";

    /**
     * 잠금 정책 — 본 status set 의 슬립은 직접 mutation 차단 + 본 service 요청 채널만 가능.
     * 사용자 명시: 확정 (CONFIRMED) → 창고 인계 (ACCEPTED) → 처리 중 (PROCESSING) 까지 창고/관리자
     * 수락 1회로 mutation 가능. CONFIRMED 는 작성자가 BE 에 전송 완료 후 창고 수락 직전 상태.
     */
    public static final Set<SlipStatus> LOCKED_REQUIRES_APPROVAL = Set.of(
            SlipStatus.CONFIRMED, SlipStatus.ACCEPTED, SlipStatus.PROCESSING);

    /**
     * 완전 잠금 — 본 status set 의 슬립은 요청 자체 reject (picking 중 / 배송 중 / 배송 완료).
     * 사용자 명시 정책: "INSPECTING + SHIPPING: 창고도 수락 불가" + "DELIVERED: 영구 잠금".
     */
    public static final Set<SlipStatus> FULLY_LOCKED = Set.of(
            SlipStatus.INSPECTING, SlipStatus.SHIPPING, SlipStatus.DELIVERED);

    private final SlipEditRequestRepository requestRepository;
    private final SlipRepository slipRepository;
    private final SlipRealtimeBroker broker;
    private final NotificationClient notificationClient;
    private final SlipEditRequestProperties properties;

    /**
     * 신규 수정/삭제 요청 생성 + 창고/관리자 그룹 알림 + SSE broadcast.
     *
     * <p>status 가드:
     * <ul>
     *   <li>DRAFT/SAVED/SENT — 작성자가 직접 mutation 가능하므로 본 endpoint 호출은 INVALID_INPUT.</li>
     *   <li>CONFIRMED/ACCEPTED/PROCESSING — 정상 요청 생성 (target_role=WAREHOUSE).</li>
     *   <li>INSPECTING/SHIPPING/DELIVERED — 완전 잠금, CONFLICT.</li>
     *   <li>REJECTED/CANCELED — 의미 없음, INVALID_INPUT.</li>
     * </ul>
     *
     * @param slipId 대상 슬립
     * @param requestType EDIT / DELETE
     * @param reason 요청 사유 (선택, ≤500자)
     * @param requesterId 요청자 UUID
     * @param requesterName 요청자 표시명 (UUID 비공개 가드)
     * @return 영속화된 SlipEditRequest (status=PENDING)
     * @throws BusinessException(NOT_FOUND) 슬립 미존재
     * @throws BusinessException(INVALID_INPUT) DRAFT/SAVED/SENT/REJECTED/CANCELED 단계
     * @throws BusinessException(CONFLICT) INSPECTING/SHIPPING/DELIVERED 단계 (완전 잠금)
     */
    @Transactional
    public SlipEditRequest request(UUID slipId, SlipEditRequestType requestType, String reason,
                                   UUID requesterId, String requesterName) {
        Objects.requireNonNull(slipId, "slipId 는 필수입니다");
        Objects.requireNonNull(requestType, "requestType 은 필수입니다");
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "슬립을 찾을 수 없습니다: " + slipId));

        guardRequestableStatus(slip);

        // CONFIRMED / ACCEPTED / PROCESSING 단계는 WAREHOUSE 권한자 그룹이 수락 주체.
        // 사용자 명시 정책 — 향후 정책 확장 시 status → role 매핑 분리.
        SlipEditTargetRole targetRole = SlipEditTargetRole.WAREHOUSE;

        LocalDateTime expiresAt = LocalDateTime.now().plusHours(properties.getExpiresHours());
        SlipEditRequest request = SlipEditRequest.create(slipId, requesterId, requesterName,
                requestType, reason, targetRole, expiresAt);
        SlipEditRequest saved = requestRepository.save(request);

        // SSE broadcast — 슬립 화면 (작성자/창고/관리자 모두 구독) + targetRole 대시보드
        broker.publish(slipId, EVENT_REQUEST_CREATED, buildPayload(saved));

        // notification-service Feign — 창고 직원 그룹에게 SMS / 푸시 알림 (graceful fallback)
        notifyTargetRole(saved, slip);

        log.info("[PR-H3] slip {} 수정 요청 생성 — type={} requester={} targetRole={}",
                slipId, requestType, requesterName, targetRole);
        return saved;
    }

    /**
     * 요청 수락 (PENDING → APPROVED) + 작성자 알림 + SSE broadcast.
     *
     * <p>수락 직후 1회 한정 mutation 가능 — service 레이어가 mutation 직후
     * {@link #consumeApproval} 호출하여 재사용 차단.
     *
     * @param requestId 대상 요청
     * @param approverId 결정자 UUID
     * @param approverName 결정자 표시명
     * @param noteOptional 수락 메모 (선택)
     * @return 갱신된 SlipEditRequest (status=APPROVED)
     * @throws BusinessException(NOT_FOUND) 요청 미존재
     * @throws BusinessException(CONFLICT) 이미 종결된 요청
     */
    @Transactional
    public SlipEditRequest approve(UUID requestId, UUID approverId, String approverName,
                                   String noteOptional) {
        SlipEditRequest request = loadForDecisionOrThrow(requestId);
        // 도메인 메서드가 status 가드 + audit
        request.approve(approverId, approverName, noteOptional);

        // SSE — 요청자 화면 즉시 "수락" 표시
        broker.publish(request.getSlipId(), EVENT_REQUEST_DECIDED, buildPayload(request));

        // notification-service — 요청자 (작성자) 에게 SMS / 푸시
        notifyRequesterDecision(request, "수락");

        log.info("[PR-H3] 요청 {} 수락 — approver={} slip={}",
                requestId, approverName, request.getSlipId());
        return request;
    }

    /**
     * 요청 거절 (PENDING → REJECTED) + 작성자 알림 + SSE broadcast.
     *
     * @param requestId 대상 요청
     * @param approverId 결정자 UUID
     * @param approverName 결정자 표시명
     * @param decisionReason 거절 사유 (필수, ≤500자)
     * @return 갱신된 SlipEditRequest (status=REJECTED)
     * @throws BusinessException(NOT_FOUND) 요청 미존재
     * @throws BusinessException(CONFLICT) 이미 종결된 요청
     * @throws BusinessException(INVALID_INPUT) decisionReason 누락
     */
    @Transactional
    public SlipEditRequest reject(UUID requestId, UUID approverId, String approverName,
                                  String decisionReason) {
        SlipEditRequest request = loadForDecisionOrThrow(requestId);
        request.reject(approverId, approverName, decisionReason);

        broker.publish(request.getSlipId(), EVENT_REQUEST_DECIDED, buildPayload(request));
        notifyRequesterDecision(request, "거절: " + decisionReason);

        log.info("[PR-H3] 요청 {} 거절 — approver={} reason={}",
                requestId, approverName, decisionReason);
        return request;
    }

    /**
     * 권한자 그룹 PENDING 요청 목록 — 창고/관리자 대시보드용. 응답 즉시 수락/거절 분기.
     *
     * @param targetRole WAREHOUSE / MANAGER
     * @return PENDING 요청 리스트 (최신순)
     */
    @Transactional(readOnly = true)
    public List<SlipEditRequest> listPendingForRole(SlipEditTargetRole targetRole) {
        Objects.requireNonNull(targetRole, "targetRole 은 필수입니다");
        return requestRepository.findByTargetRoleAndStatusOrderByRequestedAtDesc(
                targetRole, SlipEditRequestStatus.PENDING);
    }

    /**
     * 슬립별 요청 이력 — slip 화면 표시용. status null 이면 전체.
     *
     * @param slipId 대상 슬립
     * @param statusFilter 필터 (null = 전체)
     * @return 요청 이력 (최신순)
     */
    @Transactional(readOnly = true)
    public List<SlipEditRequest> listBySlip(UUID slipId, SlipEditRequestStatus statusFilter) {
        Objects.requireNonNull(slipId, "slipId 는 필수입니다");
        if (statusFilter == null) {
            return requestRepository.findBySlipIdOrderByRequestedAtDesc(slipId);
        }
        return requestRepository.findBySlipIdAndStatusOrderByRequestedAtDesc(slipId, statusFilter);
    }

    /**
     * 슬립 mutation 가드 — APPROVED 상태의 활성 요청 1건이라도 있는지 lookup.
     *
     * <p>{@link com.samhanair.logis.slip.service.SlipService} / {@link
     * com.samhanair.logis.slip.publish.SlipPublishService} 가 status 잠금 체크 시 본 메서드 호출.
     * 0건 반환 = mutation 차단 (CONFLICT). 1건 반환 = mutation 진행 후
     * {@link #consumeApproval} 호출.
     *
     * @param slipId 대상 슬립
     * @return APPROVED 요청 (있으면) 또는 empty
     */
    @Transactional(readOnly = true)
    public Optional<SlipEditRequest> findActiveApproval(UUID slipId) {
        return requestRepository.findFirstBySlipIdAndStatus(slipId,
                SlipEditRequestStatus.APPROVED);
    }

    /**
     * APPROVED 요청 1회 소진 — slip mutation 직후 호출. soft-delete 라 다음 lookup 부터 0건 반환.
     *
     * @param requestId 대상 요청
     * @param consumerUserId mutation 수행자 user-id (audit)
     */
    @Transactional
    public void consumeApproval(UUID requestId, String consumerUserId) {
        SlipEditRequest request = loadForDecisionOrThrow(requestId);
        request.consumeApproval(consumerUserId == null ? "system" : consumerUserId);
        log.info("[PR-H3] 요청 {} APPROVED 소진 — consumer={}", requestId, consumerUserId);
    }

    /**
     * 스케줄러 자동 만료 — PENDING + expires_at &lt; now 인 row 일괄 EXPIRED 전환.
     * 1시간 주기 (운영 환경). expires_at default 24h 이라 1h 주기로 충분.
     *
     * <p>만료된 요청은 SSE broadcast 도 수행 — 요청자 화면이 자동 "만료" 표시.
     */
    @Scheduled(fixedRate = 3_600_000L) // 1h
    @Transactional
    public void expirePending() {
        LocalDateTime now = LocalDateTime.now();
        List<SlipEditRequest> expired = requestRepository.findExpired(now);
        if (expired.isEmpty()) {
            return;
        }
        for (SlipEditRequest req : expired) {
            try {
                req.expire();
                broker.publish(req.getSlipId(), EVENT_REQUEST_DECIDED, buildPayload(req));
            } catch (BusinessException ex) {
                // idempotent — 이미 종결된 요청은 무시 (race condition 방어)
                log.debug("[PR-H3] 요청 {} 만료 skip (이미 종결): {}", req.getId(), ex.getMessage());
            }
        }
        log.info("[PR-H3] 자동 만료 처리 — {} 건 EXPIRED 전환", expired.size());
    }

    // ---------- 내부 helper ----------

    private SlipEditRequest loadForDecisionOrThrow(UUID requestId) {
        Objects.requireNonNull(requestId, "requestId 는 필수입니다");
        return requestRepository.findByIdForDecision(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "수정 요청을 찾을 수 없습니다: " + requestId));
    }

    /**
     * 슬립 status 별 요청 가능 가드 — 사용자 명시 정책 일관 강제.
     */
    private void guardRequestableStatus(Slip slip) {
        SlipStatus s = slip.getStatus();
        if (s == SlipStatus.DRAFT || s == SlipStatus.SAVED || s == SlipStatus.SENT) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "현 단계 (" + s + ") 는 작성자가 직접 수정/삭제 가능합니다 — 별도 요청 불필요");
        }
        if (FULLY_LOCKED.contains(s)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "현 단계 (" + s + ") 는 완전 잠금 — 수정/삭제 요청 자체 불가");
        }
        if (s == SlipStatus.REJECTED || s == SlipStatus.CANCELED) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "현 단계 (" + s + ") 는 종결됨 — 수정/삭제 요청 의미 없음");
        }
        // CONFIRMED / ACCEPTED / PROCESSING (LOCKED_REQUIRES_APPROVAL) 만 정상 진행
    }

    private Map<String, Object> buildPayload(SlipEditRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("requestId", request.getId() == null ? null : request.getId().toString());
        payload.put("slipId", request.getSlipId().toString());
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

    /**
     * 권한자 그룹 알림 발송 — 본 PR 시범 한정: 슬립 헤더의 acceptedBy (창고 직원 user-id) 가 있으면
     * 푸시 1건 + 별도 SMS 채널은 운영 향후 확장. acceptedBy 가 UUID 가 아닌 employeeCode 인 경우
     * skip (legacy header 호환).
     */
    private void notifyTargetRole(SlipEditRequest request, Slip slip) {
        String acceptedBy = slip.getAcceptedBy();
        if (acceptedBy == null || acceptedBy.isBlank()) {
            log.debug("[PR-H3] slip {} acceptedBy 미존재 — 창고 그룹 알림 skip (legacy header 호환)",
                    slip.getId());
            return;
        }
        UUID warehouseUserId = parseUuidOrNull(acceptedBy);
        if (warehouseUserId == null) {
            log.debug("[PR-H3] acceptedBy 가 UUID 아님 — push skip (employeeCode={})", acceptedBy);
            return;
        }
        String subject = String.format("[수정 요청] %s — %s",
                request.getRequestType().getDisplayName(), request.getRequesterName());
        String body = String.format("슬립 %s 에 대한 %s 요청이 도착했습니다.\n사유: %s",
                slip.getSlipNo(), request.getRequestType().getDisplayName(),
                request.getReason() == null ? "(미입력)" : request.getReason());
        notificationClient.sendUserPush(warehouseUserId, subject, body);
    }

    /**
     * 요청자 (작성자) 결과 알림 발송 — 수락/거절 시점.
     */
    private void notifyRequesterDecision(SlipEditRequest request, String decisionLabel) {
        String subject = String.format("[수정 요청 결과] %s — %s",
                request.getRequestType().getDisplayName(), decisionLabel);
        String body = String.format("귀하의 슬립 %s 요청이 %s 처리되었습니다.\n결정자: %s",
                request.getRequestType().getDisplayName(), decisionLabel,
                request.getDecidedByName());
        notificationClient.sendUserPush(request.getRequesterId(), subject, body);
    }

    private static UUID parseUuidOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
