package com.samhanair.logis.dashboard.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PublicIdentityHeaderSanitizingFilterTest {

    @Test
    void publicRequestPhysicallyHidesAllInboundIdentityHeadersFromDownstream() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/version");
        HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.forEach(header -> request.addHeader(header, "forged-value"));
        FilterChain chain = mock(FilterChain.class);

        new PublicIdentityHeaderSanitizingFilter().doFilter(
                request, new MockHttpServletResponse(), chain);

        var captured = org.mockito.ArgumentCaptor.forClass(HttpServletRequest.class);
        verify(chain).doFilter(captured.capture(), org.mockito.ArgumentMatchers.any(HttpServletResponse.class));
        HttpServletRequest downstream = captured.getValue();
        assertThat(Collections.list(downstream.getHeaderNames()))
                .doesNotContainAnyElementsOf(HttpHeaderConstants.INBOUND_IDENTITY_HEADERS);
        HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.forEach(header -> assertThat(downstream.getHeader(header)).isNull());
    }

    @Test
    void protectedRequestKeepsGatewayHeadersForAttestationFilter() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/releases");
        request.addHeader(HttpHeaderConstants.CALLER_ID_HEADER, "gateway-user");
        FilterChain chain = mock(FilterChain.class);

        new PublicIdentityHeaderSanitizingFilter().doFilter(
                request, new MockHttpServletResponse(), chain);

        var captured = org.mockito.ArgumentCaptor.forClass(HttpServletRequest.class);
        verify(chain).doFilter(captured.capture(), org.mockito.ArgumentMatchers.any(HttpServletResponse.class));
        assertThat(captured.getValue().getHeader(HttpHeaderConstants.CALLER_ID_HEADER)).isEqualTo("gateway-user");
    }
}
