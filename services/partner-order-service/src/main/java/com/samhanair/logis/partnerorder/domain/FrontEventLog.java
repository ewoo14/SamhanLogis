package com.samhanair.logis.partnerorder.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 프론트 액션 로그 (legacy logFrontEvent 8252 → 본 entity). silent fail 가드 — 실패해도 호출 응답
 * 200 으로 반환. 90일 보존 (운영 schedule 또는 로그 분리 정책 — 슬라이스 외).
 *
 * <p>{@link #partnerCode} nullable — mobile-gate 진입 직전 (로그인 전) 액션도 기록 가능.
 */
@Entity
@Getter
@Table(name = "partner_order_front_event_log")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class FrontEventLog extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 로그인 후 액션은 채워짐, 로그인 전 액션 (mobile-gate 진입) 은 null. */
    @Column(name = "partner_code", length = 50)
    private String partnerCode;

    @Column(name = "biz_code", length = 20)
    private String bizCode;

    /** legacy 의 action 인자 — '로그인 시도' / '주문 전송' 등 짧은 라벨. */
    @Column(name = "action", nullable = false, length = 100)
    private String action;

    /** legacy 의 detail 인자 — JSON 또는 자유 텍스트. PostgreSQL TEXT — Hibernate 6 OID 회피. */
    @Column(name = "detail", columnDefinition = "TEXT")
    private String detail;

    /** 사용자 IP (gateway 가 X-Forwarded-For 로 전달). */
    @Column(name = "client_ip", length = 45)
    private String clientIp;

    /** User-Agent (mobile / desktop 분기 용). */
    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Column(name = "logged_at", nullable = false)
    private LocalDateTime loggedAt;

    private FrontEventLog(String partnerCode, String bizCode, String action, String detail,
                          String clientIp, String userAgent) {
        if (action == null || action.isBlank()) {
            throw new IllegalArgumentException("action 필수");
        }
        this.partnerCode = partnerCode;
        this.bizCode = bizCode;
        this.action = action;
        this.detail = detail;
        this.clientIp = clientIp;
        this.userAgent = userAgent;
        this.loggedAt = LocalDateTime.now();
    }

    /**
     * 프론트 액션 로그 1건 생성. silent fail 가드 — 호출자는 예외를 swallow.
     *
     * @return 신규 FrontEventLog (영속화 전)
     */
    public static FrontEventLog of(String partnerCode, String bizCode, String action,
                                   String detail, String clientIp, String userAgent) {
        return new FrontEventLog(partnerCode, bizCode, action, detail, clientIp, userAgent);
    }
}
