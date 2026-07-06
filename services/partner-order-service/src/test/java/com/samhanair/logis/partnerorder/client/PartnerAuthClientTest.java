package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * PartnerAuthClient service-to-service RestClient 계약테스트.
 *
 * <p>수신측 실 계약 기준(partner-auth-service {@code PartnerAuthController}):
 * <ul>
 *   <li>{@code GET /api/v1/auth/partner-status} — 쿼리 파라미터 {@code bizNo} (partnerCode 아님)</li>
 *   <li>{@code PATCH /api/v1/auth/partner-tutorial} — 바디 {@code TutorialUpdateRequest(bizNo,
 *       platform, done)} (partnerCode/completed 아님)</li>
 * </ul>
 *
 * <p>PR #746(#22) 라운드1 fix — 이전 버전은 partnerCode/completed 를 전송해 위 계약과 불일치했다
 * (실행되면 404/400 이 되었을 결함). 본 테스트는 {@code @MockBean} 우회 없이 실 URI/바디 계약을
 * 고정한다.
 */
class PartnerAuthClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String BIZ_NO = "1234567890";
    private static final String STATUS_ENDPOINT =
            "http://partner-auth-service/api/v1/auth/partner-status?bizNo=" + BIZ_NO;
    private static final String TUTORIAL_ENDPOINT =
            "http://partner-auth-service/api/v1/auth/partner-tutorial";

    private MockRestServiceServer server;
    private PartnerAuthClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://partner-auth-service");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PartnerAuthClient(builder.build(), props(TOKEN));
    }

    @Test
    void verifyPartnerSendsInternalTokenAndBizNoQueryAndParsesStatusEnvelope() {
        server.expect(once(), requestTo(STATUS_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"bizNo":"%s","status":"OK"}}
                        """.formatted(BIZ_NO), MediaType.APPLICATION_JSON));

        Map<String, Object> result = client.verifyPartner(BIZ_NO);

        assertThat(result).containsEntry("success", true);
        server.verify();
    }

    @Test
    void verifyPartnerMaps4xxToForbiddenAnd5xxToInternalError() {
        server.expect(once(), requestTo(STATUS_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.LOCKED));
        server.expect(once(), requestTo(STATUS_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.verifyPartner(BIZ_NO))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN));
        assertThatThrownBy(() -> client.verifyPartner(BIZ_NO))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void verifyPartnerWithBlankInternalTokenFailsFastWithoutHttpCall() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://partner-auth-service");
        MockRestServiceServer blankServer = MockRestServiceServer.bindTo(builder).build();
        PartnerAuthClient blankClient = new PartnerAuthClient(builder.build(), props(" "));

        // 등록된 expectation 없음 — requireToken() 이 HTTP 호출 이전에 fail-fast 해야 한다.
        // 만약 실수로 호출을 시도하면 MockRestServiceServer 가 AssertionError(Error, RuntimeException
        // 아님) 를 던져 catch(BusinessException)/catch(RuntimeException) 를 모두 우회하고 테스트가 실패한다.
        assertThatThrownBy(() -> blankClient.verifyPartner(BIZ_NO))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        blankServer.verify();
    }

    @Test
    void patchTutorialStateSendsInternalTokenAndBizNoPlatformDoneBodyButIsFailSoft() {
        server.expect(once(), requestTo(TUTORIAL_ENDPOINT))
                .andExpect(method(HttpMethod.PATCH))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.bizNo").value(BIZ_NO))
                .andExpect(jsonPath("$.platform").value("PC"))
                .andExpect(jsonPath("$.done").value(true))
                .andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        client.patchTutorialState(BIZ_NO, "PC", true);

        server.verify();
    }

    @Test
    void patchTutorialStateWithBlankInternalTokenFailsSoftWithoutHttpCall() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://partner-auth-service");
        MockRestServiceServer blankServer = MockRestServiceServer.bindTo(builder).build();
        PartnerAuthClient blankClient = new PartnerAuthClient(builder.build(), props(""));

        // fail-soft 설계상 예외가 밖으로 전파되면 안 된다. requireToken() 실패가 catch(RuntimeException)
        // 에 흡수되어야 하며, 동시에 HTTP 호출이 실제 시도되지 않아야 한다(시도 시 AssertionError 로 노출).
        assertThatCode(() -> blankClient.patchTutorialState(BIZ_NO, "PC", true))
                .doesNotThrowAnyException();
        blankServer.verify();
    }

    private static InternalAuthProperties props(String token) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(token);
        return props;
    }
}
