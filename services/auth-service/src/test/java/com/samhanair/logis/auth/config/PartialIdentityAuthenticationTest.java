package com.samhanair.logis.auth.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PartialIdentityAuthenticationTest {
    @Test
    void groupsWithoutUserIdAre401() throws Exception {
        var request = new MockHttpServletRequest("GET", "/protected-test");
        request.addHeader("X-User-Groups", "group-1");
        request.addHeader("X-Samhan-Gateway-Attestation", "attestation");
        var response = new MockHttpServletResponse();

        new HeaderAuthenticationFilter("attestation", true).doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }
}
