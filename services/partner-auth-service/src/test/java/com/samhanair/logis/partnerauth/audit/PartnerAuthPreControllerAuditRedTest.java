package com.samhanair.logis.partnerauth.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.partnerauth.audit.PartnerAuthPreControllerAuditFilter;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PartnerAuthPreControllerAuditRedTest {
    @Test
    void validationFailureBeforeControllerIsPublishedAsBFailureWithoutSecretFields() throws Exception {
        AuditPublisher publisher = mock(AuditPublisher.class);
        PartnerAuthPreControllerAuditFilter filter = new PartnerAuthPreControllerAuditFilter(publisher);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/partner-login");
        request.addHeader("User-Agent", "Bearer-secret-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> ((MockHttpServletResponse) res).setStatus(400);

        filter.doFilter(request, response, chain);

        var captor = org.mockito.ArgumentCaptor.forClass(com.samhanair.logis.shared.audit.contract.AuditEventV2.class);
        verify(publisher).publishAfterCommit(captor.capture());
        var event = captor.getValue();
        assertThat(event.action()).isEqualTo(com.samhanair.logis.shared.audit.contract.AuditEnums.AuditAction.B_FAILURE);
        assertThat(event.description()).doesNotContain("secret", "password", "token");
        assertThat(event.userAgent()).isNull();
    }
}
