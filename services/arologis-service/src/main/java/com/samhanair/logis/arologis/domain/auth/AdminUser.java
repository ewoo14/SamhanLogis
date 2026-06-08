package com.samhanair.logis.arologis.domain.auth;

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
 * 아로로지스 admin 사용자 — 2026-05-14 분리 (자체 user 도메인).
 *
 * <p>arologis-desktop 로그인 사용자. loginId (사용자 노출 식별자) 가 활성 행 기준 unique
 * (partial unique index 가드). UUID 비공개 가드 — id 는 사용자 화면 노출 X.
 *
 * <p>BaseEntity 7 audit + Soft Delete (`@SQLRestriction`) 의무.
 */
@Entity
@Getter
@Table(name = "auth_admin_user")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AdminUser extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 사용자 노출 식별자 — 활성 행 기준 unique. UUID 노출 회피. */
    @Column(name = "login_id", nullable = false, length = 64)
    private String loginId;

    @Column(name = "password_hash", nullable = false, length = 200)
    private String passwordHash;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 32)
    private AdminUserRole role;

    private AdminUser(String loginId, String passwordHash, String name, AdminUserRole role) {
        if (loginId == null || loginId.isBlank()) {
            throw new IllegalArgumentException("loginId 필수");
        }
        if (passwordHash == null || passwordHash.isBlank()) {
            throw new IllegalArgumentException("passwordHash 필수");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 필수");
        }
        if (role == null) {
            throw new IllegalArgumentException("role 필수");
        }
        this.loginId = loginId;
        this.passwordHash = passwordHash;
        this.name = name;
        this.role = role;
    }

    /**
     * 신규 admin 사용자 생성.
     *
     * @param loginId 사용자 노출 식별자 (활성 행 unique)
     * @param passwordHash BCrypt strength 10 해시
     * @param name 사용자 이름
     * @param role 권한
     * @return 영속화 가능한 신규 인스턴스
     */
    public static AdminUser create(String loginId, String passwordHash, String name, AdminUserRole role) {
        return new AdminUser(loginId, passwordHash, name, role);
    }

    /** 비밀번호 해시 갱신 (변경 시점에 자체 호출). */
    public void updatePasswordHash(String newPasswordHash) {
        if (newPasswordHash == null || newPasswordHash.isBlank()) {
            throw new IllegalArgumentException("passwordHash 필수");
        }
        this.passwordHash = newPasswordHash;
    }

    /** HR 직원명 수정과 로그인 계정 표시명을 동기화한다. */
    public void updateName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 필수");
        }
        this.name = name;
    }

    /** HR 롤 변경 시 AdminUser 권한을 갱신한다. */
    public void updateRole(AdminUserRole role) {
        if (role == null) {
            throw new IllegalArgumentException("role 필수");
        }
        this.role = role;
    }
}
