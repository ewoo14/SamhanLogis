package com.samhanair.logis.arologis.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * DriverMatcher provider와 vendor 연동 설정.
 *
 * <ul>
 *   <li>{@code provider}: {@code mock} 또는 {@code insung-quick}</li>
 *   <li>{@code insungQuick.*}: 인성 퀵 vendor credential, sandbox, timeout</li>
 *   <li>{@code notify.*}: <b>RESERVED(현재 미사용)</b> — 알림 vendor-채널 분리 설계 예약 필드.
 *       실제 배차 매칭 알림은 {@code DispatchService} 가 aligo 채널로 하드코딩 발송한다.
 *       상세는 {@link Notify} 참고 (PR #816 ③-B 리뷰 FIX 3)</li>
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

    /** 알림 채널 설정 — RESERVED(현재 미사용). {@link Notify} 참고. */
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

    /**
     * 알림 채널 분리 설정 — <b>RESERVED(현재 미사용)</b>.
     *
     * <p>{@code dispatchChannel}/{@code inviteChannel} 은 {@code @ConfigurationProperties} 로
     * 바인딩되고 환경변수로 override 가능하지만, 정작 이 값을 읽는 코드는 아직 없다.
     * {@code DispatchService.sendAndRecordDispatchNotification} 이 배차 매칭 알림을 현재
     * 알리고(ALIGO) 채널로 하드코딩 발송하기 때문이다. 인성데이타 알림톡 등 vendor 별 채널
     * 실제 라우팅이 구현되는 시점(W10-2)까지, 설계 문서(samhan-dispatch-board)가 참조하는
     * 예약 필드로 유지한다 — 삭제 금지 (PR #816 ③-B 리뷰 FIX 3).
     */
    @Data
    public static class Notify {
        /** 배차 완료/매칭 알림 채널 — RESERVED. 실제 발송은 DispatchService가 aligo로 하드코딩. */
        private String dispatchChannel = "aligo";
        /** 기사 어플 설치 invite 알림 채널 — RESERVED. 아직 어떤 코드도 읽지 않는다. */
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
