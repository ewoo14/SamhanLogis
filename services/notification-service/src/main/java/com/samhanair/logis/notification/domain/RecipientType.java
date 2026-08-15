package com.samhanair.logis.notification.domain;

/**
 * 수신자 타입.
 *
 * <ul>
 *   <li>{@link #USER} — 사내 user (user-service 의 employees UUID).</li>
 *   <li>{@link #PARTNER} — 거래처 user (partner-service / partner-auth-service UUID).</li>
 *   <li>{@link #EXTERNAL_PHONE} — 사용자 식별자 없는 외부 전화번호 (SMS 한정 — 일회성 OTP 등).</li>
 *   <li>{@link #EXTERNAL_EMAIL} — 사용자 식별자 없는 외부 이메일 주소.</li>
 * </ul>
 *
 * <p>USER / PARTNER 는 recipient_id (UUID) + 부가 채널 주소 (선택), EXTERNAL_PHONE 은 recipient_address (전화번호) 의무.
 */
public enum RecipientType {

    USER,
    PARTNER,
    EXTERNAL_PHONE,
    EXTERNAL_EMAIL
}
