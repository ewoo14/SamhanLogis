package com.samhanair.logis.auth.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 비밀번호 재설정 인증 토큰 — P0-2 (docs/manual/00-시작하기/01-로그인.md §비밀번호 재설정).
 *
 * <p>6자리 숫자 인증번호의 SHA-256 해시를 {@code token_hash} 에 저장한다.
 * raw 인증번호는 절대 DB 에 보관하지 않는다 (보안 정책).
 *
 * <p>도메인 생성: {@link #create(UUID, String, LocalDateTime, String)}
 * 사용 완료: {@link #markUsed(LocalDateTime)}
 * 유효 여부: {@link #isValid(LocalDateTime)}
 *
 * <p>Soft-delete 는 {@link BaseEntity#markDeleted(String)} 경유만 허용.
 */
@Entity
@Getter
@Table(name = "password_reset_tokens")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PasswordResetToken extends BaseEntity {

    /** 토큰 만료 시간 — 발급 후 10 분 (rate-limit 과 짝). */
    public static final int TTL_MINUTES = 10;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 인증번호 대상 사용자 — accounts.id 와 1:N (사용자는 재발급 가능). */
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    /**
     * 6자리 인증번호의 SHA-256(HEX) 해시.
     * 평문 저장 금지 — 서비스 레이어에서 해시 후 전달.
     */
    @Column(name = "token_hash", nullable = false, updatable = false, length = 255)
    private String tokenHash;

    /** 토큰 만료 시점 — 발급 후 {@link #TTL_MINUTES} 분. */
    @Column(name = "expires_at", nullable = false, updatable = false)
    private LocalDateTime expiresAt;

    /** 사용 완료 여부 — true 이면 재사용 불가. */
    @Column(name = "used", nullable = false)
    private boolean used = false;

    /** 인증번호 confirm 완료 시점. */
    @Column(name = "used_at")
    private LocalDateTime usedAt;

    /** 요청자 IP 주소 (IPv4/IPv6). rate-limit 로그 + 감사용. */
    @Column(name = "requested_ip", length = 45)
    private String requestedIp;

    /** 낙관적 잠금 — 동시 confirm 이중 소비 방지. */
    @Version
    @Column(name = "version", nullable = false)
    private int version = 0;

    private PasswordResetToken(UUID userId, String tokenHash, LocalDateTime expiresAt, String requestedIp) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.requestedIp = requestedIp;
        this.used = false;
    }

    /**
     * 비밀번호 재설정 토큰 생성 팩토리 메서드.
     *
     * @param userId      대상 사용자 UUID
     * @param tokenHash   SHA-256(인증번호) hex 문자열 (호출자가 해시 후 전달)
     * @param expiresAt   만료 시점 ({@code now + 10분})
     * @param requestedIp 요청자 IP
     * @return 새 PasswordResetToken 인스턴스
     */
    public static PasswordResetToken create(
            UUID userId, String tokenHash, LocalDateTime expiresAt, String requestedIp) {
        return new PasswordResetToken(userId, tokenHash, expiresAt, requestedIp);
    }

    /**
     * 토큰 사용 완료 처리 — confirm 성공 시 호출.
     * {@code used = true}, {@code usedAt = now} 설정.
     *
     * @param now 현재 시각
     */
    public void markUsed(LocalDateTime now) {
        this.used = true;
        this.usedAt = now;
    }

    /**
     * 토큰 유효 여부 — 미만료 AND 미사용인 경우.
     *
     * <p>soft-delete 된 토큰은 {@code @SQLRestriction} 으로 쿼리 자체에서 필터되므로
     * 이 메서드 진입 시점에는 이미 비삭제 상태임. 안전을 위해 used + 만료만 추가 검증.
     *
     * @param now 현재 시각
     * @return 유효하면 {@code true}
     */
    public boolean isValid(LocalDateTime now) {
        return !this.used && now.isBefore(this.expiresAt);
    }
}
