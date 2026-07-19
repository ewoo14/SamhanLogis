package com.samhanair.logis.approval;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.MappedSuperclass;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 전 전표 공용 결재선 베이스. 스칼라 컬럼 + chain 종합 전이 로직만 보유한다.
 *
 * <p>steps 컬렉션(@OneToMany)·@Version·@Id·서비스 전용 필드(content/template 등)는 소비 서비스
 * concrete @Entity 가 소유한다(Hibernate 가 @MappedSuperclass 의 per-service @OneToMany 를 매핑하지
 * 못하므로). 베이스는 {@link #stepsView()} 추상 accessor 로 단계 목록을 읽어 chain 로직을 수행한다.
 *
 * <p>전표 연계는 loose ref — {@link #documentType}/{@link #documentId}(둘 다 nullable, FK 없음).
 * 전표 비연계 결재(그룹웨어 독립형)는 둘 다 null.
 */
@Getter
@MappedSuperclass
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public abstract class ApprovalLineBase extends BaseEntity {

    private static final int TITLE_MAX_LENGTH = 200;

    /** 결재문서번호 — 전표번호 표준 {@code yyyy/MM/dd-N}. */
    @Column(name = "approval_no", nullable = false, length = 30)
    private String approvalNo;

    /** 요청자 user UUID. */
    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    /** 연계 전표 종류(loose ref, A2+). 독립형 결재는 null. */
    @Column(name = "document_type", length = 70)
    private String documentType;

    /** 연계 전표 UUID(loose ref, A2+). 독립형 결재는 null. */
    @Column(name = "document_id")
    private UUID documentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ApprovalStatus status;

    /** concrete 가 보유한 단계 목록 read-only view. chain 로직이 이를 통해 단계를 읽는다. */
    protected abstract List<? extends ApprovalStepBase> stepsView();

    /** 베이스 스칼라 초기화 — concrete factory 가 호출. status=PENDING. */
    protected void initBase(String approvalNo, UUID requesterId, String title) {
        if (approvalNo == null || approvalNo.isBlank()) {
            throw new IllegalArgumentException("approvalNo 필수");
        }
        if (requesterId == null) {
            throw new IllegalArgumentException("requesterId 필수");
        }
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title 필수");
        }
        if (title.length() > TITLE_MAX_LENGTH) {
            throw new IllegalArgumentException("결재 제목은 " + TITLE_MAX_LENGTH + "자 이하여야 합니다");
        }
        this.approvalNo = approvalNo;
        this.requesterId = requesterId;
        this.title = title;
        this.status = ApprovalStatus.PENDING;
    }

    /** 제목 교체(협업 수정완료 overlay 용). concrete 가 guard 후 호출. */
    protected void replaceTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("결재 제목은 필수입니다");
        }
        if (title.length() > TITLE_MAX_LENGTH) {
            throw new IllegalArgumentException("결재 제목은 " + TITLE_MAX_LENGTH + "자 이하여야 합니다");
        }
        this.title = title;
    }

    /** 전표 연계(loose ref) 지정. */
    protected void linkDocument(String documentType, UUID documentId) {
        this.documentType = documentType;
        this.documentId = documentId;
    }

    /** 현재 처리해야 할 단계(status=PENDING 중 sequence 최소). 종료/미존재 시 null. */
    public ApprovalStepBase currentStep() {
        return stepsView().stream()
                .filter(s -> s.getStatus() == ApprovalStepStatus.PENDING)
                .map(s -> (ApprovalStepBase) s)
                .findFirst()
                .orElse(null);
    }

    /** 결재자 승인. 본인 단계 + 미종료 검증 후 단계 승인 + chain 종합 전이. */
    public void approve(UUID actorUserId) {
        approve(actorUserId, Set.of(), Set.of());
    }

    /** GROUP 단계 승인 컨텍스트를 포함한 결재자 승인. */
    public void approve(UUID actorUserId, Set<UUID> actorGroupIds, Set<String> actorPageCodes) {
        ensureMutable();
        ApprovalStepBase step = requireCurrentStepFor(actorUserId, actorGroupIds, actorPageCodes);
        step.approve(actorUserId);
        boolean allApproved = stepsView().stream()
                .allMatch(s -> s.getStatus() == ApprovalStepStatus.APPROVED);
        this.status = allApproved ? ApprovalStatus.APPROVED : ApprovalStatus.IN_PROGRESS;
    }

    /** 결재자 반려 — 즉시 REJECTED. */
    public void reject(UUID actorUserId, String reason) {
        reject(actorUserId, reason, Set.of(), Set.of());
    }

    /** GROUP 단계 반려 컨텍스트를 포함한 결재자 반려. */
    public void reject(UUID actorUserId, String reason, Set<UUID> actorGroupIds, Set<String> actorPageCodes) {
        ensureMutable();
        ApprovalStepBase step = requireCurrentStepFor(actorUserId, actorGroupIds, actorPageCodes);
        step.reject(actorUserId, reason);
        this.status = ApprovalStatus.REJECTED;
    }

    /** 요청자 본인 회수 — 종료 상태 거부. */
    public void withdraw(UUID actorUserId) {
        if (!this.requesterId.equals(actorUserId)) {
            throw new IllegalStateException("요청자 본인만 회수할 수 있습니다");
        }
        ensureMutable();
        this.status = ApprovalStatus.WITHDRAWN;
    }

    /** 종료 상태(APPROVED/REJECTED/WITHDRAWN) 인지. concrete overlay guard 등에서 재사용. */
    protected boolean isTerminal() {
        return this.status == ApprovalStatus.APPROVED
                || this.status == ApprovalStatus.REJECTED
                || this.status == ApprovalStatus.WITHDRAWN;
    }

    private void ensureMutable() {
        if (isTerminal()) {
            throw new IllegalStateException("이미 종료된 결재선입니다: " + this.status.getDisplayName());
        }
    }

    private ApprovalStepBase requireCurrentStepFor(UUID actorUserId,
                                                   Set<UUID> actorGroupIds,
                                                   Set<String> actorPageCodes) {
        ApprovalStepBase step = currentStep();
        if (step == null) {
            throw new IllegalStateException("처리 대기 중인 결재 단계가 없습니다");
        }
        if (!step.matchesActor(actorUserId, actorGroupIds, actorPageCodes)) {
            throw new IllegalStateException("현재 결재 단계의 결재자가 아닙니다");
        }
        return step;
    }
}
