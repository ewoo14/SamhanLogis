package com.samhanair.logis.notification.adapter.push;

import com.samhanair.logis.notification.adapter.NotificationGateway;
import com.samhanair.logis.notification.adapter.NotificationGatewayResult;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;

/**
 * Push 채널 게이트웨이 marker — FCM (Android Firebase Cloud Messaging) 기반.
 *
 * <p>구현체:
 * <ul>
 *   <li>{@link FcmPushAdapter} — 운영 (FCM credentials 필요)</li>
 *   <li>{@link MockPushAdapter} — test profile (모든 호출 success)</li>
 * </ul>
 */
public interface PushAdapter extends NotificationGateway {

    @Override
    default NotificationChannel channel() {
        return NotificationChannel.PUSH;
    }

    /**
     * 특정 FCM registration token 으로 PUSH 를 1회 발송한다.
     *
     * <p>기본 구현은 기존 단일 gateway 계약을 보존한다. FCM 구현체는 토큰별 발송을 override 한다.
     */
    default NotificationGatewayResult sendToToken(NotificationRequest request, String token) {
        return send(request);
    }
}
