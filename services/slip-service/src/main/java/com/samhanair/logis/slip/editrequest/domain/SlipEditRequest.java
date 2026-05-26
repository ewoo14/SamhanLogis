package com.samhanair.logis.slip.editrequest.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 슬립 수정/삭제 요청 — PR-H3 (Phase 12 Step 3).
 *
 * <p>사용자 명시 잠금 정책 (개발책임자 결정):
 * <ul>
 *   <li>DRAFT/SAVED/SENT — 작성자 자유 수정/삭제 (본 도메인 사용 X).</li>
 *   <li>ACCEPTED/PROCESSING (창고 인계 후) — 작성자 직접 mutation 차단 → 본 도메인 요청 → 창고
 *       직원 (ROLE_WAREHOUSE) 또는 관리자 (ROLE_MANAGER) 수락 시 1회 mutation 가능.</li>
 *   <li>INSPECTING/SHIPPING — 창고도 수락 불가 (완전 잠금, picking 진행 중).</li>
 *   <li>DELIVERED/CONFIRMED — 영구 잠금 (회계 마감 직전/이후, MANAGER 정책 검토 후 별도 채널).</li>
 * </ul>
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}): 사용자 화면 노출 식별자
 * = {@link #requesterName} / {@link #decidedByName} 만. UUID 자체는 audit/감사 추적용.
 *
 * <p><b>Soft-delete</b>: 회계 감사 / 분쟁 대응 — 본 row 는 {@code BaseEntity.markDeleted} 로만 비활성.
 * 실 DELETE 금지.
 *
 * <p><b>FK 미강제</b>: slip soft delete 후에도 본 row 보존. 슬립 삭제 = revert 가 아닌 별도 라이프사이클.
 */
@Entity
@Getter
@Table(name = "slip_edit_requests")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipEditRequest extends BaseEntity {

    /** reason 길이 한계 (V19 컬럼 정의 일관). */
    public static final int MAX_REASON_LENGTH = 500;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 소속 Slip FK ({@link com.samhanair.logis.slip.domain.Slip#getId()}) — FK 미강제. */
    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    /** 요청자 UUID (audit/감사 추적용 — 사용자 화면 노출 금지). */
    @Column(name = "requester_id", nullable = false)
    private UUID requesterId;

    /** 요청자 표시명 (사용자 화면 노출 식별자 — UUID 비공개 가드). */
    @Column(name = "requester_name", nullable = false, length = 50)
    private String requesterName;

    /** 요청 종류 (EDIT/DELETE). */
    @Enumerated(EnumType.STRING)
    @Column(name = "request_type", nullable = false, length = 20)
    private SlipEditRequestType requestType;

    /** 요청 사유 (선택, ≤500자). */
    @Column(name = "reason", length = MAX_REASON_LENGTH)
    private String reason;

    /** 요청 라이프사이클 status. PENDING 시점 생성. */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SlipEditRequestStatus status;

    /** 수락 권한자 그룹 (WAREHOUSE/MANAGER). */
    @Enumerated(EnumType.STRING)
    @Column(name = "target_role", nullable = false, length = 20)
    private SlipEditTargetRole targetRole;

    /** 결정자 UUID (수락/거절 시점 채움). */
    @Column(name = "decided_by_id")
    private UUID decidedById;

    /** 결정자 표시명 (UUID 비공개 가드). */
    @Column(name = "decided_by_name", length = 50)
    private String decidedByName;

    /** 결정 시각 (수락/거절/만료). */
    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    /** 거절 사유 (REJECTED 시점 필수, APPROVED/EXPIRED 시 선택). */
    @Column(name = "decision_reason", length = MAX_REASON_LENGTH)
    private String decisionReason;

    /** 요청 시각 (BaseEntity.createdAt 과 동일하지만 명시 보존). */
    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    /** 자동 만료 시각 (default 24h, app.slip.edit-request.expires-hours). */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    private SlipEditRequest(UUID slipId, UUID requesterId, String requesterName,
                            SlipEditRequestType requestType, String reason,
                            SlipEditTargetRole targetRole, LocalDateTime expiresAt) {
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 는 필수입니다");
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
        this.slipId = slipId;
        this.requesterId = requesterId;
        this.requesterName = requesterName;
        this.requestType = requestType;
        this.reason = reason;
        this.targetRole = targetRole;
        this.status = SlipEditRequestStatus.PENDING;
        this.requestedAt = LocalDateTime.now();
        this.expiresAt = expiresAt;
    }

    /**
     * 신규 PENDING 요청 정적 factory.
     *
     * @param slipId 소속 슬립 UUID
     * @param requesterId 요청자 UUID
     * @param requesterName 요청자 표시명 (UUID 비공개 가드)
     * @param requestType EDIT / DELETE
     * @param reason 요청 사유 (선택, ≤500자)
     * @param targetRole 수락 권한자 그룹 (WAREHOUSE / MANAGER)
     * @param expiresAt 자동 만료 시각 (선택, null 가능)
     * @return 영속화 전 신규 SlipEditRequest
     */
    public static SlipEditRequest create(UUID slipId, UUID requesterId, String requesterName,
                                         SlipEditRequestType requestType, String reason,
                                         SlipEditTargetRole targetRole, LocalDateTime expiresAt) {
        return new SlipEditRequest(slipId, requesterId, requesterName, requestType, reason,
                targetRole, expiresAt);
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
        this.status = SlipEditRequestStatus.APPROVED;
        this.decidedById = approverId;
        this.decidedByName = approverName;
        this.decidedAt = LocalDateTime.now();
        this.decisionReason = noteOptional;
    }

    /**
     * 거절 (PENDING → REJECTED). 거절 사유 필수.
     *
     * @param approverId 결정자 UUID
     * @param approverName 결정자 표시명
     * @param decisionReason 거절 사유 (필수, ≤500자)
     * @throws BusinessException(CONFLICT) 이미 종결된 요청
     * @throws BusinessException(INVALID_INPUT) decisionReason null/blank
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
        this.status = SlipEditRequestStatus.REJECTED;
        this.decidedById = approverId;
        this.decidedByName = approverName;
        this.decidedAt = LocalDateTime.now();
        this.decisionReason = decisionReason;
    }

    /**
     * 자동 만료 (PENDING → EXPIRED). 스케줄러 호출 — 인간 결정자 없음.
     *
     * @throws BusinessException(CONFLICT) 이미 종결된 요청 (idempotent 가드)
     */
    public void expire() {
        requirePending();
        this.status = SlipEditRequestStatus.EXPIRED;
        this.decidedAt = LocalDateTime.now();
        // decidedBy* / decisionReason 은 null — 자동 만료 표지
    }

    /**
     * Soft-delete. BaseEntity.markDeleted 위임. 회계 감사용 — FE 에서만 비표시.
     *
     * @param deleterUserId 삭제자 user-id (audit)
     */
    public void softDelete(String deleterUserId) {
        markDeleted(deleterUserId);
    }

    /** APPROVED 요청 1회 소진 마킹 — service 레이어가 mutation 직후 호출 (재사용 차단용). */
    public void consumeApproval(String consumerUserId) {
        if (Boolean.TRUE.equals(getIsDeleted())) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 소진된 요청입니다: " + getId());
        }
        if (this.status != SlipEditRequestStatus.APPROVED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "APPROVED 상태가 아닌 요청은 소진할 수 없습니다: " + this.status);
        }
        // soft delete 패턴 — 활성 요청 인덱스에서 제외 (재사용 방지)
        markDeleted(consumerUserId);
    }

    private void requirePending() {
        if (this.status != SlipEditRequestStatus.PENDING) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 종결된 요청입니다: " + this.status);
        }
    }
}
