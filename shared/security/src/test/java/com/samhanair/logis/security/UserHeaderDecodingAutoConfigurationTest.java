package com.samhanair.logis.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.boot.web.servlet.FilterRegistrationBean;

/**
 * AutoConfiguration.imports 삭제나 servlet 조건 회귀를 컴파일 단계에서 잡는 가드.
 */
class UserHeaderDecodingAutoConfigurationTest {

    private final WebApplicationContextRunner contextRunner = new WebApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(UserHeaderDecodingAutoConfiguration.class));

    @Test
    void servlet_context_registers_userHeaderDecodingFilterRegistration() {
        contextRunner.run(context -> {
            assertThat(context).hasBean("userHeaderDecodingFilterRegistration");
            assertThat(context.getBean("userHeaderDecodingFilterRegistration"))
                    .isInstanceOf(FilterRegistrationBean.class);
        });
    }
}
