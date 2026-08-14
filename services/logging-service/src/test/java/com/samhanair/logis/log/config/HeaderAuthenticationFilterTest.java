package com.samhanair.logis.log.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

class HeaderAuthenticationFilterTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void gatewayHeaders_replacePreexistingAnonymousAuthentication() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(new AnonymousAuthenticationToken(
                "key", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/logs/dlq");
        request.addHeader("X-User-Id", "00000000-0000-0000-0000-000000000001");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = new MockFilterChain();

        new HeaderAuthenticationFilter().doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication().getName())
                .isEqualTo("00000000-0000-0000-0000-000000000001");
    }
}
