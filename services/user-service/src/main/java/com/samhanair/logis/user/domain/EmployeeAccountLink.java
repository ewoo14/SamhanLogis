package com.samhanair.logis.user.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;

/** 직원 계정 연결 계획 및 건별 연결 근거를 보존하는 감사 엔티티. */
@Entity
@Getter
@Table(name = "employee_account_link_reconciliations")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class EmployeeAccountLink extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "plan_key", nullable = false, length = 40)
    private String planKey;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(name = "employee_name", nullable = false, length = 50)
    private String employeeName;

    @Column(name = "employee_login_id", nullable = false, length = 50)
    private String employeeLoginId;

    @Column(name = "old_account_id", nullable = false)
    private UUID oldAccountId;

    @Column(name = "target_account_id", nullable = false)
    private UUID targetAccountId;

    @Column(name = "match_reason", nullable = false, length = 200)
    private String matchReason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LinkStatus status;

    @Column(name = "applied_at")
    private LocalDateTime appliedAt;

    public EmployeeAccountLink(Employee employee, String planKey, UUID oldAccountId,
                               UUID targetAccountId, String matchReason) {
        this.id = UUID.randomUUID();
        this.planKey = planKey;
        this.employeeId = employee.getId();
        this.employeeName = employee.getFullName();
        this.employeeLoginId = employee.getLoginId();
        this.oldAccountId = oldAccountId;
        this.targetAccountId = targetAccountId;
        this.matchReason = matchReason;
        this.status = LinkStatus.PLANNED;
    }

    /** 계획을 적용 완료로 바꾼다. 직원 계정 변경과 같은 트랜잭션에서 호출한다. */
    public void markApplied() {
        this.status = LinkStatus.APPLIED;
        this.appliedAt = LocalDateTime.now();
    }
}
