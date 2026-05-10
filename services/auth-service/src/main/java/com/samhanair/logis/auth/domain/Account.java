package com.samhanair.logis.auth.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.security.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 인증 도메인 루트 — login_id / 비밀번호 hash / role / 잠금 상태 / 비밀번호 history 보유.
 *
 * <p>Soft-delete 만 사용 ({@link SQLRestriction} 으로 select 단계 자동 필터). Phase 10 P0-2
 * (manual 06-트러블슈팅/01-로그인-실패.md §1-3) 에서 다음 필드가 추가됨:
 *
 * <ul>
 *     <li>{@code failedLoginAttempts} — 5 회 실패 시 자동 잠금 카운터</li>
 *     <li>{@code lockedAt} — 잠금 시점 (NULL = 정상)</li>
 *     <li>{@code passwordChangedAt} — 비밀번호 마지막 변경 시점 (JWT 무효 비교 기준)</li>
 *     <li>{@code passwordHistory} — 최근 5 개 BCrypt hash (reuse 금지)</li>
 *     <li>{@code passwordResetToken} + {@code passwordResetTokenExpiresAt} — 단일 사용 reset 토큰 (30 분)</li>
 * </ul>
 */
@Entity
@Getter
@Table(name = "accounts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Account extends BaseEntity {

    /** 5 회 실패 시 자동 잠금 — 매뉴얼 §2 정책 (P0-2). */
    public static final int MAX_FAILED_LOGIN_ATTEMPTS = 5;

    /** history reuse 금지 보유 갯수 — 매뉴얼 §1-3 (P0-2). */
    public static final int PASSWORD_HISTORY_SIZE = 5;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "login_id", nullable = false, unique = true, length = 50)
    private String loginId;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private Role role;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    /** 5 회 누적 시 잠금 — login 성공 시 0 reset. */
    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts = 0;

    /** 잠금 시점. NULL = 정상. MASTER unlock 시 NULL 로 복구. */
    @Column(name = "locked_at")
    private LocalDateTime lockedAt;

    /** 비밀번호 마지막 변경 시점 — JWT 발급 iat 와 비교하여 변경 이전 token 거절. */
    @Column(name = "password_changed_at")
    private LocalDateTime passwordChangedAt;

    /** 최근 5 개 BCrypt hash JSONB 배열. reuse 금지 검증에 사용. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "password_history", columnDefinition = "jsonb", nullable = false)
    private List<String> passwordHistory = new ArrayList<>();

    /**
     * 등록된 이메일 주소 — 비밀번호 재설정 요청 시 loginId 와 교차 검증 (P0-2).
     * V3 migration 추가 컬럼, nullable.
     */
    @Column(name = "email", length = 255)
    private String email;

    /** 단일 사용 reset 토큰 (UUID4). confirm 성공 시 NULL. */
    @Column(name = "password_reset_token", length = 255)
    private String passwordResetToken;

    /** reset 토큰 만료 시점 — 발급 후 30 분. */
    @Column(name = "password_reset_token_expires_at")
    private LocalDateTime passwordResetTokenExpiresAt;

    private Account(String loginId, String passwordHash, String displayName, Role role) {
        this.loginId = loginId;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.role = role;
        this.enabled = true;
        this.passwordHistory = new ArrayList<>();
    }

    public static Account create(String loginId, String passwordHash, String displayName, Role role) {
        return new Account(loginId, passwordHash, displayName, role);
    }

    /**
     * Provisioning factory — User Service 가 미리 발급한 UUID 로 row 를 영속화.
     * Hibernate {@code @GeneratedValue} 우회를 위해 id 선세팅.
     */
    public static Account createWithId(UUID id, String loginId, String passwordHash, String displayName, Role role) {
        Account account = new Account(loginId, passwordHash, displayName, role);
        account.id = id;
        return account;
    }

    public void markLogin(LocalDateTime now) {
        this.lastLoginAt = now;
        this.failedLoginAttempts = 0;
    }

    public void changeRole(Role role) {
        this.role = role;
    }

    public void changeDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public void disable() {
        this.enabled = false;
    }

    // ---------------------------------------------------------------------
    // Phase 10 P0-2 — 잠금 / 비밀번호 변경 / reset 토큰
    // ---------------------------------------------------------------------

    /**
     * 로그인 실패 카운터 증가. {@link #MAX_FAILED_LOGIN_ATTEMPTS} 도달 시 자동 잠금.
     *
     * @return 잠금이 트리거되었는지 여부 (호출자 로깅 용)
     */
    public boolean incrementFailedLogin(LocalDateTime now) {
        this.failedLoginAttempts++;
        if (this.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS && this.lockedAt == null) {
            this.lockedAt = now;
            return true;
        }
        return false;
    }

    /** 잠금 여부 — {@code lockedAt} 비-NULL 이면 잠금. */
    public boolean isLocked() {
        return this.lockedAt != null;
    }

    /** MASTER unlock — 잠금 해제 + 카운터 초기화. */
    public void unlock() {
        this.lockedAt = null;
        this.failedLoginAttempts = 0;
    }

    /**
     * 비밀번호 변경 — 현재 hash 를 history 에 push 후 신규 hash 로 교체.
     * history 는 최근 {@link #PASSWORD_HISTORY_SIZE} 개만 유지 (FIFO).
     * {@code passwordChangedAt} 갱신 시 기존 JWT 가 무효화 됨.
     */
    public void changePassword(String newHash, LocalDateTime now) {
        if (this.passwordHistory == null) {
            this.passwordHistory = new ArrayList<>();
        }
        // 새 list 인스턴스 — Hibernate dirty-check 가 reference 변화 추적하도록 보장
        List<String> next = new ArrayList<>(this.passwordHistory);
        if (this.passwordHash != null) {
            next.add(0, this.passwordHash);
        }
        if (next.size() > PASSWORD_HISTORY_SIZE) {
            next = new ArrayList<>(next.subList(0, PASSWORD_HISTORY_SIZE));
        }
        this.passwordHistory = next;
        this.passwordHash = newHash;
        this.passwordChangedAt = now;
        // reset 토큰 무효화
        this.passwordResetToken = null;
        this.passwordResetTokenExpiresAt = null;
        // 비밀번호 변경 시 잠금 자동 해제 (MASTER 가 직접 reset 시키는 경로 포함)
        this.failedLoginAttempts = 0;
        this.lockedAt = null;
    }

    /**
     * 이메일 주소 등록/변경 — 비밀번호 재설정 교차 검증 용.
     *
     * @param email 등록할 이메일 주소
     */
    public void changeEmail(String email) {
        this.email = email;
    }

    /** reset 토큰 발급 — 30 분 만료. 기존 토큰은 덮어씀. */
    public void issueResetToken(String token, LocalDateTime expiresAt) {
        this.passwordResetToken = token;
        this.passwordResetTokenExpiresAt = expiresAt;
    }

    /** reset 토큰 유효 여부 — 미만료 + 토큰 일치. */
    public boolean isResetTokenValid(String token, LocalDateTime now) {
        return this.passwordResetToken != null
                && this.passwordResetToken.equals(token)
                && this.passwordResetTokenExpiresAt != null
                && now.isBefore(this.passwordResetTokenExpiresAt);
    }

    /** history 에 후보 hash 가 이미 존재하는지 (reuse 검증용). 현재 hash 는 별도 비교. */
    public List<String> getPasswordHistorySnapshot() {
        return this.passwordHistory == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(this.passwordHistory);
    }
}
