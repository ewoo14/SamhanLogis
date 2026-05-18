package com.samhanair.logis.notification.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 배차안내 SMS 실 발송 응답 (PR-E1 BE-4).
 *
 * @param date 배차일 (요청 echo)
 * @param sent 성공 발송 건수
 * @param failed 실패 발송 건수 (게이트웨이 4xx/5xx)
 * @param blocked BLOCKED 가드로 자동 제외된 건수
 * @param details 발송 결과 상세 (감사용 — partnerCode + status + 실패 사유)
 */
public record DispatchBatchSendResponse(
        LocalDate date,
        int sent,
        int failed,
        int blocked,
        List<SendResultDetail> details) {

    /**
     * 발송 결과 1건 — 감사 / 운영 대응 용.
     *
     * @param partnerCode 거래처코드
     * @param recipientPhone 수신 번호
     * @param status SENT / FAILED / BLOCKED
     * @param reason 실패 / 차단 사유 (성공 시 null)
     * @param msgId Aligo 발급 메시지 ID (성공 시만 존재, null 가능 — SP-09-2 운영 추적)
     * @param gatewayRaw Aligo 게이트웨이 raw 응답 JSON (디버깅 / 감사용, null 가능)
     */
    public record SendResultDetail(
            String partnerCode,
            String recipientPhone,
            String status,
            String reason,
            String msgId,
            String gatewayRaw) {

        /**
         * BLOCKED / 기본 entry 생성 — msgId / gatewayRaw 없음.
         *
         * @param partnerCode 거래처코드
         * @param recipientPhone 수신 번호
         * @param status SENT / FAILED / BLOCKED
         * @param reason 사유
         */
        public SendResultDetail(String partnerCode, String recipientPhone,
                                String status, String reason) {
            this(partnerCode, recipientPhone, status, reason, null, null);
        }
    }
}
