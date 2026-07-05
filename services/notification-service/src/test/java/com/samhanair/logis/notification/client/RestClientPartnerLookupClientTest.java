package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * {@link RestClientPartnerLookupClient} 단위 테스트 — Phase 10 PR-E 진입 전 선행 BE-E.
 *
 * <p>{@link MockRestServiceServer} 로 partner-service internal endpoint 응답을 stub,
 * X-Internal-Token 헤더 / 200/404/409 분기 / fail-soft 동작을 검증.
 *
 * <h2>커버 케이스</h2>
 * <ol>
 *   <li>verifyPartnerCode — 200 + ApiResponse wrapper {@code data.partnerCode} 추출 정상</li>
 *   <li>verifyPartnerCode — 404 응답 → fail-soft empty</li>
 *   <li>findPartnerCodeByName — 200 + ApiResponse wrapper 추출 정상</li>
 *   <li>findPartnerCodeByName — 409 (다중 매칭) → fail-soft empty</li>
 *   <li>verifyPartnerCode — internalToken 미설정 시 외부 호출 회피 + empty</li>
 * </ol>
 */
class RestClientPartnerLookupClientTest {

    private static final String BASE_URL = "http://localhost:8095";
    private static final String INTERNAL_TOKEN = "test-internal-token";

    private MockRestServiceServer mockServer;
    private RestClientPartnerLookupClient client;

    @BeforeEach
    void setup() {
        ObjectMapper objectMapper = new ObjectMapper();
        RestClient.Builder builder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(builder).build();
        client = new RestClientPartnerLookupClient(builder, objectMapper, BASE_URL, INTERNAL_TOKEN);
    }

    @Test
    @DisplayName("case 1 — verifyPartnerCode 200 응답 정상 추출")
    void verifyPartnerCode_returns_code_when_200() {
        String responseBody = "{\"success\":true,\"data\":{"
                + "\"partnerId\":\"00000000-0000-0000-0000-000000000001\","
                + "\"partnerCode\":\"P-2026-0001\","
                + "\"name\":\"테스트사\","
                + "\"creditLimit\":1000000,"
                + "\"outstandingBalance\":0,"
                + "\"status\":\"ACTIVE\"}}";

        mockServer.expect(requestTo(BASE_URL + "/internal/partners/P-2026-0001"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(responseBody));

        Optional<String> result = client.verifyPartnerCode("P-2026-0001");

        assertThat(result).isPresent().contains("P-2026-0001");
        mockServer.verify();
    }

    @Test
    @DisplayName("case 2 — verifyPartnerCode 404 → fail-soft empty")
    void verifyPartnerCode_returns_empty_when_404() {
        mockServer.expect(requestTo(BASE_URL + "/internal/partners/P-NOT-FOUND"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        Optional<String> result = client.verifyPartnerCode("P-NOT-FOUND");

        assertThat(result).isEmpty();
        mockServer.verify();
    }

    @Test
    @DisplayName("case 3 — findPartnerCodeByName 200 응답 정상 추출")
    void findPartnerCodeByName_returns_code_when_200() {
        String responseBody = "{\"success\":true,\"data\":{"
                + "\"partnerId\":\"00000000-0000-0000-0000-000000000002\","
                + "\"partnerCode\":\"P-2026-0002\","
                + "\"name\":\"에스엠하나공조\","
                + "\"creditLimit\":2000000,"
                + "\"outstandingBalance\":150000,"
                + "\"status\":\"ACTIVE\"}}";

        // 한글 사업자명은 URL-encoded — UriUtils.encode("에스엠하나공조", UTF-8)
        mockServer.expect(requestTo(startsWith(BASE_URL + "/internal/partners/by-name?name=")))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(responseBody));

        Optional<String> result = client.findPartnerCodeByName("에스엠하나공조");

        assertThat(result).isPresent().contains("P-2026-0002");
        mockServer.verify();
    }

    @Test
    @DisplayName("case 3b — findPartnerCodeByName 한글 query 는 한 번만 URL 인코딩")
    void findPartnerCodeByName_encodes_korean_query_once() {
        String responseBody = "{\"success\":true,\"data\":{"
                + "\"partnerCode\":\"P-2026-0003\","
                + "\"name\":\"에어디자이너 주식회사\","
                + "\"creditLimit\":0,"
                + "\"outstandingBalance\":0,"
                + "\"status\":\"ACTIVE\"}}";

        mockServer.expect(requestTo(BASE_URL
                        + "/internal/partners/by-name?name=%EC%97%90%EC%96%B4%EB%94%94%EC%9E%90%EC%9D%B4%EB%84%88%20%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(responseBody));

        Optional<String> result = client.findPartnerCodeByName("에어디자이너 주식회사");

        assertThat(result).isPresent().contains("P-2026-0003");
        mockServer.verify();
    }

    @Test
    @DisplayName("case 4 — findPartnerCodeByName 409 (다중 매칭) → fail-soft empty")
    void findPartnerCodeByName_returns_empty_when_409() {
        mockServer.expect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.CONFLICT));

        Optional<String> result = client.findPartnerCodeByName("동일상호");

        assertThat(result).isEmpty();
        mockServer.verify();
    }

    @Test
    @DisplayName("case 5 — internalToken 미설정 시 외부 호출 회피 + empty")
    void verifyPartnerCode_returns_empty_when_token_blank() {
        // 별도 client — internalToken 빈 문자열
        ObjectMapper objectMapper = new ObjectMapper();
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer localServer = MockRestServiceServer.bindTo(builder).build();
        RestClientPartnerLookupClient noTokenClient =
                new RestClientPartnerLookupClient(builder, objectMapper, BASE_URL, "");

        // mockServer 에 expectation 등록 X — 호출 자체가 없어야 함
        Optional<String> verifyResult = noTokenClient.verifyPartnerCode("P-2026-0001");
        Optional<String> nameResult = noTokenClient.findPartnerCodeByName("테스트사");

        assertThat(verifyResult).isEmpty();
        assertThat(nameResult).isEmpty();
        // verify() 호출하지 않음 — expectation 0 인 상태에서 모든 호출이 회피되었는지 단지 결과로 검증
        // (MockRestServiceServer 는 unexpected 호출 시 자동 fail)
        localServer.verify();
    }
}
