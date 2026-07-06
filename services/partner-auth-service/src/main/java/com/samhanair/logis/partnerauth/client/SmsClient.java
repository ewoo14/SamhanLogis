package com.samhanair.logis.partnerauth.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * sms-service 클라이언트 (Phase 7+ 예정).
 *
 * <p><b>현 PR (M2 W2):</b> 발송 요청을 로그로 큐잉만 한다 (실 발송 X).
 * IT 에서는 본 클라이언트를 {@code @MockBean} 으로 격리한다
 * (memory feedback_it_mockbean_external_clients.md).
 */
@Component
public class SmsClient {

    private static final Logger log = LoggerFactory.getLogger(SmsClient.class);

    /**
     * 임시 비밀번호 SMS 발송 큐잉 — 202 Accepted 시점.
     *
     * @param mobileNo 마스킹 전 원본 휴대폰 번호
     * @param tempPassword 임시 평문 (SMS 본문에 포함)
     */
    public void enqueueTempPassword(String mobileNo, String tempPassword) {
        // Phase 7 sms-service 구축 후 RestClient 또는 Kafka publish 로 교체.
        log.info("SmsClient.enqueueTempPassword: mobileNo masked, length={} (queued, no real send)",
                tempPassword.length());
    }

    /**
     * 비밀번호 재설정 시도 알림을 계정 소유자 연락처로 큐잉한다.
     *
     * <p>현재 구현은 기존 SMS 큐잉 스텁과 동일하게 감사 로그만 남긴다. 실제 sms-service 연동 시
     * 본 메서드를 별도 알림 템플릿 publish 로 교체한다.
     *
     * @param mobileNo 등록된 계정 소유자 휴대폰 번호
     */
    public void enqueuePasswordResetAttemptNotice(String mobileNo) {
        log.info("SmsClient.enqueuePasswordResetAttemptNotice: mobileNo masked (queued, no real send)");
    }
}
