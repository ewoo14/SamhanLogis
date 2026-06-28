package com.samhanair.logis.groupware.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.RETURNS_SELF;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.web.client.RestClient;

/** GroupwareApprovalLineConfigClient 운영 생성자 DI 가드 테스트. */
class GroupwareApprovalLineConfigClientDiGuardTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(ClientDiGuardConfig.class);

    @Test
    void groupwareApprovalLineConfigClient_operationalConstructor_isAutowired() {
        contextRunner.run(context -> assertThat(context)
                .hasNotFailed()
                .hasSingleBean(GroupwareApprovalLineConfigClient.class));
    }

    @Configuration(proxyBeanMethods = false)
    @Import(GroupwareApprovalLineConfigClient.class)
    static class ClientDiGuardConfig {

        @Bean("loadBalancedRestClientBuilder")
        RestClient.Builder loadBalancedRestClientBuilder() {
            RestClient.Builder builder = mock(RestClient.Builder.class, RETURNS_SELF);
            when(builder.build()).thenReturn(mock(RestClient.class));
            return builder;
        }

        @Bean
        InternalAuthProperties internalAuthProperties() {
            return new InternalAuthProperties();
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }
}
