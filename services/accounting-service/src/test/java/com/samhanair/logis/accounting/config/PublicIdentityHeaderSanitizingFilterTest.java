package com.samhanair.logis.accounting.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PublicIdentityHeaderSanitizingFilterTest {

    @Test
    void publicRequestHidesInboundIdentityHeaders() throws Exception {
        var request = new MockHttpServletRequest("GET", "/actuator/health");
        HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.forEach(header -> request.addHeader(header, "forged-value"));
        var chain = mock(jakarta.servlet.FilterChain.class);

        new PublicIdentityHeaderSanitizingFilter().doFilter(request, new MockHttpServletResponse(), chain);

        var captured = org.mockito.ArgumentCaptor.forClass(HttpServletRequest.class);
        verify(chain).doFilter(captured.capture(), org.mockito.ArgumentMatchers.any(HttpServletResponse.class));
        assertThat(Collections.list(captured.getValue().getHeaderNames()))
                .doesNotContainAnyElementsOf(HttpHeaderConstants.INBOUND_IDENTITY_HEADERS);
    }
}
