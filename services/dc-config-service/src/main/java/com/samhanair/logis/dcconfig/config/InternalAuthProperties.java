package com.samhanair.logis.dcconfig.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 내부 서비스 간 호출 인증용 공유 시크릿.
 * `app.security.internal.token` (env override: {@code INTERNAL_AUTH_TOKEN}).
 *
 * <p>DC 노출 5겹 가드 의 5번째 — internal token 검증 항목.
 */
@Data
@ConfigurationProperties(prefix = "app.security.internal")
public class InternalAuthProperties {

    private String token;
}
