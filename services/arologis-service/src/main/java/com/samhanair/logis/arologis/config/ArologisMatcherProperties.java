package com.samhanair.logis.arologis.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * DriverMatcher provider와 vendor 연동 설정.
 *
 * <ul>
 *   <li>{@code provider}: {@code mock} 또는 {@code insung-quick}</li>
 *   <li>{@code insungQuick.*}: 인성 퀵 vendor credential, sandbox, timeout</li>
 *   <li>{@code notify.*}: 알림 채널 분리. 배차 매칭은 aligo, 인성 알림톡은 향후 예약 채널</li>
 *   <li>{@code gps.*}: GPS source 우선순위와 stale 기준</li>
 * </ul>
 */
@Data
@ConfigurationProperties(prefix = "samhan.arologis.matcher")
public class ArologisMatcherProperties {

    /** DriverMatcher provider (mock | insung-quick). */
    private String provider = "mock";

    /** 인성 퀵 vendor 설정. */
    private InsungQuick insungQuick = new InsungQuick();

    /** 알림 채널 설정. */
    private Notify notify = new Notify();

    /** GPS source 우선순위 설정. */
    private Gps gps = new Gps();

    /** 인성 퀵 vendor 설정. */
    @Data
    public static class InsungQuick {
        /** 인성 API base URL. */
        private String apiUrl;
        /** 인성 API 인증 키. */
        private String apiKey;
        /** 인성 partner ID. */
        private String partnerId;
        /** true이면 실제 인성 API 호출 없이 mock 응답을 반환한다. */
        private boolean sandboxMode = true;
        /** 인성 webhook HMAC SHA-256 검증 secret. */
        private String webhookSecret;
        /** 인성 API 호출 timeout(ms). */
        private int requestTimeoutMs = 5000;
    }

    /** 알림 채널 분리 설정. */
    @Data
    public static class Notify {
        /** 배차 완료/매칭 알림 채널 (aligo). */
        private String dispatchChannel = "aligo";
        /** 기사 어플 설치 invite 알림 채널 (aligo). */
        private String inviteChannel = "aligo";
    }

    /** GPS source 우선순위 설정. */
    @Data
    public static class Gps {
        /** GPS source 우선순위. 기본값은 insung-lbs, app-gps, manual 순서. */
        private String priority = "insung-lbs,app-gps,manual";
        /** insung-lbs 데이터 stale 판단 임계값(ms). */
        private long staleThresholdMs = 60000;
    }
}
