package com.samhanair.logis.approval;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.MappedSuperclass;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 결재 chain 단계의 공통 베이스(전 전표 공용). 컬럼과 단계 전이 로직만 보유하고,
 * 부모 결재선으로의 {@code @ManyToOne} 역참조·{@code @Id} 는 소비 서비스 concrete @Entity 가 소유한다
 * (Hibernate 가 @MappedSuperclass 의 per-service 관계 타입을 매핑하지 못하므로).
 *
 * <p>결재자 식별은 {@link StepType} 으로 분기한다.
 * <ul>
 *   <li>{@link StepType#USER} — {@code approverUserId} 사원 UUID 일치 여부로 판정.</li>
 *   <li>{@link StepType#GROUP} — actor 가 {@code approverGroupId} 그룹의 멤버인지(groupMatch)로만 판정.
 *       {@code requiredPageCode} 는 표시/설정 저장용이며 approve/reject 권한 판정에는 사용하지 않는다.</li>
 * </ul>
 */
@Getter
@MappedSuperclass
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public abstract class ApprovalStepBase extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "step_type", length = 20)
    private StepType stepType;

    /** USER 모드 결재자 사원 UUID. 기존 컬럼 {@code approver_id} 에 매핑(컬럼명 불변). */
    @Column(name = "approver_id", updatable = false)
    private UUID approverUserId;

    /** GROUP 모드 권한 그룹 UUID(표시·설정용, A2). */
    @Column(name = "approver_group_id")
    private UUID approverGroupId;

    /** GROUP 모드 결재 권한 page-code(enforce 용, A2). */
    @Column(name = "required_page_code", length = 100)
    private String requiredPageCode;

    /** 실제 승인 처리자 user UUID — approve 시 기록. */
    @Column(name = "approved_by_user_id")
    private UUID approvedByUserId;

    /** chain 순서(0-base ASC). */
    @Column(name = "sequence", nullable = false, updatable = false)
    private int sequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ApprovalStepStatus status;

    /** 처리 시각(승인/반려). */
    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    /** 반려 사유(REJECTED 인 경우만 의미). */
    @Column(name = "reason", length = 500)
    private String reason;

    /**
     * 결재 시점 동결 서명 PNG(A3 에서 채움). LAZY 는 Hibernate bytecode enhancement 전제이며,
     * 미적용 시 EAGER 로 강등된다. A3 서명 동결 시 enhancement 또는 projection/별도 테이블 병행이 필수다.
     */
    @Basic(fetch = FetchType.LAZY)
    @Column(name = "signature_png_snapshot")
    private byte[] signaturePngSnapshot;

    /** 서명 동결 시각(A3). */
    @Column(name = "signed_at")
    private LocalDateTime signedAt;

    /** USER 모드 단계 초기화 — concrete create 가 호출. */
    protected void initUserStep(UUID approverUserId, int sequence) {
        if (approverUserId == null) {
            throw new IllegalArgumentException("approverUserId 필수");
        }
        this.stepType = StepType.USER;
        this.approverUserId = approverUserId;
        this.sequence = sequence;
        this.status = ApprovalStepStatus.PENDING;
    }

    /**
     * GROUP 모드 단계 초기화 — 권한그룹 식별자는 필수.
     *
     * <p>{@code requiredPageCode} 는 관리 화면 표시 및 설정 저장용 보조 정보이며
     * approve/reject 결재 권한 판정에는 사용하지 않는다.
     */
    protected void initGroupStep(UUID approverGroupId, String requiredPageCode, int sequence) {
        if (approverGroupId == null) {
            throw new IllegalArgumentException("approverGroupId 필수");
        }
        this.stepType = StepType.GROUP;
        this.approverGroupId = approverGroupId;
        this.requiredPageCode = blankToNull(requiredPageCode);
        this.sequence = sequence;
        this.status = ApprovalStepStatus.PENDING;
    }

    /** 액터가 본 단계의 결재 권한자인지. 기존 USER 전용 호출은 source 호환을 위해 유지한다. */
    boolean matchesActor(UUID actorUserId) {
        return matchesActor(actorUserId, Set.of(), Set.of());
    }

    /**
     * 액터가 본 단계의 결재 권한자인지.
     *
     * <p>{@link StepType#GROUP} 판정은 그룹 멤버십(groupMatch)만 사용한다.
     * {@code requiredPageCode} 는 표시/설정 저장용이므로 approve/reject 판정에 사용하지 않는다
     * — page-code 단독 일치로 결재권이 부여되는 특권 상승을 방지한다.
     *
     * @param actorUserId    수행자 user UUID
     * @param actorGroupIds  수행자의 활성 그룹 UUID 집합 (게이트웨이 주입 {@code X-User-Groups})
     * @param actorPageCodes reserved — 현재 판정 미사용
     */
    boolean matchesActor(UUID actorUserId, Set<UUID> actorGroupIds, Set<String> actorPageCodes) {
        if (actorUserId == null) {
            return false;
        }
        if (this.stepType == StepType.USER) {
            return this.approverUserId != null && this.approverUserId.equals(actorUserId);
        }
        if (this.stepType != StepType.GROUP) {
            return false;
        }
        // GROUP 판정 = 그룹 멤버십(groupMatch)만 사용. pageMatch 는 특권 상승 위험으로 제외.
        Set<UUID> safeGroupIds = actorGroupIds == null ? Set.of() : actorGroupIds;
        boolean groupMatch = this.approverGroupId != null && safeGroupIds.contains(this.approverGroupId);
        return groupMatch;
    }

    /** 본 단계 승인. 호출 흐름은 {@link ApprovalLineBase#approve(UUID)} 가 보장. */
    void approve(UUID actorUserId) {
        ensurePending();
        this.status = ApprovalStepStatus.APPROVED;
        this.approvedByUserId = actorUserId;
        this.decidedAt = LocalDateTime.now();
    }

    /** 본 단계 반려. */
    void reject(UUID actorUserId, String reason) {
        ensurePending();
        this.status = ApprovalStepStatus.REJECTED;
        this.approvedByUserId = actorUserId;
        this.reason = reason;
        this.decidedAt = LocalDateTime.now();
    }

    private void ensurePending() {
        if (this.status != ApprovalStepStatus.PENDING) {
            throw new IllegalStateException("이미 처리된 결재 단계입니다: " + this.status);
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
