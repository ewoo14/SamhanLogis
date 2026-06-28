package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.approval.ApprovalStepBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 그룹웨어 결재 chain 단계(concrete @Entity). 컬럼·전이 로직은 {@link ApprovalStepBase} 가 보유하고,
 * 본 클래스는 @Id 와 부모 {@link ApprovalLine} 으로의 @ManyToOne 역참조만 소유한다.
 */
@Entity
@Getter
@Table(name = "approval_steps")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ApprovalStep extends ApprovalStepBase {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "approval_line_id", nullable = false, updatable = false)
    private ApprovalLine approvalLine;

    private ApprovalStep(ApprovalLine line, UUID approverUserId, int sequence) {
        this.approvalLine = line;
        initUserStep(approverUserId, sequence);
    }

    private ApprovalStep(ApprovalLine line, UUID approverGroupId, String requiredPageCode, int sequence) {
        this.approvalLine = line;
        initGroupStep(approverGroupId, requiredPageCode, sequence);
    }

    /** USER 모드 단계 생성 — caller = {@link ApprovalLine#appendStep}. */
    static ApprovalStep createUser(ApprovalLine line, UUID approverUserId, int sequence) {
        return new ApprovalStep(line, approverUserId, sequence);
    }

    /** GROUP 모드 단계 생성 — caller = {@link ApprovalLine#appendGroupStep}. */
    static ApprovalStep createGroup(ApprovalLine line, UUID approverGroupId,
                                    String requiredPageCode, int sequence) {
        return new ApprovalStep(line, approverGroupId, requiredPageCode, sequence);
    }
}
