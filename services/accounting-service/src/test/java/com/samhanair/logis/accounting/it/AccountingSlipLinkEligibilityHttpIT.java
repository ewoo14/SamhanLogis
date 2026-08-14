package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModel;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModelService;
import com.samhanair.logis.accounting.web.dto.OpaqueUuidSerializer;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

/** gateway가 실제로 전달하는 identity 헤더를 accounting HTTP 경계에서 검증한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AccountingSlipLinkEligibilityHttpIT extends AbstractPostgresIT {

    @LocalServerPort
    private int port;

    @MockBean
    private AccountingSlipLinkReadModelService readModelService;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @org.springframework.beans.factory.annotation.Autowired
    private TestRestTemplate restTemplate;

    @Test
    void gateway형_MASTER는_역할_헤더_없이_통과하고_SALES는_위조_역할도_거부한다() {
        UUID sourceId = UUID.randomUUID();
        when(readModelService.read(sourceId, "OUTBOUND")).thenReturn(confirmedReadModel());
        String url = "http://localhost:" + port + "/accounting/slip-links/eligibility"
                + "?sourceSlipIdToken=" + OpaqueUuidSerializer.encode(sourceId)
                + "&sourceSlipType=OUTBOUND&dailyAmountVerified=true";

        ResponseEntity<String> master = restTemplate.exchange(url, HttpMethod.GET,
                new HttpEntity<>(headers("master-user", "true", MASTER_GROUP, null)), String.class);
        ResponseEntity<String> sales = restTemplate.exchange(url, HttpMethod.GET,
                new HttpEntity<>(headers("sales-user", "false", SALES_GROUP, "MASTER")), String.class);

        assertThat(master.getStatusCode().value()).isEqualTo(200);
        assertThat(master.getBody()).contains("\"allowed\":true");
        assertThat(sales.getStatusCode().value()).isEqualTo(200);
        assertThat(sales.getBody()).contains("\"allowed\":false", "PERMISSION_DENIED");
    }

    private static HttpHeaders headers(String userId, String systemMaster, String groups, String role) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-User-Id", userId);
        headers.set("X-Is-System-Master", systemMaster);
        headers.set("X-User-Groups", groups);
        if (role != null) {
            headers.set("X-User-Role", role);
        }
        return headers;
    }

    private static AccountingSlipLinkReadModel confirmedReadModel() {
        return new AccountingSlipLinkReadModel(
                "OUT-20260814-001", "OUTBOUND", "CONFIRMED", "P-001",
                BigDecimal.valueOf(110000), BigDecimal.ZERO, BigDecimal.ZERO,
                List.of(), false);
    }

    private static final String MASTER_GROUP = "00000000-0000-0000-0000-000000000100";
    private static final String SALES_GROUP = "00000000-0000-0000-0000-000000000102";
}
