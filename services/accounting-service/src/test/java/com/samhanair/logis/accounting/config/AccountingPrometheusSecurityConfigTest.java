package com.samhanair.logis.accounting.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * accounting-service Prometheus actuator 의 ROLE_ 의존 제거 회귀 테스트.
 *
 * <p>(사이클1 BE P2-1) {@code hasRole("MASTER")} → {@code authenticated()} 전환이 보안 등가인 이유:
 * 실 게이트는 {@code InternalTokenFilter}(path-prefix=/actuator/prometheus,
 * allow-missing-token=false) — 토큰 없는 요청은 필터에서 401 종료되어 인가 단계에 도달하지
 * 않는다. C5 이후 ROLE_MASTER authority 가 생성되지 않으므로 구 hasRole 은 always-false
 * dead-gate 였고, authenticated() 가 동일 실효 + 도달 가능 시맨틱이다.
 */
class AccountingPrometheusSecurityConfigTest {

    @Test
    void prometheus_endpoint_doesNotDependOnRoleAuthority() throws IOException {
        String source = Files.readString(Path.of(
                "src/main/java/com/samhanair/logis/accounting/config/SecurityConfig.java"));

        assertThat(source)
                .contains("InternalTokenFilter")
                .contains(".requestMatchers(\"/actuator/prometheus\").authenticated()")
                .doesNotContain(".requestMatchers(\"/actuator/prometheus\").hasRole(\"MASTER\")")
                .contains(".addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)");
    }
}
