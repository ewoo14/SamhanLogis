package com.samhanair.logis.partnerorder.mig8.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * PartnerMig8LookupClient RestClient 계약테스트 — partner-service 실 수신 DTO
 * ({@code PartnerInternalResponse}: partnerId/partnerCode/name/bizNo/creditLimit/
 * outstandingBalance/status) 기준. {@code @MockBean} 우회 없이 실 JSON 파싱 경로를 검증한다.
 *
 * <p>PR #746(#22) 라운드1 회귀 배경 — {@code businessNo}/{@code businessRegistrationNumber} 등
 * partner-service 응답에 실제로 존재하지 않는 별칭 키만으로 bizCode 를 찾던 구현은 항상 empty 를
 * 반환해 MIG-8 partner-order 이식이 100% partner lookup miss 로 reject 되었다(회귀 이전에는
 * {@code Mig8OrderImportServiceIT} 가 본 client 를 {@code @MockBean} 으로 완전히 우회해 실 파싱
 * 경로가 한 번도 검증되지 않았다). 실 응답 필드명은 {@code bizNo} 하나뿐이다.
 */
class PartnerMig8LookupClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final UUID PARTNER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final String SUMMARY_ENDPOINT =
            "http://partner-service/internal/partners/" + PARTNER_ID + "/summary";

    private MockRestServiceServer server;
    private PartnerMig8LookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PartnerMig8LookupClient(builder, props(TOKEN), new ObjectMapper());
    }

    @Test
    void findByPartnerId_실_PartnerInternalResponse_bizNo_필드를_파싱한다() {
        server.expect(requestTo(SUMMARY_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                            "partnerId":"%s",
                            "partnerCode":"P-MIG8",
                            "name":"삼한테스트",
                            "bizNo":"1234567890",
                            "creditLimit":5000000,
                            "outstandingBalance":0,
                            "status":"ACTIVE"
                        }}
                        """.formatted(PARTNER_ID), MediaType.APPLICATION_JSON));

        Optional<PartnerMig8Summary> result = client.findByPartnerId(PARTNER_ID);

        assertThat(result).isPresent();
        assertThat(result.get().partnerId()).isEqualTo(PARTNER_ID);
        assertThat(result.get().partnerCode()).isEqualTo("P-MIG8");
        assertThat(result.get().bizCode()).isEqualTo("1234567890");
        assertThat(result.get().partnerName()).isEqualTo("삼한테스트");
        server.verify();
    }

    @Test
    void findByPartnerId_bizNo_없는_응답은_empty를_반환한다() {
        // partner-service 가 bizNo 를 채우지 못한 예외 케이스(예: 데이터 결손) 방어 — lookup miss 로 처리.
        server.expect(requestTo(SUMMARY_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                            "partnerId":"%s",
                            "partnerCode":"P-MIG8",
                            "name":"삼한테스트",
                            "creditLimit":5000000,
                            "outstandingBalance":0,
                            "status":"ACTIVE"
                        }}
                        """.formatted(PARTNER_ID), MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerId(PARTNER_ID)).isEmpty();
        server.verify();
    }

    @Test
    void findByPartnerId_404면_empty를_반환한다() {
        server.expect(requestTo(SUMMARY_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findByPartnerId(PARTNER_ID)).isEmpty();
        server.verify();
    }

    @Test
    void findByPartnerId_401이면_FORBIDDEN_BusinessException을_던진다() {
        server.expect(requestTo(SUMMARY_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.findByPartnerId(PARTNER_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN));
        server.verify();
    }

    @Test
    void findByPartnerId_blank_토큰이면_HTTP_호출없이_INTERNAL_ERROR를_던진다() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer blankServer = MockRestServiceServer.bindTo(builder).build();
        PartnerMig8LookupClient blankClient =
                new PartnerMig8LookupClient(builder, props(" "), new ObjectMapper());

        // 등록된 expectation 없음 — requireToken() 이 HTTP 호출 이전에 fail-fast 해야 한다.
        assertThatThrownBy(() -> blankClient.findByPartnerId(PARTNER_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        blankServer.verify();
    }

    private static InternalAuthProperties props(String token) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(token);
        return props;
    }
}
