package com.samhanair.logis.shared.audit.publisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import com.samhanair.logis.shared.audit.contract.AuditEventV2;

class AuditRequestCaptureInterceptorTest {
    @Test
    void completedRequest_publishesOneEventWithStableRequestIdAndOutcome() throws Exception {
        AuditPublisher publisher = mock(AuditPublisher.class);
        AuditRequestCaptureInterceptor interceptor =
                new AuditRequestCaptureInterceptor("dc-config-service", publisher);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/dc-configs");
        request.addHeader("X-Request-Id", "req-1161");
        request.addHeader("X-Trace-Id", "trace-1161");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(200);

        interceptor.preHandle(request, response, new Object());
        interceptor.afterCompletion(request, response, new Object(), null);

        var captor = org.mockito.ArgumentCaptor.forClass(AuditEventV2.class);
        verify(publisher).publish(captor.capture());
        assertThat(captor.getValue().requestId()).isEqualTo("req-1161");
        assertThat(captor.getValue().traceId()).isEqualTo("trace-1161");
        assertThat(captor.getValue().routeTemplate()).isEqualTo("/api/v1/dc-configs");
        assertThat(captor.getValue().httpStatus()).isEqualTo(200);
    }
}
