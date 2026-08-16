package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

/**
 * S4a R-5: 실제 임의 TCP 포트 HTTP에서 정산 VIEW guard가 403 원문을 반환하는지 검증한다.
 *
 * <p>local 프로필의 H2 in-memory만 사용하므로 공유 DB write가 없다. 배포 JAR나 MockMvc가
 * 아닌 Spring Boot embedded server + TestRestTemplate 경로를 사용한다.
 */
@SpringBootTest(
        classes = AccountingServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT
)
@TestPropertySource(properties = {
        "spring.profiles.active=local",
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "app.security.internal.token=test-internal-token"
})
class SalesCommissionSettlementHttpGuardIT {

    private static final String PAGE_CODE = "accounting.sales-commission-settlement";
    private static final UUID SALES_ACCOUNT_ID = UUID.fromString("00000000-0000-0000-0000-000000000901");

    @Autowired
    private TestRestTemplate restTemplate;

    @Value("${SAMHAN_GATEWAY_ATTESTATION}")
    private String gatewayAttestation;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    // 외부 서비스는 격리한다. deny 판정은 정산 controller 진입 전에 끝나므로 호출되지 않는다.
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;

    @Test
    @DisplayName("SALES 토큰의 정산 목록 실제 HTTP 요청은 403과 원문 FORBIDDEN envelope를 반환한다")
    void salesTokenCannotViewSettlementOverRealHttp() {
        when(dynamicPermissionClient.check(
                eq(SALES_ACCOUNT_ID), eq(PAGE_CODE), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Samhan-Gateway-Attestation", gatewayAttestation);
        headers.set("X-User-Id", SALES_ACCOUNT_ID.toString());
        headers.set("X-User-Role", "SALES");

        ResponseEntity<String> response = restTemplate.exchange(
                "/accounting/sales-commission-settlements?page=0&size=20",
                org.springframework.http.HttpMethod.GET,
                new HttpEntity<>(headers),
                String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(response.getBody())
                .contains("\"success\":false")
                .contains("\"code\":\"FORBIDDEN\"")
                .contains("동적 권한 deny")
                .contains(PAGE_CODE)
                .contains("action=VIEW");
    }
}
