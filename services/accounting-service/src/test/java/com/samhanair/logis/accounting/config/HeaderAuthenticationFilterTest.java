package com.samhanair.logis.accounting.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

class HeaderAuthenticationFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void ignoresUserRoleHeaderAndKeepsGroupAuthorities() throws Exception {
        var request = new MockHttpServletRequest("GET", "/test");
        request.addHeader("X-User-Id", "user-1");
        request.addHeader("X-User-Role", "MASTER");
        request.addHeader("X-User-Groups",
                "11111111-1111-1111-1111-111111111111, 22222222-2222-2222-2222-222222222222");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        new HeaderAuthenticationFilter(new ObjectMapper()).doFilter(request, response, chain);

        var authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(authentication).isNotNull();
        assertThat(authentication.getAuthorities())
                .extracting("authority")
                .containsExactly(
                        "GROUP_11111111-1111-1111-1111-111111111111",
                        "GROUP_22222222-2222-2222-2222-222222222222")
                .doesNotContain("ROLE_MASTER");
    }

    @Test
    void gateway의_검증된_system_master_표시를_전용_authority로_변환한다() throws Exception {
        var request = new MockHttpServletRequest("GET", "/test");
        request.addHeader("X-User-Id", "master-user");
        request.addHeader("X-Is-System-Master", "true");
        var response = new MockHttpServletResponse();

        new HeaderAuthenticationFilter(new ObjectMapper()).doFilter(
                request, response, new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
                .extracting("authority")
                .containsExactly("SYSTEM_MASTER");
    }
}
