package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import com.samhanair.logis.common.http.HttpHeaderConstants;

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

        request.addHeader(HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER, "attestation");
        new HeaderAuthenticationFilter("attestation").doFilter(request, response, chain);

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
    void rejectsIdentityHeadersWithoutGatewayAttestation() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/v1/partner-orders");
        request.addHeader(HttpHeaderConstants.CALLER_ID_HEADER, "forged-user");
        var response = new MockHttpServletResponse();

        new HeaderAuthenticationFilter("attestation")
                .doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }
}
