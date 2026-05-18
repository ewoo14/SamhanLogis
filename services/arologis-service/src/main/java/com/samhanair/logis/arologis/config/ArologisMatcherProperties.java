package com.samhanair.logis.arologis.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * DriverMatcher provider 설정 — Phase 10 W10-2 (W10-1 기반 확장).
 *
 * <ul>
 *   <li>{@code provider} = {@code mock} (default) | {@code insung-quick} (W10-2 통합 시점)</li>
 *   <li>{@code insungQuick.*} — 인성데이타 vendor 시크릿 + sandbox-mode 토글</li>
 *   <li>{@code notify.*} — 알림 채널 분리 (배차: insung-talk / 어플 invite: aligo)</li>
 *   <li>{@code gps.*} — GPS 하이브리드 우선순위 comma-list + stale threshold</li>
 * </ul>
 */
@Data
@ConfigurationProperties(prefix = "samhan.arologis.matcher")
public class ArologisMatcherProperties {

    /** DriverMatcher provider (mock | insung-quick). */
    private String provider = "mock";

    /** 인성데이타 퀵프로그램 vendor 설정. */
    private InsungQuick insungQuick = new InsungQuick();

    /** 알림 채널 분리 설정. */
    private Notify notify = new Notify();

    /** GPS 하이브리드 우선순위 설정. */
    private Gps gps = new Gps();

    /**
     * 인성데이타 퀵프로그램 vendor 시크릿 — Phase 10 W10-2.
     *
     * <p>운영 환경에서는 반드시 환경변수로 주입 (빈 값 / placeholder 금지).
     * {@code sandboxMode=true} (default) 시 실 API 호출 없이 mock 응답 반환.
     */
    @Data
    public static class InsungQuick {
        /** 인성 API 엔드포인트 URL (예: https://api.insung.co.kr). */
        private String apiUrl;
        /** 인성 API 인증 키. 빈 값 또는 placeholder 금지. */
        private String apiKey;
        /** 인성 partner ID (계약 코드). */
        private String partnerId;
        /**
         * sandbox-mode — {@code true} (default) 시 실 API 호출 없이 mock 응답 반환.
         * prod cutover 시 {@code false} 전환.
         */
        private boolean sandboxMode = true;
        /** 인성 webhook HMAC SHA-256 검증 secret. 운영 환경 필수 주입. */
        private String webhookSecret;
        /** 인성 API 호출 타임아웃 (ms). 기본 5000ms. */
        private int requestTimeoutMs = 5000;
    }

    /**
     * 알림 채널 분리 설정 — Phase 10 W10-2.
     *
     * <p>배차 단계 알림은 인성 알림톡 (insung-talk) 채널,
     * 기사 어플 invite 는 Aligo SMS 채널로 분리.
     */
    @Data
    public static class Notify {
        /** 배차 완료/매칭 알림 채널 (insung-talk | aligo). 기본 insung-talk. */
        private String dispatchChannel = "insung-talk";
        /** 기사 어플 설치 invite 알림 채널 (aligo). */
        private String inviteChannel = "aligo";
    }

    /**
     * GPS 하이브리드 우선순위 설정 — Phase 10 W10-2.
     *
     * <p>인성 LBS 우선 → 본 어플 GPS 보강 → 수동 fallback 순서.
     * comma-separated source 순서로 우선순위 결정.
     */
    @Data
    public static class Gps {
        /**
         * GPS 소스 우선순위 (comma-separated, 순서 중요).
         * 기본값: {@code insung-lbs,app-gps,manual}.
         */
        private String priority = "insung-lbs,app-gps,manual";
        /** insung-lbs 데이터 stale 판단 임계값 (ms). 기본 60초. */
        private long staleThresholdMs = 60000;
    }
}
