package com.samhanair.logis.arologis.domain;

import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 아로로지스 직원 롤 변경 이력.
 *
 * <p>append-only 감사 로그이다. 변경 시각/변경자는 BaseEntity createdAt/createdBy 를 사용하고,
 * 동일 롤 변경 요청은 서비스에서 이력을 남기지 않는다.
 */
@Entity
@Getter
@Table(name = "arologis_role_change_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ArologisRoleChangeHistory extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_role", length = 32)
    private AdminUserRole previousRole;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_role", nullable = false, length = 32)
    private AdminUserRole newRole;

    @Column(name = "reason", length = 500)
    private String reason;

    private ArologisRoleChangeHistory(
            UUID employeeId,
            AdminUserRole previousRole,
            AdminUserRole newRole,
            String reason) {
        if (employeeId == null) {
            throw new IllegalArgumentException("employeeId 필수");
        }
        if (newRole == null) {
            throw new IllegalArgumentException("newRole 필수");
        }
        this.employeeId = employeeId;
        this.previousRole = previousRole;
        this.newRole = newRole;
        this.reason = reason == null || reason.isBlank() ? null : reason;
    }

    /** 롤 변경 이력 생성. previousRole 은 신규 부여 시 null 일 수 있다. */
    public static ArologisRoleChangeHistory record(
            UUID employeeId,
            AdminUserRole previousRole,
            AdminUserRole newRole,
            String reason) {
        return new ArologisRoleChangeHistory(employeeId, previousRole, newRole, reason);
    }
}
