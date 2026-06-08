package com.samhanair.logis.arologis.domain;

import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 아로로지스 행정직원.
 *
 * <p>직원 1명은 자체 로그인 계정인 {@link AdminUser} 1개와 1:1로 연결된다. loginId 는 화면과
 * API에서 사용하는 업무 식별자이며 UUID 는 사용자에게 노출하지 않는다.
 *
 * <p>퇴직은 terminationDate 설정 후 직원과 AdminUser 를 모두 soft-delete 한다.
 */
@Entity
@Getter
@Table(name = "arologis_employee")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ArologisEmployee extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admin_user_id", nullable = false)
    private AdminUser adminUser;

    @Column(name = "login_id", nullable = false, length = 64)
    private String loginId;

    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @Column(name = "position", length = 30)
    private String position;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id", nullable = false)
    private ArologisDepartment department;

    @Column(name = "hire_date", nullable = false)
    private LocalDate hireDate;

    @Column(name = "termination_date")
    private LocalDate terminationDate;

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "phone", length = 20)
    private String phone;

    private ArologisEmployee(
            AdminUser adminUser,
            String loginId,
            String fullName,
            String position,
            ArologisDepartment department,
            LocalDate hireDate,
            String email,
            String phone) {
        validateRequired(adminUser, loginId, fullName, department, hireDate);
        this.adminUser = adminUser;
        this.loginId = loginId;
        this.fullName = fullName;
        this.position = blankToNull(position);
        this.department = department;
        this.hireDate = hireDate;
        this.email = blankToNull(email);
        this.phone = blankToNull(phone);
    }

    /** 신규 직원 생성. AdminUser 는 같은 트랜잭션에서 먼저 생성된 계정이어야 한다. */
    public static ArologisEmployee create(
            AdminUser adminUser,
            String loginId,
            String fullName,
            String position,
            ArologisDepartment department,
            LocalDate hireDate,
            String email,
            String phone) {
        return new ArologisEmployee(adminUser, loginId, fullName, position, department, hireDate, email, phone);
    }

    /** 직원 기본 정보 갱신. loginId/hireDate/AdminUser 연결은 변경하지 않는다. */
    public void updateProfile(
            String fullName,
            String position,
            ArologisDepartment department,
            String email,
            String phone) {
        validateRequired(this.adminUser, this.loginId, fullName, department, this.hireDate);
        this.fullName = fullName;
        this.position = blankToNull(position);
        this.department = department;
        this.email = blankToNull(email);
        this.phone = blankToNull(phone);
        this.adminUser.updateName(fullName);
    }

    /** 퇴직 처리. 호출자는 AdminUser 도 같은 actor 로 soft-delete 해야 한다. */
    public void terminate(LocalDate terminationDate, String actor) {
        if (terminationDate == null) {
            throw new IllegalArgumentException("terminationDate 필수");
        }
        this.terminationDate = terminationDate;
        markDeleted(actor);
    }

    private static void validateRequired(
            AdminUser adminUser,
            String loginId,
            String fullName,
            ArologisDepartment department,
            LocalDate hireDate) {
        if (adminUser == null) {
            throw new IllegalArgumentException("adminUser 필수");
        }
        if (loginId == null || loginId.isBlank()) {
            throw new IllegalArgumentException("loginId 필수");
        }
        if (fullName == null || fullName.isBlank()) {
            throw new IllegalArgumentException("fullName 필수");
        }
        if (department == null) {
            throw new IllegalArgumentException("department 필수");
        }
        if (hireDate == null) {
            throw new IllegalArgumentException("hireDate 필수");
        }
    }

    private static String blankToNull(String raw) {
        return raw == null || raw.isBlank() ? null : raw;
    }
}
