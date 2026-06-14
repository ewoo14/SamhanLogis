package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 결재선 (전자결재 요청 1건). 요청자가 발의하고 chain 의 결재자가 순서대로 승인/반려.
 *
 * <p>chain 자체는 {@link ApprovalStep} 별도 entity 에 sequence ASC 로 보관 (`@OneToMany` +
 * `@OrderBy(sequence ASC)`). 본 entity 의 {@link #status} 는 chain 종합 상태:
 * <ul>
 *   <li>{@link ApprovalStatus#PENDING} — 1번째 결재자 처리 대기 (chain 미진행).</li>
 *   <li>{@link ApprovalStatus#IN_PROGRESS} — chain 일부 승인 + 후속 대기.</li>
 *   <li>{@link ApprovalStatus#APPROVED} — 모든 step 승인 완료.</li>
 *   <li>{@link ApprovalStatus#REJECTED} — chain 중 1명이라도 반려.</li>
 *   <li>{@link ApprovalStatus#WITHDRAWN} — 요청자 회수.</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — 응답 DTO 는 {@link #requesterId} 같은 UUID 를 외부 사용자 화면에 직접
 * 노출하지 않도록 호출 측에서 가공한다 (서비스 응답에는 구조 보존, controller 에서 화면용 ID 로 가공).
 */
@Entity
@Getter
@Table(name = "approval_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ApprovalLine extends BaseEntity {

    /** 협업 수정완료가 차단되는 물리 종결 상태. */
    private static final Set<ApprovalStatus> COLLAB_LOCKED_STATUSES =
            EnumSet.of(ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.WITHDRAWN);

    private static final int TITLE_MAX_LENGTH = 200;
    private static final int CONTENT_MAX_LENGTH = 2000;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 결재문서번호 — 전표번호 표준 {@code yyyy/MM/dd-N}. */
    @Column(name = "approval_no", nullable = false, length = 30)
    private String approvalNo;

    /** 요청자 user UUID (user-service). */
    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    /** 결재선 제목. */
    @Column(name = "title", nullable = false, length = 200)
    private String title;

    /** 결재선 본문 / 요청 사유. */
    @Column(name = "content", length = 2000)
    private String content;

    /** 결재유형 템플릿 UUID. null 이면 레거시 자유형 결재. */
    @Column(name = "template_id")
    private UUID templateId;

    /** 템플릿 fieldKey -> value JSON object 문자열. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_values", columnDefinition = "jsonb")
    private String fieldValuesJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ApprovalStatus status;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    /** chain — sequence ASC. */
    @OneToMany(mappedBy = "approvalLine", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sequence ASC")
    private List<ApprovalStep> steps = new ArrayList<>();

    private ApprovalLine(String approvalNo, UUID requesterId, String title, String content) {
        if (approvalNo == null || approvalNo.isBlank()) {
            throw new IllegalArgumentException("approvalNo 필수");
        }
        if (requesterId == null) {
            throw new IllegalArgumentException("requesterId 필수");
        }
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title 필수");
        }
        validateOverlayLength(title, "결재 제목", TITLE_MAX_LENGTH);
        validateOverlayLength(content, "결재 본문", CONTENT_MAX_LENGTH);
        this.approvalNo = approvalNo;
        this.requesterId = requesterId;
        this.title = title;
        this.content = content;
        this.status = ApprovalStatus.PENDING;
        this.version = 0L;
    }

    /**
     * 신규 결재선 발의. status=PENDING, chain 미부여 (caller 가 후속 {@link #appendStep} 호출 의무).
     *
     * @param approvalNo 채번된 결재문서번호 ({@code yyyy/MM/dd-N})
     * @param requesterId 요청자
     * @param title 제목
     * @param content 본문 (nullable)
     */
    public static ApprovalLine open(String approvalNo, UUID requesterId, String title, String content) {
        return new ApprovalLine(approvalNo, requesterId, title, content);
    }

    /**
     * 결재 chain 에 단계 추가. sequence 는 0-base 자동 할당.
     *
     * @param approverId 결재자 user UUID (요청자 본인 차단 — {@link IllegalArgumentException})
     * @return 신규 step (caller 가 별도 영속화 — cascade ALL)
     */
    public ApprovalStep appendStep(UUID approverId) {
        if (approverId == null) {
            throw new IllegalArgumentException("approverId 필수");
        }
        if (approverId.equals(this.requesterId)) {
            throw new IllegalArgumentException("요청자 본인은 결재자가 될 수 없습니다");
        }
        int nextSeq = this.steps.size();
        ApprovalStep step = ApprovalStep.create(this, approverId, nextSeq);
        this.steps.add(step);
        return step;
    }

    /**
     * 현재 처리해야 할 step (status=PENDING 중 sequence 최소).
     *
     * @return 처리 대기 step. chain 종료 / 미존재 시 {@code null}
     */
    public ApprovalStep currentStep() {
        return this.steps.stream()
                .filter(s -> s.getStatus() == ApprovalStepStatus.PENDING)
                .findFirst()
                .orElse(null);
    }

    /**
     * 결재자 승인. 본인 step 인지 + 종료 상태 아닌지 검증 후 step 승인 처리. chain 의 모든 step 이
     * 승인되면 본 결재선 status 를 APPROVED 로 전이.
     *
     * @param approverId 호출자 user UUID
     */
    public void approve(UUID approverId) {
        ensureMutable();
        ApprovalStep step = requireCurrentStepFor(approverId);
        step.approve();
        if (this.steps.stream().allMatch(s -> s.getStatus() == ApprovalStepStatus.APPROVED)) {
            this.status = ApprovalStatus.APPROVED;
        } else {
            this.status = ApprovalStatus.IN_PROGRESS;
        }
    }

    /**
     * 결재자 반려. step 반려 처리 + 본 결재선 status REJECTED 전이.
     *
     * @param approverId 호출자
     * @param reason 반려 사유 (선택)
     */
    public void reject(UUID approverId, String reason) {
        ensureMutable();
        ApprovalStep step = requireCurrentStepFor(approverId);
        step.reject(reason);
        this.status = ApprovalStatus.REJECTED;
    }

    /**
     * 요청자 회수 — chain 종료 전 본인 결재선 취소. 종료 상태 (APPROVED/REJECTED/WITHDRAWN)
     * 에서는 거부.
     */
    public void withdraw(UUID actorUserId) {
        if (!this.requesterId.equals(actorUserId)) {
            throw new IllegalStateException("요청자 본인만 회수할 수 있습니다");
        }
        ensureMutable();
        this.status = ApprovalStatus.WITHDRAWN;
    }

    /** 결재 chain 의 현재 시점 snapshot — 외부 호출자가 list 조작 불가. */
    public List<ApprovalStep> getStepsView() {
        return Collections.unmodifiableList(this.steps);
    }

    /**
     * 협업 수정완료 가능 상태인지 검증한다.
     *
     * <p>PENDING/IN_PROGRESS 는 title/content soft overlay 를 허용하고, APPROVED/REJECTED/WITHDRAWN
     * 은 물리 종결 상태이므로 409 로 차단한다.
     */
    public void guardCollabModifiable() {
        if (COLLAB_LOCKED_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "협업 수정완료가 불가능한 상태입니다: " + this.status);
        }
    }

    /** 협업 수정완료로 결재 제목을 덮어쓴다. */
    public ApprovalLine overlayTitle(String title) {
        guardCollabModifiable();
        if (title == null || title.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재 제목은 필수입니다");
        }
        validateOverlayLength(title, "결재 제목", TITLE_MAX_LENGTH);
        this.title = title;
        return this;
    }

    /** 협업 수정완료로 결재 본문을 덮어쓴다. */
    public ApprovalLine overlayContent(String content) {
        guardCollabModifiable();
        validateOverlayLength(content, "결재 본문", CONTENT_MAX_LENGTH);
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

    private static void validateOverlayLength(String value, String fieldName, int maxLength) {
        if (value != null && value.length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    fieldName + "은(는) " + maxLength + "자 이하여야 합니다");
        }
    }

    private void ensureMutable() {
        if (this.status == ApprovalStatus.APPROVED
                || this.status == ApprovalStatus.REJECTED
                || this.status == ApprovalStatus.WITHDRAWN) {
            throw new IllegalStateException("이미 종료된 결재선입니다: " + this.status);
        }
    }

    private ApprovalStep requireCurrentStepFor(UUID approverId) {
        ApprovalStep step = currentStep();
        if (step == null) {
            throw new IllegalStateException("처리 대기 중인 결재 단계가 없습니다");
        }
        if (!step.getApproverId().equals(approverId)) {
            throw new IllegalStateException("현재 결재 단계의 결재자가 아닙니다");
        }
        return step;
    }
}
