package com.samhanair.logis.notification.adapter;

/**
 * 채널 게이트웨이 호출 결과 — 성공 / 실패 / 메시지 ID / raw response.
 *
 * <p>{@link #success} 가 false 인 경우 service 레이어가 재시도 정책을 결정 (현 W3 시점은 1회 시도, retry=false).
 * Phase 10 시점에 retry-after-seconds + retryable 플래그 추가 (현재 기본 false).
 *
 * @param success 게이트웨이 200 + 결과 코드 OK
 * @param gatewayStatus 게이트웨이 결과 코드 ({@code SUCCESS} / {@code FAILURE_<code>})
 * @param messageId 게이트웨이 메시지 식별자 (null 가능)
 * @param rawResponse raw 응답 (디버깅 용, null 가능)
 * @param retryable 후속 재시도 권장 여부 (현 W3 = 모두 false)
 */
public record NotificationGatewayResult(
        boolean success,
        String gatewayStatus,
        String messageId,
        String rawResponse,
        boolean retryable) {

    public static NotificationGatewayResult success(String messageId, String rawResponse) {
        return new NotificationGatewayResult(true, "SUCCESS", messageId, rawResponse, false);
    }

    public static NotificationGatewayResult failure(String gatewayStatus, String rawResponse) {
        return new NotificationGatewayResult(false, gatewayStatus, null, rawResponse, false);
    }

    /** 외부 게이트웨이를 호출하지 않은 비전송 결과. 성공/SENT로 해석하지 않는다. */
    public static NotificationGatewayResult notSent(String gatewayStatus, String rawResponse) {
        return failure(gatewayStatus, rawResponse);
    }
}
