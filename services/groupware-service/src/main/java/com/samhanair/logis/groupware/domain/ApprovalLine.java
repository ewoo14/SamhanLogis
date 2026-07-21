package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.approval.ApprovalLineBase;
import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.approval.ApprovalStepStatus;
import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 그룹웨어 결재선(concrete @Entity). 스칼라/상태/chain 로직은 {@link ApprovalLineBase} 가 보유하고,
 * 본 클래스는 @Id·@Version·steps 컬렉션·그룹웨어 전용 필드(content/template/overlay)를 소유한다.
 */
@Entity
@Getter
@Table(name = "approval_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ApprovalLine extends ApprovalLineBase {

    private static final Set<ApprovalStatus> COLLAB_LOCKED_STATUSES =
            EnumSet.of(ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.WITHDRAWN);
    private static final int CONTENT_MAX_LENGTH = 2000;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "content", length = 2000)
    private String content;

    @Column(name = "template_id")
    private UUID templateId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_values", columnDefinition = "jsonb")
    private String fieldValuesJson;

    /** 최종 승인 시점에 각인한 문서 레이아웃 template UUID(API 연동 전용). */
    @Column(name = "document_template_id")
    private UUID documentTemplateId;

    /** 최종 승인 시점에 각인한 문서 레이아웃 revision. */
    @Column(name = "document_template_revision")
    private Integer documentTemplateRevision;

    /** 승인 순간 ACTIVE 양식이 없어 내장 DEFAULT를 사용했다는 사실의 시점 각인. */
    @Column(name = "document_template_default_pinned", nullable = false)
    private boolean documentTemplateDefaultPinned;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @OneToMany(mappedBy = "approvalLine", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sequence ASC")
    private List<ApprovalStep> steps = new ArrayList<>();

    private ApprovalLine(String approvalNo, UUID requesterId, String title, String content) {
        initBase(approvalNo, requesterId, title);
        validateContentLength(content);
        this.content = content;
        this.version = 0L;
    }

    /** 신규 결재선 발의. status=PENDING, chain 미부여(caller 가 {@link #appendStep} 호출 의무). */
    public static ApprovalLine open(String approvalNo, UUID requesterId, String title, String content) {
        return new ApprovalLine(approvalNo, requesterId, title, content);
    }

    @Override
    protected List<? extends com.samhanair.logis.approval.ApprovalStepBase> stepsView() {
        return this.steps;
    }

    /** 결재 chain 의 현재 처리 단계 — 기존 groupware API 호환을 위해 concrete 타입으로 반환한다. */
    @Override
    public ApprovalStep currentStep() {
        return (ApprovalStep) super.currentStep();
    }

    /** 결재 chain 에 USER 단계 추가. sequence 0-base 자동, 요청자 본인 차단. */
    public ApprovalStep appendStep(UUID approverUserId) {
        return appendUserStep(approverUserId, false);
    }

    /** 결재 chain 에 GROUP 단계 추가. sequence 0-base 자동, 동일 그룹 중복 차단. */
    public ApprovalStep appendGroupStep(UUID approverGroupId, String requiredPageCode) {
        if (approverGroupId == null) {
            throw new IllegalArgumentException("approverGroupId 필수");
        }
        if (containsGroupApprover(approverGroupId)) {
            throw new IllegalArgumentException("동일 권한그룹을 결재선에 중복 추가할 수 없습니다");
        }
        ApprovalStep step = ApprovalStep.createGroup(this, approverGroupId, requiredPageCode, this.steps.size());
        this.steps.add(step);
        return step;
    }

    /**
     * 중앙 결재라인 config 역할을 현재 결재선에 인스턴스화한다.
     *
     * <p>CREATOR 는 요청자 USER 단계로 동결하고, USER/GROUP 은 정규화된 역할 값에 따라 단계로 변환한다.
     * sequence 는 기존 단계 뒤에 0-base 로 재부여한다.
     */
    public ApprovalLine instantiateFromRoles(List<ResolvedRole> roles) {
        if (roles == null || roles.isEmpty()) {
            throw new IllegalArgumentException("결재 역할 1개 이상 필요");
        }
        roles.stream()
                .sorted(java.util.Comparator.comparingInt(ResolvedRole::sequence))
                .forEach(role -> {
                    if (role.stepType() == StepType.CREATOR) {
                        appendUserStep(getRequesterId(), true);
                    } else if (role.stepType() == StepType.USER) {
                        appendUserStep(role.approverUserId(), false);
                    } else if (role.stepType() == StepType.GROUP) {
                        appendGroupStep(role.approverGroupId(), role.requiredPageCode());
                    }
                });
        return this;
    }

    /** 그룹웨어 템플릿 documentType 을 loose ref 로 보관한다. */
    public ApprovalLine linkGroupwareDocument(String documentType, UUID templateId) {
        if (documentType != null && !documentType.isBlank()) {
            linkDocument(documentType.trim(), templateId);
        }
        return this;
    }

    private ApprovalStep appendUserStep(UUID approverUserId, boolean allowRequester) {
        if (approverUserId == null) {
            throw new IllegalArgumentException("approverUserId 필수");
        }
        if (!allowRequester && approverUserId.equals(getRequesterId())) {
            throw new IllegalArgumentException("요청자 본인은 결재자가 될 수 없습니다");
        }
        if (containsUserApprover(approverUserId)) {
            throw new IllegalArgumentException("동일 결재자를 결재선에 중복 추가할 수 없습니다");
        }
        ApprovalStep step = ApprovalStep.createUser(this, approverUserId, this.steps.size());
        this.steps.add(step);
        return step;
    }

    private boolean containsUserApprover(UUID approverUserId) {
        return this.steps.stream()
                .anyMatch(step -> approverUserId.equals(step.getApproverUserId()));
    }

    private boolean containsGroupApprover(UUID approverGroupId) {
        return this.steps.stream()
                .anyMatch(step -> approverGroupId.equals(step.getApproverGroupId()));
    }

    /** 결재 chain 의 현재 시점 snapshot — 외부 호출자가 list 조작 불가. */
    public List<ApprovalStep> getStepsView() {
        return Collections.unmodifiableList(this.steps);
    }

    /** 협업 수정완료 가능 상태 검증(종료 상태 409 차단). */
    public void guardCollabModifiable() {
        if (COLLAB_LOCKED_STATUSES.contains(getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "협업 수정완료가 불가능한 상태입니다: " + getStatus().getDisplayName());
        }
    }

    /** 협업 수정완료로 결재 제목을 덮어쓴다. */
    public ApprovalLine overlayTitle(String title) {
        guardCollabModifiable();
        try {
            replaceTitle(title);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
        return this;
    }

    /** 협업 수정완료로 결재 본문을 덮어쓴다. */
    public ApprovalLine overlayContent(String content) {
        guardCollabModifiable();
        validateContentLength(content);
        this.content = content;
        return this;
    }

    /** 결재유형 템플릿과 동적 필드 값을 적용한다. */
    public ApprovalLine applyTemplateValues(UUID templateId, String fieldValuesJson) {
        this.templateId = templateId;
        this.fieldValuesJson = fieldValuesJson;
        return this;
    }

    /** 협업 수정완료로 동적 필드 값 JSON 을 갱신한다. */
    public ApprovalLine overlayFieldValues(String fieldValuesJson) {
        guardCollabModifiable();
        this.fieldValuesJson = fieldValuesJson;
        return this;
    }

    /** APPROVED 전이 직후 승인 당시 레이아웃 참조를 결재 문서에 각인한다. */
    public ApprovalLine pinDocumentTemplate(UUID templateId, int revision) {
        if (getStatus() != ApprovalStatus.APPROVED) {
            throw new IllegalStateException("승인 완료 문서만 레이아웃을 각인할 수 있습니다");
        }
        if (templateId == null || revision <= 0) {
            throw new IllegalArgumentException("문서 양식 revision 참조가 유효하지 않습니다");
        }
        this.documentTemplateId = templateId;
        this.documentTemplateRevision = revision;
        this.documentTemplateDefaultPinned = false;
        return this;
    }

    /** 승인 순간 ACTIVE 양식이 없어서 내장 DEFAULT를 사용했다는 사실을 각인한다. */
    public ApprovalLine pinDefaultDocumentTemplate() {
        if (getStatus() != ApprovalStatus.APPROVED) {
            throw new IllegalStateException("승인 완료 문서만 기본 문서 양식을 각인할 수 있습니다");
        }
        if (this.documentTemplateId != null || this.documentTemplateRevision != null) {
            throw new IllegalStateException("문서 양식 revision이 이미 각인된 문서입니다");
        }
        this.documentTemplateDefaultPinned = true;
        return this;
    }

    private static void validateContentLength(String content) {
        if (content != null && content.length() > CONTENT_MAX_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "결재 본문은(는) " + CONTENT_MAX_LENGTH + "자 이하여야 합니다");
        }
    }
}
