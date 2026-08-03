package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** MIG-12 partner-service lookup 내부 인증 회귀 가드. */
class PartnerLookupClientTest {

    private static final String TOKEN = "test-token";
    private static final UUID PARTNER_ID =
            UUID.fromString("11111111-1111-1111-1111-111111111111");

    private MockRestServiceServer server;
    private PartnerLookupClient client;

    @BeforeEach
    void setUp() {
        // #831 R-6: 프로덕션 생성자가 이제 자체 timeout requestFactory 를 builder 에 설정하므로
        // (MockRestServiceServer 의 mock requestFactory 를 덮어써 버림), 테스트는 MockRestServiceServer
        // 로 이미 바인딩된 RestClient 를 "빌드까지 마친 뒤" 테스트 전용 생성자로 주입한다
        // (ApprovalLineAuthorizeClient/AuthAccountLookupClient 테스트와 동일 관례).
        RestClient.Builder builder = RestClient.builder().baseUrl("http://partner-service");
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new PartnerLookupClient(builder.build(), props, new ObjectMapper());
    }

    @Test
    void token_null은_MIG12_INTERNAL_AUTH_MISS_throw() {
        InternalAuthProperties props = new InternalAuthProperties();
        PartnerLookupClient noTokenClient =
                new PartnerLookupClient(RestClient.builder().build(), props, new ObjectMapper());

        assertThatThrownBy(() -> noTokenClient.findByPartnerCode("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
    }

    @Test
    void token_blank는_MIG12_INTERNAL_AUTH_MISS_throw() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        PartnerLookupClient noTokenClient =
                new PartnerLookupClient(RestClient.builder().build(), props, new ObjectMapper());

        assertThatThrownBy(() -> noTokenClient.findByPartnerCode("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
    }

    @Test
    void findByPartnerCode_401은_MIG12_INTERNAL_AUTH_MISS_throw() {
        server.expect(requestTo("http://partner-service/internal/partners/P-001"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.findByPartnerCode("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }

    @Test
    void findByPartnerCode_403은_MIG12_INTERNAL_AUTH_MISS_throw() {
        server.expect(requestTo("http://partner-service/internal/partners/P-001"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> client.findByPartnerCode("P-001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }

    @Test
    void findByPartnerCodeResult는_404와_5xx를_NOT_FOUND_UNAVAILABLE로_구분한다() {
        server.expect(requestTo("http://partner-service/internal/partners/P-404"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo("http://partner-service/internal/partners/P-503"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThat(client.findByPartnerCodeResult("P-404").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.NOT_FOUND);
        assertThat(client.findByPartnerCodeResult("P-503").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerNameResult는_partner_service_5xx를_UNAVAILABLE로_보존한다() {
        server.expect(requestTo("http://partner-service/internal/partners/by-name?name=%EC%9E%A5%EC%95%A0%EA%B1%B0%EB%9E%98%EC%B2%98"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        assertThat(client.findByPartnerNameResult("장애거래처").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void searchDirectoryResult는_partner_service_5xx와_빈목록을_구분한다() {
        server.expect(requestTo("http://partner-service/internal/partners/list?q=%EC%9E%A5%EC%95%A0%EA%B1%B0%EB%9E%98%EC%B2%98&limit=2&page=0"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        server.expect(requestTo("http://partner-service/internal/partners/list?q=%EC%97%86%EB%8A%94%EA%B1%B0%EB%9E%98%EC%B2%98&limit=2&page=0"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));

        assertThat(client.searchDirectoryResult("장애거래처", 2).status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        assertThat(client.searchDirectoryResult("없는거래처", 2).status())
                .isEqualTo(PartnerLookupClient.LookupStatus.NOT_FOUND);
        server.verify();
    }

    @Test
    void 숫자10자리_사업자번호는_하이픈형식으로_directory_검색한다() {
        server.expect(requestTo("http://partner-service/internal/partners/list?q=165-35-10155&limit=10&page=0"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"data":[{"partnerId":"11111111-1111-1111-1111-111111111111",
                        "partnerCode":"P-2026-0005","name":"대구HVAC솔루션","bizNo":"165-35-10155"}]}
                        """, MediaType.APPLICATION_JSON));

        PartnerLookupClient.DirectoryLookupResult result =
                client.searchDirectoryResult("1653510155", 10);

        assertThat(result.partners()).singleElement().satisfies(partner -> {
            assertThat(partner.partnerCode()).isEqualTo("P-2026-0005");
            assertThat(partner.bizNo()).isEqualTo("165-35-10155");
        });
        server.verify();
    }

    @Test
    void findByPartnerCodeResult는_파싱실패를_UNAVAILABLE로_반환한다() {
        server.expect(requestTo("http://partner-service/internal/partners/P-BAD"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{not-json", MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCodeResult("P-BAD").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void 이백응답에_partnerId가_누락되면_FOUND가_아니라_UNAVAILABLE로_격리한다() {
        // #810 R3-CODEX (S1-M2): 부분배포/응답손상으로 partnerId 없이 partnerCode 만 오면
        // FOUND(partnerId=null) 가 매칭 경로로 흘러 오매칭을 유발한다 — 구조 결손은 UNAVAILABLE.
        server.expect(requestTo("http://partner-service/internal/partners/P-NOID"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"success":true,"code":"OK","data":{"partnerCode":"P-NOID","name":"부분배포거래처"}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCodeResult("P-NOID").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void 이백응답의_partnerId_형식오류도_UNAVAILABLE로_격리한다() {
        server.expect(requestTo("http://partner-service/internal/partners/P-BADID"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"success":true,"code":"OK","data":{"partnerId":"not-a-uuid","partnerCode":"P-BADID"}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCodeResult("P-BADID").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerCode는_partner_service_internal_response를_wire_parse한다() {
        server.expect(requestTo("http://partner-service/internal/partners/P-2026-0001"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "code": "OK",
                          "message": "성공",
                          "data": {
                            "partnerId": "11111111-1111-1111-1111-111111111111",
                            "partnerCode": "P-2026-0001",
                            "name": "(주)테스트거래처",
                            "bizNo": "111-22-33333",
                            "creditLimit": 5000000,
                            "outstandingBalance": 0,
                            "status": "ACTIVE"
                          },
                          "timestamp": "2026-06-23T00:00:00Z"
                        }
                        """, MediaType.APPLICATION_JSON));

        PartnerSummary result = client.findByPartnerCode("P-2026-0001").orElseThrow();

        assertThat(result.partnerId()).isEqualTo(PARTNER_ID);
        assertThat(result.partnerCode()).isEqualTo("P-2026-0001");
        assertThat(result.name()).isEqualTo("(주)테스트거래처");
        assertThat(result.businessNo()).isEqualTo("111-22-33333");
        assertThat(result.bizNo()).isEqualTo("111-22-33333");
        assertThat(result.creditLimit()).isEqualByComparingTo("5000000");
        assertThat(result.address()).isNull();
        server.verify();
    }

    @Test
    void findByPartnerCode_404는_empty_유지() {
        server.expect(requestTo("http://partner-service/internal/partners/P-404"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findByPartnerCode("P-404")).isEmpty();
        server.verify();
    }

    @Test
    void findByPartnerCode_200_data_null은_empty_유지() {
        server.expect(requestTo("http://partner-service/internal/partners/P-EMPTY"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"code":"OK","message":"성공","data":null}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCode("P-EMPTY")).isEmpty();
        server.verify();
    }

    @Test
    void findByPartnerIdsBatch는_lookup_by_ids를_1회_호출하고_summary_map을_반환한다() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(content().json("""
                        {"ids":["11111111-1111-1111-1111-111111111111"]}
                        """))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"partners":[{"id":"11111111-1111-1111-1111-111111111111","partnerCode":"P-2026-0001","name":"삼한상사","bizNo":"123-45-67890","creditLimit":7500000}]}}
                        """, MediaType.APPLICATION_JSON));

        Map<UUID, PartnerSummary> result = client.findByPartnerIdsBatch(List.of(PARTNER_ID));

        assertThat(result).containsKey(PARTNER_ID);
        assertThat(result.get(PARTNER_ID).partnerCode()).isEqualTo("P-2026-0001");
        assertThat(result.get(PARTNER_ID).name()).isEqualTo("삼한상사");
        assertThat(result.get(PARTNER_ID).bizNo()).isEqualTo("123-45-67890");
        assertThat(result.get(PARTNER_ID).creditLimit()).isEqualByComparingTo("7500000");
        server.verify();
    }

    @Test
    void findByPartnerIdsBatch_401은_MIG12_INTERNAL_AUTH_MISS_throw() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.findByPartnerIdsBatch(List.of(PARTNER_ID)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }

    @Test
    void findByPartnerIdsBatch_5xx는_빈맵이_아닌_502로_fail_closed한다() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThatThrownBy(() -> client.findByPartnerIdsBatch(List.of(PARTNER_ID)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        server.verify();
    }

    @Test
    void findByPartnerIdsBatch_timeout도_빈맵이_아닌_502로_fail_closed한다() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withException(new IOException("connection timed out")));

        assertThatThrownBy(() -> client.findByPartnerIdsBatch(List.of(PARTNER_ID)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        server.verify();
    }

    // --- #831 B군 — findByPartnerIdsBatchResult 3분류 (findByPartnerIdsBatch 미승격 회귀 가드) ---

    @Test
    void findByPartnerIdsBatchResult는_5xx를_UNAVAILABLE로_분류한다() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThat(client.findByPartnerIdsBatchResult(List.of(PARTNER_ID)).status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerIdsBatchResult는_연결_예외_timeout을_UNAVAILABLE로_분류한다() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withException(new IOException("connection timed out")));

        assertThat(client.findByPartnerIdsBatchResult(List.of(PARTNER_ID)).status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerIdsBatchResult는_구조손상_응답을_UNAVAILABLE로_격리한다() {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{not-json", MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerIdsBatchResult(List.of(PARTNER_ID)).status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerIdsBatchResult는_일부_id_미매칭을_장애가_아닌_FOUND_빈맵으로_유지한다() {
        // 정상 무회귀: partner-service 가 200 으로 정상 응답했지만 요청한 id 가 하나도
        // partners 배열에 없는 것(삭제/미존재 거래처 혼재)은 장애가 아니라 부분/빈 성공이다.
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"partners":[]}}
                        """, MediaType.APPLICATION_JSON));

        PartnerLookupClient.BatchLookupResult result =
                client.findByPartnerIdsBatchResult(List.of(PARTNER_ID));

        assertThat(result.status()).isEqualTo(PartnerLookupClient.LookupStatus.FOUND);
        assertThat(result.partners()).isEmpty();
        server.verify();
    }

    @Test
    void findByPartnerIdsBatchResult는_배열_내_id_누락_원소를_UNAVAILABLE로_승격한다() {
        expectBatchResponse("""
                {"success":true,"data":{"partners":[{"partnerCode":"P-BROKEN","name":"손상거래처"}]}}
                """);

        assertThat(client.findByPartnerIdsBatchResult(List.of(PARTNER_ID)).status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerIdsBatchResult는_배열_내_UUID_손상_원소를_UNAVAILABLE로_승격한다() {
        expectBatchResponse("""
                {"success":true,"data":{"partners":[{"id":"not-a-uuid","partnerCode":"P-BROKEN"}]}}
                """);

        assertThat(client.findByPartnerIdsBatchResult(List.of(PARTNER_ID)).status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @Test
    void findByPartnerIdsBatchResult는_배열_내_partnerCode와_name_동시결손을_UNAVAILABLE로_승격한다() {
        expectBatchResponse("""
                {"success":true,"data":{"partners":[{"id":"11111111-1111-1111-1111-111111111111"}]}}
                """);

        assertThat(client.findByPartnerIdsBatchResult(List.of(PARTNER_ID)).status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    private void expectBatchResponse(String body) {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    }
}
