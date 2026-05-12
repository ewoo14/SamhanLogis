package com.samhanair.logis.partnerauth.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * dc-config-service (M3) 호출 설정 ({@code samhan.dc-config.*}).
 *
 * <p>현 PR 단계 (M2 W2) 는 직접 base URL 을 사용. W3 정식 구현 시점에
 * Eureka {@code lb://dc-config-service} 로 전환 예정.
 *
 * <p>3d backlog (본 PR): {@code internal-token} 으로 dc-config-service 의
 * {@code X-Internal-Token} 가드를 통과한다. shared secret 는 {@code SAMHAN_INTERNAL_TOKEN}
 * env (dc-config-service 와 동일 값) 으로 주입.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "samhan.dc-config")
public class DcConfigClientProperties {

    /** dc-config-service base URL (예: http://dc-config-service:8089). */
    private String url = "http://dc-config-service:8089";

    /** 호출 타임아웃 (ms). */
    private int timeoutMs = 3000;

    /** dc-config-service {@code /internal/**} 가드 통과용 X-Internal-Token 값. */
    private String internalToken;
}
