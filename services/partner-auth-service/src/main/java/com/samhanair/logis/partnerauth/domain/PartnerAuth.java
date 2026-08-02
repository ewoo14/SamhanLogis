package com.samhanair.logis.partnerauth.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
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
 * 파트너 인증 정보 1건.
 *
 * <p>Owner 는 본 partner-auth-service. M3 dc-config-service 가 관리하는 거래처
 * 마스터(법인등록번호=bizNo, 거래처명, 대표자 등)와 1:1 매핑되며, bizNo 가
 * 비즈니스 식별자 역할을 한다 (UUID 비공개 — memory feedback_uuid_no_user_visibility.md).
 *
 * <p><b>핵심 비즈니스 로직 (legacy 100% 보존):</b>
 * <ul>
 *   <li>3회 연속 로그인 실패 시 LOCKED — Code.js:2847</li>
 *   <li>30일 미사용 시 LONG_UNUSED 슬라이딩 만료 — Code.js:2957</li>
 *   <li>password_history 5건 FIFO — 같은 비밀번호 5회 안 재사용 차단</li>
 * </ul>
 *
 * <p>Soft-delete 는 {@code @SQLRestriction("is_deleted = false")} 로 적용.
 */
@Entity
@Getter
@Table(name = "partner_auth")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerAuth extends BaseEntity {

    /** 3회 연속 실패 시 락 (Code.js:2847 — CONSISTENCY 결정). */
    public static final int FAIL_LOCK_THRESHOLD = 3;

    /** 30일 미사용 시 LONG_UNUSED (Code.js:2957 — CONSISTENCY 결정). */
    public static final int LONG_UNUSED_DAYS = 30;

    /** password_history FIFO 5건 (legacy 보존). */
    public static final int PASSWORD_HISTORY_SIZE = 5;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 사업자등록번호 — 비즈니스 식별자 (UNIQUE). */
    @Column(name = "biz_no", nullable = false, unique = true, length = 12)
    private String bizNo;

    /** 파트너 코드 (M3 dc-config 의 partner_code 와 동일 — 디버그/감사용 캐시). */
    @Column(name = "partner_code", length = 30)
    private String partnerCode;

    /** DelegatingPasswordEncoder 가 직접 처리: {@code {bcrypt}...} 또는 {@code {sha256}...} prefix. */
    @Column(name = "password_hash", length = 200)
    private String passwordHash;

    /** 비밀번호 해시 이력 (FIFO 5건 — 직전 5건 재사용 차단). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "password_history", columnDefinition = "jsonb")
    private List<String> passwordHistory = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PartnerStatus status;

    /** 연속 실패 횟수 (성공 시 0 으로 reset). */
    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts = 0;

    /** 마지막 로그인 성공 시각 (인증 이력용이며 장기미발주 판정에는 사용하지 않음). */
    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    /** 마지막 비밀번호 변경 시각 (90일 강제 변경 기준). */
    @Column(name = "password_changed_at")
    private LocalDateTime passwordChangedAt;

    /** 관리자 장기미발주 복구 시각 — 일반 로그인과 분리된 복구 유예 기준. */
    @Column(name = "access_restored_at")
    private LocalDateTime accessRestoredAt;

    /** PC 튜토리얼 완료 여부. */
    @Column(name = "tutorial_pc_done", nullable = false)
    private boolean tutorialPcDone = false;

    /** 모바일 튜토리얼 완료 여부. */
    @Column(name = "tutorial_mobile_done", nullable = false)
    private boolean tutorialMobileDone = false;

    /** PENDING 가입 신청 메모 (관리자 검토용). */
    @Column(name = "register_memo", length = 500)
    private String registerMemo;

    private PartnerAuth(String bizNo, String partnerCode, PartnerStatus status, String registerMemo) {
        this.bizNo = bizNo;
        this.partnerCode = partnerCode;
        this.status = status;
        this.registerMemo = registerMemo;
    }

    /** 신규 가입 신청 (status = PENDING). */
    public static PartnerAuth register(String bizNo, String partnerCode, String memo) {
        return new PartnerAuth(bizNo, partnerCode, PartnerStatus.PENDING, memo);
    }

    /** legacy 마이그용 — 이미 비밀번호가 있는 row 시드. */
    public static PartnerAuth seedFromLegacy(
            String bizNo, String partnerCode, String passwordHash, PartnerStatus status) {
        PartnerAuth pa = new PartnerAuth(bizNo, partnerCode, status, null);
        pa.passwordHash = passwordHash;
        pa.passwordChangedAt = LocalDateTime.now();
        return pa;
    }

    /** 비밀번호 설정 / 변경 — 5건 history 검증은 service 에서 선행. */
    public void changePassword(String newHash) {
        if (this.status == PartnerStatus.PENDING) {
            throw new IllegalStateException("관리자 승인 전에는 비밀번호를 설정할 수 없습니다");
        }
        if (this.passwordHash != null) {
            // FIFO 5건 유지
            Deque<String> dq = new ArrayDeque<>(this.passwordHistory == null ? List.of() : this.passwordHistory);
            dq.addLast(this.passwordHash);
            while (dq.size() > PASSWORD_HISTORY_SIZE) {
                dq.pollFirst();
            }
            this.passwordHistory = new ArrayList<>(dq);
        }
        this.passwordHash = newHash;
        this.passwordChangedAt = LocalDateTime.now();
        this.failedAttempts = 0;
        // 승인 또는 임시 PIN 검증을 통과한 NEED_PW_SET 만 정상 로그인 대기 상태로 전환한다.
        if (this.status == PartnerStatus.NEED_PW_SET) {
            this.status = PartnerStatus.NEED_PW_INPUT;
        }
    }

    /** 임시 비밀번호 발급 — status = NEED_PW_SET. */
    public void issueTempPassword(String tempHash) {
        if (this.status == PartnerStatus.PENDING) {
            throw new IllegalStateException("관리자 승인 전에는 임시 비밀번호를 발급할 수 없습니다");
        }
        if (this.passwordHash != null) {
            Deque<String> dq = new ArrayDeque<>(this.passwordHistory == null ? List.of() : this.passwordHistory);
            dq.addLast(this.passwordHash);
            while (dq.size() > PASSWORD_HISTORY_SIZE) {
                dq.pollFirst();
            }
            this.passwordHistory = new ArrayList<>(dq);
        }
        this.passwordHash = tempHash;
        this.passwordChangedAt = LocalDateTime.now();
        this.failedAttempts = 0;
        this.status = PartnerStatus.NEED_PW_SET;
    }

    /** 로그인 성공 mark — failedAttempts reset + lastLoginAt 갱신. */
    public void markLoginSuccess(LocalDateTime now) {
        this.failedAttempts = 0;
        this.lastLoginAt = now;
        if (this.status == PartnerStatus.NEED_PW_INPUT || this.status == PartnerStatus.LONG_UNUSED) {
            // 정상 로그인 시점에 NEED_PW_INPUT 유지 또는 LONG_UNUSED 해제 → NEED_PW_INPUT
            this.status = PartnerStatus.NEED_PW_INPUT;
        }
    }

    /** 로그인 실패 mark — failedAttempts+1, 3회 도달 시 LOCKED. */
    public void markLoginFailure() {
        this.failedAttempts += 1;
        if (this.failedAttempts >= FAIL_LOCK_THRESHOLD) {
            this.status = PartnerStatus.LOCKED;
        }
    }

    /** 30일 슬라이딩 만료 마킹 — service 가 GET /partner-status 에서 평가. */
    public void markLongUnused() {
        this.status = PartnerStatus.LONG_UNUSED;
    }

    /**
     * 장기미사용 거래처의 관리자 승인 복구 — 인증 입력 대기 상태로 전환하고 만료 기준을 복구 시점으로 갱신한다.
     *
     * <p>복구하지 않은 거래처의 30일 판정은 기존 {@link #expirationAt()} 규칙을 그대로 적용한다.
     */
    public void restoreFromLongUnused() {
        if (this.status != PartnerStatus.LONG_UNUSED) {
            throw new IllegalStateException(PartnerStatus.LONG_UNUSED.getDisplayName()
                    + " 상태에서만 승인 복구 가능: " + this.status.getDisplayName());
        }
        this.status = PartnerStatus.NEED_PW_INPUT;
        // 관리자 복구를 일반 로그인과 구분되는 접근 기준시각으로 기록한다.
        this.accessRestoredAt = LocalDateTime.now();
    }

    /** 관리자 승인 (PENDING → NEED_PW_SET — 임시 비밀번호 발급 직전). */
    public void approvePending() {
        if (this.status != PartnerStatus.PENDING) {
            throw new IllegalStateException(PartnerStatus.PENDING.getDisplayName()
                    + " 상태에서만 승인 가능: " + this.status.getDisplayName());
        }
        this.status = PartnerStatus.NEED_PW_SET;
    }

    /** 관리자 차단. */
    public void denyAccess() {
        this.status = PartnerStatus.ACCESS_DENIED;
    }

    /** 락 해제 (관리자 수동). */
    public void unlock() {
        this.failedAttempts = 0;
        if (this.status == PartnerStatus.LOCKED) {
            this.status = PartnerStatus.NEED_PW_INPUT;
        }
    }

    /** PC 튜토리얼 완료 표시. */
    public void completePcTutorial() {
        this.tutorialPcDone = true;
    }

    /** 모바일 튜토리얼 완료 표시. */
    public void completeMobileTutorial() {
        this.tutorialMobileDone = true;
    }

    /** 30일 슬라이딩 만료 일시 계산 — service 의 GET /partner-expiration 가 호출. */
    public LocalDateTime expirationAt() {
        return expirationAt(LONG_UNUSED_DAYS);
    }

    /**
     * 설정된 기간을 적용한 접근 만료 일시 계산.
     *
     * <p>복구 유예 표시용 기준은 관리자 복구 시각이다. 일반 로그인·비밀번호 변경
     * 시각은 장기미발주 판정에 사용하지 않는다.
     *
     * @param unusedDays 장기미사용으로 볼 기간(일)
     * @return 만료 일시, 기준 시각이 없으면 {@code null}
     */
    public LocalDateTime expirationAt(int unusedDays) {
        if (unusedDays < 1 || unusedDays > 365) {
            throw new IllegalArgumentException("장기미사용 기간은 1~365일이어야 합니다");
        }
        LocalDateTime base = accessRestoredAt;
        return base == null ? null : base.plusDays(unusedDays);
    }

    /** Read-only history view (테스트/감사용). */
    public List<String> getPasswordHistoryView() {
        return passwordHistory == null ? List.of() : Collections.unmodifiableList(passwordHistory);
    }
}
