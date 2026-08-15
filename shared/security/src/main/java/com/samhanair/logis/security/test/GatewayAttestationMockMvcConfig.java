package com.samhanair.logis.security.test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcBuilderCustomizer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Spring Boot 통합 테스트의 정상 MockMvc 요청을 gateway ingress 계약과 맞춘다.
 *
 * <p>실행 환경의 attestation만 사용하고, 값이 없으면 테스트 컨텍스트도 fail-closed 한다.
 * 보안 필터 단위 테스트처럼 이 설정을 import하지 않는 테스트의 401 계약에는 영향을 주지 않는다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class GatewayAttestationMockMvcConfig {

    @Bean
    MockMvcBuilderCustomizer gatewayAttestationDefaultRequest(
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String attestation) {
        if (attestation == null || attestation.isBlank()) {
            throw new IllegalStateException("SAMHAN_GATEWAY_ATTESTATION is required for MockMvc integration tests");
        }
        return builder -> builder.defaultRequest(
                get("/").header(HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER, attestation));
    }
}
