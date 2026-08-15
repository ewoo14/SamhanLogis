package com.samhanair.logis.arologis.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

class HeaderAuthenticationFilterTest {

    private static final String ATTESTATION = UUID.randomUUID().toString();

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

        request.addHeader("X-Samhan-Gateway-Attestation", ATTESTATION);
        new HeaderAuthenticationFilter(ATTESTATION).doFilter(request, response, chain);

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
    void forgedIdentityWithoutGatewayAttestation_returnsUnauthorized() throws Exception {
        var request = new MockHttpServletRequest("GET", "/test");
        request.addHeader("X-User-Id", "forged-user");
        request.addHeader("X-User-Groups", "00000000-0000-0000-0000-000000000100");
        request.addHeader("X-Is-System-Master", "true");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        new HeaderAuthenticationFilter(ATTESTATION).doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void mismatchedGatewayAttestation_returnsUnauthorized() throws Exception {
        var request = new MockHttpServletRequest("GET", "/test");
        request.addHeader("X-User-Id", "forged-user");
        request.addHeader("X-Samhan-Gateway-Attestation", "wrong");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        new HeaderAuthenticationFilter(ATTESTATION).doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }
}
