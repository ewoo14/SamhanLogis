package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * [#929 재수렴 5차 D-RC5-1] {@code partnerCode} 세그먼트가 partner-service 의 <b>형제 라우트
 * 이름</b>과 충돌할 때, 화면이 502 로 깨지지 않고 "없는 거래처"로 성사하는지 고정한다.
 *
 * <p><b>축이 문자가 아니라 경로다.</b> 재수렴 3차는 문자 5종을 열거하다 {@code ';'} 로,
 * 4차 리뷰는 printable ASCII 95자 스윕이 U+2028/U+2029 로 샜고, 4차 fix 는 예약문자 + 유니코드
 * 카테고리로 문자 축을 닫았다. 그런데 {@code "list"} 는 소문자 ASCII 4자다 — 어떤 문자 판정도
 * 이 값을 거부할 수 없다. 누출 지점은 값의 <i>문자 부류</i>가 아니라 값이 <i>어느 자원을
 * 가리키는가</i>이며, 그 답은 요청을 보내기 전이 아니라 <b>응답을 받은 뒤</b>에만 알 수 있다.
 *
 * <p><b>실측 (라이브 partner-service {@code :8095}, 2026-07-27)</b>
 * <pre>
 *   GET /internal/partners/list           -&gt; 200  {"data":[ …거래처 50건 배열… ]}
 *   GET /internal/partners/by-name        -&gt; 400  {"code":"INVALID_INPUT","message":"필수 요청 파라미터가 누락되었습니다."}
 *   GET /internal/partners/lookup-by-ids  -&gt; 404  (POST 전용 → {partnerCode} 로 낙하)
 *   GET /internal/partners/find-by-codes  -&gt; 404  (POST 전용 → {partnerCode} 로 낙하)
 *   GET /internal/partners/NOSUCH9999     -&gt; 404
 * </pre>
 * 앞의 둘만 {@code parseSummaryResult} 실패/4xx 를 거쳐 {@code UNAVAILABLE} → 게이트웨이 502 가
 * 됐다(일마감·원장·거래처원장 3화면 실측 502).
 *
 * <p><b>왜 라우트 이름을 열거하지 않는가</b> — {@code /internal/partners/*} 는 앞으로도 늘어나는
 * <i>열린 집합</i>이다. 이름을 막으면 다섯 번째 라우트에서 다시 샌다. 대신 이 테스트가 고정하는
 * 계약은 자원 신원 확인이다: <b>2xx 응답이 "내가 지정한 그 거래처 코드"를 스스로 밝히지 않으면
 * 그것은 내 자원이 아니다</b>(→ NOT_FOUND). 응답 형태가 배열이든 낯선 객체든 다른 거래처든
 * 같은 결론이며, 아직 존재하지 않는 라우트에도 그대로 적용된다.
 *
 * <p><b>깨뜨리면 안 되는 것</b> — {@code #810 R3-CODEX}(내 코드를 밝힌 응답의 구조 결손 =
 * 재시도 대상 UNAVAILABLE), 5xx/네트워크 = UNAVAILABLE, 401/403 = MIG-12 fail-fast,
 * 그리고 재수렴 4차의 문자 축 가드. 아래 회귀 테스트가 그 넷을 함께 고정한다.
 */
class PartnerLookupCodeRouteCollisionTest {

    private static final String TOKEN = "test-token";

    /** 라이브 {@code GET /internal/partners/list} 응답 원문(선두 2건, 2026-07-27 실측). */
    private static final String LIST_ROUTE_BODY = """
            {
              "success": true,
              "code": "OK",
              "message": "성공",
              "data": [
                {
                  "partnerId": "8e809b05-1426-387c-a13e-14e53ffdb3ea",
                  "partnerCode": "P-2026-0001",
                  "name": "(주)서울에어컨",
                  "bizNo": "113-07-10031",
                  "representative": "홍길동",
                  "address": "서울특별시 강남구 테헤란로 101번길 2",
                  "phone": "02-1017-1041",
                  "group": "VIP거래처",
                  "note": null
                },
                {
                  "partnerId": "8b8e5c4b-8d0d-3404-a4e2-6075989922da",
                  "partnerCode": "P-2026-0002",
                  "name": "한국공조시스템(주)",
                  "bizNo": "126-14-10062",
                  "representative": "김철수",
                  "address": "서울특별시 강남구 테헤란로 102번길 3",
                  "phone": "02-1034-1082",
                  "group": "VIP거래처",
                  "note": null
                }
              ]
            }
            """;

    /** 라이브 {@code GET /internal/partners/by-name} (name 파라미터 없음) 응답 원문. */
    private static final String BY_NAME_ROUTE_BODY = """
            {"success":false,"code":"INVALID_INPUT","message":"필수 요청 파라미터가 누락되었습니다.","data":null}
            """;

    private MockRestServiceServer server;
    private PartnerLookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://partner-service");
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new PartnerLookupClient(builder.build(), props, new ObjectMapper());
    }

    // ────────────────────────── D-RC5-1 RED ──────────────────────────

    @Test
    @DisplayName("D-RC5-1 RED — 'list' 는 거래처 배열 200 을 받지만 NOT_FOUND 로 성사한다")
    void listRouteCollision_resolvesToNotFound() {
        expectCodeLookup("list").andRespond(withSuccess(LIST_ROUTE_BODY, MediaType.APPLICATION_JSON));

        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult("list");

        assertThat(result.isNotFound())
                .as("'list' 가 NOT_FOUND 가 아니라 %s — 호출부가 502 로 승격시켜 일마감/원장/거래처원장이 깨진다",
                        result.status())
                .isTrue();
        server.verify();
    }

    @Test
    @DisplayName("D-RC5-1 — 'list' 응답 선두 거래처를 내 거래처로 오인하지 않는다")
    void listRouteCollision_neverAdoptsFirstElement() {
        expectCodeLookup("list").andRespond(withSuccess(LIST_ROUTE_BODY, MediaType.APPLICATION_JSON));

        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult("list");

        assertThat(result.isFound())
                .as("배열 선두(P-2026-0001)를 'list' 의 조회 결과로 채택하면 전 화면이 엉뚱한 거래처를 보여준다")
                .isFalse();
        assertThat(result.partner()).isNull();
        server.verify();
    }

    @Test
    @DisplayName("D-RC5-1 RED — 'by-name' 은 400 을 받지만 NOT_FOUND 로 성사한다")
    void byNameRouteCollision_resolvesToNotFound() {
        expectCodeLookup("by-name")
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .body(BY_NAME_ROUTE_BODY)
                        .contentType(MediaType.APPLICATION_JSON));

        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult("by-name");

        assertThat(result.isNotFound())
                .as("'by-name' 이 NOT_FOUND 가 아니라 %s — 호출부가 502 로 승격시켜 3화면이 깨진다",
                        result.status())
                .isTrue();
        server.verify();
    }

    // ───────── 라우트 이름 열거가 아니라 신원 확인이라는 것을 고정한다 ─────────

    @Test
    @DisplayName("D-RC5-1 — 다른 거래처를 기술한 200 응답은 FOUND 가 아니다(오매칭 차단)")
    void responseDescribingAnotherPartner_isNotFound() {
        expectCodeLookup("P-ASKED").andRespond(withSuccess("""
                {"success":true,"code":"OK","data":{
                  "partnerId":"11111111-1111-1111-1111-111111111111",
                  "partnerCode":"P-OTHER","name":"엉뚱한거래처"}}
                """, MediaType.APPLICATION_JSON));

        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult("P-ASKED");

        assertThat(result.isNotFound()).isTrue();
        server.verify();
    }

    @Test
    @DisplayName("D-RC5-1 — 아직 없는 형제 라우트가 낯선 객체를 돌려줘도 NOT_FOUND(열린 집합 봉쇄)")
    void unknownSiblingRouteObject_isNotFound() {
        // 예: 장차 추가될 GET /internal/partners/stats 가 {"data":{"total":56}} 를 돌려준다면.
        expectCodeLookup("stats").andRespond(withSuccess(
                "{\"success\":true,\"code\":\"OK\",\"data\":{\"total\":56,\"active\":50}}",
                MediaType.APPLICATION_JSON));

        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult("stats");

        assertThat(result.isNotFound())
                .as("라우트 이름을 열거하는 대신 '내 코드를 밝히지 않은 응답'을 전부 미존재로 성사시켜야 한다")
                .isTrue();
        server.verify();
    }

    @ParameterizedTest(name = "형제 라우트가 {0} 계열 4xx 를 돌려줘도 NOT_FOUND")
    @ValueSource(ints = {400, 405, 406, 410, 415, 422})
    @DisplayName("D-RC5-1 — 요청이 자원을 지정하지 못했다는 4xx 는 장애가 아니다")
    void addressingFailure4xx_isNotFound(int status) {
        expectCodeLookup("route-x").andRespond(withStatus(HttpStatus.valueOf(status)));

        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult("route-x");

        assertThat(result.isNotFound()).isTrue();
        server.verify();
    }

    // ────────────────── 직전 라운드/과거 결정 회귀 가드 ──────────────────

    @Test
    @DisplayName("회귀 #810 — 내 코드를 밝힌 응답의 구조 결손은 여전히 UNAVAILABLE")
    void structuralDeficitOfAddressedPartner_staysUnavailable() {
        expectCodeLookup("P-NOID").andRespond(withSuccess("""
                {"success":true,"code":"OK","data":{"partnerCode":"P-NOID","name":"부분배포거래처"}}
                """, MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCodeResult("P-NOID").status())
                .as("#810 R3-CODEX: partnerId 결손 요약이 매칭 경로로 흐르면 안 되고, 재시도 대상으로 남아야 한다")
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @ParameterizedTest(name = "{0} 는 여전히 UNAVAILABLE(서버가 아픈 상태)")
    @ValueSource(ints = {408, 429, 500, 502, 503, 504})
    @DisplayName("회귀 — 재시도 지시 4xx 와 5xx 는 미존재로 삼키지 않는다")
    void retryableAndServerErrors_stayUnavailable(int status) {
        expectCodeLookup("P-2026-0001").andRespond(withStatus(HttpStatus.valueOf(status)));

        assertThat(client.findByPartnerCodeResult("P-2026-0001").status())
                .as("%d 를 NOT_FOUND 로 삼키면 partner-service 장애가 '없는 거래처'로 위장된다", status)
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    @ParameterizedTest(name = "{0} 은 여전히 MIG-12 fail-fast")
    @ValueSource(ints = {401, 403})
    @DisplayName("회귀 MIG-12 — 내부 인증 실패는 미존재로 삼키지 않는다")
    void internalAuthFailure_staysFailFast(int status) {
        expectCodeLookup("P-2026-0001").andRespond(withStatus(HttpStatus.valueOf(status)));

        assertThatThrownBy(() -> client.findByPartnerCodeResult("P-2026-0001"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG12_INTERNAL_AUTH_MISS));
        server.verify();
    }

    @Test
    @DisplayName("회귀 — 실 거래처 코드는 그대로 FOUND (과차단 아님)")
    void realPartnerCode_staysFound() {
        expectCodeLookup("P-2026-0001").andRespond(withSuccess("""
                {"success":true,"code":"OK","data":{
                  "partnerId":"8e809b05-1426-387c-a13e-14e53ffdb3ea",
                  "partnerCode":"P-2026-0001","name":"(주)서울에어컨","bizNo":"113-07-10031"}}
                """, MediaType.APPLICATION_JSON));

        PartnerLookupClient.LookupResult result = client.findByPartnerCodeResult("P-2026-0001");

        assertThat(result.isFound()).isTrue();
        assertThat(result.partner().partnerCode()).isEqualTo("P-2026-0001");
        server.verify();
    }

    @Test
    @DisplayName("회귀 — 파싱 불가 본문은 여전히 UNAVAILABLE(전송/직렬화가 깨진 상태)")
    void unparseableBody_staysUnavailable() {
        expectCodeLookup("P-BAD").andRespond(withSuccess("{not-json", MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCodeResult("P-BAD").status())
                .isEqualTo(PartnerLookupClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    private org.springframework.test.web.client.ResponseActions expectCodeLookup(String code) {
        return server.expect(requestTo("http://partner-service/internal/partners/" + code))
                .andExpect(method(HttpMethod.GET));
    }
}
