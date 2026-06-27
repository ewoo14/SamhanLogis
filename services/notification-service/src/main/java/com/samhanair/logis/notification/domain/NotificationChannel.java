package com.samhanair.logis.notification.domain;

/**
 * 발송 채널.
 *
 * <ul>
 *   <li>{@link #PUSH} — 모바일 push.</li>
 *   <li>{@link #EMAIL} — 이메일 (Phase 10 SES 활성 대비 — 현 슬라이스는 placeholder 어댑터).</li>
 *   <li>{@link #SMS} — 한국 SMS (Aligo 통합 — Phase 5 SmsGateway 흡수).</li>
 * </ul>
 *
 * <p>각 채널은 {@code NotificationGateway} 구현체로 strategy pattern 매핑되며 channel 값으로
 * 어댑터 선택 (NotificationGatewayConfig).
 */
public enum NotificationChannel {

    PUSH,
    EMAIL,
    SMS
}
