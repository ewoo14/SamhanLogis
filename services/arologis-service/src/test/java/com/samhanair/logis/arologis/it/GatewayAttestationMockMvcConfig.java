package com.samhanair.logis.arologis.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcBuilderCustomizer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/** MockMvc gateway 요청에 실제 ingress attestation 계약을 적용한다. */
@TestConfiguration(proxyBeanMethods = false)
public class GatewayAttestationMockMvcConfig {

    public static final String ATTESTATION = "test-gateway-attestation";

    @Bean
    MockMvcBuilderCustomizer gatewayAttestationDefaultRequest() {
        return builder -> builder.defaultRequest(
                get("/").header("X-Samhan-Gateway-Attestation", ATTESTATION));
    }
}
