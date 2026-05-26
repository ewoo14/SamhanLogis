package com.samhanair.logis.shared.realtime.editrequest;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.MappedSuperclass;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 수정/삭제 요청 공통 base — PR-H4a (Phase 12 Step 4a) 통합 abstraction.
 *
 * <p>14 service 가 자체 도메인 (slip / lot / dispatch / partner-order 등) 의 수정 요청 테이블을
 * 만들 때 본 클래스를 {@code @MappedSuperclass} 상속 → BaseEntity 7 audit + edit-request 13 필드
 * 자동 보유.
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}): 사용자 화면 노출 식별자
 * = {@link #requesterName} / {@link #decidedByName} 만. UUID 자체는 audit/감사 추적용.
 *
 * <p><b>Soft-delete</b>: 회계 감사 / 분쟁 대응 — 본 row 는 BaseEntity.markDeleted 로만 비활성.
 * APPROVED 1회 소진 시 markDeleted 패턴 (재사용 차단). consumer entity 가
 * {@code @SQLRestriction("is_deleted = false")} 명시 필수.
 *
 * <p><b>FK 미강제</b>: 도메인 entity soft-delete 후에도 본 row 보존.
 *
 * <p><b>적용 예</b> ({@code SlipEditRequest}):
 * <pre>
 * &#64;Entity
 * &#64;Table(name = "slip_edit_requests")
 * &#64;SQLRestriction("is_deleted = false")
 * public class SlipEditRequest extends EditRequestRecord {
 *     // entityId = slipId 의미 — getter alias 만 추가
 *     public UUID getSlipId() { return getEntityId(); }
 * }
 * </pre>
 */
@Getter
@MappedSuperclass
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public abstract class EditRequestRecord extends BaseEntity {

    /** 하위 entity 의 UUID PK. consumed guard 메시지에서 도메인 공통으로 사용한다. */
    public abstract UUID getId();

    /** reason 길이 한계 — 모든 service 일관. */
    public static final int MAX_REASON_LENGTH = 500;

    /** 소속 도메인 entity FK (slipId / lotId / dispatchId 등) — FK 미강제. */
    @Column(name = "entity_id", nullable = false)
    private UUID entityId;

    /** 요청자 UUID (audit/감사 추적용 — 사용자 화면 노출 금지). */
    @Column(name = "requester_id", nullable = false)
    private UUID requesterId;

    /** 요청자 표시명 (사용자 화면 노출 식별자 — UUID 비공개 가드). */
    @Column(name = "requester_name", nullable = false, length = 50)
    private String requesterName;

    /** 요청 종류 (EDIT/DELETE). */
    @Enumerated(EnumType.STRING)
    @Column(name = "request_type", nullable = false, length = 20)
    private EditRequestType requestType;

    /** 요청 사유 (선택, ≤500자). */
    @Column(name = "reason", length = MAX_REASON_LENGTH)
    private String reason;

    /** 요청 라이프사이클 status. PENDING 시점 생성. */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private EditRequestStatus status;

    /** 수락 권한자 그룹 (WAREHOUSE/MANAGER). */
    @Enumerated(EnumType.STRING)
    @Column(name = "target_role", nullable = false, length = 20)
    private EditTargetRole targetRole;

    /** 결정자 UUID (수락/거절 시점 채움). */
    @Column(name = "decided_by_id")
    private UUID decidedById;

    /** 결정자 표시명 (UUID 비공개 가드). */
    @Column(name = "decided_by_name", length = 50)
    private String decidedByName;

    /** 결정 시각 (수락/거절/만료). */
    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    /** 거절 사유 (REJECTED 시점 필수). */
    @Column(name = "decision_reason", length = MAX_REASON_LENGTH)
    private String decisionReason;

    /** 요청 시각 (BaseEntity.createdAt 과 동일하지만 명시 보존). */
    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    /** 자동 만료 시각 (default 24h). */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /**
     * 공통 초기화 — 하위 entity 의 정적 factory 가 본 메서드를 호출하여 필드 값 검증/세팅.
     */
    protected void init(UUID entityId, UUID requesterId, String requesterName,
                        EditRequestType requestType, String reason,
                        EditTargetRole targetRole, LocalDateTime expiresAt) {
        if (entityId == null) {
            throw new IllegalArgumentException("entityId 는 필수입니다");
        }
        if (requesterId == null) {
            throw new IllegalArgumentException("requesterId 는 필수입니다");
        }
        if (requesterName == null || requesterName.isBlank()) {
            throw new IllegalArgumentException("requesterName 은 필수입니다");
        }
        if (requestType == null) {
            throw new IllegalArgumentException("requestType 은 필수입니다");
        }
        if (targetRole == null) {
            throw new IllegalArgumentException("targetRole 은 필수입니다");
        }
        if (reason != null && reason.length() > MAX_REASON_LENGTH) {
            throw new IllegalArgumentException(
                    "reason 은 최대 " + MAX_REASON_LENGTH + "자입니다 (현재: " + reason.length() + ")");
        }
        this.entityId = entityId;
        this.requesterId = requesterId;
        this.requesterName = requesterName;
        this.requestType = requestType;
        this.reason = reason;
        this.targetRole = targetRole;
        this.status = EditRequestStatus.PENDING;
        this.requestedAt = LocalDateTime.now();
        this.expiresAt = expiresAt;
    }

    /**
     * 수락 (PENDING → APPROVED). 종결 상태에서 호출 시 CONFLICT.
     *
     * @param approverId 결정자 UUID
     * @param approverName 결정자 표시명 (UUID 비공개 가드)
     * @param noteOptional 수락 메모 (선택, decision_reason 컬럼에 저장)
     * @throws BusinessException(CONFLICT) 이미 종결된 요청
     */
    public void approve(UUID approverId, String approverName, String noteOptional) {
        requirePending();
        if (approverId == null) {
            throw new IllegalArgumentException("approverId 는 필수입니다");
        }
        if (approverName == null || approverName.isBlank()) {
            throw new IllegalArgumentException("approverName 은 필수입니다");
        }
        if (noteOptional != null && noteOptional.length() > MAX_REASON_LENGTH) {
            throw new IllegalArgumentException(
                    "decisionReason 은 최대 " + MAX_REASON_LENGTH + "자입니다");
        }
        this.status = EditRequestStatus.APPROVED;
        this.decidedById = approverId;
        this.decidedByName = approverName;
        this.decidedAt = LocalDateTime.now();
        this.decisionReason = noteOptional;
    }

    /**
     * 거절 (PENDING → REJECTED). 거절 사유 필수.
     */
    public void reject(UUID approverId, String approverName, String decisionReason) {
        requirePending();
        if (approverId == null) {
            throw new IllegalArgumentException("approverId 는 필수입니다");
        }
        if (approverName == null || approverName.isBlank()) {
            throw new IllegalArgumentException("approverName 은 필수입니다");
        }
        if (decisionReason == null || decisionReason.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "거절 시 decisionReason 은 필수입니다");
        }
        if (decisionReason.length() > MAX_REASON_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "decisionReason 은 최대 " + MAX_REASON_LENGTH + "자입니다");
        }
        this.status = EditRequestStatus.REJECTED;
        this.decidedById = approverId;
        this.decidedByName = approverName;
        this.decidedAt = LocalDateTime.now();
        this.decisionReason = decisionReason;
    }

    /**
     * 자동 만료 (PENDING → EXPIRED). 스케줄러 호출 — 인간 결정자 없음.
     */
    public void expire() {
        requirePending();
        this.status = EditRequestStatus.EXPIRED;
        this.decidedAt = LocalDateTime.now();
        // decidedBy* / decisionReason 은 null — 자동 만료 표지
    }

    /** Soft-delete. BaseEntity.markDeleted 위임. */
    public void softDelete(String deleterUserId) {
        markDeleted(deleterUserId);
    }

    /** APPROVED 요청 1회 소진 마킹 — service 레이어가 mutation 직후 호출 (재사용 차단용). */
    public void consumeApproval(String consumerUserId) {
        if (Boolean.TRUE.equals(getIsDeleted())) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 소진된 요청입니다: " + getId());
        }
        if (this.status != EditRequestStatus.APPROVED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "APPROVED 상태가 아닌 요청은 소진할 수 없습니다: " + this.status);
        }
        // soft delete 패턴 — 활성 요청 인덱스에서 제외 (재사용 방지)
        markDeleted(consumerUserId);
    }

    private void requirePending() {
        if (this.status != EditRequestStatus.PENDING) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 종결된 요청입니다: " + this.status);
        }
    }
}
